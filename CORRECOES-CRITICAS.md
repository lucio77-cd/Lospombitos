# Correções críticas — Los Pombitos / Soldo

## O que foi corrigido

1. **Chave Gemini exposta** (`arte-semanal.js`, `germinador.js`) → removida do client.
   Criado `api/gemini.js` (função serverless da Vercel) que guarda a chave no servidor.
2. **Chamada à Anthropic sem chave e sempre quebrada em produção** (`relatorio.html`,
   `atlas.html` — 3 ocorrências) → removida do client.
   Criado `api/analise-ia.js` que guarda a chave no servidor.
3. **XSS por falta de escaping** em `feed.html` (foto do post e campo `mood`) → corrigido
   com `escHtml()`.

## Passos para colocar no ar

### 1. Rotacionar a chave Gemini AGORA
A chave antiga (`AIzaSyCdQ1MThqZ5...`) já esteve exposta publicamente no código-fonte
do site. Trate-a como comprometida:
- Acesse https://aistudio.google.com/apikey
- Revogue/delete a chave antiga
- Gere uma nova

### 2. Configurar variáveis de ambiente na Vercel
No painel do projeto: **Settings → Environment Variables**, adicione:
- `GEMINI_API_KEY` = (a nova chave gerada no passo 1)
- `ANTHROPIC_API_KEY` = (sua chave da API da Anthropic, em console.anthropic.com)

Marque para os ambientes Production e Preview. **Não** prefixe essas variáveis com
`NEXT_PUBLIC_` ou `VITE_` — isso as exporia no client de novo.

### 3. Subir os arquivos
Os arquivos alterados/criados estão nesta pasta:
- `api/gemini.js` (novo)
- `api/analise-ia.js` (novo)
- `germinador.js` (alterado — chave removida, chama `/api/gemini`)
- `arte-semanal.js` (alterado — chave removida, chama `/api/gemini`)
- `relatorio.html` (alterado — chama `/api/analise-ia`)
- `atlas.html` (alterado — 3 chamadas agora usam `/api/analise-ia`)
- `feed.html` (alterado — escaping de `foto` e `mood` corrigido)

Substitua os arquivos correspondentes no seu repositório e faça o deploy normal
pela Vercel (a pasta `api/` é detectada automaticamente como Serverless Functions,
não precisa de configuração extra).

### 4. Testar depois do deploy
- Abra `germinar.html` após criar uma conta nova → o avatar deve gerar sem erro no console.
- Abra `relatorio.html` de qualquer ativo → a seção "ANÁLISE INTELIGENTE" deve aparecer
  (antes, sempre caía no fallback estático).
- Abra `atlas.html` e rode uma análise de ação/cripto e o simulador de cenário.
- No DevTools → Network, confirme que as chamadas saem para `/api/gemini` e
  `/api/analise-ia` (mesma origem), **nunca** para `generativelanguage.googleapis.com`
  ou `api.anthropic.com` diretamente do navegador.

## O que ainda falta (próximos passos, não incluídos aqui)

- **Firestore Security Rules**: eu não tenho o arquivo `firestore.rules` do projeto.
  Se você me enviar, reviso e reforço — em especial as coleções `usuarios` (campo
  `pombcoins`, hoje gravado livremente pelo client em `pomb-economy.js`) e `carteiras`
  (saldo/patrimônio, hoje calculados só no client em `ordem.html`).
- **Validação server-side do preço de execução em `ordem.html`**: hoje nada impede
  alguém de forjar o preço via console antes de confirmar uma ordem. Para um simulador
  isso não é "dinheiro real", mas compromete qualquer ranking entre membros.
