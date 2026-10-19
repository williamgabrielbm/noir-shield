# Noir Shield 0.2.0

Implementação atual do YouTube: [auditoria, arquitetura, testes executados e limitações](docs/YOUTUBE-ENGINE.md). O pacote inclui prevenção seletiva em MAIN, integração com configurações e fallback nativo. Não há comprovação de bloqueio integral de anúncios reais.

Extensão real para Chromium (Manifest V3) com bloqueio de rede por `declarativeNetRequest`, filtragem cosmética, exceções por site e controles para YouTube. **Versão beta 0.2.0:** funcional nos testes descritos abaixo, mas ainda sem validação manual completa no Chrome instalado, YouTube real e Twitch real. O código fonte está em `src/`; a pasta **`dist/`** é a extensão pronta para carregar.

## Instalar no Google Chrome ou Microsoft Edge

1. Extraia o projeto, caso tenha recebido um ZIP.
2. Abra `chrome://extensions` (Chrome) ou `edge://extensions` (Edge).
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione a pasta `NoirShield/dist` — a que contém `manifest.json`.
5. Fixe o ícone na barra de ferramentas. Abra um site HTTP/HTTPS e clique no ícone para usar o popup.

Depois de alterar o código, execute `npm ci` e `npm run build` na pasta do projeto; na página de extensões, clique em **Atualizar**. Recarregue as abas já abertas para iniciar os scripts de conteúdo atualizados.

## O que faz

- Bloqueia requisições conhecidas por regras DNR estáticas, atualizadas e personalizadas. O navegador aplica as regras sem passar o conteúdo das requisições pelo service worker.
- Usa EasyList, EasyPrivacy e AdGuard Spanish/Portuguese por padrão. AdGuard Base e Tracking Protection podem ser ativadas em Configurações.
- Compila filtros textuais baixados por HTTPS para o subconjunto suportado por esta extensão. Atualizações agendadas ocorrem uma vez por dia para listas incluídas que estiverem ativas; o botão **Atualizar** permite tentar imediatamente. Erros ficam visíveis na página de listas.
- Aplica seletores CSS compatíveis, incluindo regras globais, regras de domínio, exceções cosméticas e regras criadas pelo usuário. CSS continua valendo em conteúdo dinâmico. A seleção manual destaca o elemento, permite confirmar e oferece desfazer nas configurações.
- Pausa globalmente ou por site. A lista de permissões persiste após reiniciar o navegador e vale para subdomínios. Páginas abertas recebem a mudança cosmética imediatamente; uma navegação/reload renova o contexto das regras de rede da página.
- YouTube: DNR para recursos publicitários observados, filtragem seletiva de dados reconhecidos em `ytInitialPlayerResponse`, fetch e XHR; CSS publicitário, navegação SPA e botão nativo **Pular anúncio** como fallback. O modo agressivo reduz o intervalo de detecção sem alterar tempo, mudo ou velocidade do vídeo. Ações de player e sanitização **não** são contabilizadas como bloqueios de rede.

## Desenvolvimento e testes

Requer Node.js 20+.

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run e2e
$env:NOIR_BROWSER='edge'; npm run e2e
```

`npm run refresh` baixa novamente as fontes oficiais e recompila o pacote. `npm run build` reutiliza `.cache/` quando presente; num clone novo, baixa as fontes oficiais. O conteúdo da cache não é versionado, portanto um build futuro pode refletir novas versões das listas. O compilador (`scripts/compiler.mjs`) rejeita sintaxe incompatível em vez de criar regras mais amplas sem aviso.

## Publicação

O ZIP do repositório/projeto, que contém `dist/` como subpasta, **não** deve ser enviado à Chrome Web Store. Para gerar um ZIP de upload com `manifest.json` na raiz e sem os metadados locais `_metadata/`:

```powershell
npm ci
npm run typecheck
npm test
npm run build
./scripts/package-store.ps1
```

O comando cria `../NoirShield-CWS-0.2.0.zip`. O pacote inclui apenas os arquivos necessários da extensão, sua documentação e as regras compiladas. Na versão de loja, a permissão de depuração `declarativeNetRequestFeedback` é removida e `activeTab` permite consultar correspondências da aba quando o usuário aciona a extensão; totais acumulados de depuração não são prometidos. Consulte [PRIVACY.md](PRIVACY.md) e [STORE_LISTING.md](STORE_LISTING.md) antes de preencher o painel da loja. Publique a política de privacidade em um URL público. Faça os testes manuais abaixo antes de enviar para análise; aprovação pela loja não é garantida. A conta de desenvolvedor da Chrome Web Store e a verificação em duas etapas são gerenciadas pelo titular da conta.

O teste de ponta a ponta usa um perfil temporário e um servidor local. Ele verificou, em Chromium de teste e Edge instalado: carregamento MV3; regra incluída da EasyList (requisição não chegou ao servidor); regra personalizada; consulta de correspondência DNR; atualização da EasyList no service worker; ligar/desligar listas; adicionar, alternar e remover lista por URL; CSS cosmético; pausa por site e global; botão de energia do popup; seleção visual; exportar/importar configurações; acionamento de pular anúncio e CSS em uma página sintética do YouTube; navegação SPA; persistência após reinício. Não usa o perfil pessoal do navegador.

## Limites reais

- A sintaxe completa ABP/AdGuard **não** é suportada. O compilador aceita padrões de rede ancorados em domínio `||domínio^` com opções simples (`third-party`, tipo de recurso e `domain=`), exceções `@@`, e seletores cosméticos CSS `##` / `#@#`. Regras regex, scriptlets, redirecionamentos, filtros procedurais, `:has()` e modificações de resposta são ignorados. O relatório de build registra quantas regras foram ignoradas e duplicadas.
- O pacote contém até 4.500 regras de rede por lista incluída (a lista regional gerou 930), e as atualizações em execução usam até 3.500 por lista incluída e 1.000 por lista personalizada, reservando espaço para exceções e regras pessoais dentro do limite dinâmico. O limite cosmético é 3.000 por lista no pacote e 1.500 nas atualizações. A seleção favorece regras populares e distribui o restante pela lista; ela não reproduz a cobertura integral dos bloqueadores maduros.
- O bloqueio de anúncios no YouTube varia conforme o serviço entrega o vídeo. Anúncios no mesmo fluxo, formatos desconhecidos, dados já consumidos antes da configuração e caminhos não interceptados podem escapar. Lives não são sanitizadas. Erros de mídia liberam os hooks sem reload automático. Não há contorno de DRM nem de autenticação. A extensão não considera um anúncio “bloqueado” apenas porque um elemento foi ocultado. Ao desativar a extensão pelo navegador, recarregue a aba para remover também efeitos já aplicados.
- No Twitch e em outros players, as regras de terceiros e a filtragem cosmética funcionam quando o anúncio é uma requisição/elemento separável. Anúncios inseridos no mesmo fluxo de mídia não têm bloqueio confiável nesta versão.
- Os totais de sessão/acumulados dependem de `onRuleMatchedDebug`, disponível para extensões descompactadas em depuração; **não são prometidos na versão publicada pela loja**. O popup consulta `getMatchedRules` para a aba quando permitido pelo navegador; seu histórico é limitado. Onde essas APIs não permitem uma contagem confiável, aparece `—`/“indisponível”. Nenhum contador é estimado.
- Chrome e Edge podem impedir transparência *fora* da janela nativa do popup; os componentes internos usam vidro escuro translúcido.

### Testes manuais ainda necessários

1. Carregar `dist/` pelo fluxo de desenvolvedor no **Chrome instalado** e verificar o popup na janela nativa. A automação passou no Chromium de teste e no Edge instalado; o Chrome instalado não expôs o service worker quando iniciado pelo Playwright com `--load-extension` em headless.
2. No **YouTube real**, verificar pre-roll, mid-roll, Shorts, busca, página inicial e navegação entre vídeos com e sem anúncios. A automação cobriu DOM/player sintéticos, portanto não comprova remoção de anúncios reais servidos pelo YouTube.
3. No **Twitch real**, verificar se anúncios de terceiros são filtrados e confirmar as limitações para anúncios no fluxo de vídeo.
4. Testar em sites habituais do usuário, especialmente login, compras e vídeo, e usar a permissão por site quando uma regra causar incompatibilidade.
5. Testar o ZIP final enviado à loja, não apenas a pasta `dist/`; verificar que a loja aceita permissões, regras e declarações de privacidade.

## Arquitetura e permissões

`src/background.ts` gerencia DNR, listas, exceções, estatísticas e persistência. `src/content.ts` aplica CSS, seleciona elementos e trata o YouTube. `scripts/compiler.mjs` faz a conversão conservadora; `scripts/build.mjs` empacota as regras. `src/popup.*` e `src/options.*` implementam os controles. `chrome.storage.local` guarda preferências e contadores; `chrome.storage.session` guarda o estado da sessão. Não há analytics, telemetria própria, histórico enviado a servidores ou JavaScript remoto. A política de privacidade detalha os dados processados localmente e as conexões para baixar listas.

| Permissão | Uso |
|---|---|
| `declarativeNetRequest` | Bloquear ou permitir requisições com regras declarativas. |
| `declarativeNetRequestFeedback` | Consultar correspondências e obter eventos de depuração quando permitidos. |
| `storage` | Preferências, regras do usuário, metadados das listas e contadores disponíveis. |
| `tabs` | Identificar o site atual, atualizar abas abertas e exibir o contador da aba. |
| `alarms` | Tentar atualizar listas ativas diariamente. |
| `contextMenus` | Acesso à seleção manual pelo menu de contexto. |
| `http://*/*`, `https://*/*` | Aplicar filtros nas páginas e baixar as listas configuradas. Esta permissão ampla é necessária para um bloqueador geral; URLs visitadas não são transmitidas pela extensão. |

## Licenças e fontes dos filtros

O código do Noir Shield e o pacote distribuído são GPL-3.0. As regras incluídas derivam das fontes oficiais, com atribuição:

- [EasyList / EasyPrivacy](https://easylist.to/) — [licença GPLv3 ou posterior / CC BY-SA 3.0](https://easylist.to/pages/licence.html).
- [AdGuard Filters](https://github.com/AdguardTeam/AdguardFilters) — [GPLv3](https://github.com/AdguardTeam/AdguardFilters/blob/master/LICENSE). A lista Spanish/Portuguese fornece cobertura regional relevante para páginas em português, incluindo brasileiras.

Dependências de desenvolvimento: TypeScript (Apache-2.0), esbuild (MIT), Playwright (Apache-2.0) e pngjs (MIT). Nenhuma delas é carregada remotamente pela extensão. A pasta local `.cache/` contém o texto das listas baixadas para builds posteriores; `dist/rules/metadata.json` registra contagens e URLs de origem do build.
