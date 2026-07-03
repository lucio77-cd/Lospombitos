// ============================================================
//  api/_lib/yahoo.js — Histórico de índices globais e câmbio
//
//  Fonte: endpoint v8 "chart" do Yahoo Finance — não é uma API
//  oficialmente documentada, mas é a mesma que alimenta o site
//  publicamente, estável há anos, sem chave. Cobre índices
//  (^BVSP, ^GSPC...) e câmbio (USDBRL=X, EURBRL=X...).
// ============================================================

async function historicoYahoo(simbolo, dias = 60) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=${dias}d&interval=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SoldoBot/1.0)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status} (${simbolo})`);
  const data = await res.json();

  const resultado = data?.chart?.result?.[0];
  if (!resultado) throw new Error(`Yahoo Finance: sem dados pra ${simbolo}`);

  const timestamps = resultado.timestamp || [];
  const closes = resultado.indicators?.quote?.[0]?.close || [];

  const pontos = [];
  timestamps.forEach((ts, i) => {
    if (typeof closes[i] === 'number') {
      pontos.push({ data: new Date(ts * 1000).toISOString().slice(0, 10), preco: closes[i] });
    }
  });
  return pontos;
}

module.exports = { historicoYahoo };
