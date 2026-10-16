# Política de privacidade — Noir Shield

Última atualização: 16 de outubro de 2026.

O Noir Shield é uma extensão de bloqueio de anúncios para navegadores Chromium. Sua finalidade é aplicar regras de rede e filtros visuais às páginas visitadas. A extensão não possui conta, publicidade própria, analytics ou telemetria e não envia ao desenvolvedor histórico de navegação, conteúdo de páginas ou estatísticas de uso.

## Dados usados e armazenados no dispositivo

- A extensão consulta o endereço e o domínio da aba ativa para mostrar o site no popup, aplicar exceções e exibir os bloqueios que a API do navegador conseguir informar.
- Sites permitidos, listas ativadas, regras criadas pelo usuário, preferências e metadados das listas são armazenados em `chrome.storage.local` no próprio navegador. Contagens da sessão, quando disponíveis, usam `chrome.storage.session`; contagens acumuladas disponíveis podem ser armazenadas localmente. Não mantemos um histórico de URLs visitadas.
- O recurso “Bloquear elemento” lê a estrutura da página somente para identificar o elemento selecionado pelo usuário e gerar um seletor CSS local. O conteúdo da página não é enviado ao desenvolvedor.
- O usuário pode exportar suas configurações para um arquivo local. Esse arquivo pode conter domínios permitidos e regras personalizadas; cabe ao usuário escolher se irá compartilhá-lo.

## Conexões externas

O pacote inclui listas de filtros. Ao usar a atualização de listas, a extensão baixa diretamente por HTTPS o texto das listas fornecidas por EasyList e AdGuard. Se o usuário adicionar uma lista própria, a extensão acessará o URL HTTPS informado. Os respectivos servidores podem receber o endereço IP e metadados normais de uma requisição HTTP; a extensão não anexa histórico de navegação, identificadores próprios ou configurações do usuário a essas requisições. Nenhum código JavaScript remoto é executado.

As regras de rede são aplicadas localmente pela API `declarativeNetRequest` do navegador. A extensão não faz proxy do tráfego por servidores do desenvolvedor. Sites visitados podem, por conta própria, observar requisições que não forem bloqueadas; isso está fora do controle da extensão.

## Controle, retenção e segurança

O usuário pode pausar a proteção, remover sites permitidos e regras próprias, redefinir as estatísticas disponíveis ou desinstalar a extensão. As configurações permanecem no armazenamento local até serem alteradas, apagadas ou até a extensão ser removida. O Noir Shield não compartilha esses dados com o desenvolvedor nem os vende. Atualizações de filtros usam HTTPS.

O código-fonte e a descrição das permissões estão no repositório público do projeto. Para relatar problemas de privacidade, abra uma issue nesse repositório.
