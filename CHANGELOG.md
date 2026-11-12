# Histórico de versões

## Em investigação — iframes, 2026-10-29

- Corrige a seleção de endpoints com Request e URL de outro realm por getters nativos, sem acessar getters arbitrários de objetos.
- Aplica o filtro fetch a iframes vazios acessíveis, incluindo APIs emprestadas, inserções síncronas e navegação do WindowProxy.
- Preserva o realm efetivo da Response, inclusive fetch do iframe vinculado ao pai depois de remover o iframe.
- Restaura propriedades pertencentes ao motor em pausa/allowlist; preserva alterações posteriores de terceiros.
- Acrescenta contratos de iframe no Chrome, incluindo GC, clones, streams e navegação.
- A correção de cobertura não comprova por si só a resolução do aviso anti-adblock relatado. Não é uma nova versão publicada.

## 0.2.3 beta — 2026-10-28

- Corrige o caminho SPA /youtubei/v1/get_watch, incluindo o envelope explícito com playerResponse, preservando os demais dados de navegação.
- Mantém corpo filtrado coerente em JSON, texto, bytes, blob, stream e clones de fetch; preserva respostas não alteradas e falhas nativas.
- Filtra sequências de Shorts apenas quando a entrada publicitária tem adClientParams.isAd === true.
- Não classifica buffering inicial como travamento antes de haver progresso; rearma a filtragem na próxima navegação explícita após falha de um vídeo.
- Corrige o controle do ruleset YouTube e compila listas independentemente.
- Preserva os controles de diagnóstico locais e inclui seus recursos no pacote da loja.
- Compara mid-roll real com e sem extensão no Chrome instalado e no Edge. No Chrome, dois vídeos protegidos passam de 930 segundos contínuos sem anúncio, erro ou aviso observado; os controles exibem mid-roll em aproximadamente 519 e 625 segundos. Resultado limitado às sessões documentadas.
- Acrescenta executores de testes ocultos e em mudo, sem copiar perfis pessoais.

Ver [arquitetura e validação](docs/YOUTUBE-ENGINE.md). As versões 0.2.1 e 0.2.2 foram laboratórios locais; a versão publicada anterior é 0.2.0.
