# Controladores do frontend

`useFitpesoApp` é a camada de orquestração do shell. Regras que pertencem a um único domínio ficam
em controladores menores:

- `useAssessment`: cálculo e estado da avaliação corporal;
- `usePublicTrainerProfile`: leitura do perfil público por ID ou slug;
- `useSupportedCity`: cidades atendidas, preferência e geolocalização;
- `useSessionBootstrap`: restauração das sessões de cliente e personal;
- `useAuthentication`, `useCustomerRequests`, `useAccountProfile` e demais módulos: fluxos já
  separados por domínio.

Novas regras de negócio não devem ser adicionadas diretamente ao shell quando puderem pertencer a
um desses controladores ou a um novo módulo de domínio.
