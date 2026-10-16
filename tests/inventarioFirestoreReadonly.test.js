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
