# Texto para a Chrome Web Store — rascunho de revisão

Nome: Noir Shield

Resumo: Bloqueie anúncios e rastreadores com filtros locais, controles por site e proteção parcial para o YouTube.

Categoria sugerida: Produtividade

Descrição longa:

Noir Shield é um bloqueador de anúncios de código aberto para Chrome e Edge. Usa regras declarativas do navegador e listas de filtros conhecidas para bloquear requisições publicitárias e rastreadores separáveis do conteúdo. Também aplica filtros visuais para remover espaços e componentes publicitários identificáveis nas páginas.

Você pode pausar a proteção por site, escolher listas, adicionar regras e listas próprias, selecionar elementos para ocultar e exportar suas configurações. A interface é escura e compacta. As preferências ficam no seu navegador; não há conta ou telemetria própria.

No YouTube, o Noir Shield tenta bloquear requisições publicitárias identificáveis, ocultar elementos promocionais e acionar o botão nativo de pular anúncios quando ele aparece. A entrega de anúncios pode mudar; anúncios inseridos no mesmo fluxo do vídeo podem continuar sendo reproduzidos. O modo agressivo pode afetar a reprodução em alguns casos. Não prometemos bloquear todos os anúncios do YouTube ou Twitch.

As estatísticas de bloqueio dependem das informações que o navegador disponibiliza. Quando não existe uma contagem confiável, a interface mostra “indisponível”, em vez de inventar números.

As listas incluídas funcionam sem conexão. Atualizá-las estabelece conexão HTTPS direta com seus provedores. Consulte a política de privacidade e as licenças do projeto para detalhes.

Finalidade única para a aba Privacidade: Bloquear anúncios e rastreadores em páginas visitadas e oferecer controles locais de filtragem por site.

Dados para declaração de privacidade: atividade de navegação/domínios consultados e conteúdo da página selecionado manualmente são processados localmente para aplicar filtros e exceções; configurações e contagens disponíveis ficam no armazenamento local. Não são vendidos, usados para publicidade própria ou enviados ao desenvolvedor. O download opcional/agendado de listas ocorre por HTTPS diretamente dos provedores indicados na política.

Permissões do pacote da loja: `declarativeNetRequest` aplica as regras; `activeTab` permite consultar correspondências da aba quando o usuário abre o popup; `storage` guarda preferências; `tabs` identifica a aba e atualiza páginas abertas; `alarms` agenda atualização; `contextMenus` oferece seleção de elemento; acesso HTTP/HTTPS é necessário para aplicar filtros em sites e baixar listas. `declarativeNetRequestFeedback` fica somente no build descompactado de desenvolvimento.

Antes de submeter: conferir o texto com o comportamento da versão final, publicar `PRIVACY.md` num URL público, produzir captura real 1280×800 ou 640×400 da interface, completar a aba Privacidade e testar no Chrome instalado com anúncios reais.
