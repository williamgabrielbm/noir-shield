# Investigação dos iframes — 29 de outubro de 2026

Estado: correção experimental local. A falha de cobertura dos iframes foi corrigida e testada. A causa do aviso anti-adblock apresentado na sessão afetada continua sem reprodução. Nenhum novo ZIP, push ou envio à loja foi realizado nesta investigação.

Base: commit `511a40c84a8d82b30e1afd721e249c09df539785`, versão publicada 0.2.3. Branch local: `fix/youtube-frame-fetch`. A candidata conserva o número 0.2.3 e usa `version_name` explicitamente experimental; não é uma nova versão publicada.

## Defeito demonstrado e correção

O ensaio anterior à alteração (`r29f01/report.json`) revelou três caminhos pelos quais uma resposta de player com `adSlots` atravessava a filtragem: `iframe.contentWindow.fetch`, `Request` criado em outro contexto JavaScript e `URL` criado em outro contexto. Nos dois caminhos do contexto principal, o mesmo conteúdo era filtrado. Esse ensaio usa respostas controladas: demonstra o defeito de transporte, mas não identifica a causa do aviso da captura.

`requestAddress` agora reconhece Request e URL pelos getters nativos, sem depender de `instanceof` do contexto principal e sem executar getters arbitrários de objetos imitadores. O endereço relativo usa o documento que originou o fetch; a origem permitida continua sendo a página principal.

`frames.ts` protege os contextos acessíveis `about:blank` e `about:srcdoc`, incluindo iframes aninhados, inserção síncrona no DOM, acesso por `contentWindow`/`contentDocument` e novo contexto após navegação. Não altera iframes HTTPS comuns nem contextos opacos. A desativação restaura apenas os descritores que ainda pertencem ao Noir, preservando substituições posteriores de terceiros.

Um erro adicional surgiu durante o teste de um fetch capturado de iframe e associado à janela principal antes de remover o iframe: o navegador devolve Response do contexto principal. Reconstruí-lo com o construtor do iframe removido causava `InvalidStateError` ao ler o corpo. A correção escolhe os construtores pelo contexto real da Response recebida. Os leitores JSON, texto, clone e stream foram verificados.

Não houve alteração do texto do aviso, ocultação da mensagem, recarga forçada, simulação de eventos publicitários ou alteração de reprodução para contornar o erro. As regras estáticas de rede foram preservadas.

## Evidências no Chrome instalado

Chrome `156.0.8078.48`, perfis temporários independentes, sem login, desktop privado do Windows sem alternância para a tela principal. Os processos receberam `--mute-audio`; as amostras de mídia registraram `muted=true` e `volume=0`. Nenhum perfil pessoal, cookie ou token foi copiado. Datas nos JSON são UTC; nesta tabela os horários são de São Paulo, UTC−3.

| Execução | Resultado observado |
| --- | --- |
| Controle sem extensão, `f29ctrl` | Pré-roll e mid-roll reais no vídeo `0e3GPea1Tyg`. Mid-roll às 09:23:50, após 539,193 s de conteúdo; retomada do mesmo vídeo às 09:23:56. Captura `ad-2.png` mostra anúncio patrocinado. |
| Versão publicada anterior, `f29old` | 930,838 s de conteúdo, sem anúncio ou aviso observado. O problema relatado também não foi reproduzido nesta versão. |
| Candidata com correção, `f29new` | 930,769 s de conteúdo em velocidade 1×, com 926 amostras, sem anúncio, aviso, pausa ou erro de mídia observado. |
| Shorts e playlist, `f29nav` | Seis Shorts e duas entradas consecutivas de playlist reproduziram. Nenhum anúncio ou aviso observado. Um estado ERROR transitório ocorreu na entrada inicial `/shorts/` antes da seleção do primeiro vídeo; depois passou a OK e reproduziu. |
| Atualização e reinício, `f29rest` | Entrada inicial, atualização e reinício do Chrome: aproximadamente 25 s por etapa, reprodução em andamento e sem aviso. A extensão de teste foi explicitamente recarregada via CDP após o reinício; isto não comprova persistência da instalação pela loja. |
| Cobertura real, `f29cov` | O profiler registrou execução de `protectFrame` e `protectRealm` sete vezes e criação de três wrappers `wrapFetch`. Confirma execução dos guardas no YouTube real; não identifica sozinho qual fetch do player atravessou um iframe. |

A resposta original de `/youtubei/v1/get_watch` da candidata continha 11 `adPlacements`, um `playerAds` e sete `adSlots`. O player exposto à página apresentou contagens zero. Houve oportunidades publicitárias reais no controle e estruturas publicitárias na resposta da candidata: a conclusão não depende apenas da ausência casual de anúncios. As sessões independentes não garantem os mesmos leilões ou a mesma segmentação.

Na candidata ocorreram seis falhas DNS em um host de mídia, uma requisição abortada e duas bloqueadas pelo cliente. Foram preservadas no relatório. O player continuou progredindo, não registrou erro de mídia e atingiu a meta. Os controles também registraram requisições abortadas/falhas; não se atribui automaticamente todo erro de rede à extensão.

## Verificação automatizada

- TypeScript e build passaram.
- 21 testes unitários passaram.
- 28 verificações anteriores do motor passaram no Chrome instalado.
- 39 verificações novas de contexto/iframe passaram no Chrome instalado, inclusive contra a candidata congelada usada nas sessões reais.
- Nenhum erro não tratado nos dois ensaios de navegador com respostas controladas.
- Cinco bundles da interface/background e todos os arquivos de regras estáticas permaneceram idênticos à distribuição anterior. O bundle alterado do motor é `youtube-main.js`, SHA-256 `037eacd6f67827d5d5ac48f26bab576e6eab74c02aa1230010b57937bfe054b5`.

## Limites e decisão de entrega

O aviso da captura não apareceu nem na versão anterior nem na candidata nos perfis temporários. Portanto, a diferença antes/depois não demonstra que esta alteração resolveu esse aviso. A edição manual de “viola” para “não viola” continua sendo uma observação da sessão afetada, sem causalidade estabelecida.

Não foi validado o caso em que um script inline de `srcdoc` usa fetch antes do evento load e antes de qualquer acesso do pai ao iframe. XHR nativo de um iframe também não recebeu nova interceptação nesta correção. Não há evidência de que esses sejam o caminho usado na sessão bloqueada. Não foi repetida uma sessão real no Edge com esta candidata. Shorts e playlist tiveram verificação de reprodução, mas não um controle publicitário pareado próprio.

O resultado permite afirmar que os três caminhos de transporte reproduzidos foram corrigidos e que a candidata reproduziu o vídeo testado por mais de 15 minutos, atravessando os pontos de mid-roll observados no controle. Não permite afirmar que o aviso relatado foi eliminado ou que a extensão seja indetectável.

**Decisão: não gerar novo ZIP nem promover a candidata como atualização validada.** Código, patch e compilado sem compactação permanecem identificados como experimentais. O próximo teste decisivo depende de reproduzir o aviso em um vídeo/sessão afetado e comparar a mesma condição com a correção.

## Reproduzir os ensaios

Na pasta do código experimental, execute `npm ci`, `npm run typecheck`, `npm test` e `npm run build`. Os testes abaixo usam o Chrome instalado em desktop privado, sem alterar o perfil pessoal. A instalação é local ao perfil de teste e carregada por CDP.

```powershell
$env:NOIR_INSTALLED_CHROME='1'
$env:NOIR_EXTENSION_DIR=(Resolve-Path dist).Path
$env:NOIR_LABEL='recheck-frames'
.\tests\launch-private-desktop.ps1 -Script tests/youtube-frames-e2e.mjs

$env:NOIR_ENTRY='search'
$env:NOIR_VIDEO='0e3GPea1Tyg'
$env:NOIR_QUERY='$456,000 Squid Game In Real Life MrBeast'
$env:NOIR_SECONDS='1100'
$env:NOIR_DIAGNOSTICS='1'
$env:NOIR_CONTROL='1'
$env:NOIR_LABEL='recheck-control'
.\tests\launch-private-desktop.ps1 -Script tests/midroll-hidden.mjs

$env:NOIR_CONTROL='0'
$env:NOIR_CONTENT_TARGET='930'
$env:NOIR_LABEL='recheck-candidate'
.\tests\launch-private-desktop.ps1 -Script tests/midroll-hidden.mjs

$env:NOIR_LABEL='recheck-navigation'
.\tests\launch-private-desktop.ps1 -Script tests/formats-session.mjs

$env:NOIR_LABEL='recheck-restart'
.\tests\launch-private-desktop.ps1 -Script tests/youtube-frame-restart.mjs
```

Inspecione os JSON e o `runner.log`; o exit code do launcher PowerShell sozinho não aprova o ensaio. Um controle sem anúncio real é inconclusivo para eficácia publicitária. Antes de aprovar uma atualização, reproduza o aviso relatado na versão anterior, confirme a reprodução normal na candidata na mesma condição e repita navegação e reprodução prolongada.

## Referências técnicas consultadas

O [filtro oficial do AdGuard](https://github.com/AdguardTeam/AdguardFilters/blob/master/BaseFilter/sections/specific.txt#L1015-L1016) contempla obtenção de fetch/Request por iframe. É suporte à relevância técnica desse vetor, não prova da causa local. A [alteração recente do uAssets](https://github.com/uBlockOrigin/uAssets/commit/0688dd16d8a3c8051505e6210399832f4302d371) desativou uma interceptação de JSON.parse por regressão; a candidata não acrescenta esse tipo de modificação global. A implementação local preserva a arquitetura existente e não incorpora código remoto executável.
