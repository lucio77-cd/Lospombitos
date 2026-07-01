// ============================================================
//  api/_lib/precos.js — Fonte de preço server-side
//
//  Esta é a versão "fonte da verdade" das mesmas APIs que o
//  mercado-api.js já usa no client. A diferença crucial: o
//  preço usado para DEBITAR/CREDITAR o saldo do usuário agora
//  vem DAQUI, não do que o navegador mandar — então forjar o
//  preço no DevTools deixa de ter efeito.
//
//  Cobre hoje: ações/FIIs (brapi.dev) e cripto (CoinGecko).
//  TODO: tesouro/CDB/LCI ainda usam o preço mandado pelo client
//  (são calculados por fórmula, não cotados em bolsa — menor
//  risco, mas vale revisar depois).
// ============================================================

const BRAPI_TOKEN = process.env.BRAPI_TOKEN || ''; // opcional — mova para env var quando puder

async function _fetchJson(url, timeoutMs = 8000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function precoAcaoOuFii(ticker) {
  const t = String(ticker).toUpperCase().trim();
  const base = `https://brapi.dev/api/quote/${t}?fundamental=false`;
  const url = BRAPI_TOKEN ? `${base}&token=${BRAPI_TOKEN}` : base;

  const data = await _fetchJson(url);
  const q = data?.results?.[0];
  if (!q || !q.regularMarketPrice || q.regularMarketPrice <= 0) {
    return null;
  }
  return { preco: q.regularMarketPrice, mercado_aberto: q.marketState === 'REGULAR' };
}

async function precoCripto(id) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=brl`;
  const data = await _fetchJson(url);
  const preco = data?.[id]?.brl;
  if (!preco || preco <= 0) return null;
  return { preco, mercado_aberto: true }; // cripto negocia 24h
}

// Retorna { preco, mercado_aberto } ou null se não foi possível confirmar o preço real.
async function obterPrecoReal(tipo, ticker) {
  try {
    if (tipo === 'cripto') return await precoCripto(ticker.toLowerCase());
    if (tipo === 'acoes' || tipo === 'fiis') return await precoAcaoOuFii(ticker);
    return null; // tesouro/cdb/lci — não validado aqui ainda (ver TODO acima)
  } catch (e) {
    console.error('[precos] Falha ao obter preço real:', tipo, ticker, e.message);
    return null;
  }
}

module.exports = { obterPrecoReal };
