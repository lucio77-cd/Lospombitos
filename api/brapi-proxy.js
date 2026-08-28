// ============================================================
//  api/brapi-proxy.js — Proxy pra brapi.dev
//
//  FIX: mercado-api.js tinha o token da brapi ('dxg6v14WGQmfM1t9Hdms17')
//  hardcoded no client — qualquer um via DevTools podia copiar e usar
//  sua cota paga. Igual foi feito com Gemini/Anthropic: o token agora
//  só existe aqui no servidor (BRAPI_TOKEN na Vercel).
//
//  Não exige login — é só cotação pública de mercado, sem dado sensível
//  do usuário — mas o token some do client de qualquer forma.
//
//  Allowlist de paths: só libera os endpoints que o mercado-api.js
//  realmente usa, pra não virar um proxy genérico pra qualquer coisa.
// ============================================================

const BRAPI_TOKEN = process.env.BRAPI_TOKEN || '';
const PATHS_PERMITIDOS = [/^\/quote\/list$/, /^\/quote\/[A-Za-z0-9,%^=]+$/];

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método não permitido. Use GET.' });
    return;
  }

  const { path, ...params } = req.query || {};
  if (!path || typeof path !== 'string') {
    res.status(400).json({ error: 'Informe o path.' });
    return;
  }
  if (!PATHS_PERMITIDOS.some((re) => re.test(path))) {
    res.status(400).json({ error: 'Path não permitido.' });
    return;
  }

  const url = new URL('https://brapi.dev/api' + path);
  Object.entries(params).forEach(([k, v]) => {
    if (typeof v === 'string') url.searchParams.set(k, v);
  });
  if (BRAPI_TOKEN) url.searchParams.set('token', BRAPI_TOKEN);

  try {
    const r = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    console.error('[api/brapi-proxy]', path, e.message);
    res.status(502).json({ error: 'Falha ao consultar a brapi: ' + e.message });
  }
};
