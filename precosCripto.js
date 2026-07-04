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

// Cache em memória (dura enquanto a função da Vercel ficar "quente" —
// não é garantido entre execuções frias, mas reduz muito as chamadas ao
// CoinGecko quando várias pessoas estão jogando ao mesmo tempo, já que o
// polling do client é a cada 8s e não precisa bater na fonte toda vez).
const CACHE_TTL_MS = 5000;
let cache = { dados: null, timestamp: 0 };
let ultimoValorConhecido = null; // fallback se o CoinGecko falhar de vez

async function precosTodos() {
  const agora = Date.now();
  if (cache.dados && (agora - cache.timestamp) < CACHE_TTL_MS) {
    return cache.dados;
  }

  const ids = Object.values(IDS).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=brl&include_24hr_change=true`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = await res.json();

    const resultado = {};
    for (const [chave, id] of Object.entries(IDS)) {
      const preco = data?.[id]?.brl;
      const variacao24h = data?.[id]?.brl_24h_change;
      if (preco > 0) resultado[chave] = { preco, variacao24h: variacao24h ?? null };
    }

    if (!Object.keys(resultado).length) throw new Error('CoinGecko retornou vazio pros 4 ativos.');

    cache = { dados: resultado, timestamp: agora };
    ultimoValorConhecido = resultado;
    return resultado;

  } catch (e) {
    // Se já tivermos QUALQUER cotação anterior (mesmo velha), devolve ela em
    // vez de deixar a tela do usuário sem nada — com uma flag avisando que
    // é um valor desatualizado, não ao vivo.
    if (ultimoValorConhecido) {
      console.warn('[precosCripto] CoinGecko falhou, usando último valor conhecido:', e.message);
      return { ...ultimoValorConhecido, _desatualizado: true };
    }
    throw e;
  }
}

module.exports = { precoAtual, precosTodos, IDS };
