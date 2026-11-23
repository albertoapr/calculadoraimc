import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  academyPath,
  academySlug,
  parseAcademyPath,
  parseSharedAcademySlug,
  sharedAcademyPath,
} from '../src/router/academyRoutes'
import { pathForScreen, safeReturnPath, screenForPath } from '../src/router/screens'
import { isAcademySlug, suggestAcademySlug } from '../shared/academy-slug'

test('gera URL legível com cidade, academia e bairro', () => {
  assert.equal(academyPath('Mesquita', 'SmartFit', 'Centro'), '/mesquita/academia/smartfit/centro')
  assert.equal(
    academyPath('Nova Iguaçu', 'Aquatic Center', 'Vila Emil'),
    '/nova-iguacu/academia/aquatic-center/vila-emil',
  )
  assert.equal(
    academyPath('Mesquita', 'Academia SmartFit', 'Centro'),
    '/mesquita/academia/smartfit/centro',
  )
  assert.equal(academyPath('Mesquita', 'Smart Fit', 'Centro'), '/mesquita/academia/smartfit/centro')
  assert.equal(academySlug('São João de Meriti'), 'sao-joao-de-meriti')
})

test('aceita academias legadas sem bairro e rejeita segmentos extras', () => {
  assert.equal(academyPath('Mesquita', 'SmartFit', ''), '/mesquita/academia/smartfit')
  assert.deepEqual(parseAcademyPath('/mesquita/academia/smartfit/centro'), {
    city: 'mesquita',
    name: 'smartfit',
    neighborhood: 'centro',
  })
  assert.deepEqual(parseAcademyPath('/mesquita/academia/smartfit'), {
    city: 'mesquita',
    name: 'smartfit',
    neighborhood: '',
  })
  assert.equal(parseAcademyPath('/mesquita/academia/smartfit/centro/extra'), null)
})

test('reconhece links de academias como consulta pública sem perder a rota', () => {
  const path = '/mesquita/academia/smartfit/centro'
  assert.equal(screenForPath(path), 'public-trainers')
  assert.equal(pathForScreen('public-trainers', path), path)
  assert.equal(safeReturnPath(path), path)
  assert.equal(pathForScreen('public-trainers', '/'), '/profissionais')
  assert.equal(safeReturnPath('//malicious.example/'), '')
})

test('o link compartilhável usa um slug e abre a home', () => {
  const slug = suggestAcademySlug('Academia Aquatic Center', 'Vila Emil')
  const path = sharedAcademyPath(slug)
  assert.equal(path, '/academias/aquaticcenter-vilaemil')
  assert.equal(parseSharedAcademySlug(path), slug)
  assert.equal(parseSharedAcademySlug('/academias/mesquita/aquaticcenter-vilaemil'), '')
  assert.equal(screenForPath(path), 'home')
  assert.equal(pathForScreen('home', path), path)
  assert.equal(safeReturnPath(path), path)
  assert.ok(isAcademySlug(slug))
  assert.equal(isAcademySlug('aquaticcenter--vilaemil'), false)
})
