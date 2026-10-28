# Chrome Web Store — Noir Shield 0.2.3 beta

Item existente: camcmlekdnfckogegmeckemefkfpmmpa. Atualizar este item; não criar outra extensão.

Nome: Noir Shield

Resumo do manifest: Bloqueio local de anúncios e rastreadores com listas verificáveis.

Categoria existente: Privacidade e segurança. Idioma: português (Brasil).

## Descrição

Noir Shield é um bloqueador gratuito e de código aberto para Chrome e Edge. Bloqueia anúncios e rastreadores com regras locais do navegador e listas conhecidas, incluindo EasyList, EasyPrivacy e AdGuard. Filtros visuais também removem componentes publicitários identificáveis das páginas.

Você pode pausar a proteção por site, escolher listas, adicionar regras e listas próprias, selecionar elementos para ocultar e exportar suas configurações. As preferências ficam no seu navegador; não há conta, publicidade própria ou telemetria do Noir Shield.

A versão 0.2.3 melhora o tratamento de anúncios do YouTube no carregamento inicial, na navegação entre vídeos e nas sequências de Shorts. Corrige um caminho de navegação que podia deixar anúncios escaparem e mantém a filtragem coerente entre as formas de leitura das respostas do player. O fallback usa o botão nativo de pular quando disponível, sem alterar o tempo, a velocidade ou o volume do conteúdo e sem esconder avisos anti-adblock.

Nos testes reais documentados em Chrome e Edge, controles sem proteção exibiram anúncios durante o vídeo; as sessões protegidas comparáveis reproduziram por mais de 15 minutos contínuos, sem anúncios nem aviso anti-adblock observado. Os resultados e os limites dos testes estão no repositório. A entrega de anúncios muda por sessão e formato; não prometemos bloqueio universal do YouTube ou Twitch.

As estatísticas dependem das informações que o navegador disponibiliza. Quando não há contagem confiável, a interface mostra “indisponível”. As listas incluídas funcionam sem conexão; atualizá-las estabelece conexão HTTPS direta com seus provedores. Nenhum código JavaScript remoto é executado.

Código, resultados dos testes e política de privacidade: https://github.com/williamgabrielbm/noir-shield

## Notas da versão

- Corrigida filtragem de respostas de navegação SPA do YouTube (get_watch).
- Leitura coerente do corpo filtrado em fetch, clones e streams.
- Tratamento seletivo de entradas publicitárias explícitas nas sequências de Shorts.
- Recuperação por vídeo e preservação do buffering inicial.
- Controles DNR e listas independentes preservados.
- Mid-roll real comparado com controles em Chrome e Edge; evidências no repositório.

## Privacidade e submissão

Finalidade única: bloquear anúncios e rastreadores em páginas visitadas e oferecer controles locais de filtragem por site.

As permissões do pacote da loja são as mesmas do item 0.2.0 publicado: declarativeNetRequest, storage, tabs, alarms, contextMenus, activeTab e acesso HTTP/HTTPS. Não incluir declarativeNetRequestFeedback no pacote publicado. Justificativas e comportamento de dados estão em PRIVACY.md e README.md.

Manter a política de privacidade, URLs de suporte, distribuição pública e recursos gráficos existentes. Não solicitar dispensa de análise como atualização apenas de regras estáticas: esta versão altera também o motor JavaScript. Submissão para análise não equivale a aprovação ou publicação pela loja.
