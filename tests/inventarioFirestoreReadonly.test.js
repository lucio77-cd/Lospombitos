'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  argumentos,
  tipoCampo,
  criarResumo,
  contarCampo,
} = require('../scripts/inventario-firestore-readonly');

test('argumentos exige valores e reconhece project ids', () => {
  assert.deepEqual(argumentos([
    'node', 'script', '--project-id', 'demo-app',
    '--confirm-project-id', 'demo-app',
  ]), { 'project-id': 'demo-app', 'confirm-project-id': 'demo-app' });
  assert.throws(() => argumentos(['node', 'script', '--project-id']));
});

test('tipoCampo classifica tipos sem serializar dados', () => {
  assert.equal(tipoCampo(null), 'nulo');
  assert.equal(tipoCampo(0), 'numero');
  assert.equal(tipoCampo(-1), 'numero');
  assert.equal(tipoCampo(Number.NaN), 'numero_nao_finito');
  assert.equal(tipoCampo('privado'), 'texto');
  assert.equal(tipoCampo([1]), 'array');
  assert.equal(tipoCampo({ x: 1 }), 'objeto');
});

test('resumo conta campos ausentes, tipos e valores financeiros negativos', () => {
  const resumo = criarResumo('carteiras');
  contarCampo(resumo, {}, 'saldo_disponivel');
  contarCampo(resumo, { saldo_disponivel: -10 }, 'saldo_disponivel');
  contarCampo(resumo, { saldo_investido: 'indefinido' }, 'saldo_investido');

  assert.equal(resumo.campos.saldo_disponivel.ausente, 1);
  assert.equal(resumo.campos.saldo_disponivel.tipos.numero, 1);
  assert.equal(resumo.financeiros_negativos.saldo_disponivel, 1);
  assert.equal(resumo.campos.saldo_investido.tipos.texto, 1);
});

test('não cria campos não previstos no esquema do relatório', () => {
  const resumo = criarResumo('usuarios');
  contarCampo(resumo, { email: 'não deve ser registrado' }, 'email');
  assert.equal(Object.hasOwn(resumo.campos, 'email'), false);
});


test('inventariar agrega contagens por coleção e cruza usuários/carteiras sem expor IDs', async () => {
  const dados = {
    usuarios: [
      { id: 'u1', data: { saldo_disponivel: 10, email: 'privado@example.test' } },
      { id: 'u2', data: { saldo_disponivel: -2 } },
    ],
    carteiras: [
      { id: 'u1', data: { saldo_disponivel: 10, posicoes: [] } },
      { id: 'u3', data: { saldo_disponivel: 'inválido' } },
    ],
    ordens: [{ id: 'o1', data: { uid: 'u1', status: 'executada' } }],
    perfis_publicos: [{ id: 'u2', data: { uid: 'outro-uid', nome: 'Não registrar' } }],
    posts: [{ id: 'p1', data: {} }],
    convites: [],
    pagamentos: [],
  };

  const db = {
    projectId: 'demo-test',
    collection(nome) {
      return {
        select() {
          return {
            async get() {
              const docs = (dados[nome] || []).map(item => ({
                id: item.id,
                data: () => item.data,
              }));
              return { size: docs.length, docs };
            },
          };
        },
      };
    },
  };

  const { inventariar } = require('../scripts/inventario-firestore-readonly');
  const resultado = await inventariar(db);

  assert.equal(resultado.modo, 'somente_leitura');
  assert.equal(resultado.projeto, 'demo-test');
  assert.deepEqual(resultado.falhas, []);
  assert.equal(resultado.colecoes.find(c => c.colecao === 'usuarios').documentos, 2);
  assert.equal(resultado.colecoes.find(c => c.colecao === 'usuarios').financeiros_negativos.saldo_disponivel, 1);
  assert.equal(resultado.colecoes.find(c => c.colecao === 'perfis_publicos').uid_ausente_ou_divergente, 1);
  assert.deepEqual(resultado.cruzamento, {
    usuarios_sem_carteira: 1,
    carteiras_sem_usuario: 1,
    presentes_em_ambas: 1,
    nota: 'Somente contagens; nenhuma lista de IDs é incluída.',
  });
  const serializado = JSON.stringify(resultado);
  assert.equal(serializado.includes('privado@example.test'), false);
  assert.equal(serializado.includes('Não registrar'), false);
  assert.equal(serializado.includes('u1'), false);
});

test('inventariar registra falhas por coleção sem incluir mensagem bruta', async () => {
  const db = {
    projectId: 'demo-test',
    collection(nome) {
      return {
        select() {
          return {
            async get() {
              const erro = new Error('informação sensível do ambiente');
              erro.code = 'permission-denied';
              throw erro;
            },
          };
        },
      };
    },
  };

  const { inventariar } = require('../scripts/inventario-firestore-readonly');
  const resultado = await inventariar(db);

  assert.equal(resultado.falhas.length, 8);
  assert.equal(resultado.falhas[0].tipo_erro, 'permission-denied');
  assert.equal(JSON.stringify(resultado).includes('informação sensível'), false);
});
