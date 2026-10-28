# Noir Shield 0.2.3 beta

Bloqueador gratuito e de código aberto para Chrome e Edge, em Manifest V3. Combina regras de rede declarativeNetRequest, filtros cosméticos, listas verificáveis e controles por site. O código está em src/; dist/ contém a extensão compilada.

Na versão 0.2.3, o motor YouTube trata o carregamento inicial e a navegação SPA, incluindo get_watch e sequências de Shorts. Em 28/10/2026, dois controles no Chrome instalado exibiram mid-roll real; nos mesmos vídeos com proteção, o conteúdo reproduziu por mais de 15 minutos contínuos, sem anúncios ou aviso anti-adblock observado. Comparações anteriores no Edge também passaram. Isso descreve as sessões registradas, sem garantia para toda conta, região ou mudança futura do YouTube.

- [Mudanças da versão](CHANGELOG.md)
- [Arquitetura, testes e limites](docs/YOUTUBE-ENGINE.md)
- [Resultados Chrome](docs/validation/2026-10-28/chrome.json) e [Edge](docs/validation/2026-10-28/edge.json)
- [Privacidade](PRIVACY.md)
- [Chrome Web Store](https://chromewebstore.google.com/detail/camcmlekdnfckogegmeckemefkfpmmpa)

## Instalação local

1. Abra chrome://extensions ou edge://extensions e ative o modo de desenvolvedor.
2. Escolha **Carregar sem compactação** e selecione dist/, a pasta que contém manifest.json.
3. Feche as abas antigas do YouTube e abra novas abas após atualizar a extensão.

A versão disponível na loja pode ficar atrás do código enquanto uma atualização aguarda análise. Desative outra cópia do Noir Shield antes de carregar dist/.

## Recursos

- Regras DNR estáticas e dinâmicas para bloquear requisições publicitárias e rastreadores separáveis do conteúdo.
- EasyList, EasyPrivacy e AdGuard Spanish/Portuguese habilitadas por padrão; AdGuard Base e Tracking Protection opcionais.
- Atualização HTTPS direta das listas, programada diariamente para as listas incluídas ativas, e atualização manual com erros visíveis.
- Regras pessoais, listas por URL, filtros cosméticos, seleção manual de elementos e exceções por domínio/subdomínio.
- Pausa global ou por site, preferências persistentes, importação e exportação locais.
- YouTube: filtragem seletiva de dados publicitários reconhecidos, navegação SPA, sequências de Shorts e botão nativo de pular como fallback. O motor não altera tempo, velocidade, volume ou origem do vídeo e não oculta o aviso anti-adblock.
- Laboratório local para controlar separadamente as camadas do YouTube e comparar perfis de diagnóstico.

As estatísticas mostram apenas dados disponibilizados pelo navegador. Eventos cosméticos e transformações do player não são contados como bloqueios de rede. Fora do modo de desenvolvimento, totais de depuração podem ficar indisponíveis. Não há validação de bloqueio integral de Twitch nem de formatos publicitários desconhecidos inseridos no mesmo fluxo do conteúdo.

## Desenvolvimento

Requer Node.js 20+ e npm.

    npm ci
    npm run typecheck
    npm test
    npm run build
    npm run e2e
    npm run test:youtube

npm run build reutiliza .cache/ quando disponível; num clone novo baixa as fontes oficiais. npm run refresh baixa as listas novamente. A cache não é versionada: um build futuro pode refletir listas diferentes. As regras compiladas em dist/rules/ e os hashes publicados registram a versão testada.

O compilador suporta um subconjunto explícito da sintaxe de filtros. Rejeita sintaxe incompatível em vez de ampliar silenciosamente o bloqueio. Cada lista é compilada independentemente para preservar seu funcionamento quando outra é desativada.

## Testes reais do YouTube

Perfis temporários separados, sem copiar sessões pessoais. O executor Chrome instalado roda no Windows em um desktop separado, sem aparecer na tela de trabalho, com áudio global desativado e elementos em mudo/volume zero. O caminho padrão é C:\Program Files\Google\Chrome\Application\chrome.exe.

No PowerShell, para um controle sem Noir Shield:

    $env:NOIR_LABEL='ctrl01'
    $env:NOIR_CONTROL='1'
    $env:NOIR_ENTRY='search'
    $env:NOIR_VIDEO='0e3GPea1Tyg'
    $env:NOIR_SECONDS='1900'
    npm run test:youtube:chrome

Para proteção em outro perfil:

    Remove-Item Env:NOIR_CONTROL
    $env:NOIR_LABEL='prot01'
    $env:NOIR_CONTENT_TARGET='930'
    npm run test:youtube:chrome

Use rótulos curtos e inéditos. Para a playlist, use novos rótulos, NOIR_ENTRY='playlist' e NOIR_VIDEO='9vKqVkMQHKk'. Sem anúncio real no controle, a nova comparação é inconclusiva. Fixtures verificam contratos e regressões, mas não comprovam sozinhas eficácia no YouTube real. Os relatórios ficam em work/<rótulo>/, fora do pacote da loja.

## Pacote da Chrome Web Store

O ZIP completo de teste contém fonte e evidências. Para a loja, gere um ZIP separado com apenas a extensão e manifest.json na raiz:

    npm run typecheck
    npm test
    npm run build
    ./scripts/package-store.ps1 -Destination C:\caminho\NoirShield-CWS-0.2.3.zip

O empacotador inclui os recursos da extensão, inclusive o laboratório; exclui perfis, testes, documentação de execução e metadados locais. Substitui declarativeNetRequestFeedback por activeTab, como no pacote 0.2.0 já publicado. Os bundles JavaScript são preservados. [Texto para a loja](STORE_LISTING.md).

## Privacidade e permissões

Sem conta, publicidade própria, analytics ou telemetria. Preferências e contagens disponíveis ficam em chrome.storage.local e chrome.storage.session. Atualizações de listas acessam diretamente seus provedores por HTTPS, sem anexar histórico ou identificadores próprios. Não há código executável remoto.

| Permissão | Finalidade |
|---|---|
| declarativeNetRequest | Aplicar bloqueios e exceções de rede. |
| activeTab no pacote da loja | Consultar correspondências da aba após ação explícita no popup, quando permitido. |
| declarativeNetRequestFeedback apenas no build de desenvolvimento | Eventos e consultas de depuração. |
| storage | Preferências, regras, metadados e contagens locais disponíveis. |
| tabs | Identificar o domínio atual e atualizar abas abertas. |
| alarms | Agendar atualização das listas. |
| contextMenus | Acesso à seleção manual de elementos. |
| Acesso HTTP/HTTPS | Aplicar filtros nos sites e baixar as listas configuradas. |

## Licenças

Código e pacote: [GPL-3.0-only](LICENSE).

- [EasyList / EasyPrivacy](https://easylist.to/): [GPLv3 ou posterior / CC BY-SA 3.0](https://easylist.to/pages/licence.html).
- [AdGuard Filters](https://github.com/AdguardTeam/AdguardFilters): [GPLv3](https://github.com/AdguardTeam/AdguardFilters/blob/master/LICENSE).
- Dependências de desenvolvimento: TypeScript e Playwright (Apache-2.0), esbuild e pngjs (MIT).

As dependências de desenvolvimento não são carregadas remotamente pela extensão. dist/rules/metadata.json registra fontes e contagens das listas compiladas.
