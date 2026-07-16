// ============================================================
//  etl/02-precos.js
//
//  Pra cada ticker em ibovespa-tickers.json: busca 10 anos de
//  histórico diário no Yahoo Finance, agrupa por ano e grava em
//  precos_historicos/{ticker}_{ano} (Camada 1) + eventos em
//  eventos_corporativos/{ticker} (parte da Camada 4).
//
//  CHECKPOINT: grava em etl/.checkpoint-precos.json quais tickers
//  já processou. Se o script cair no meio (rate limit, timeout),
//  rodar de novo pula quem já foi feito. Pra forçar recomeço do
//  zero, apague esse arquivo de checkpoint.
//
//  Rodar: node etl/02-precos.js
// ============================================================

const fs = require('fs');
const path = require('path');
const { getDb, admin } = require('./lib/firebaseAdmin');
const { buscarHistoricoYahoo } = require('./lib/yahoo');

const ANOS_HISTORICO = 10;
const PAUSA_ENTRE_TICKERS_MS = 600; // espaça as chamadas — mesma lição do rate-limit da brapi
const CHECKPOINT_PATH = path.join(__dirname, '.checkpoint-precos.json');

function carregarCheckpoint() {
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  } catch (_) {
    return { concluidos: [], falhados: {} };
  }
}
function salvarCheckpoint(cp) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

function agruparPorAno(dias) {
  const porAno = {};
  for (const d of dias) {
    const ano = d.data.slice(0, 4);
    if (!porAno[ano]) porAno[ano] = [];
    porAno[ano].push(d);
  }
  return porAno;
}

async function main() {
  const db = getDb();
  const listaPath = path.join(__dirname, 'ibovespa-tickers.json');
  const { ativos } = JSON.parse(fs.readFileSync(listaPath, 'utf8'));

  const checkpoint = carregarCheckpoint();
  const pendentes = ativos.filter(a => !checkpoint.concluidos.includes(a.ticker));

  console.log(`[precos] ${ativos.length} tickers no total, ${pendentes.length} pendentes.`);

  for (const { ticker } of pendentes) {
    try {
      console.log(`[precos] Buscando ${ticker}...`);
      const { dias, eventos } = await buscarHistoricoYahoo(ticker, ANOS_HISTORICO);

      if (!dias.length) {
        throw new Error('Yahoo retornou 0 dias — ticker existe? tem .SA?');
      }

      const porAno = agruparPorAno(dias);
      const batch = db.batch();

      for (const ano in porAno) {
        const ref = db.collection('precos_historicos').doc(`${ticker}_${ano}`);
        batch.set(ref, {
          ticker,
          ano: Number(ano),
          dias: porAno[ano],
          atualizado_em: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      await batch.commit();

      if (eventos.length) {
        await db.collection('eventos_corporativos').doc(ticker).set({
          ticker,
          eventos,
          atualizado_em: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      const anos = Object.keys(porAno).sort();
      console.log(`[precos] ${ticker}: ok — ${dias.length} dias (${anos[0]}-${anos[anos.length - 1]}), ${eventos.length} eventos.`);

      checkpoint.concluidos.push(ticker);
      delete checkpoint.falhados[ticker];
      salvarCheckpoint(checkpoint);

    } catch (e) {
      console.error(`[precos] ${ticker} falhou:`, e.message);
      checkpoint.falhados[ticker] = e.message;
      salvarCheckpoint(checkpoint);
      // Não interrompe o lote inteiro por causa de 1 ticker problemático
    }

    await new Promise(r => setTimeout(r, PAUSA_ENTRE_TICKERS_MS));
  }

  const falhas = Object.keys(checkpoint.falhados);
  console.log(`\n[precos] Concluído. ${checkpoint.concluidos.length}/${ativos.length} ok.`);
  if (falhas.length) {
    console.log(`[precos] ${falhas.length} falharam (rode o script de novo pra tentar só esses):`, falhas.join(', '));
  }
}

main().catch(e => {
  console.error('[precos] Erro fatal:', e);
  process.exit(1);
});
