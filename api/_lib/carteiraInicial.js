'use strict';

const JANELA_CADASTRO_MS = 10 * 60 * 1000;

/**
 * Decide whether a server may grant the simulator's initial wallet.
 * Existing or partially existing Firestore state is never repaired by
 * granting capital automatically; it requires explicit reconciliation.
 */
function decidirInicializacaoCarteira({
  usuarioExiste,
  carteiraExiste,
  idadeContaMs,
  janelaCadastroMs = JANELA_CADASTRO_MS,
}) {
  if (usuarioExiste && carteiraExiste) {
    return { acao: 'ja_inicializada' };
  }

  if (usuarioExiste !== carteiraExiste) {
    return { acao: 'reconciliar', motivo: 'estado_parcial' };
  }

  if (
    !Number.isFinite(idadeContaMs) ||
    idadeContaMs < 0 ||
    idadeContaMs > janelaCadastroMs
  ) {
    return { acao: 'reconciliar', motivo: 'conta_antiga_sem_dados' };
  }

  return { acao: 'inicializar' };
}

module.exports = { decidirInicializacaoCarteira, JANELA_CADASTRO_MS };
