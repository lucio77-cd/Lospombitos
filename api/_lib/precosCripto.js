// ============================================================
//  api/_lib/precosCripto.js — preço de cripto pro "Game Estudo"
//  (terminal de day trade), separado do precos.js do simulador
//  principal. Lista menor de moedas, com cache curto próprio.
// ============================================================

const MAP_ID = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
  bnb: 'binancecoin',
};

const _cache = {};
const CACHE_TTL_MS = 15 * 1000; // preço de day trade precisa ser mais fresco

async function precoCripto(simbolo) {
  const s = simbolo.toLowerCase();
  const id = MAP_ID[s];
  if (!id) return null;

  const agora = Date.now();
  if (_cache[id] && agora - _cache[id].ts < CACHE_TTL_MS) {
    return _cache[id].preco;
  }

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=brl`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const data = await res.json();
  const preco = data?.[id]?.brl;
  if (!preco) return null;

  _cache[id] = { preco, ts: agora };
  return preco;
}

module.exports = { precoCripto, MAP_ID };
