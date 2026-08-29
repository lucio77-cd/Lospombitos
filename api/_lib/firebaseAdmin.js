// ============================================================
//  api/_lib/firebaseAdmin.js
//
//  Init do Firebase Admin SDK pros endpoints serverless da Vercel.
//  Usa as variáveis de ambiente:
//    FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
//
//  verificarToken(req): confere o header "Authorization: Bearer <idToken>"
//  do Firebase Auth e devolve o uid, ou lança erro com .status (401/500).
// ============================================================

const admin = require('firebase-admin');

let app;
function getApp() {
  if (!app) {
    const projectId   = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey  = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      const err = new Error(
        'Credenciais do Firebase Admin não configuradas na Vercel ' +
        '(FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY).'
      );
      err.status = 500;
      throw err;
    }

    app = admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
  return app;
}

function getDb() {
  getApp();
  return admin.firestore();
}

async function verificarToken(req) {
  const header = req.headers?.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    const err = new Error('Token de autenticação ausente.');
    err.status = 401;
    throw err;
  }
  getApp();
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    return decoded.uid;
  } catch (e) {
    const err = new Error('Token de autenticação inválido ou expirado.');
    err.status = 401;
    throw err;
  }
}

module.exports = { getDb, verificarToken, admin };
