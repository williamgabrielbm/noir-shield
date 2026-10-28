# Motor YouTube — Noir Shield 0.2.3 beta

## Caminho SPA e dados reconhecidos

O YouTube real mostrou carregamento pela busca e playlist via /youtubei/v1/get_watch, com envelope [{playerResponse: ...}, {watchNextResponse: ...}]. A filtragem anterior cobria somente /youtubei/v1/player; leitores do corpo por stream também podiam obter dados diferentes dos leitores JSON/texto adaptados.

data.ts reconhece endpoints exatos, na mesma origem: player, get_watch e reel/reel_watch_sequence. Transforma somente respostas reconhecidas, com vídeo, status OK e streamingData; lives passam sem alteração. Esvazia arrays publicitários apenas quando todos os itens têm o renderizador esperado. Preserva campos desconhecidos, mídia, captions, DRM, playbackTracking e watchNextResponse. Não faz remoção recursiva genérica por nome.

Na sequência de Shorts, remove apenas entradas com command.reelWatchEndpoint.adClientParams.isAd === true, preservando conteúdo e continuação.

## Corpo da resposta e hooks

response.ts lê uma cópia limitada a 4.000.000 bytes. Para transformação reconhecida, cria um único corpo filtrado compatível com leitores e clones fetch. Remove cabeçalhos de tamanho, compressão e integridade que deixaram de descrever o corpo. Preserva URL, tipo, redirecionamento e status observáveis. Falha de parse, tamanho excessivo, controle desativado ou resposta não reconhecida preservam a resposta original sem consumir seu corpo.

main.ts instala hooks de fetch, getters XHR e ytInitialPlayerResponse sob autorização das configurações locais. O getter nativo XHR roda primeiro e conserva erros de estado/tipo. A restauração só remove hooks ainda pertencentes ao Noir Shield. Um heartbeat limita a permanência quando o controle desaparece; timers continuam sujeitos ao navegador.

MAIN e ISOLATED iniciam em document_start. O canal de configuração é restrito a schema, não expõe APIs privilegiadas e não é fronteira de autenticação. A página pode observar/interferir em hooks MAIN. Nenhuma técnica é apresentada como universalmente invisível.

## Ciclo de vida e rede

engine.ts acompanha player e SPA. Usa o botão nativo visível/habilitado com estado publicitário confirmado, no máximo três cliques por episódio. Não altera currentTime, playbackRate, muted ou src, nem recarrega/reproduz o vídeo para recuperar falhas. Erro de mídia ou buffering prolongado depois de progresso anterior libera a filtragem desse vídeo; a próxima navegação explícita rearma o motor. Buffering inicial sem progresso anterior não é tratado como travamento.

Cosméticos são restritos a componentes publicitários. O motor não oculta o aviso anti-adblock. Pausa global, site permitido e controles por camada continuam funcionando. O módulo YouTube desativa seu ruleset dedicado; listas gerais e filtros próprios têm controles separados. Pausa global e sites permitidos sobrepõem também as listas gerais.

As regras estáticas YouTube correspondem a recursos DoubleClick específicos observados, limitados ao iniciador e tipo. O laboratório permite as exceções estreitas existentes aos dois probes. Uma requisição bloqueada sozinha não comprova que um anúncio foi impedido. Não há bloqueio geral de mídia googlevideo, manifests ou endpoints de reprodução.

No controle Edge, player/ad_break foi observado antes de um anúncio real. Não foi acrescentada reescrita especulativa desse endpoint; nas sessões protegidas registradas, filtrar os dados de agendamento manteve o conteúdo nos intervalos comparáveis.

## Validação real — 28/10/2026

| Navegador instalado | Vídeo | Mid-roll no controle, posição do conteúdo | Conteúdo contínuo protegido |
|---|---|---|---|
| Chrome 156.0.8078.48 | 0e3GPea1Tyg, busca/SPA | 519,265 s; retomada confirmada | 930,422 s |
| Chrome 156.0.8078.48 | 9vKqVkMQHKk, playlist | 624,731 s; retomada confirmada | 930,229 s |
| Edge 156.0.4314.50 | 0e3GPea1Tyg, busca/SPA | Cerca de 519 s; retomada confirmada | 951,051 s |
| Edge 156.0.4314.50 | 9vKqVkMQHKk, playlist | Cerca de 624 s; retomada confirmada | 1.009,520 s |

As quatro sessões protegidas atravessaram os intervalos sem anúncio, erro de mídia ou aviso anti-adblock observado. Dados publicitários estavam presentes nas respostas originais protegidas. Perfis independentes não garantem o mesmo criativo. Os controles observaram anúncio em execução e retomada. Sem anúncio real em um novo controle, uma repetição é inconclusiva.

Chrome normal em desktops Windows separados, sem troca para a tela de trabalho; Edge headless. Áudio global desativado e elementos em mudo/volume zero. Sem login, cópia de perfil pessoal, seek ou aceleração. Amostras aproximadamente a cada segundo verificaram tempo e estados. Essa resolução e essas sessões não provam comportamento universal.

[Resumo Chrome](validation/2026-10-28/chrome.json) e [Edge](validation/2026-10-28/edge.json) registram comparações e hashes dos seis bundles. Relatórios brutos Chrome selecionados estão em validation/2026-10-28/chrome/. Sem cookies, tokens, corpos originais completos ou perfis. A flag genérica validated:false dos relatórios brutos não substitui a conclusão específica dos resumos revisados.

Falhas iniciais do executor Chrome por pipe ocorreram com e sem Noir Shield. A comparação final usou porta local e Chrome normal em desktop separado, sem flag adicional de instalação insegura, sem adulterar user-agent ou respostas do YouTube. O motor não precisou mudar nessa rodada. Uma fixture DNR falhou num perfil de caminho longo e passou com rótulo curto; a causa exata não foi comprovada. Esses ensaios negativos não foram contados como aprovados.

## Verificação e repetição

TypeScript, build, 19 testes unitários e 28 verificações específicas passaram no Chrome instalado. As verificações específicas também passaram anteriormente no Edge e Chromium. Fixtures cobrem bootstrap, endpoints, leitores, limites, erros, lives, SPA, controles, DNR e recuperação; não comprovam sozinhas eficácia publicitária real.

Shorts foram observados em sessões reais anteriores no Edge, com publicidade no controle. Nesta rodada Chrome, Shorts passaram por fixtures; a prova ao vivo acima cobre busca/SPA, playlist e mid-roll, sem alegar novo controle real de Shorts no Chrome. Não há comprovação integral de lives, Twitch ou formatos desconhecidos no mesmo fluxo.

O [README](../README.md#testes-reais-do-youtube) contém comandos. npm run test:youtube:chrome abre o Chrome instalado em desktop separado e mudo. Use rótulos curtos inéditos; controle com NOIR_CONTROL=1, proteção sem essa variável e NOIR_CONTENT_TARGET=930. Logs ficam em work/.

O ZIP da loja usa os mesmos bundles do motor, troca a permissão de depuração por activeTab como na 0.2.0 publicada e inclui a página de laboratório referenciada nas opções. Aprovação e distribuição pela loja são etapas distintas dos ensaios locais.
