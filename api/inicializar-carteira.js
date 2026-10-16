'use strict';

const { inicializarCarteira } = require('./_lib/inicializarCarteiraService');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Método não permitido. Use POST.' });
    return;
  }

  let verificarToken, getDb, admin;
  try {
    ({ verificarToken, getDb, admin } = require('./_lib/firebaseAdmin'));
  } catch (e) {
    console.error('[api/inicializar-carteira] Falha ao carregar módulos:', e.message);
    res.status(500).json({ error: 'Serviço de inicialização indisponível.' });
    return;
  }

  let uid;
  try {
    uid = await verificarToken(req);
  } catch (e) {
    res.status(e.status || 401).json({ error: e.message });
    return;
  }

  try {
    const usuarioAuth = await admin.auth().getUser(uid);
    const criadoEmMs = Date.parse(usuarioAuth.metadata?.creationTime || '');
    const idadeContaMs = Date.now() - criadoEmMs;
    if (!Number.isFinite(idadeContaMs) || idadeContaMs < 0) {
      res.status(409).json({
        error: 'Não foi possível confirmar a data de criação da conta. É necessária uma reconciliação.',
        code: 'RECONCILIACAO_NECESSARIA',
      });
      return;
    }

    const resultado = await inicializarCarteira({
      db: getDb(),
      admin,
      uid,
      usuarioAuth,
      idadeContaMs,
    });

    res.status(200).json({ ok: true, ...resultado });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) {
      console.error('[api/inicializar-carteira]', uid, e.message);
    }
    res.status(status).json({
      error: e.message || 'Não foi possível inicializar a carteira.',
      ...(e.code ? { code: e.code } : {}),
    });
  }
};
