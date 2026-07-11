// ============================================================
//  api/snapshot-diario.js — Tira uma "foto" do valor de cada
//  carteira uma vez por dia, e salva em
//  carteiras/{uid}/historico_valor/{YYYY-MM-DD}
//
//  Isso é o que alimenta a "linha do tempo" de patrimônio real
//  (curva de valor de mercado) na carteira.html. Sem isso, a
//  gente só consegue reconstruir o CUSTO investido (via ordens),
//  não o valor de mercado no passado — não dá pra saber
//  retroativamente quanto uma ação valia num dia específico se a
//  gente nunca guardou isso. A partir de quando este endpoint
//  rodar pela primeira vez, a curva real começa a existir.
//
//  Só a Vercel Cron pode chamar isso (ver vercel.json) — protegido
//  por CRON_SECRET. Rodar manualmente também funciona se você
//  mandar o header certo, útil pra testar.
//
//  Variáveis de ambiente necessárias:
//    FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
//    CRON_SECRET (qualquer string aleatória — a mesma configurada
//    no vercel.json/Vercel Dashboard)
// ============================================================

module.exports = async (req, res) => {
  // A Vercel Cron manda "Authorization: Bearer <CRON_SECRET>" sozinha.
  // Fora do cron (teste manual), mande o mesmo header você mesmo.
  const auth = req.headers.authorization || '';
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }

  let getDb, obterPrecoReal, admin;
  try {
    ({ getDb, admin } = require('./_lib/firebaseAdmin'));
    ({ obterPrecoReal } = require('./_lib/precos'));
  } catch (e) {
    console.error('[api/snapshot-diario] Falha ao carregar módulos:', e.message);
    res.status(500).json({ error: 'Erro interno: ' + e.message });
    return;
  }

  const db = getDb();
  const hoje = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  // Cache de preço por ticker+tipo dentro desta execução — evita
  // buscar o mesmo preço 500 vezes se 500 usuários tiverem PETR4.
  const cachePreco = new Map();
  async function precoComCache(tipo, ticker) {
    const chave = `${tipo}:${ticker}`;
    if (cachePreco.has(chave)) return cachePreco.get(chave);
    let preco = 0;
    try {
      const r = await obterPrecoReal(tipo, ticker);
      preco = r?.preco || 0;
    } catch (_) { /* mantém 0 — melhor registrar valor parcial do que travar o snapshot inteiro */ }
    cachePreco.set(chave, preco);
    return preco;
  }

  let processadas = 0;
  let erros = 0;

  try {
    const carteirasSnap = await db.collection('carteiras').get();

    for (const doc of carteirasSnap.docs) {
      const uid = doc.id;
      const dados = doc.data();
      const posicoes = Array.isArray(dados.posicoes) ? dados.posicoes : [];

      try {
        const porAtivo = {};
        let valorInvestido = 0;

        for (const p of posicoes) {
          const preco = p.tipo === 'tesouro' || p.tipo === 'cdb' || p.tipo === 'lci'
            ? p.preco_medio // renda fixa não tem cotação de mercado — usa o próprio custo
            : await precoComCache(p.tipo, p.ticker);

          const valor = (p.quantidade || 0) * (preco || p.preco_medio || 0);
          valorInvestido += valor;
          porAtivo[p.ticker] = {
            tipo: p.tipo || 'acoes',
            quantidade: p.quantidade || 0,
            preco: preco || p.preco_medio || 0,
            valor,
          };
        }

        const saldoDisponivel = dados.saldo_disponivel || 0;
        const patrimonioTotal = saldoDisponivel + valorInvestido;

        await db
          .collection('carteiras').doc(uid)
          .collection('historico_valor').doc(hoje)
          .set({
            data: hoje,
            saldo_disponivel: saldoDisponivel,
            valor_investido: valorInvestido,
            patrimonio_total: patrimonioTotal,
            por_ativo: porAtivo,
            criado_em: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true }); // merge: se o cron rodar 2x no mesmo dia, sobrescreve em vez de duplicar

        processadas++;
      } catch (e) {
        erros++;
        console.error(`[api/snapshot-diario] Falhou pro uid ${uid}:`, e.message);
      }
    }

    res.status(200).json({ ok: true, data: hoje, carteiras_processadas: processadas, erros });
  } catch (e) {
    console.error('[api/snapshot-diario] Erro geral:', e.message);
    res.status(500).json({ error: 'Erro ao gerar snapshots: ' + e.message });
  }
};
