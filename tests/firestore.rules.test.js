'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} = require('firebase/firestore');

const PROJECT_ID = 'demo-los-pombitos';
let env;

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
    },
  });
});

test.after(async () => {
  if (env) await env.cleanup();
});

test.beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'usuarios/alice'), {
      uid: 'alice',
      nome: 'Alice',
      username: 'alice',
      perfil_completo: true,
      saldo_disponivel: 500000,
      saldo_investido: 0,
      patrimonio_total: 500000,
      pombcoins: 99,
      email: 'alice@example.test',
    });
    await setDoc(doc(db, 'usuarios/bob'), {
      uid: 'bob',
      nome: 'Bob',
      username: 'bob',
      perfil_completo: true,
      saldo_disponivel: 123,
      email: 'bob@example.test',
    });
    await setDoc(doc(db, 'carteiras/alice'), {
      uid: 'alice',
      saldo_disponivel: 500000,
      posicoes: [],
    });
    await setDoc(doc(db, 'carteiras/bob'), {
      uid: 'bob',
      saldo_disponivel: 123,
      posicoes: [],
    });
    await setDoc(doc(db, 'ordens/ordem-alice'), { uid: 'alice', ticker: 'PETR4' });
    await setDoc(doc(db, 'ordens/ordem-bob'), { uid: 'bob', ticker: 'VALE3' });
    await setDoc(doc(db, 'perfis_publicos/bob'), {
      uid: 'bob',
      nome: 'Bob',
      username: 'bob',
      perfil_completo: true,
    });
  });
});

function dbAutenticado(uid) {
  return env.authenticatedContext(uid).firestore();
}

test('perfil privado só pode ser lido pelo dono', async () => {
  const alice = dbAutenticado('alice');
  const bob = dbAutenticado('bob');
  await assertSucceeds(getDoc(doc(alice, 'usuarios/alice')));
  await assertFails(getDoc(doc(alice, 'usuarios/bob')));
  await assertFails(getDoc(doc(bob, 'usuarios/alice')));
});

test('cliente não pode criar documento privado nem alterar campos financeiros', async () => {
  const alice = dbAutenticado('alice');
  await assertFails(setDoc(doc(alice, 'usuarios/novo'), {
    uid: 'novo',
    perfil_completo: false,
  }));
  await assertFails(updateDoc(doc(alice, 'usuarios/alice'), {
    saldo_disponivel: 1,
  }));
  await assertFails(updateDoc(doc(alice, 'usuarios/alice'), {
    saldo_investido: 1,
  }));
  await assertFails(updateDoc(doc(alice, 'usuarios/alice'), {
    patrimonio_total: 1,
  }));
  await assertFails(updateDoc(doc(alice, 'usuarios/alice'), {
    pombcoins: 1000000,
  }));
  await assertSucceeds(updateDoc(doc(alice, 'usuarios/alice'), {
    username: 'alice-novo',
  }));
});

test('carteiras são privadas e não aceitam escrita do cliente', async () => {
  const alice = dbAutenticado('alice');
  const bob = dbAutenticado('bob');
  await assertSucceeds(getDoc(doc(alice, 'carteiras/alice')));
  await assertFails(getDoc(doc(alice, 'carteiras/bob')));
  await assertFails(setDoc(doc(alice, 'carteiras/nova'), {
    uid: 'nova',
    saldo_disponivel: 500000,
    posicoes: [],
  }));
  await assertFails(updateDoc(doc(alice, 'carteiras/alice'), {
    saldo_disponivel: 999999999,
  }));
  await assertFails(deleteDoc(doc(alice, 'carteiras/alice')));
  await assertFails(getDoc(doc(bob, 'carteiras/alice')));
});

test('diretório público pode ser lido por membros autenticados, sem dados financeiros', async () => {
  const alice = dbAutenticado('alice');
  await assertSucceeds(getDoc(doc(alice, 'perfis_publicos/bob')));
  await assertFails(getDoc(doc(alice, 'usuarios/bob')));
});

test('membro pode criar seu perfil público apenas com campos permitidos', async () => {
  const alice = dbAutenticado('alice');
  await assertSucceeds(setDoc(doc(alice, 'perfis_publicos/alice'), {
    uid: 'alice',
    nome: 'Alice',
    username: 'alice',
    foto_perfil: 'https://example.test/alice.png',
    perfil_completo: true,
    perfil_investidor: 'moderado',
    bio: 'Olá',
    musica: null,
    filme: null,
    cor: 'roxo',
  }));
  await assertFails(setDoc(doc(alice, 'perfis_publicos/alice-invasao'), {
    uid: 'alice-invasao',
    nome: 'Alice',
    perfil_completo: true,
  }));
  await assertFails(setDoc(doc(alice, 'perfis_publicos/alice'), {
    uid: 'alice',
    nome: 'Alice',
    perfil_completo: true,
    saldo_disponivel: 500000,
  }));
});

test('membro só altera seu perfil público e não pode acrescentar campos financeiros', async () => {
  const alice = dbAutenticado('alice');
  await assertSucceeds(setDoc(doc(alice, 'perfis_publicos/alice'), {
    uid: 'alice',
    nome: 'Alice',
    username: 'alice',
    perfil_completo: true,
  }));
  await assertSucceeds(updateDoc(doc(alice, 'perfis_publicos/alice'), {
    username: 'alice2',
  }));
  await assertFails(updateDoc(doc(alice, 'perfis_publicos/alice'), {
    saldo_disponivel: 999999,
  }));
  await assertFails(updateDoc(doc(alice, 'perfis_publicos/bob'), {
    username: 'bob-hackeado',
  }));
  await assertFails(deleteDoc(doc(alice, 'perfis_publicos/alice')));
});

test('ordens são legíveis apenas pelo titular e não podem ser alteradas pelo cliente', async () => {
  const alice = dbAutenticado('alice');
  await assertSucceeds(getDoc(doc(alice, 'ordens/ordem-alice')));
  await assertFails(getDoc(doc(alice, 'ordens/ordem-bob')));
  await assertFails(updateDoc(doc(alice, 'ordens/ordem-alice'), { ticker: 'HACK' }));
  await assertFails(setDoc(doc(alice, 'ordens/ordem-falsa'), {
    uid: 'alice',
    ticker: 'HACK',
  }));
});

test('usuário não autenticado não lê dados privados nem diretório de membros', async () => {
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, 'usuarios/alice')));
  await assertFails(getDoc(doc(anon, 'perfis_publicos/bob')));
});
