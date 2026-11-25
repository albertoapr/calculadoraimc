# FitPeso — Registro de decisões de produto

## 25/11/2026 — Cadastro de cidades

**Status:** implementado na branch `develop`.

### Decisões

- Criar um cadastro de cidades para apoiar a expansão da FitPeso. O cadastro será a fonte da lista de municípios usada no app.
- Gravar, por cidade, o valor mínimo e o valor médio da hora-aula de personal trainer.
- Mostrar no seletor público apenas cidades onde há personais trabalhando.

### Regras propostas para a implementação

| Situação da cidade | Seletor público | Cadastro do personal |
|---|---|---|
| Ativa, com pelo menos um personal ativo vinculado a uma academia ativa na cidade | Aparece | Aparece |
| Ativa, sem personal que atenda ao critério acima | Fica oculta | Aparece, permitindo cadastrar o primeiro personal |
| Inativa | Fica oculta | Fica oculta para novos vínculos |

Ao sair do seletor, a cidade conserva seus preços cadastrados e seus vínculos existentes. As cidades de atuação do personal são derivadas das academias selecionadas no cadastro dele.

O modelo inicial proposto inclui identificador, nome, UF, slug e status da cidade. Para cada preço, usar centavos de real por hora-aula e guardar a data da última revisão. Preços ainda indisponíveis podem ficar em branco. Quando os dois valores estiverem preenchidos, a média deve ser maior ou igual ao mínimo. A proposta é mostrar os valores disponíveis após a escolha da cidade, sem condicionar a presença da cidade no seletor ao preenchimento dos preços.

### Pontos a definir

- Quais serão os valores iniciais em cada cidade? A sugestão é começar com referências editáveis no painel. Nesse caso, o mínimo serve de referência, e a média deve ser apresentada como estimativa.
- Se a média passar a usar contratações da FitPeso, qual período, quantidade mínima de contratações e modalidade de aula serão considerados?
- Atendimento presencial em residência ou parque, sem vínculo com academia na cidade, contará para a disponibilidade pública?
- Como tratar as páginas públicas e a preferência de cidade já salva quando a cidade sair do seletor?

### Implementação

- O menu administrativo abre **Cadastro de cidades** em `/admin/cidades`. É possível cadastrar, ativar, inativar e editar os preços.
- Mesquita, Nilópolis, Nova Iguaçu e Rio de Janeiro são cadastradas automaticamente, com preços em branco. Os registros existentes continuam vinculados pela chave de cidade original. As novas gravações de academias incluem o identificador da cidade.
- O seletor público usa a existência de pelo menos um personal ativo com academia ativa. Atendimentos sem academia ficam pendentes de decisão. Uma preferência salva só é aplicada enquanto a cidade estiver disponível.
- A tela de solicitação usa o preço mínimo para estimar o valor das aulas e apresenta a média como estimativa, quando cadastrada.

### Etapas previstas originalmente

1. Criar o cadastro administrativo de cidades e preparar os registros iniciais de Mesquita, Nilópolis, Nova Iguaçu e Rio de Janeiro.
2. Vincular as academias existentes às cidades, preservando os endereços públicos já divulgados.
3. Atualizar os seletores da home, da busca de profissionais e do cadastro de personal com as regras de cada fluxo.
4. Incluir os campos de preço no painel e exibir as referências disponíveis para a cidade selecionada.
