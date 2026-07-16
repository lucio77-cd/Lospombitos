// ============================================================
//  etl/lib/yahoo.js — Histórico diário + eventos corporativos
//
//  Usa o endpoint público v8/finance/chart do Yahoo Finance.
//  Tickers brasileiros levam o sufixo ".SA" (ex: PETR4.SA).
//
//  Retorna preço BRUTO (close) e AJUSTADO (adjclose — já corrigido
//  por dividendo e desdobramento/grupamento pelo próprio Yahoo),
//  mais os eventos de dividendo e split que vierem no mesmo payload.
// ============================================================

const UM_ANO_SEGUNDOS = 365 * 24 * 60 * 60;

/**
 * @param {string} ticker  ex: "PETR4" (sem .SA — a função adiciona)
 * @param {number} anos    quantos anos pra trás buscar, a partir de hoje
 * @param {object} opts    { symbolCompleto: true } pra símbolos que já
 *                         vêm prontos (ex: "^BVSP", o índice em si —
 *                         nesse caso NÃO adiciona o sufixo .SA)
 */
async function buscarHistoricoYahoo(ticker, anos = 10, opts = {}) {
  const symbol = opts.symbolCompleto ? ticker : `${ticker}.SA`;
  const agora = Math.floor(Date.now() / 1000);
  const inicio = agora - anos * UM_ANO_SEGUNDOS;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}` +
    `?period1=${inicio}&period2=${agora}&interval=1d&events=div,split`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LosPombitosETL/1.0)' },
  });
  if (!res.ok) throw new Error(`Yahoo respondeu ${res.status} pra ${symbol}`);

  const json = await res.json();
  const resultado = json?.chart?.result?.[0];
  if (!resultado) {
    const erro = json?.chart?.error?.description || 'sem dados retornados';
    throw new Error(`Yahoo sem resultado pra ${symbol}: ${erro}`);
  }

  const timestamps = resultado.timestamp || [];
  const quote      = resultado.indicators?.quote?.[0] || {};
  const adjclose   = resultado.indicators?.adjclose?.[0]?.adjclose || [];

  const dias = [];
  for (let i = 0; i < timestamps.length; i++) {
    // Yahoo às vezes traz null nos campos de um dia sem pregão —
    // pula esses em vez de gravar um dia quebrado no banco.
    if (quote.close?.[i] == null) continue;
    dias.push({
      data:                new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      abertura:            arred(quote.open?.[i]),
      maxima:              arred(quote.high?.[i]),
      minima:              arred(quote.low?.[i]),
      fechamento:          arred(quote.close?.[i]),
      fechamento_ajustado: arred(adjclose[i] ?? quote.close[i]),
      volume:              quote.volume?.[i] || 0,
    });
  }

  // Eventos corporativos (dividendos e splits) que vieram no payload
  const eventos = [];
  const divEvents   = resultado.events?.dividends || {};
  const splitEvents = resultado.events?.splits || {};

  for (const key in divEvents) {
    const e = divEvents[key];
    eventos.push({
      data: new Date(e.date * 1000).toISOString().slice(0, 10),
      tipo: 'dividendo',
      detalhe: { valor_por_acao: e.amount },
    });
  }
  for (const key in splitEvents) {
    const e = splitEvents[key];
    eventos.push({
      data: new Date(e.date * 1000).toISOString().slice(0, 10),
      tipo: e.numerator > e.denominator ? 'split' : 'grupamento',
      detalhe: { proporcao: `${e.numerator}:${e.denominator}` },
    });
  }
  eventos.sort((a, b) => a.data.localeCompare(b.data));

  return { dias, eventos };
}

function arred(n) {
  return n == null ? null : Math.round(n * 100) / 100;
}

module.exports = { buscarHistoricoYahoo };
