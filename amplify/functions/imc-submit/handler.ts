import type { APIGatewayProxyHandler } from 'aws-lambda'

const corsHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST,OPTIONS',
}

function response(statusCode: number, body: Record<string, unknown>) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) }
}

function parseBody(event: Parameters<APIGatewayProxyHandler>[0]) {
  if (typeof event.body !== 'string') return null
  const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body
  if (Buffer.byteLength(body, 'utf8') > 8192) return null
  try { return JSON.parse(body) as Record<string, unknown> } catch { return null }
}

function validate(data: Record<string, unknown> | null) {
  if (!data) return false
  const { clientName, whatsapp, age, sex, weight, heightCm, imc, consent, requestId } = data
  const name = typeof clientName === 'string' ? clientName.trim().replace(/\s+/g, ' ') : ''
  const phone = typeof whatsapp === 'string' ? whatsapp.replace(/\D/g, '') : ''
  return consent === true && name.length >= 2 && name.length <= 80 &&
    /^[\p{L}\p{M} .'-]+$/u.test(name) && /^55\d{10,11}$/.test(phone) &&
    Number.isInteger(age) && Number(age) >= 1 && Number(age) <= 120 &&
    ['feminino', 'masculino', 'outro'].includes(String(sex)) &&
    typeof weight === 'number' && Number.isFinite(weight) && weight >= 20 && weight <= 400 &&
    typeof heightCm === 'number' && Number.isFinite(heightCm) && heightCm >= 80 && heightCm <= 250 &&
    typeof imc === 'number' && Number.isFinite(imc) &&
    Math.abs(weight / ((heightCm / 100) ** 2) - imc) <= 0.11 &&
    typeof requestId === 'string' && /^[0-9a-f-]{36}$/i.test(requestId)
}

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  if (event.httpMethod !== 'POST') return response(405, { error: 'Método não permitido.' })

  const data = parseBody(event)
  if (!data || !validate(data)) return response(400, { error: 'Dados inválidos.' })

  const token = process.env.OPENCLAW_HOOK_TOKEN?.trim()
  const hookUrl = process.env.OPENCLAW_IMC_HOOK_URL
  if (!token || token.length < 16 || !hookUrl) {
    return response(503, { error: 'Serviço temporariamente indisponível.' })
  }

  const name = String(data.clientName).trim().replace(/\s+/g, ' ')
  const phone = String(data.whatsapp).replace(/\D/g, '')
  try {
    const upstream = await fetch(hookUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': String(data.requestId),
      },
      body: JSON.stringify({
        clientName: name,
        whatsapp: `+${phone}`,
        age: data.age,
        sex: data.sex,
        weight: data.weight,
        heightCm: data.heightCm,
        consent: true,
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (upstream.status !== 200) return response(502, { error: 'Não foi possível encaminhar o resultado.' })
    return response(202, { accepted: true })
  } catch {
    return response(502, { error: 'Não foi possível encaminhar o resultado.' })
  }
}
