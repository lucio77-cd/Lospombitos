# Anti-cheat do saldo/preço + Firestore Rules

Segunda leva de correções, focada em proteger a integridade do ranking
("Descobrir Membros" — você confirmou que isso importa de verdade).

## O que mudou

- **`api/executar-ordem.js`** (novo): agora é o servidor quem calcula o
  preço de ordens **a mercado** de ações, FIIs e cripto (busca direto na
  brapi/CoinGecko) e quem roda a transação que debita/credita o saldo.
  Antes, tudo isso rodava no navegador — bastava abrir o DevTools e
  chamar a função com um preço forjado.
- **`api/_lib/firebaseAdmin.js`** e **`api/_lib/precos.js`** (novos):
  suporte pro endpoint acima — autenticação via ID token do Firebase e
  busca de preço real.
- **`ordem.html`**: a função `executar()` agora chama `/api/executar-ordem`
  em vez de rodar a transação localmente. Visualmente nada muda pro usuário.
- **`package.json`** (novo): declara a dependência `firebase-admin` para a
  Vercel instalar automaticamente. **Se você já tiver um `package.json` no
  projeto, não sobrescreva — só adicione `"firebase-admin": "^12.6.0"` nas
  `dependencies` dele.**
- **`firestore.rules`** (novo, rascunho): trava escrita direta do client em
  `carteiras` e nos campos de saldo de `usuarios`; convites, posts e ordens
  também ganharam regras. **Leia os comentários "REVISAR" dentro do
  arquivo** — não tenho certeza suficiente sobre `galeria`, `leiloes`,
  `lances`, `pagamentos` e `transacoes` pra travar com confiança; deixei
  fechadas por padrão até você confirmar o comportamento esperado.

## O que NÃO ficou coberto nesta leva (de propósito, pra não travar demais de uma vez)

1. **$POMB (`pomb-economy.js`) continua vulnerável.** Ele grava
   `pombcoins` direto do client via `increment()`. Isso significa que dá
   pra rodar `POMB._creditar(999999, 'x')` no console e inflar o saldo.
   O `firestore.rules` deste rascunho ainda permite essa escrita (senão o
   recurso quebra por completo). Como o $POMB decide lances em `leiloes`,
   se os leilões importam tanto quanto o ranking de saldo, esse é o
   próximo alvo natural — mesma receita: mover `_creditar`/`debitar` pra
   uma função serverless com Admin SDK.
2. **Ordens `limitada`/`stop`** e **ativos de renda fixa** (tesouro/CDB/LCI)
   ainda usam o preço que o client declara. O motivo: "limitada"/"stop"
   são ordens pendentes por natureza (o usuário escolhe o preço-alvo) e
   renda fixa não tem cotação de bolsa pra validar do mesmo jeito — mover
   isso pro servidor é um projeto à parte (precisaria de um mecanismo de
   ordens pendentes + fórmula de rendimento server-side).
3. Reparei que o app debita o saldo **imediatamente**, mesmo quando a
   ordem fica marcada como "agendada" (mercado fechado) — ou seja, hoje
   não existe de fato uma fila de ordens pendentes esperando o mercado
   abrir, só um rótulo diferente. Mantive esse comportamento como estava
   pra não mudar a experiência sem combinar antes com você.

## Passos para colocar no ar

### 1. Gerar as credenciais do Firebase Admin
Firebase Console → ⚙️ Configurações do projeto → **Contas de serviço** →
"Gerar nova chave privada" → baixa um JSON com `project_id`, `client_email`
e `private_key`.

### 2. Variáveis de ambiente na Vercel
Além de `GEMINI_API_KEY` e `ANTHROPIC_API_KEY` (leva anterior), adicione:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (cole o valor completo, com `-----BEGIN PRIVATE
  KEY-----` etc.; se a Vercel exibir os `\n` escapados, o código já trata isso)

Opcional: `BRAPI_TOKEN`, se você tiver um token próprio da brapi (hoje o
`mercado-api.js` do client usa um token hardcoded — baixa prioridade, mas
vale mover também quando sobrar tempo).

### 3. Subir os arquivos
Novos: `api/executar-ordem.js`, `api/_lib/firebaseAdmin.js`,
`api/_lib/precos.js`, `package.json` (ou mescle), `firestore.rules`.
Alterado: `ordem.html`.

### 4. Testar as regras ANTES de publicar
No Firebase Console → Firestore → Regras → **Playground**, simule pelo
menos:
- Um usuário lendo o próprio doc em `usuarios` e em `carteiras`
- Um usuário lendo o doc de outro membro em `usuarios` (pro feed de
  "Descobrir Membros" funcionar)
- Um usuário tentando escrever `saldo_disponivel` direto em `usuarios`
  (deve ser **negado**)
- Criação de post comum (`tipo != 'trade'`) pelo dono (deve **permitir**)
- Criação de post com `tipo: 'trade'` direto do client (deve ser **negado**)

Só depois disso, publique as regras (`firebase deploy --only firestore:rules`
ou colando no console).

### 5. Testar o fluxo de ordem de ponta a ponta
Compre e venda um ativo pelo `ordem.html` normalmente e confirme no
Network do DevTools que a chamada vai para `/api/executar-ordem` — e que
o preço que aparece na tela de sucesso bate com o preço real de mercado
(não o que estava em cache no navegador).
