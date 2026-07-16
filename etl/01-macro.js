// ============================================================
//  etl/01-macro.js
//
//  Carrega Selic, CDI e IPCA (2015-hoje) do Banco Central e grava
//  em macro/{indicador}. Roda 1x (ou de novo pra atualizar até a
//  data mais recente — usa set com merge, então é seguro repetir).
//
//  Rodar: node etl/01-macro.js
// ============================================================

const { getDb, admin } = require('./lib/firebaseAdmin');
const { buscarSerieBCB } = require('./lib/bcb');
const { buscarHistoricoYahoo } = require('./lib/yahoo');

const DATA_INICIO = '2015-01-01';
const DATA_FIM    = new Date().toISOString().slice(0, 10);

async function main() {
  const db = getDb();

  for (const indicador of ['selic', 'cdi', 'ipca']) {
    console.log(`[macro] Buscando ${indicador}...`);
    let serie;
    try {
      serie = await buscarSerieBCB(indicador, DATA_INICIO, DATA_FIM);
    } catch (e) {
      console.error(`[macro] Falhou pra ${indicador}:`, e.message);
      continue;
    }

    if (!serie.length) {
      console.warn(`[macro] ${indicador} veio vazio — pulando.`);
      continue;
    }

    await db.collection('macro').doc(indicador).set({
      indicador,
      serie,
      atualizado_em: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`[macro] ${indicador}: ${serie.length} pontos gravados (${serie[0].data} a ${serie[serie.length - 1].data}).`);

    // Respiro entre chamadas pra não estressar a API do BCB
    await new Promise(r => setTimeout(r, 300));
  }

  // O Ibovespa em si, como benchmark (Camada 5) — usado pro beta,
  // alpha e comparação de retorno nas metas "bater_ibovespa".
  console.log('[macro] Buscando Ibovespa (^BVSP)...');
  try {
    const { dias } = await buscarHistoricoYahoo('^BVSP', 10, { symbolCompleto: true });
    const serie = dias.map(d => ({ data: d.data, valor: d.fechamento }));
    await db.collection('macro').doc('ibovespa').set({
      indicador: 'ibovespa',
      serie,
      atualizado_em: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`[macro] ibovespa: ${serie.length} pontos gravados.`);
  } catch (e) {
    console.error('[macro] Falhou pro Ibovespa:', e.message);
  }

  console.log('[macro] Concluído.');
}

main().catch(e => {
  console.error('[macro] Erro fatal:', e);
  process.exit(1);
});
