// ============================================================
//  api/executar-ordem.js — Execução de ordem com preço validado
//  no servidor (substitui a transação que antes rodava 100% no
//  client em ordem.html).
//
//  O que muda pro usuário: nada visualmente. O que muda pra
//  segurança: o preço usado pra debitar/creditar o saldo agora
//  vem de api/_lib/precos.js (fonte real), não do que o
//  navegador mandar no corpo da requisição — pra ordens a
//  mercado de ações, FIIs e cripto.
//
//  Variáveis de ambiente necessárias (ver api/_lib/firebaseAdmin.js):
//    FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
//  Opcional: BRAPI_TOKEN
// ============================================================

const { verificarToken, getDb, admin } = require('./_lib/firebaseAdmin');
const { obterPrecoReal } = require('./_lib/precos');

const TIPOS_VALIDOS = ['acoes', 'fiis', 'cripto', 'tesouro', 'cdb', 'lci'];
const LADOS_VALIDOS = ['compra', 'venda'];
const ORDENS_VALIDAS = ['mercado', 'limitada', 'stop'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido. Use POST.' });
    return;
  }

  let uid;
  try {
    uid = await verificarToken(req);
  } catch (e) {
    res.status(e.status || 401).json({ error: e.message });
    return;
  }

  const {
    ticker,
    tipo,
    lado,
    quantidade,
    tipo_ordem: tipoOrdem,
    preco_limite: precoLimiteClient, // só usado para limitada/stop, e para tesouro/cdb/lci
  } = req.body || {};

  // ── Validação básica de entrada ──
  if (!ticker || typeof ticker !== 'string') {
    res.status(400).json({ error: 'Ticker inválido.' });
    return;
  }
  if (!TIPOS_VALIDOS.includes(tipo)) {
    res.status(400).json({ error: 'Tipo de ativo inválido.' });
    return;
  }
  if (!LADOS_VALIDOS.includes(lado)) {
    res.status(400).json({ error: 'Lado da ordem inválido.' });
    return;
  }
  if (!ORDENS_VALIDAS.includes(tipoOrdem)) {
    res.status(400).json({ error: 'Tipo de ordem inválido.' });
    return;
  }
  const qtd = parseInt(quantidade, 10);
  if (!Number.isFinite(qtd) || qtd <= 0 || qtd > 1_000_000) {
    res.status(400).json({ error: 'Quantidade inválida.' });
    return;
  }

  const tickerSalvo = ticker.toUpperCase().trim();

  // ── Determina o preço a usar ──
  // Ordem a mercado de ações/FIIs/cripto: SEMPRE busca o preço real no servidor.
  // Demais casos (limitada/stop, ou tipos ainda não cobertos como
  // tesouro/cdb/lci): usa o preço declarado pelo client, como antes.
  // TODO: mover tesouro/cdb/lci e limitada/stop pra validação server-side também.
  let preco = null;
  let mercadoAberto = true;

  if (tipoOrdem === 'mercado' && (tipo === 'acoes' || tipo === 'fiis' || tipo === 'cripto')) {
    const real = await obterPrecoReal(tipo, tickerSalvo);
    if (!real) {
      res.status(502).json({ error: 'Não foi possível confirmar a cotação real no momento. Tente novamente.' });
      return;
    }
    preco = real.preco;
    mercadoAberto = real.mercado_aberto;
  } else {
    const p = parseFloat(precoLimiteClient);
    if (!Number.isFinite(p) || p <= 0) {
      res.status(400).json({ error: 'Preço inválido.' });
      return;
    }
    preco = p;
  }

  const total = qtd * preco;
  if (!preco || preco <= 0 || !total || total <= 0) {
    res.status(400).json({ error: 'Preço inválido. A ordem não pode ser executada com preço zero.' });
    return;
  }

  const db = getDb();
  const cRef = db.collection('carteiras').doc(uid);
  const uRef = db.collection('usuarios').doc(uid);

  try {
    const resultado = await db.runTransaction(async (t) => {
      const cSnap = await t.get(cRef);
      const c = cSnap.exists ? cSnap.data() : {};
      let saldo = c.saldo_disponivel ?? 500000;
      let posicoes = [...(c.posicoes || [])];

      if (lado === 'compra') {
        if (total > saldo) throw new Error('Saldo insuficiente.');
        saldo -= total;
        const idx = posicoes.findIndex((p) => p.ticker === tickerSalvo);
        if (idx >= 0) {
          const qtdAnt = posicoes[idx].quantidade;
          const totAnt = qtdAnt * posicoes[idx].preco_medio;
          posicoes[idx].quantidade += qtd;
          posicoes[idx].preco_medio = (totAnt + total) / posicoes[idx].quantidade;
          posicoes[idx].ultima_atualizacao = new Date().toISOString();
        } else {
          posicoes.push({
            ticker: tickerSalvo,
            tipo,
            quantidade: qtd,
            preco_medio: preco,
            data_compra: new Date().toISOString(),
            ultima_atualizacao: new Date().toISOString(),
          });
        }
      } else {
        const idx = posicoes.findIndex((p) => p.ticker === tickerSalvo);
        if (idx < 0) throw new Error('Ativo não encontrado na carteira.');
        if (posicoes[idx].quantidade < qtd) throw new Error('Quantidade insuficiente.');
        saldo += total;
        posicoes[idx].quantidade -= qtd;
        if (posicoes[idx].quantidade === 0) posicoes.splice(idx, 1);
      }

      const investido = posicoes.reduce((a, p) => a + p.quantidade * p.preco_medio, 0);
      const patrimonio = saldo + investido;
      const status = mercadoAberto ? 'executada' : 'agendada';

      t.set(
        cRef,
        {
          uid,
          saldo_disponivel: saldo,
          saldo_investido: investido,
          patrimonio_total: patrimonio,
          posicoes,
          ultima_atualizacao: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      const ordemRef = db.collection('ordens').doc();
      t.set(ordemRef, {
        uid,
        ticker: tickerSalvo,
        tipo,
        lado,
        quantidade: qtd,
        preco,
        total,
        tipo_ordem: tipoOrdem,
        status,
        data: admin.firestore.FieldValue.serverTimestamp(),
      });

      const postRef = db.collection('posts').doc();
      t.set(postRef, {
        uid,
        tipo: 'trade',
        tipo_ativo: tipo,
        ticker: tickerSalvo,
        lado,
        quantidade: qtd,
        preco,
        total,
        auto: true,
        data_post: admin.firestore.FieldValue.serverTimestamp(),
      });

      t.update(uRef, { saldo_disponivel: saldo, patrimonio_total: patrimonio });

      return { saldo, patrimonio, preco, status };
    });

    res.status(200).json({ ok: true, ...resultado });
  } catch (e) {
    console.error('[api/executar-ordem]', uid, tickerSalvo, e.message);
    res.status(400).json({ error: e.message || 'Erro ao executar a ordem.' });
  }
};
