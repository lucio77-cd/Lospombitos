'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { inicializarCarteira } = require('../api/_lib/inicializarCarteiraService');

function bancoFalso(estadoInicial = {}) {
  const docs = new Map(Object.entries(estadoInicial));
  const ref = (colecao, uid) => ({
    path: colecao + '/' + uid,
    colecao,
    id: uid,
  });
  const db = {
    collection: (colecao) => ({ doc: (uid) => ref(colecao, uid) }),
    runTransaction: async (callback) => {
      const pendentes = new Map();
      const tx = {
        get: async (r) => ({
          exists: docs.has(r.path),
          data: () => docs.get(r.path),
        }),
        create: (r, data) => {
          if (docs.has(r.path) || pendentes.has(r.path)) {
            const e = new Error('ALREADY_EXISTS');
            e.code = 6;
            throw e;
          }
          pendentes.set(r.path, data);
        },
      };
      const resultado = await callback(tx);
      for (const [path, data] of pendentes) docs.set(path, data);
      return resultado;
    },
  };
  return { db, docs };
}

const adminFalso = {
  firestore: {
    FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
  },
};
const usuarioAuth = {
  displayName: 'Teste',
  email: 'teste@example.com',
  photoURL: 'https://example.test/avatar.png',
};

test('cadastro novo cria perfil privado e carteira uma única vez', async () => {
  const { db, docs } = bancoFalso();
  const args = { db, admin: adminFalso, uid: 'alice', usuarioAuth, idadeContaMs: 1000 };

  assert.deepEqual(await inicializarCarteira(args), { inicializada: true, existente: false });
  assert.equal(docs.get('carteiras/alice').saldo_disponivel, 500000);
  assert.equal(docs.get('usuarios/alice').email, 'teste@example.com');

  assert.deepEqual(await inicializarCarteira(args), { inicializada: false, existente: true });
  assert.equal([...docs.keys()].length, 2);
});

test('não concede capital quando existe apenas perfil ou apenas carteira', async () => {
  for (const estado of [
    { 'usuarios/alice': { uid: 'alice' } },
    { 'carteiras/alice': { uid: 'alice', saldo_disponivel: 123 } },
  ]) {
    const { db, docs } = bancoFalso(estado);
    await assert.rejects(
      inicializarCarteira({ db, admin: adminFalso, uid: 'alice', usuarioAuth, idadeContaMs: 1000 }),
      (e) => e.status === 409 && e.code === 'RECONCILIACAO_NECESSARIA',
    );
    assert.equal(docs.size, 1);
  }
});

test('não concede capital a conta antiga sem documentos', async () => {
  const { db, docs } = bancoFalso();
  await assert.rejects(
    inicializarCarteira({ db, admin: adminFalso, uid: 'alice', usuarioAuth, idadeContaMs: 700000 }),
    (e) => e.status === 409,
  );
  assert.equal(docs.size, 0);
});

test('o perfil privado criado não inclui dados públicos nem valores financeiros', async () => {
  const { db, docs } = bancoFalso();
  await inicializarCarteira({ db, admin: adminFalso, uid: 'alice', usuarioAuth, idadeContaMs: 1000 });
  const perfil = docs.get('usuarios/alice');
  for (const campo of ['saldo_disponivel', 'saldo_investido', 'patrimonio_total', 'pombcoins', 'username', 'bio']) {
    assert.equal(Object.hasOwn(perfil, campo), false, campo);
  }
});
