// ============================================================
//  etl/03-composicao-indice.js
//
//  Grava a composição ATUAL do Ibovespa (ibovespa-tickers.json)
//  como aproximação reaproveitada pra todo o período 2015-2025.
//  Marcado com aproximado:true — na Fase 3 do projeto isso vira
//  vários documentos (um por rebalanceamento real), não mais 1 só.
//
//  Rodar: node etl/03-composicao-indice.js
// ============================================================

const fs = require('fs');
const path = require('path');
const { getDb, admin } = require('./lib/firebaseAdmin');

async function main() {
  const db = getDb();
  const listaPath = path.join(__dirname, 'ibovespa-tickers.json');
  const config = JSON.parse(fs.readFileSync(listaPath, 'utf8'));

  await db.collection('composicao_ibovespa').doc('atual').set({
    vigencia_original: config.vigencia,
    aproximado: true,
    nota: 'Composição atual reaproveitada como aproximação para todo o período ' +
          '2015-2025 (survivorship bias assumido e documentado — ver design do projeto). ' +
          'Fase 3 vai substituir isso por composições reais por rebalanceamento.',
    ativos: config.ativos,
    atualizado_em: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`[composicao] Gravado com ${config.ativos.length} ativos (aproximado:true).`);
}

main().catch(e => {
  console.error('[composicao] Erro fatal:', e);
  process.exit(1);
});
