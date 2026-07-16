// ============================================================
//  etl/lib/firebaseAdmin.js
//
//  Init do Admin SDK pra rodar os scripts ETL localmente (fora
//  da Vercel). Usa as MESMAS 3 variáveis de ambiente do projeto:
//  FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
//
//  Pra rodar localmente, crie um arquivo .env na raiz do ETL (não
//  comite isso no git!) com essas 3 linhas, e rode com:
//    node -r dotenv/config etl/01-macro.js
//  (precisa `npm install dotenv` — só pra rodar local, não vai pra Vercel)
//
//  Ou exporta as variáveis direto no terminal antes de rodar:
//    export FIREBASE_PROJECT_ID=los-pombitos
//    export FIREBASE_CLIENT_EMAIL=...
//    export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
//    node etl/01-macro.js
// ============================================================

const admin = require('firebase-admin');

let app;
function getDb() {
  if (!app) {
    const projectId   = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey  = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'Credenciais do Firebase Admin não configuradas ' +
        '(FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY). ' +
        'Exporte as 3 variáveis de ambiente antes de rodar o script.'
      );
    }

    app = admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
  return admin.firestore();
}

module.exports = { getDb, admin };
