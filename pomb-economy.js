// ============================================================
//  pomb-economy.js — Sistema de Economia $POMB
//  
//  COMO FUNCIONA:
//  - 1 $POMB a cada 5 minutos com aba aberta e visível
//  - Bônus diário de +10 $POMB na primeira visita do dia
//  - +5 $POMB ao postar
//  - +2 $POMB ao receber curtida
//  - +1 $POMB ao curtir
//  - +15 $POMB ao completar 1h seguida online (streak)
//  - +50 $POMB ao convidar alguém que germinou
// ============================================================

const POMB = {

  // ── CONFIGURAÇÃO ──
  config: {
    tick_intervalo_ms:  5 * 60 * 1000, // 5 minutos
    tick_valor:         1,              // $POMB por tick
    bonus_diario:       10,
    bonus_post:         5,
    bonus_curtida_dar:  1,
    bonus_curtida_recv: 2,
    bonus_streak_1h:    15,
    bonus_convite:      50,
    streak_threshold_ms: 60 * 60 * 1000, // 1 hora contínua
  },

  // ── ESTADO INTERNO ──
  _uid:           null,
  _tickTimer:     null,
  _streakTimer:   null,
  _sessionInicio: null,
  _streakGanho:   false,

  // ────────────────────────────────────────────
  //  INICIAR — chama ao logar
  // ────────────────────────────────────────────
  async iniciar(uid) {
    this._uid = uid;
    this._sessionInicio = Date.now();
    this._streakGanho   = false;

    await this._verificarDailyBonus();
    this._iniciarTick();
    this._iniciarStreakTimer();
    this._ouvirVisibilidade();

    console.log('[POMB] Economia iniciada para', uid);
  },

  // ────────────────────────────────────────────
  //  PARAR — chama ao deslogar
  // ────────────────────────────────────────────
  parar() {
    clearInterval(this._tickTimer);
    clearTimeout(this._streakTimer);
    this._uid = null;
    console.log('[POMB] Economia pausada.');
  },

  // ────────────────────────────────────────────
  //  TICK — 1 $POMB a cada 5 minutos visível
  // ────────────────────────────────────────────
  _iniciarTick() {
    clearInterval(this._tickTimer);
    this._tickTimer = setInterval(async () => {
      if (!this._uid || document.hidden) return;
      await this._creditar(this.config.tick_valor, 'tick_presenca');
    }, this.config.tick_intervalo_ms);
  },

  // ────────────────────────────────────────────
  //  STREAK — +15 após 1h contínua online
  // ────────────────────────────────────────────
  _iniciarStreakTimer() {
    clearTimeout(this._streakTimer);
    this._streakGanho = false;

    this._streakTimer = setTimeout(async () => {
      if (!this._uid || document.hidden || this._streakGanho) return;
      this._streakGanho = true;
      await this._creditar(this.config.bonus_streak_1h, 'streak_1h');
      this._mostrarNotificacao(`🔥 Streak! +${this.config.bonus_streak_1h} $POMB por 1h online!`);
    }, this.config.streak_threshold_ms);
  },

  // ────────────────────────────────────────────
  //  VISIBILIDADE — pausa se aba ficar oculta
  // ────────────────────────────────────────────
  _ouvirVisibilidade() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Aba oculta: pausa o streak
        clearTimeout(this._streakTimer);
      } else {
        // Voltou: reinicia o streak do zero se passou mais de 5min
        const ausencia = Date.now() - (this._ultimoVisible || Date.now());
        if (ausencia > 5 * 60 * 1000) {
          this._iniciarStreakTimer();
        }
        this._ultimoVisible = Date.now();
      }
    });

    this._ultimoVisible = Date.now();
  },

  // ────────────────────────────────────────────
  //  DAILY BONUS — +10 na primeira visita do dia
  // ────────────────────────────────────────────
  async _verificarDailyBonus() {
    if (!this._uid) return;
    try {
      const snap  = await db.collection('usuarios').doc(this._uid).get();
      const dados = snap.data() || {};
      const agora = new Date();
      const ultimo = dados.ultimo_daily ? dados.ultimo_daily.toDate() : null;

      if (!ultimo || ultimo.toDateString() !== agora.toDateString()) {
        await this._creditar(this.config.bonus_diario, 'bonus_diario');
        this._mostrarNotificacao(`🎁 Bônus diário: +${this.config.bonus_diario} $POMB!`);
      }
    } catch(e) {
      console.error('[POMB] Erro no daily bonus:', e);
    }
  },

  // ────────────────────────────────────────────
  //  AÇÕES PÚBLICAS — chamadas de fora
  // ────────────────────────────────────────────

  async aoPostar() {
    await this._creditar(this.config.bonus_post, 'bonus_post');
    this._mostrarNotificacao(`✍️ +${this.config.bonus_post} $POMB por postar!`);
  },

  async aoCurtir() {
    await this._creditar(this.config.bonus_curtida_dar, 'bonus_curtida_dar');
  },

  async aoReceberCurtida() {
    if (!this._uid) return;
    await this._creditar(this.config.bonus_curtida_recv, 'bonus_curtida_recv');
  },

  async aoConvidar() {
    await this._creditar(this.config.bonus_convite, 'bonus_convite');
    this._mostrarNotificacao(`🪶 +${this.config.bonus_convite} $POMB por trazer um irmão!`);
  },

  // ────────────────────────────────────────────
  //  CREDITAR — operação atômica no Firestore
  // ────────────────────────────────────────────
  async _creditar(valor, motivo) {
    if (!this._uid || valor <= 0) return;
    try {
      const update = {
        pombcoins: firebase.firestore.FieldValue.increment(valor),
        ultimo_tick: firebase.firestore.FieldValue.serverTimestamp(),
      };

      // Marca o daily separado para não sobrescrever
      if (motivo === 'bonus_diario') {
        update.ultimo_daily = firebase.firestore.FieldValue.serverTimestamp();
      }

      await db.collection('usuarios').doc(this._uid).update(update);

      // Registra no histórico de ganhos (últimos 50)
      await db.collection('usuarios').doc(this._uid)
        .collection('pomb_historico').add({
          valor,
          motivo,
          data: firebase.firestore.FieldValue.serverTimestamp(),
        });

      console.log(`[POMB] +${valor} $POMB (${motivo})`);
    } catch(e) {
      console.error('[POMB] Erro ao creditar:', e);
    }
  },

  // ────────────────────────────────────────────
  //  DEBITAR — para lances e compras
  // ────────────────────────────────────────────
  async debitar(valor, motivo) {
    if (!this._uid || valor <= 0) return false;
    try {
      await db.runTransaction(async (t) => {
        const ref  = db.collection('usuarios').doc(this._uid);
        const snap = await t.get(ref);
        const saldo = snap.data().pombcoins || 0;

        if (saldo < valor) throw new Error('Saldo insuficiente.');

        t.update(ref, {
          pombcoins: saldo - valor,
          ultimo_tick: firebase.firestore.FieldValue.serverTimestamp(),
        });
      });

      await db.collection('usuarios').doc(this._uid)
        .collection('pomb_historico').add({
          valor: -valor,
          motivo,
          data: firebase.firestore.FieldValue.serverTimestamp(),
        });

      return true;
    } catch(e) {
      console.error('[POMB] Erro ao debitar:', e);
      return false;
    }
  },

  // ────────────────────────────────────────────
  //  OBTER SALDO — leitura rápida
  // ────────────────────────────────────────────
  async obterSaldo() {
    if (!this._uid) return 0;
    try {
      const snap = await db.collection('usuarios').doc(this._uid).get();
      return snap.data()?.pombcoins || 0;
    } catch(e) {
      return 0;
    }
  },

  // ────────────────────────────────────────────
  //  HISTÓRICO — últimas movimentações
  // ────────────────────────────────────────────
  async obterHistorico(limite = 20) {
    if (!this._uid) return [];
    try {
      const snap = await db.collection('usuarios').doc(this._uid)
        .collection('pomb_historico')
        .orderBy('data', 'desc')
        .limit(limite)
        .get();

      return snap.docs.map(d => d.data());
    } catch(e) {
      return [];
    }
  },

  // ────────────────────────────────────────────
  //  NOTIFICAÇÃO VISUAL — toast na tela
  // ────────────────────────────────────────────
  _mostrarNotificacao(msg) {
    // Tenta usar o toast do feed se disponível
    if (typeof mostrarToast === 'function') {
      mostrarToast(msg, 3000);
      return;
    }
    // Fallback: cria um toast temporário
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `
      position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
      background:#0d0d0d; color:white; font-family:'DM Mono',monospace;
      font-size:12px; padding:10px 20px; border-radius:20px;
      z-index:9999; white-space:nowrap; transition:opacity .3s;
    `;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
  },
};

