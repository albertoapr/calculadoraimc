<template>
  <section class="fitpeso-about-page" aria-labelledby="page-title">
    <p>A FitPeso conecta pessoas que desejam treinar a profissionais de Educação Física.</p>
    <p>
      Nossa proposta é facilitar a busca por acompanhamento profissional, com opções para
      diferentes objetivos, bolsos e rotinas.
    </p>

    <section class="about-chapter" aria-labelledby="about-how">
      <h2 id="about-how">Como funciona a FitPeso</h2>
      <ol>
        <li>Escolha sua cidade e academia ou consulte os profissionais disponíveis.</li>
        <li>Informe seu objetivo, disponibilidade, frequência, duração e data pretendida para começar. Você também pode solicitar aulas avulsas.</li>
        <li>Selecione os personais que deseja convidar e envie sua solicitação.</li>
        <li>Receba até cinco propostas e compare valores, condições e perfis profissionais. Acompanhe as respostas em Minhas solicitações.</li>
        <li>Converse com os profissionais disponíveis, escolha a proposta mais adequada e combine os detalhes do atendimento.</li>
      </ol>
    </section>

    <section class="about-chapter" aria-labelledby="about-customers">
      <h2 id="about-customers">Vantagens para o cliente</h2>
      <ul>
        <li>Encontre profissionais próximos e conheça seus perfis antes de escolher.</li>
        <li>Envie uma única solicitação para vários personais, sem precisar procurar cada um individualmente.</li>
        <li>Compare propostas e encontre opções compatíveis com seu orçamento e sua rotina.</li>
        <li>Escolha entre aulas avulsas e acompanhamento por um período maior.</li>
        <li>Tenha liberdade para avaliar as propostas antes de aceitar qualquer uma.</li>
        <li>Consulte o andamento das solicitações e as condições oferecidas em um só lugar.</li>
      </ul>
    </section>

    <section class="about-chapter" aria-labelledby="about-trainers">
      <h2 id="about-trainers">Vantagens para o personal trainer</h2>
      <ul>
        <li>Aumente sua visibilidade entre potenciais alunos na sua região e nas academias em que atua.</li>
        <li>Receba oportunidades de atendimento com informações sobre objetivos e disponibilidade dos interessados.</li>
        <li>Defina seus próprios valores e apresente propostas de acordo com sua agenda e forma de trabalho.</li>
        <li>Divulgue seu perfil profissional e suas qualificações em um ambiente voltado ao treinamento personalizado.</li>
        <li>Organize as solicitações e propostas recebidas, reduzindo o trabalho de prospecção.</li>
        <li>Tenha mais oportunidades de conquistar novos alunos e ocupar horários disponíveis.</li>
      </ul>
    </section>

    <section class="about-chapter" aria-labelledby="about-safety">
      <h2 id="about-safety">Segurança e confiança</h2>
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
    </section>
  </section>
</template>

<style scoped>
.fitpeso-about-page {
  font-size: 17px;
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
.about-chapter {
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.about-chapter h2 {
  margin: 0 0 10px;
  font-size: 22px;
  line-height: 1.3;
  color: var(--ink);
}
.about-chapter ul,
.about-chapter ol {
  margin: 0 0 12px;
  padding-inline-start: 22px;
}
.about-chapter li + li {
  margin-top: 7px;
}
</style>
