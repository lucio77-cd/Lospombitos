// ============================================================
//  arte-semanal.js — Gerador de Arte Semanal da Ordem
//
//  FLUXO:
//  1. Verifica se já existe leilão ativo no Firestore
//  2. Se não existir (ou encerrou): gera novo tema via Gemini
//  3. Gemini retorna DNA visual (JSON com mood, cores, etc.)
//  4. DNA é renderizado no canvas como pixel art única
//  5. Arte salva como PNG no Firebase Storage
//  6. Novo documento de leilão criado no Firestore
//  7. Timer regressivo até domingo 23:00
// ============================================================

// A chave da API Gemini NÃO fica mais aqui — vive só no servidor
// (variável de ambiente GEMINI_API_KEY na Vercel), acessada via /api/gemini.

const ArteSemanal = {

  // ── ESTADO ──
  leilaoId:   null,
  leilaoFim:  null,
  leilaoListener: null,
  _timerInterval: null,

  // ────────────────────────────────────────────
  //  INICIAR — ponto de entrada
  // ────────────────────────────────────────────
  async iniciar(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    this._setStatus('Verificando leilão ativo...');

    try {
      const snap = await db.collection('leiloes')
        .where('status', '==', 'ativo')
        .orderBy('criado_em', 'desc')
        .limit(1).get();

      if (!snap.empty) {
        // Leilão já existe — carrega
        const doc   = snap.docs[0];
        this.leilaoId  = doc.id;
        this.leilaoFim = doc.data().encerra_em.toDate();
        await this._renderizarExistente(canvas, doc.data());
        this._iniciarTimer();
        this._ouvirLances();
        this._esconderStatus();
        return doc.id;
      }

      // Nenhum leilão ativo — cria um novo
      return await this._criarNovoLeilao(canvas);

    } catch(e) {
      console.error('[Arte] Erro ao iniciar:', e);
      this._setStatus('Erro ao carregar. Tentando novamente...');
      setTimeout(() => this.iniciar(canvasId), 5000);
    }
  },

  // ────────────────────────────────────────────
  //  CRIAR NOVO LEILÃO
  // ────────────────────────────────────────────
  async _criarNovoLeilao(canvas) {
    this._setStatus('Gemini está criando a arte desta semana...');

    // Calcula encerramento: próximo domingo às 23:00
    const fim = this._proximoDomingoAs23();

    // Gera DNA visual via Gemini
    const dna = await this._gerarDNAcomGemini();

    this._setStatus('Renderizando arte exclusiva...');

    // Renderiza no canvas
    this._renderizarCanvas(canvas, dna);

    this._setStatus('Salvando na Ordem...');

    // Salva PNG no Storage
    let urlArte = null;
    try {
      urlArte = await this._salvarNoStorage(canvas, `semana_${this._obterSemana()}`);
    } catch(e) {
      console.warn('[Arte] Storage falhou, usando canvas local:', e);
    }

    // Cria documento do leilão
    const semana = this._obterSemana();
    const dadosLeilao = {
      status:         'ativo',
      arte_titulo:    dna.titulo || `ARTE DA SEMANA ${semana}`,
      arte_dna:       dna,
      arte_url:       urlArte,
      numero_semana:  semana,
      criado_em:      firebase.firestore.FieldValue.serverTimestamp(),
      encerra_em:     firebase.firestore.Timestamp.fromDate(fim),
      lance_inicial:  50,
      maior_lance:    0,
      lider_uid:      null,
      lider_username: '',
      lider_foto:     '',
      total_lances:   0,
    };

    const ref = await db.collection('leiloes').add(dadosLeilao);
    this.leilaoId  = ref.id;
    this.leilaoFim = fim;

    this._iniciarTimer();
    this._ouvirLances();
    this._esconderStatus();

    // Atualiza UI
    const el = document.getElementById('arte-titulo');
    if (el) el.textContent = dadosLeilao.arte_titulo;
    const el2 = document.getElementById('arte-semana');
    if (el2) el2.textContent = `SEMANA · ${semana}`;
    const el3 = document.getElementById('arte-lote');
    if (el3) el3.textContent = `LOTE #${semana}`;
    const el4 = document.getElementById('section-sub');
    if (el4) el4.textContent = `SEMANA ${semana} · LEILÃO ABERTO`;

    return ref.id;
  },

  // ────────────────────────────────────────────
  //  RENDERIZAR ARTE EXISTENTE
  // ────────────────────────────────────────────
  async _renderizarExistente(canvas, dados) {
    // Atualiza textos
    const titulo = dados.arte_titulo || 'ARTE DA SEMANA';
    const semana = dados.numero_semana || this._obterSemana();

    const el = document.getElementById('arte-titulo');
    if (el) el.textContent = titulo;
    const el2 = document.getElementById('arte-semana');
    if (el2) el2.textContent = `SEMANA · ${semana}`;
    const el3 = document.getElementById('arte-lote');
    if (el3) el3.textContent = `LOTE #${semana}`;
    const el4 = document.getElementById('section-sub');
    if (el4) el4.textContent = `SEMANA ${semana} · LEILÃO ABERTO`;

    // Renderiza o DNA no canvas
    this._renderizarCanvas(canvas, dados.arte_dna || {});

    // Guarda referência global para proteção de tela
    window._arteAtual = dados.arte_dna;

    // Mostra o conteúdo
    const loading = document.getElementById('loading-wrap');
    if (loading) loading.style.display = 'none';
    const content = document.getElementById('praia-content');
    if (content) content.style.display = 'block';
  },

  // ────────────────────────────────────────────
  //  GEMINI — gera DNA visual único
  // ────────────────────────────────────────────
  async _gerarDNAcomGemini() {
    const temasSemente = [
      'ocean ritual at midnight', 'golden beach carnival',
      'pigeon oracle in storm', 'sacred sand mandala',
      'neon brotherhood festival', 'ancient pigeon constellation',
      'silent wave ceremony', 'cosmic beach guardian',
      'pigeon warrior at dawn', 'mystic tide oracle',
      'burning feather ceremony', 'silver moon beach rite',
    ];

    const tema = temasSemente[this._obterSemana() % temasSemente.length];

    const prompt = `You are an art director for a secret pigeon brotherhood called Los Pombitos.
Create the visual DNA for this week's exclusive pixel art. Theme: "${tema}".
Respond ONLY with valid JSON, no markdown, no explanation:
{
  "titulo": "SHORT TITLE IN CAPS (max 4 words)",
  "tema": "${tema}",
  "fundo": "hex color for background",
  "corpo": "hex color for pigeon body",
  "asa": "hex color for wings",
  "bico": "hex color for beak",
  "halo": true or false,
  "mood": "one of: heroic|melancholic|playful|mystical|rebellious|serene|fierce|dreamy",
  "pattern": "one of: striped|dotted|gradient|solid|speckled|cosmic",
  "acessorio": "one of: none|crown|eyepatch|scarf|glasses|medal",
  "particulas": "one of: none|stars|bubbles|sparks|petals",
  "cor_extra": "hex color for particles/details"
}`;

    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, temperature: 1.0, maxOutputTokens: 400 })
      });

      if (!res.ok) throw new Error(`Erro no proxy da IA: ${res.status}`);

      const data  = await res.json();
      const limpo = data.texto.replace(/```json|```/g, '').trim();
      const dna   = JSON.parse(limpo);

      console.log('[Arte] DNA gerado pelo Gemini:', dna);
      return dna;

    } catch(e) {
      console.warn('[Arte] Gemini falhou, usando DNA padrão:', e);
      return this._dnaFallback();
    }
  },

  // ────────────────────────────────────────────
  //  DNA FALLBACK — se Gemini falhar
  // ────────────────────────────────────────────
  _dnaFallback() {
    const semana = this._obterSemana();
    const paletas = [
      { fundo:'#1a1a4e', corpo:'#e8d4a0', asa:'#4a6fff', bico:'#f5b800', cor_extra:'#ffffff' },
      { fundo:'#2d1a0e', corpo:'#f0c878', asa:'#c9a84c', bico:'#ff8800', cor_extra:'#ffd700' },
      { fundo:'#0e2d1a', corpo:'#d4f0c8', asa:'#4ac984', bico:'#f5b800', cor_extra:'#88ffcc' },
      { fundo:'#2d0e1a', corpo:'#f0c8d4', asa:'#c94a6f', bico:'#ff4488', cor_extra:'#ffaacc' },
    ];
    const p = paletas[semana % paletas.length];
    return {
      titulo:    `ARTE DA SEMANA ${semana}`,
      tema:      'pombito secreto',
      ...p,
      halo:      true,
      mood:      'mystical',
      pattern:   'solid',
      acessorio: 'none',
      particulas:'stars',
    };
  },

  // ────────────────────────────────────────────
  //  RENDERIZAR CANVAS — pixel art do Pombito
  // ────────────────────────────────────────────
  _renderizarCanvas(canvas, dna) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width  || 480;
    const H = canvas.height || 480;

    // ── FUNDO ──
    ctx.fillStyle = dna.fundo || '#1a1a3e';
    ctx.fillRect(0, 0, W, H);

    // ── PADRÃO DE FUNDO ──
    this._desenharPadrao(ctx, W, H, dna);

    // ── PARTÍCULAS ──
    if (dna.particulas && dna.particulas !== 'none') {
      this._desenharParticulas(ctx, W, H, dna);
    }

    // ── POMBO PIXEL ART ──
    this._desenharPombo(ctx, W / 2, H / 2, dna);

    // ── ACESSÓRIO ──
    if (dna.acessorio && dna.acessorio !== 'none') {
      this._desenharAcessorio(ctx, W / 2, H / 2, dna);
    }

    // ── BORDA ──
    ctx.strokeStyle = this._ajustarBrilho(dna.fundo || '#1a1a3e', -20);
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);

    // ── WATERMARK ──
    ctx.font = '500 10px "DM Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.textAlign = 'center';
    ctx.fillText('LOS POMBITOS · ARTE EXCLUSIVA · REPRODUÇÃO PROIBIDA', W / 2, H - 12);

    // Salva referência para proteção
    window._arteAtual = dna;

    // Mostra conteúdo
    const loading = document.getElementById('loading-wrap');
    if (loading) loading.style.display = 'none';
    const content = document.getElementById('praia-content');
    if (content) content.style.display = 'block';
  },

  _desenharPadrao(ctx, W, H, dna) {
    const seed  = this._hash(dna.tema || 'pombito');
    const cor   = dna.cor_extra || '#ffffff';

    ctx.globalAlpha = 0.06;

    if (dna.pattern === 'striped') {
      ctx.strokeStyle = cor;
      ctx.lineWidth = 2;
      for (let i = -H; i < W + H; i += 30) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke();
      }
    } else if (dna.pattern === 'dotted') {
      ctx.fillStyle = cor;
      for (let x = 20; x < W; x += 30) {
        for (let y = 20; y < H; y += 30) {
          ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        }
      }
    } else if (dna.pattern === 'cosmic') {
      for (let i = 0; i < 30; i++) {
        const x = (seed * (i + 1) * 137) % W;
        const y = (seed * (i + 1) * 97) % H;
        const r = 10 + (seed * i % 40);
        ctx.fillStyle = i % 2 === 0 ? cor : (dna.asa || cor);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    } else if (dna.pattern === 'gradient') {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, dna.asa || cor);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    } else {
      // solid — leve vinheta
      const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.7);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.globalAlpha = 1;
  },

  _desenharParticulas(ctx, W, H, dna) {
    const cor  = dna.cor_extra || '#ffffff';
    const seed = this._hash(dna.tema || 'p');

    ctx.fillStyle = cor;

    for (let i = 0; i < 20; i++) {
      const x = (seed * (i + 3) * 173) % W;
      const y = (seed * (i + 7) * 113) % H;
      ctx.globalAlpha = 0.2 + (i % 5) * 0.08;

      if (dna.particulas === 'stars') {
        this._desenharEstrela(ctx, x, y, 3 + (i % 4));
      } else if (dna.particulas === 'bubbles') {
        ctx.beginPath(); ctx.arc(x, y, 4 + (i % 8), 0, Math.PI * 2);
        ctx.strokeStyle = cor; ctx.lineWidth = 1; ctx.stroke();
      } else if (dna.particulas === 'sparks') {
        ctx.fillRect(x, y, 2, 8 + (i % 10));
        ctx.fillRect(x - 3, y + 3, 8 + (i % 10), 2);
      } else if (dna.particulas === 'petals') {
        ctx.beginPath(); ctx.ellipse(x, y, 4, 8, i * 0.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },

  _desenharEstrela(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      i === 0 ? ctx.moveTo(x + r * Math.cos(angle), y + r * Math.sin(angle))
              : ctx.lineTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
    }
    ctx.closePath(); ctx.fill();
  },

  _desenharPombo(ctx, cx, cy, dna) {
    const px = 16; // tamanho de cada pixel
    const corCorpo = dna.corpo || '#e8d4a0';
    const corAsa   = dna.asa   || '#c9a84c';
    const corBico  = dna.bico  || '#f5b800';
    const corOlho  = '#0a0a0f';

    // Grade pixel art do pombo (cx, cy = centro)
    const grade = [
      [0,0,0,6,6,6,6,6,6,6,0,0,0],  // auréola
      [0,0,0,0,1,1,1,1,1,0,0,0,0],  // cabeça topo
      [0,0,0,1,1,1,1,1,1,1,0,0,0],  // cabeça
      [0,0,1,1,1,1,4,1,1,1,3,3,0],  // olho + bico
      [0,0,1,1,1,1,1,1,1,1,3,0,0],  // bico baixo
      [0,2,2,1,7,1,1,1,7,1,2,2,0],  // corpo + detalhe
      [2,2,2,2,1,1,1,1,1,2,2,2,2],  // asas abertas
      [2,2,2,2,2,1,1,1,2,2,2,2,2],  // asas largas
      [0,2,2,2,2,2,1,2,2,2,2,2,0],  // asas ponta
      [0,0,2,2,2,2,1,2,2,2,2,0,0],  // asas fechando
      [0,0,0,1,1,1,1,1,1,1,0,0,0],  // corpo baixo
      [0,0,0,1,1,1,1,1,1,1,0,0,0],  // barriga
      [0,0,0,0,1,0,0,0,1,0,0,0,0],  // patas
      [0,0,0,0,1,0,0,0,1,0,0,0,0],  // patas
    ];

    const offX = cx - (grade[0].length * px) / 2;
    const offY = cy - (grade.length * px) / 2;

    // Padrão nas asas
    const getCorAsa = (c, r) => {
      if (dna.pattern === 'striped')  return r % 2 === 0 ? this._ajustarBrilho(corAsa, 20) : corAsa;
      if (dna.pattern === 'speckled') return (c + r) % 3 === 0 ? this._ajustarBrilho(corAsa, 30) : corAsa;
      if (dna.pattern === 'dotted')   return c % 2 === 0 && r % 2 === 0 ? this._ajustarBrilho(corAsa, 25) : corAsa;
      return corAsa;
    };

    grade.forEach((linha, r) => {
      linha.forEach((cod, c) => {
        if (!cod) return;

        if (cod === 6) {
          // Auréola (só se halo = true)
          if (!dna.halo) return;
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = dna.cor_extra || '#f0d080';
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(cx, offY + r * px + px / 2, 52, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          return;
        }

        const cores = {
          1: corCorpo,
          2: getCorAsa(c, r),
          3: corBico,
          4: corOlho,
          7: this._ajustarBrilho(corCorpo, -15), // sombra
        };

        ctx.fillStyle = cores[cod] || corCorpo;
        ctx.fillRect(offX + c * px, offY + r * px, px - 1, px - 1);
      });
    });

    // Brilho no olho
    ctx.fillStyle = 'white';
    ctx.globalAlpha = 0.9;
    const olhoX = offX + 6 * px + 4;
    const olhoY = offY + 3 * px + 2;
    ctx.fillRect(olhoX, olhoY, 4, 4);
    ctx.globalAlpha = 1;
  },

  _desenharAcessorio(ctx, cx, cy, dna) {
    const px  = 16;
    const grade = 14; // linhas totais
    const offY = cy - (grade * px) / 2;
    const cor  = dna.cor_extra || '#f0d080';

    if (dna.acessorio === 'crown') {
      // Coroa acima da cabeça
      ctx.fillStyle = cor;
      const topoY = offY - px * 2;
      ctx.fillRect(cx - 3*px, topoY,      px,      2*px); // ponta esq
      ctx.fillRect(cx - 1*px, topoY - px, px,      3*px); // ponta centro
      ctx.fillRect(cx + 1*px, topoY,      px,      2*px); // ponta dir
      ctx.fillRect(cx - 3*px, topoY + px, 6*px,   px);    // base coroa
      // Pedra vermelha
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(cx - px/2, topoY - px + 2, px, px);

    } else if (dna.acessorio === 'eyepatch') {
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(cx + px, offY + 3*px, 3*px, 2*px);

    } else if (dna.acessorio === 'scarf') {
      ctx.fillStyle = '#cc2200';
      ctx.fillRect(cx - 5*px, offY + 5*px, 10*px, 2*px);
      ctx.fillRect(cx - 5*px, offY + 6*px, 3*px,  3*px);

    } else if (dna.acessorio === 'glasses') {
      ctx.strokeStyle = cor;
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - 4*px, offY + 3*px, 3*px, 2*px);
      ctx.strokeRect(cx + 1*px, offY + 3*px, 3*px, 2*px);
      ctx.fillStyle = cor;
      ctx.fillRect(cx - 1*px, offY + 3*px, 2*px, px);

    } else if (dna.acessorio === 'medal') {
      ctx.fillStyle = cor;
      ctx.fillRect(cx - px/2, offY + 6*px, px, 2*px);
      ctx.beginPath();
      ctx.arc(cx, offY + 9*px, px, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this._ajustarBrilho(cor, -30);
      ctx.beginPath();
      ctx.arc(cx, offY + 9*px, px * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  // ────────────────────────────────────────────
  //  SALVAR NO FIREBASE STORAGE
  // ────────────────────────────────────────────
  async _salvarNoStorage(canvas, nome) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        try {
          const ref  = storage.ref(`artes_semanais/${nome}.png`);
          const snap = await ref.put(blob, { contentType: 'image/png' });
          const url  = await snap.ref.getDownloadURL();
          resolve(url);
        } catch(e) { reject(e); }
      }, 'image/png', 1.0);
    });
  },

  // ────────────────────────────────────────────
  //  TIMER REGRESSIVO
  // ────────────────────────────────────────────
  _iniciarTimer() {
    clearInterval(this._timerInterval);
    if (!this.leilaoFim) return;

    const dataEl  = document.getElementById('timer-data');
    const valorEl = document.getElementById('timer-display');

    if (dataEl) {
      dataEl.textContent = this.leilaoFim.toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long'
      });
    }

    const tick = () => {
      const diff = this.leilaoFim - new Date();
      if (diff <= 0) {
        if (valorEl) valorEl.textContent = '00:00:00';
        clearInterval(this._timerInterval);
        this._encerrarLeilao();
        return;
      }
      const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
      if (valorEl) valorEl.textContent = `${h}:${m}:${s}`;
    };

    tick();
    this._timerInterval = setInterval(tick, 1000);
  },

  // ────────────────────────────────────────────
  //  ENCERRAR LEILÃO — transfere arte ao vencedor
  // ────────────────────────────────────────────
  async _encerrarLeilao() {
    if (!this.leilaoId) return;

    try {
      const snap  = await db.collection('leiloes').doc(this.leilaoId).get();
      const dados = snap.data();

      if (dados.status !== 'ativo') return; // já encerrado

      await db.runTransaction(async (t) => {
        const ref = db.collection('leiloes').doc(this.leilaoId);
        t.update(ref, {
          status:       'encerrado',
          encerrado_em: firebase.firestore.FieldValue.serverTimestamp(),
        });

        // Se houve vencedor, cria entrada na galeria
        if (dados.lider_uid && dados.maior_lance > 0) {
          const galeriaRef = db.collection('galeria').doc();
          t.set(galeriaRef, {
            dono_uid:      dados.lider_uid,
            arte_titulo:   dados.arte_titulo,
            arte_dna:      dados.arte_dna,
            arte_url:      dados.arte_url || null,
            semana:        dados.numero_semana,
            leilao_id:     this.leilaoId,
            preco_pago:    dados.maior_lance,
            a_venda:       false,
            preco:         0,
            adquirida_em:  firebase.firestore.FieldValue.serverTimestamp(),
            historico:     [{
              de:    'leilao',
              para:  dados.lider_uid,
              preco: dados.maior_lance,
              data:  new Date().toISOString(),
            }],
          });
        }
      });

      console.log('[Arte] Leilão encerrado. Vencedor:', dados.lider_uid || 'nenhum');

      // Inicia novo leilão após 3 segundos
      this.leilaoId = null;
      setTimeout(() => {
        const canvas = document.getElementById('arte-canvas');
        if (canvas) this.iniciar('arte-canvas');
      }, 3000);

    } catch(e) {
      console.error('[Arte] Erro ao encerrar leilão:', e);
    }
  },

  // ────────────────────────────────────────────
  //  LISTENER DE LANCES — atualiza UI em tempo real
  // ────────────────────────────────────────────
  _ouvirLances() {
    if (this.leilaoListener) this.leilaoListener();
    if (!this.leilaoId) return;

    this.leilaoListener = db.collection('leiloes').doc(this.leilaoId)
      .onSnapshot((snap) => {
        if (!snap.exists) return;
        const d = snap.data();

        // Maior lance
        const maiorLanceEl = document.getElementById('lance-maior');
        if (maiorLanceEl) maiorLanceEl.textContent = d.maior_lance > 0 ? d.maior_lance : '—';

        // Líder
        if (d.lider_uid) {
          const userEl = document.getElementById('lider-username');
          if (userEl) userEl.textContent = '@' + (d.lider_username || '···');
          const avatarEl = document.getElementById('lider-avatar');
          if (avatarEl) avatarEl.src = d.lider_foto || `https://api.dicebear.com/7.x/identicon/svg?seed=${d.lider_uid}`;
          const quandoEl = document.getElementById('lider-quando');
          if (quandoEl && d.lance_em) {
            quandoEl.textContent = this._tempoRelativo(d.lance_em.toDate());
          }
        }

        // Dispara evento para a praia.html atualizar o status
        window.dispatchEvent(new CustomEvent('leilao-atualizado', { detail: d }));
      });

    // Histórico de lances
    db.collection('leiloes').doc(this.leilaoId)
      .collection('lances')
      .orderBy('data', 'desc').limit(8)
      .onSnapshot((snap) => {
        const lista = document.getElementById('historico-lista');
        if (!lista) return;

        if (snap.empty) {
          lista.innerHTML = `<p style="font-family:'DM Mono',monospace;font-size:10px;color:var(--muted)">Nenhum lance ainda. Seja o primeiro!</p>`;
          return;
        }

        lista.innerHTML = '';
        snap.forEach((doc) => {
          const l = doc.data();
          lista.innerHTML += `
            <div class="lance-item">
              <span class="lance-item-user">@${l.username || '···'}</span>
              <span class="lance-item-tempo">${l.data ? this._tempoRelativo(l.data.toDate()) : '···'}</span>
              <span class="lance-item-valor">${l.valor} $POMB</span>
            </div>`;
        });
      });
  },

  // ────────────────────────────────────────────
  //  UTILITÁRIOS
  // ────────────────────────────────────────────
  _proximoDomingoAs23() {
    const d = new Date();
    const diasAteDomingo = (7 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + diasAteDomingo);
    d.setHours(23, 0, 0, 0);
    return d;
  },

  _obterSemana() {
    const d = new Date();
    const inicio = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - inicio) / 86400000 + inicio.getDay() + 1) / 7);
  },

  _hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
    return Math.abs(h);
  },

  _ajustarBrilho(hex, delta) {
    if (!hex || hex.length < 7) return hex || '#888';
    const r = Math.min(255, Math.max(0, parseInt(hex.slice(1,3), 16) + delta));
    const g = Math.min(255, Math.max(0, parseInt(hex.slice(3,5), 16) + delta));
    const b = Math.min(255, Math.max(0, parseInt(hex.slice(5,7), 16) + delta));
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  },

  _tempoRelativo(date) {
    const diff = Date.now() - date.getTime();
    if (diff < 60000)    return 'agora mesmo';
    if (diff < 3600000)  return `${Math.floor(diff/60000)}min atrás`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h atrás`;
    return date.toLocaleDateString('pt-BR');
  },

  _setStatus(msg) {
    const el = document.getElementById('arte-status');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    console.log('[Arte]', msg);
  },

  _esconderStatus() {
    const el = document.getElementById('arte-status');
    if (el) el.style.display = 'none';
  },
};

