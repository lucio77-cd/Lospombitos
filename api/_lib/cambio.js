// ============================================================
//  api/_lib/cambio.js — Histórico de câmbio USD/BRL
//
//  Fonte: AwesomeAPI (já usada em outras partes do projeto,
//  ex: atlas.html pro fluxo de cripto). Câmbio entra aqui como
//  variável de controle pros ativos de agro/commodity, porque
//  preço de commodity costuma ser dolarizado — sem controlar por
//  câmbio, uma correlação com clima pode na verdade ser câmbio
//  disfarçado de clima.
// ============================================================

async function cambioHistorico(dias = 100) {
  const url = `https://economia.awesomeapi.com.br/json/daily/USD-BRL/${dias}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`AwesomeAPI HTTP ${res.status}`);
  const data = await res.json();

  const porData = {};
  for (const d of data) {
    const dataStr = new Date(parseInt(d.timestamp, 10) * 1000).toISOString().slice(0, 10);
    porData[dataStr] = parseFloat(d.bid);
  }
  return porData; // { 'YYYY-MM-DD': cotacao }
}

module.exports = { cambioHistorico };
