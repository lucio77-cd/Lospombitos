// ============================================================
//  api/_lib/precos.js — Preço real no servidor (fonte de verdade
//  pra ordens a mercado — executar-ordem.js confia só nisso, nunca
//  no preço que o client manda no corpo da requisição)
// ============================================================

const BRAPI_TOKEN = process.env.BRAPI_TOKEN || '';

async function precoAcaoOuFii(ticker) {
  const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}` +
    `?fundamental=false${BRAPI_TOKEN ? `&token=${BRAPI_TOKEN}` : ''}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`brapi HTTP ${res.status}`);
  const data = await res.json();
  const q = data?.results?.[0];
  if (!q || !q.regularMarketPrice) return null;
  return {
    preco: q.regularMarketPrice,
    mercado_aberto: q.marketState === 'REGULAR',
  };
}

// FIX: o resto do app (mercado-api.js, carteira.html, ordem.html) trata
// cripto pelo ID COMPLETO do CoinGecko (ex: "bitcoin", "ethereum"), salvo
// em maiúsculas nas posições/ordens (ex: "BITCOIN"). Esta função antes
// tentava mapear isso contra uma tabela de SÍMBOLOS (BTC, ETH...), que
// nunca batia com "BITCOIN"/"ETHEREUM" — resultado: toda ordem de cripto
// a mercado falhava com "Não foi possível confirmar a cotação real".
// Agora usa o próprio ticker (em minúsculas) como ID do CoinGecko,
// exatamente como buscarCripto() já faz no client.
async function precoCripto(ticker) {
  const id = (ticker || '').toLowerCase().trim();
  if (!id) return null;
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=brl`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const data = await res.json();
  const preco = data?.[id]?.brl;
  if (!preco) return null;
  return { preco, mercado_aberto: true }; // cripto negocia 24h
}

/**
 * @param {string} tipo   'acoes' | 'fiis' | 'cripto'
 * @param {string} ticker
 * @returns {Promise<{preco:number, mercado_aberto:boolean}|null>}
 */
async function obterPrecoReal(tipo, ticker) {
  try {
    if (tipo === 'cripto') return await precoCripto(ticker);
    return await precoAcaoOuFii(ticker);
  } catch (e) {
    console.error('[precos] obterPrecoReal', tipo, ticker, e.message);
    return null;
  }
}

module.exports = { obterPrecoReal };
