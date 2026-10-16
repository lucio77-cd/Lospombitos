'use strict';

const { decidirInicializacaoCarteira } = require('./carteiraInicial');

async function inicializarCarteira({ db, admin, uid, usuarioAuth, idadeContaMs }) {
  const usuarioRef = db.collection('usuarios').doc(uid);
  const carteiraRef = db.collection('carteiras').doc(uid);

  return db.runTransaction(async (tx) => {
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
      erro.code = 'RECONCILIACAO_NECESSARIA';
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
}

module.exports = { inicializarCarteira };
