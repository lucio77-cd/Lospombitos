// ============================================================
//  api/_lib/precosCripto.js — Preço em tempo real (CoinGecko)
//
//  Fonte única de verdade pro Game Estudo: tanto o polling do
//  gráfico quanto abrir/fechar posição usam ESTA função. O client
//  nunca decide o preço de entrada/saída — só exibe.
// ============================================================

const IDS = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
  bnb: 'binancecoin',
};

async function precoAtual(ativo) {
  const id = IDS[ativo];
  if (!id) throw new Error(`Ativo desconhecido: ${ativo}`);

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=brl`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const data = await res.json();
  const preco = data?.[id]?.brl;
  if (!preco || preco <= 0) throw new Error(`Preço inválido pra ${ativo}`);
  return preco;
}

async function precosTodos() {
  const ids = Object.values(IDS).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=brl&include_24hr_change=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const data = await res.json();

  const resultado = {};
  for (const [chave, id] of Object.entries(IDS)) {
    const preco = data?.[id]?.brl;
    const variacao24h = data?.[id]?.brl_24h_change;
    if (preco > 0) resultado[chave] = { preco, variacao24h: variacao24h ?? null };
  }
  return resultado;
}

module.exports = { precoAtual, precosTodos, IDS };
