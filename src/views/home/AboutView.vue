<script setup lang="ts">
import { ref } from 'vue'
import RequestAccordionItem from '../../components/RequestAccordionItem.vue'

type AboutSection = 'how' | 'customers' | 'trainers' | 'safety'
const expandedSection = ref<AboutSection | null>(null)

function toggleSection(section: AboutSection) {
  expandedSection.value = expandedSection.value === section ? null : section
}
</script>

<template>
  <section class="fitpeso-about-page" aria-labelledby="page-title">
    <p>A FitPeso conecta pessoas que desejam treinar a profissionais de Educação Física.</p>
    <p>
      Nossa proposta é facilitar a busca por acompanhamento profissional, com opções para
      diferentes objetivos, bolsos e rotinas.
    </p>

    <div class="about-accordion">
      <RequestAccordionItem :open="expandedSection === 'how'">
        <template #header>
          <h2 id="about-how" class="request-accordion-heading">
            <button
              type="button"
              class="request-accordion-toggle"
              :aria-expanded="expandedSection === 'how'"
              aria-controls="about-panel-how"
              @click="toggleSection('how')"
            >
              <span class="request-accordion-title">Como funciona a FitPeso</span>
              <span class="request-accordion-chevron" aria-hidden="true"></span>
            </button>
          </h2>
        </template>
        <div
          v-show="expandedSection === 'how'"
          id="about-panel-how"
          class="request-accordion-panel about-panel"
          role="region"
          aria-labelledby="about-how"
        >
          <ol>
            <li>Escolha sua cidade e academia ou consulte os profissionais disponíveis.</li>
            <li>Informe seu objetivo, disponibilidade, frequência, duração e data pretendida para começar. Você também pode solicitar aulas avulsas.</li>
            <li>Selecione os personais que deseja convidar e envie sua solicitação.</li>
            <li>Receba até cinco propostas e compare valores, condições e perfis profissionais. Acompanhe as respostas em Minhas solicitações.</li>
            <li>Converse com os profissionais disponíveis, escolha a proposta mais adequada e combine os detalhes do atendimento.</li>
          </ol>
        </div>
      </RequestAccordionItem>

      <RequestAccordionItem :open="expandedSection === 'customers'">
        <template #header>
          <h2 id="about-customers" class="request-accordion-heading">
            <button
              type="button"
              class="request-accordion-toggle"
              :aria-expanded="expandedSection === 'customers'"
              aria-controls="about-panel-customers"
              @click="toggleSection('customers')"
            >
              <span class="request-accordion-title">Vantagens para o cliente</span>
              <span class="request-accordion-chevron" aria-hidden="true"></span>
            </button>
          </h2>
        </template>
        <div
          v-show="expandedSection === 'customers'"
          id="about-panel-customers"
          class="request-accordion-panel about-panel"
          role="region"
          aria-labelledby="about-customers"
        >
          <ul>
            <li>Encontre profissionais próximos e conheça seus perfis antes de escolher.</li>
            <li>Envie uma única solicitação para vários personais, sem precisar procurar cada um individualmente.</li>
            <li>Compare propostas e encontre opções compatíveis com seu orçamento e sua rotina.</li>
            <li>Escolha entre aulas avulsas e acompanhamento por um período maior.</li>
            <li>Tenha liberdade para avaliar as propostas antes de aceitar qualquer uma.</li>
            <li>Consulte o andamento das solicitações e as condições oferecidas em um só lugar.</li>
          </ul>
        </div>
      </RequestAccordionItem>

      <RequestAccordionItem :open="expandedSection === 'trainers'">
        <template #header>
          <h2 id="about-trainers" class="request-accordion-heading">
            <button
              type="button"
              class="request-accordion-toggle"
              :aria-expanded="expandedSection === 'trainers'"
              aria-controls="about-panel-trainers"
              @click="toggleSection('trainers')"
            >
              <span class="request-accordion-title">Vantagens para o personal trainer</span>
              <span class="request-accordion-chevron" aria-hidden="true"></span>
            </button>
          </h2>
        </template>
        <div
          v-show="expandedSection === 'trainers'"
          id="about-panel-trainers"
          class="request-accordion-panel about-panel"
          role="region"
          aria-labelledby="about-trainers"
        >
          <ul>
            <li>Aumente sua visibilidade entre potenciais alunos na sua região e nas academias em que atua.</li>
            <li>Receba oportunidades de atendimento com informações sobre objetivos e disponibilidade dos interessados.</li>
            <li>Defina seus próprios valores e apresente propostas de acordo com sua agenda e forma de trabalho.</li>
            <li>Divulgue seu perfil profissional e suas qualificações em um ambiente voltado ao treinamento personalizado.</li>
            <li>Organize as solicitações e propostas recebidas, reduzindo o trabalho de prospecção.</li>
            <li>Tenha mais oportunidades de conquistar novos alunos e ocupar horários disponíveis.</li>
          </ul>
          <h3>Sem assinatura ou mensalidade</h3>
          <p>
            O cadastro, a divulgação do perfil, o recebimento de solicitações e o envio de propostas
            são gratuitos. A FitPeso recebe apenas 10% do valor total do treinamento contratado
            pela plataforma. Considere essa comissão ao definir o valor da sua proposta.
          </p>
          <p>
            Para ativar o atendimento, o cliente paga 10% à FitPeso e os 90% restantes diretamente
            ao personal, conforme combinado. Não há acréscimo ao valor da proposta.
            Por exemplo, em um treinamento de R$ 1.000, R$ 100 correspondem à comissão da FitPeso
            e R$ 900 ao recebimento do profissional.
          </p>
          <h3>Como manter seu perfil ativo</h3>
          <ul>
            <li>Novos profissionais têm 180 dias de carência para conseguir a primeira contratação.</li>
            <li>Após a carência, mantenha pelo menos dois atendimentos contratados pela plataforma nos últimos 12 meses ou tenha um atendimento ativo.</li>
            <li>Somente contratações com a comissão efetivamente paga são contabilizadas.</li>
            <li>Se não atender aos critérios, seu perfil fica temporariamente oculto na busca pública, sem perda do cadastro.</li>
            <li>A reativação é gratuita mediante uma nova contratação pela FitPeso. Você pode compartilhar sua página profissional para receber solicitações de novos alunos.</li>
          </ul>
          <p>
            <strong>Sem custo fixo: a FitPeso só ganha quando você conquista um aluno pela plataforma.</strong>
          </p>
        </div>
      </RequestAccordionItem>

      <RequestAccordionItem :open="expandedSection === 'safety'">
        <template #header>
          <h2 id="about-safety" class="request-accordion-heading">
            <button
              type="button"
              class="request-accordion-toggle"
              :aria-expanded="expandedSection === 'safety'"
              aria-controls="about-panel-safety"
              @click="toggleSection('safety')"
            >
              <span class="request-accordion-title">Segurança e confiança</span>
              <span class="request-accordion-chevron" aria-hidden="true"></span>
            </button>
          </h2>
        </template>
        <div
          v-show="expandedSection === 'safety'"
          id="about-panel-safety"
          class="request-accordion-panel about-panel"
          role="region"
          aria-labelledby="about-safety"
        >
          <p>
            A FitPeso utiliza autenticação para proteger o acesso às contas e registra as solicitações
            e propostas para facilitar o acompanhamento das negociações. Os links de acesso a
            solicitações destinados aos profissionais possuem validade limitada.
          </p>
          <ul>
            <li>Confira o registro do profissional no CREF antes de contratar.</li>
            <li>Analise o perfil, as qualificações, os valores e as condições de cada proposta.</li>
            <li>Combine previamente horários, local, pagamentos e regras de cancelamento.</li>
            <li>Nunca compartilhe senhas ou códigos de confirmação com terceiros.</li>
            <li>Em caso de dúvida ou suspeita de irregularidade, utilize o WhatsApp de contato da FitPeso disponível no rodapé.</li>
          </ul>
          <p>
            A plataforma facilita o encontro entre clientes e profissionais. A avaliação da adequação
            do treino, a prestação do serviço e o cumprimento das condições combinadas dependem dos
            profissionais e clientes envolvidos.
          </p>
        </div>
      </RequestAccordionItem>
    </div>
  </section>
</template>

<style scoped>
.fitpeso-about-page {
  font-size: 20px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.fitpeso-about-page p,
.fitpeso-about-page li {
  font-size: inherit;
  line-height: inherit;
}
.fitpeso-about-page p {
  margin: 0 0 12px;
}
.about-accordion {
  display: grid;
  gap: 12px;
  margin-top: 20px;
}
.about-accordion .request-accordion-title {
  flex: 1 1 auto;
  font-size: 22px;
  line-height: 1.3;
}
.about-panel {
  display: block;
}
.about-panel h3 {
  margin: 18px 0 8px;
  font-size: 21px;
  line-height: 1.35;
  color: var(--ink);
}
.about-panel ul,
.about-panel ol {
  margin: 0 0 12px;
  padding-inline-start: 24px;
}
.about-panel li + li {
  margin-top: 8px;
}
.about-panel > :last-child {
  margin-bottom: 0;
}
</style>
