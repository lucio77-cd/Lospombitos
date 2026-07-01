// ============================================================
//  api/_lib/firebaseAdmin.js — Firebase Admin SDK (server-only)
//
//  Usa uma Service Account para falar com o Firestore/Auth com
//  privilégios de servidor (ignora as Security Rules — por isso
//  toda validação de negócio precisa acontecer AQUI, no código,
//  já que as rules não protegem mais essas escritas específicas).
//
//  Variáveis de ambiente necessárias na Vercel (Project Settings
//  → Environment Variables):
//    FIREBASE_PROJECT_ID
//    FIREBASE_CLIENT_EMAIL
//    FIREBASE_PRIVATE_KEY   (cole com as quebras de linha; se a
//                            Vercel escapar como \n, o replace
//                            abaixo desfaz isso)
//
//  Onde conseguir essas 3 informações:
//  Firebase Console → Configurações do projeto → Contas de serviço
//  → "Gerar nova chave privada" → baixa um JSON com project_id,
//  client_email e private_key.
//
//  ⚠️ Esse JSON é extremamente sensível — nunca commitar no repo,
//  nunca colar em chat, só cadastrar direto nas env vars da Vercel.
// ============================================================

const admin = require('firebase-admin');

function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Credenciais do Firebase Admin não configuradas (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY).');
  }

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

// Verifica o ID token que o client manda no header Authorization.
// Retorna o uid autenticado ou lança erro (token ausente/inválido/expirado).
async function verificarToken(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    const err = new Error('Token de autenticação ausente.');
    err.status = 401;
    throw err;
  }

  try {
    const app = getAdminApp();
    const decoded = await admin.auth(app).verifyIdToken(token);
    return decoded.uid;
  } catch (e) {
    const err = new Error('Token de autenticação inválido ou expirado.');
    err.status = 401;
    throw err;
  }
}

function getDb() {
  const app = getAdminApp();
  return admin.firestore(app);
}

module.exports = { admin, getAdminApp, verificarToken, getDb };
