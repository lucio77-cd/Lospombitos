// ============================================================
//  api/daytrade-abrir.js — Abre posição alavancada (Game Estudo)
//
//  Usa o MESMO saldo da carteira principal (carteiras/{uid}),
//  por pedido explícito do produto. A margem é debitada do
//  saldo_disponivel no momento da abertura (fica "reservada" na
//  posição); o patrimônio total não muda nesse instante — só
//  muda quando a posição fecha, pelo resultado (PnL).
//
//  Alavancagem de até 20x é bem mais arriscada que o simulador
//  de investimento normal — por isso o valor perdido é sempre
//  travado no máximo na margem colocada (nunca fica saldo
//  negativo), diferente de day trade alavancado real, onde dá
//  pra perder mais que o depositado.
// ============================================================

const { verificarToken, getDb, admin } = require('./lib/firebaseAdmin');
const { precoAtual, IDS } = require('./lib/precosCripto');

const ALAVANCAGEM_MAX = 20;
const MARGEM_MINIMA = 10;

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método não permitido. Use POST.' }); return; }

  let uid;
  try {
    uid = await verificarToken(req);
  } catch (e) {
    res.status(e.status || 401).json({ error: e.message });
    return;
  }

  const { ativo, direcao, alavancagem, margem } = req.body || {};

  if (!IDS[ativo]) { res.status(400).json({ error: 'Ativo inválido.' }); return; }
  if (direcao !== 'long' && direcao !== 'short') { res.status(400).json({ error: 'Direção inválida.' }); return; }

  const alav = parseInt(alavancagem, 10);
  if (!Number.isFinite(alav) || alav < 1 || alav > ALAVANCAGEM_MAX) {
    res.status(400).json({ error: `Alavancagem deve ser entre 1x e ${ALAVANCAGEM_MAX}x.` });
    return;
  }

  const marg = parseFloat(margem);
  if (!Number.isFinite(marg) || marg < MARGEM_MINIMA) {
    res.status(400).json({ error: `Margem mínima de R$ ${MARGEM_MINIMA}.` });
    return;
  }

  try {
    const preco = await precoAtual(ativo);
    const quantidade = (marg * alav) / preco;

    const db = getDb();
    const cRef = db.collection('carteiras').doc(uid);
    const posRef = db.collection('posicoes_daytrade').doc();

    await db.runTransaction(async (t) => {
      const cSnap = await t.get(cRef);
      const c = cSnap.exists ? cSnap.data() : {};
      const saldo = c.saldo_disponivel ?? 500000;

      if (marg > saldo) throw new Error('Saldo insuficiente pra essa margem.');

      t.update(cRef, {
        saldo_disponivel: saldo - marg,
        ultima_atualizacao: admin.firestore.FieldValue.serverTimestamp(),
      });

      t.set(posRef, {
        uid,
        ativo,
        direcao,
        alavancagem: alav,
        margem: marg,
        quantidade,
        preco_entrada: preco,
        status: 'aberta',
        data_abertura: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    res.status(200).json({ ok: true, posicaoId: posRef.id, preco_entrada: preco, quantidade });
  } catch (e) {
    console.error('[api/daytrade-abrir]', uid, ativo, e.message);
    res.status(400).json({ error: e.message || 'Erro ao abrir posição.' });
  }
};
