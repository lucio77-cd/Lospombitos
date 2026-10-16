'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decidirInicializacaoCarteira, JANELA_CADASTRO_MS } = require('../api/_lib/carteiraInicial');

test('não concede capital novamente quando usuário e carteira já existem', () => {
  assert.deepEqual(decidirInicializacaoCarteira({
    usuarioExiste: true, carteiraExiste: true, idadeContaMs: 1,
  }), { acao: 'ja_inicializada' });
});

test('inicializa apenas uma conta nova sem documentos, dentro da janela', () => {
  assert.deepEqual(decidirInicializacaoCarteira({
    usuarioExiste: false, carteiraExiste: false, idadeContaMs: 1000,
  }), { acao: 'inicializar' });
});

test('não concede capital se o perfil existe mas a carteira não', () => {
  assert.deepEqual(decidirInicializacaoCarteira({
    usuarioExiste: true, carteiraExiste: false, idadeContaMs: 1000,
  }), { acao: 'reconciliar', motivo: 'estado_parcial' });
});

test('não concede capital se a carteira existe mas o perfil não', () => {
  assert.deepEqual(decidirInicializacaoCarteira({
    usuarioExiste: false, carteiraExiste: true, idadeContaMs: 1000,
  }), { acao: 'reconciliar', motivo: 'estado_parcial' });
});

test('não concede capital automaticamente a uma conta antiga sem documentos', () => {
  assert.deepEqual(decidirInicializacaoCarteira({
    usuarioExiste: false, carteiraExiste: false, idadeContaMs: JANELA_CADASTRO_MS + 1,
  }), { acao: 'reconciliar', motivo: 'conta_antiga_sem_dados' });
});

test('rejeita metadados de idade ausentes ou inválidos', () => {
  for (const idadeContaMs of [undefined, NaN, Infinity, -1]) {
    assert.equal(decidirInicializacaoCarteira({
      usuarioExiste: false, carteiraExiste: false, idadeContaMs,
    }).acao, 'reconciliar');
  }
});
