# YouTube AdBlock Engine — Noir Shield 0.2.0

Implementação local de 19/10/2026, baseada no commit `3ba1327d08190b9e3f75ca822ccdcd851ae7096d`. Sem publicação, push ou deploy. Carregue `dist/` como extensão descompactada; não é necessário compilar para testar o pacote entregue.

## Auditoria da versão anterior

- `src/manifest.json`: MV3, Chrome mínimo 121, service worker e um content script ISOLATED em document_start. Permissões existentes de DNR, feedback, storage, tabs, alarms e contextMenus; acesso HTTP/HTTPS. Não havia acesso MAIN aos dados do player.
- `src/background.ts`: fila serial de operações, compilação/atualização de listas, configuração persistente, regras dinâmicas de exceção e regras pessoais, contagem de eventos DNR. `src/shared.ts` define as configurações comuns. Popup/opções usam mensagens ao worker.
- `scripts/compiler.mjs` e `scripts/build.mjs`: compilação limitada de filtros ABP, cinco listas oficiais e regras estáticas do YouTube. Regras dinâmicas ocupam intervalos próprios; nenhuma nova reserva dinâmica foi necessária.
- `src/content.ts`: CSS geral, seleção manual de elementos e lógica do YouTube juntos. Observava classes de todo o documento; só reagia depois de `ad-showing`. No modo agressivo alterava tempo, mudo e velocidade do mesmo elemento de vídeo usado para conteúdo. Um indicador atrasado podia afetar o conteúdo legítimo.
- Cinco padrões antigos não demonstravam cobertura: bloquear telemetria não impede necessariamente o anúncio. Não havia inspeção das respostas do player, circuito de desativação em falha ou prevenção antes da reprodução.
- Pausa global usa prioridade 100000; exceções de site 50000; regras pessoais até 40000; listas 1/2. Essas exceções precedem as novas regras estáticas. `allowAllRequests` pode conservar a autorização no contexto do documento: recarregue após reativar um site anteriormente permitido.
- O CSS específico ignorava o controle `cosmetics` e incluía banners de avisos/promoções não necessariamente publicitários. Isso foi corrigido; listas gerais e filtros pessoais continuam independentes do botão YouTube.

## Camadas implementadas

### A — Rede

O ruleset `youtube` agora contém duas correspondências observadas numa página real, limitadas ao iniciador youtube.com e ao tipo de recurso:

| Destino | Tipo | Evidência |
|---|---|---|
| `googleads.g.doubleclick.net/pagead/id` | XHR/fetch | Requisição XHR observada no Edge |
| `static.doubleclick.net/instream/ad_status.js` | script | Requisição de script observada no Edge |

Os padrões terminam em separador DNR `^`, aceitando query sem ampliar para nomes semelhantes. A captura em `evidence/live-observation.json` registra host, caminho e tipo, sem query/cookies. Isso comprova a existência dos recursos, **não** que bloqueá-los elimina anúncios de vídeo. Removidos padrões legados não observados. As listas gerais continuam responsáveis por outras requisições publicitárias conhecidas.

Não há regra específica bloqueando googlevideo.com, `/youtubei/v1/player`, manifests ou mídia. Não foram acrescentadas regras de sessão: não há evidência para um bloqueio temporário adicional. `youtube:false` desliga o ruleset dedicado; sites permitidos/pausa global sobrepõem também as listas gerais.

### B — Dados do player

`src/youtube/data.ts` aceita somente objeto com `videoDetails.videoId`, `playabilityStatus.status === "OK"` e `streamingData`. Lives identificadas por `isLiveContent` passam sem alteração. Esvazia somente arrays não vazios com renderizadores reconhecidos: `adPlacements/adPlacementRenderer`, `playerAds/playerLegacyDesktopWatchAdsRenderer`, `adSlots/adSlotRenderer`.

A transformação é superficial e não muta o objeto original. Preserva mídia, captions, DRM, status, playbackTracking, ytcfg e todos os campos desconhecidos. Não faz remoção recursiva por nome. `adBreakHeartbeatParams` foi observado na página real, mas não foi alterado: não há evidência de que seja seguro removê-lo. Os três formatos publicitários são exercitados por fixtures sintéticas; a sessão real não forneceu esses arrays com anúncios.

`src/youtube/main.ts` trata atribuições/leitura de `ytInitialPlayerResponse`, respostas de fetch e getters XHR. Interceptação de rede restrita ao caminho exato `/youtubei/v1/player` da mesma origem. Fetch mantém o Response original (status, URL, headers, stream, abort e consumo do body); adapta somente json/text/clone. XHR chama primeiro o getter nativo, respeita readyState, responseType e erros nativos; não altera open/send, eventos ou cabeçalhos. Texto inválido ou maior que 4 MB é preservado. Em fetch, leitura por stream/arrayBuffer/blob não é filtrada. O método json usa a decodificação nativa e não impõe limite adicional de tamanho.

### C — Início antecipado e comunicação

MAIN e ISOLATED iniciam em document_start. ISOLATED lê as configurações locais diretamente, sem aguardar download de listas ou a fila cosmética do worker. MAIN fica inativo até receber autorização; isso respeita exceções, mas deixa uma janela assíncrona em que o player pode consumir os dados antes da configuração. Não existe garantia de prevenção em todas as inicializações.

O evento de controle contém apenas JSON `{version:1, enabled:boolean}`, com limite de tamanho e validação estrita. Não transporta comandos privilegiados, URLs, código ou estatísticas. A página pode interferir no mundo MAIN: esse canal não é uma fronteira de autenticação. Hooks são restaurados somente se ainda pertencem ao motor, sem desfazer alterações posteriores de terceiros. Um heartbeat de 5 s e prazo de 15 s limita a permanência dos hooks se o contexto da extensão desaparecer; timers podem ser atrasados pelo navegador.

### D — Estado e recuperação

`src/youtube/engine.ts` separa idle, conteúdo, anúncio detectado, pulável, não pulável, transição, falha e recuperação. Usa o botão nativo visível/habilitado somente em player marcado como anúncio. No máximo três cliques por episódio, separados por pelo menos um segundo. Se o anúncio não for pulável, preserva a reprodução.

Não altera currentTime, playbackRate, muted ou src. O modo agressivo passa a reduzir o debounce de 250 para 100 ms. A aceleração anterior foi retirada por não ser comprovadamente segura. Erro de mídia ou ausência de progresso com readyState baixo por mais de 12 s desativa a sanitização até o fim do documento. Não chama reload/load/play para recuperar, nem repete requisições. Libera os hooks e deixa o player nativo decidir; isso não promete recuperar dados já consumidos ou um bloqueio causado por outra lista.

### E/F — Cosméticos e SPA

CSS restrito a renderizadores publicitários, containers de ads e Shorts explicitamente marcados `is-ad`. Não usa texto genérico “patrocinado”, não remove DOM nem oculta o vídeo/controladores. Banners de avisos e promoções genéricas foram retirados da lista dedicada.

Um MutationObserver acompanha só o player atual. Uma descoberta a cada segundo permite reencontrar players substituídos. Navegação `yt-navigate-start/finish`, popstate e pageshow acionam atualização. Configure é idempotente; stop remove listeners/observer e cancela timers pendentes. Não há listener de página inteira para toda mutação de classe. Tela cheia/cinema não alteram a estratégia porque ela não reposiciona nem substitui o player.

## Testes e evidências

Comandos reproduzíveis (Node 20+):

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run e2e
npm run test:youtube
$env:NOIR_BROWSER='edge'
npm run e2e
npm run test:youtube
npm run test:youtube:live
```

`test:youtube:live` usa Edge instalado e rede real, com perfil temporário. Os demais testes de YouTube usam fixtures, não anúncios reais. Relatórios são gravados em `work/`; evidências desta entrega estão em `docs/evidence/`. Os tempos de inicialização nas fixtures incluem navegação/automação; não são um benchmark isolado do motor.

- TypeScript e 10 testes unitários: aprovados.
- Suíte original de integração: aprovada em Chromium e Edge. Inclui popup, listas, filtros, estatísticas DNR verificáveis, pausa, seleção de elementos, exportação/importação e persistência.
- Suíte específica: 24 verificações aprovadas em cada navegador (Chrome for Testing 156.0.8078.4 e Edge 155.0.4283.62). Inicialização na fixture: 55 ms e 80 ms, respectivamente. Exercita bootstrap, fetch, XHR, JSON inválido, abort, live, SPA, CSS, limite de cliques, whitelist, pausa, restauração e erro real de elemento media.
- YouTube real no Edge: vídeo `jNQXAC9IVRw` reproduziu com proteção ligada e desligada; readyState 4, avanço contínuo, nenhum erro de mídia ou pageerror na janela observada. Sem anúncio de vídeo observado em ambos. As correspondências DNR da amostra desativada incluem ALLOW; **não são contadores de anúncios bloqueados**.
- Sem perfilagem prolongada de heap/CPU ou validação manual completa em Chrome estável. Teste automatizado de Chromium usa Chrome for Testing. A inspeção de limpeza e os testes de toggles não substituem medição de vazamento por horas.

### Roteiro real obrigatório antes de alegar cobertura

Use perfil de teste sem outros bloqueadores; preserve Console e Network. Compare proteção desligada/ligada, com a mesma conta e região, e registre versão, vídeo, horário, evento de anúncio e resultado. Nunca conclua bloqueio só pela ausência de anúncio numa sessão.

| Cenário | Como validar | Situação nesta entrega |
|---|---|---|
| Pre-roll, 5/15/30 s, não pulável | Repetir vídeo que recebeu ad no controle; verificar mídia e dados do anúncio antes de carregar | Sem amostra real com ad; fixtures de dados e fallback aprovadas |
| Mid-roll/post-roll | Assistir vídeo longo até intervalos/final sem avançar; confirmar continuidade | Pendente real |
| Playlist | Transição automática e seleção manual; repetir após pausa do motor | Pendente real; troca sintética de player aprovada |
| Shorts | Entrar/sair e trocar vários Shorts; inspecionar renderizadores `is-ad` | Pendente real; navegação sintética aprovada |
| SPA/histórico/nova aba | Dez trocas entre vídeos e Shorts; voltar/avançar; verificar um conjunto de listeners | SPA sintética aprovada; sessão longa pendente |
| Tela cheia/cinema/legendas | Alternar durante conteúdo e anúncio; verificar controles e legendas | Pendente manual |
| Site permitido | Permitir youtube.com e subdomínios; repetir fetch/XHR e DNR | Automatizado aprovado |
| Sem anúncios | Medir avanço com/sem proteção e verificar mídia | Real aprovado na amostra curta |
| Falha de rede/player | Simular erro e buffering; observar liberação sem reload loop | Erro de mídia sintético aprovado; buffering prolongado pendente |
| Live | Abrir transmissão real e trocar qualidade | Estrutura live preservada no teste; reprodução live real pendente |
| Desativação pelo popup | Confirmar retirada de CSS e hooks, nenhum novo clique | Automatizado aprovado |
| Desativação da extensão no navegador | Desativar em extensions e recarregar a aba | Pendente manual; ver limite abaixo |

Para diagnóstico opcional, no console da página de opções da extensão execute:

```javascript
await chrome.runtime.sendMessage({type:'SET',patch:{youtubeDebug:true}});
```

O console do YouTube mostra transições `[Noir YouTube]`. Para desligar, use false. Logs não incluem URLs de mídia nem incrementam contadores. `getMatchedRules` e `testMatchOutcome` exigem as permissões de feedback já existentes no pacote descompactado.

## Limites explícitos

1. DNR não inspeciona/regrava corpos JSON e não separa anúncio de conteúdo no mesmo fluxo. A sanitização é código empacotado executado na página, não uma capacidade DNR.
2. Inserção no servidor, vídeo patrocinado pelo criador, ad sem renderizador conhecido, dados em caminhos novos, workers, streams/binários e contextos de iframe não cobertos podem escapar. Anúncios não puláveis nesses caminhos continuam; o motor não salta o conteúdo às cegas.
3. Lives são intencionalmente excluídas da sanitização. Nenhum bypass de autenticação/DRM ou troca de cliente/API foi implementado.
4. Dados já consumidos pelo player não podem ser “desconsumidos”. Desativar restaura as APIs e o objeto inicial original; para uma sessão completamente limpa, recarregue. Desativar/desinstalar a extensão pelo navegador pode invalidar ISOLATED antes de executar sua limpeza: MAIN tem expiração, mas CSS já inserido pode exigir reload. Não se promete desligamento retroativo instantâneo nesse caso.
5. A interface visual, filtros pessoais e estatísticas existentes foram preservados; cliques, dados removidos e CSS não contam como bloqueios de rede. A semântica perigosa da aceleração agressiva foi substituída e o texto da interface atualizado.
6. Não há comprovação de eliminação integral de publicidade nem garantia de aprovação pela Chrome Web Store. Nenhum código remoto executável, eval, nova dependência de produção ou nova permissão foi acrescentado.

## Fontes consultadas

- [Chrome: declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) — prioridades, ações, limites e regras estáticas/dinâmicas/sessão.
- [Chrome: content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) — document_start, isolamento e execução MAIN.
- Capturas de rede próprias e testes locais anexos; nenhum endpoint novo foi inferido por nome sem observação.

## Arquivos

Criados: `src/youtube/data.ts`, `src/youtube/main.ts`, `src/youtube/engine.ts`, `tests/youtube.test.mjs`, `tests/youtube-e2e.mjs`, `tests/youtube-live.mjs`, este relatório e evidências; `dist/youtube-main.js` gerado.

Modificados: `src/content.ts`, `src/background.ts`, `src/shared.ts`, `src/manifest.json`, textos em `src/popup.ts` e `src/options.html`, `scripts/build.mjs`, `tests/e2e.mjs`, `package.json`, `.gitignore`, `README.md`, `STORE_LISTING.md` e `dist/` recompilado. O build de clone novo baixou novamente as cinco listas oficiais; por isso seus arquivos compilados/metadados também mudaram. Nenhuma alteração visual em CSS/estrutura do popup.
