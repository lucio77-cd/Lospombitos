'use strict';

const { decidirInicializacaoCarteira } = require('./_lib/carteiraInicial');

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
    const db = getDb();
    const usuarioRef = db.collection('usuarios').doc(uid);
    const carteiraRef = db.collection('carteiras').doc(uid);

    const resultado = await db.runTransaction(async (tx) => {
      const [usuarioSnap, carteiraSnap] = await Promise.all([
        tx.get(usuarioRef),
        tx.get(carteiraRef),
      ]);

      const decisao = decidirInicializacaoCarteira({
        usuarioExiste: usuarioSnap.exists,
        carteiraExiste: carteiraSnap.exists,
        idadeContaMs,
      });

      if (decisao.acao === 'ja_inicializada') {
        return { inicializada: false, existente: true };
      }

      if (decisao.acao === 'reconciliar') {
        const erro = new Error(
          decisao.motivo === 'estado_parcial'
            ? 'Cadastro com dados parciais. A carteira precisa de reconciliação antes de continuar.'
            : 'Conta sem dados financeiros iniciais e fora da janela segura de cadastro. É necessária uma reconciliação.'
        );
        erro.status = 409;
        throw erro;
      }

      const agora = admin.firestore.FieldValue.serverTimestamp();
      tx.create(usuarioRef, {
        uid,
        nome: usuarioAuth.displayName || 'Pombito',
        email: usuarioAuth.email || null,
        foto_google: usuarioAuth.photoURL || null,
        perfil_completo: false,
        data_adesao: agora,
      });
      tx.create(carteiraRef, {
        uid,
        saldo_disponivel: 500000,
        saldo_investido: 0,
        patrimonio_total: 500000,
        posicoes: [],
        historico_ordens: [],
        criada_em: agora,
      });

      return { inicializada: true, existente: false };
    });

    res.status(200).json({ ok: true, ...resultado });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) {
      console.error('[api/inicializar-carteira]', uid, e.message);
    }
    res.status(status).json({
      error: e.message || 'Não foi possível inicializar a carteira.',
      code: status === 409 ? 'RECONCILIACAO_NECESSARIA' : undefined,
    });
  }
};
