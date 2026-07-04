// ============================================================
//  api/noticias.js — Busca manchetes recentes de um ticker/empresa
//
//  Fica separado do /api/analise-ia de propósito: este endpoint só
//  busca dados (Google News RSS); quem monta o prompt e pede o
//  sentimento pro Claude é o próprio atlas.html, reaproveitando o
//  /api/analise-ia que já existe — sem duplicar o código que fala
//  com a Anthropic.
// ============================================================

const { buscarNoticias } = require('./lib/noticias');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido. Use POST.' });
    return;
  }

  const { query } = req.body || {};
  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'Campo "query" (string) é obrigatório.' });
    return;
  }

  try {
    const manchetes = await buscarNoticias(query, 8);
    res.status(200).json({ manchetes });
  } catch (e) {
    console.error('[api/noticias]', query, e.message);
    res.status(500).json({ error: 'Erro ao buscar notícias: ' + e.message });
  }
};
