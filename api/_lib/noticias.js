// ============================================================
//  api/noticias.js — Manchetes recentes via Google News RSS
//
//  FIX: faltava verificarToken — era o único endpoint do projeto
//  aberto sem login, então qualquer um na internet podia bater
//  aqui e consumir a fonte de notícias sem estar logado.
// ============================================================

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido. Use POST.' });
    return;
  }

  let verificarToken, buscarNoticias;
  try {
    ({ verificarToken } = require('./_lib/firebaseAdmin'));
    ({ buscarNoticias } = require('./_lib/noticias'));
  } catch (e) {
    console.error('[api/noticias] Falha ao carregar módulos:', e.message);
    res.status(500).json({ error: 'Erro interno ao carregar dependências: ' + e.message });
    return;
  }

  try {
    await verificarToken(req);
  } catch (e) {
    res.status(e.status || 401).json({ error: e.message });
    return;
  }

  const { query, maxItens } = req.body || {};
  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({ error: 'Informe a busca (query).' });
    return;
  }

  const limite = Number.isFinite(parseInt(maxItens, 10))
    ? Math.min(Math.max(parseInt(maxItens, 10), 1), 20)
    : 8;

  try {
    const noticias = await buscarNoticias(query.trim(), limite);
    res.status(200).json({ noticias });
  } catch (e) {
    console.error('[api/noticias]', query, e.message);
    res.status(502).json({ error: 'Erro ao buscar notícias: ' + e.message });
  }
};
