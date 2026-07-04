// ============================================================
//  api/daytrade-fechar.js — Fecha posição (manual ou liquidação)
//
//  O PnL é sempre calculado com o preço buscado AGORA no servidor
//  — o preço que o client mostrava na tela (do polling) é só
//  visual, nunca é o que decide o resultado.
//
//  Perda é sempre travada no máximo na margem (nunca fica saldo
//  negativo) — ver aviso em daytrade-abrir.js.
// ============================================================

const { verificarToken, getDb, admin } = require('./_lib/firebaseAdmin');
const { precoAtual } = require('./_lib/precosCripto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método não permitido. Use POST.' }); return; }

  let uid;
  try {
    uid = await verificarToken(req);
  } catch (e) {
    res.status(e.status || 401).json({ error: e.message });
    return;
  }

  const { posicaoId } = req.body || {};
  if (!posicaoId) { res.status(400).json({ error: 'Informe posicaoId.' }); return; }

  try {
    const db = getDb();
    const posRef = db.collection('posicoes_daytrade').doc(posicaoId);
    const cRef = db.collection('carteiras').doc(uid);

    const posSnap = await posRef.get();
    if (!posSnap.exists) throw new Error('Posição não encontrada.');
    const pos = posSnap.data();
    if (pos.uid !== uid) throw new Error('Posição não pertence a este usuário.');
    if (pos.status !== 'aberta') throw new Error('Posição já está fechada.');

    const precoSaida = await precoAtual(pos.ativo);

    const sinal = pos.direcao === 'long' ? 1 : -1;
    let pnl = (precoSaida - pos.preco_entrada) * pos.quantidade * sinal;

    // Trava a perda no máximo na margem — nunca fica saldo negativo.
    const liquidada = pnl <= -pos.margem;
    if (liquidada) pnl = -pos.margem;

    const pnlPct = (pnl / pos.margem) * 100;

    await db.runTransaction(async (t) => {
      const cSnap = await t.get(cRef);
      const c = cSnap.exists ? cSnap.data() : {};
      const saldo = c.saldo_disponivel ?? 0;
      const patrimonio = c.patrimonio_total ?? 0;

      t.update(cRef, {
        saldo_disponivel: saldo + pos.margem + pnl,
        patrimonio_total: patrimonio + pnl,
        ultima_atualizacao: admin.firestore.FieldValue.serverTimestamp(),
      });

      t.update(posRef, {
        status: liquidada ? 'liquidada' : 'fechada',
        preco_saida: precoSaida,
        pnl,
        pnl_pct: pnlPct,
        data_fechamento: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    res.status(200).json({ ok: true, pnl, pnl_pct: pnlPct, preco_saida: precoSaida, liquidada });
  } catch (e) {
    console.error('[api/daytrade-fechar]', uid, posicaoId, e.message);
    res.status(400).json({ error: e.message || 'Erro ao fechar posição.' });
  }
};
