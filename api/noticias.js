// ============================================================
//  api/noticias.js — Endpoint real chamado por atlas.html
//
//  ⚠️ IMPORTANTE — ESTE ARQUIVO VAI EM api/noticias.js
//  O outro "noticias.js" que você já tem é a LIB (api/_lib/noticias.js,
//  só exporta a função buscarNoticias, não é um handler do Vercel).
//  Os dois se chamam "noticias.js" mas são coisas diferentes — se
//  salvar os dois no mesmo lugar, um sobrescreve o outro.
//
//  O atlas.html chama fetch('/api/noticias', {method:'POST', body:{query}})
//  esperando { manchetes: [...] } de volta. Sem este arquivo em
//  api/noticias.js, essa rota nem existe — a Vercel devolve a página
//  de erro genérica em HTML ("A server error has occurred..."), que
//  quebra o JSON.parse no client (é o erro "Unexpected token 'A'...
//  is not valid JSON" que aparece no Atlas).
// ============================================================

const { buscarNoticias } = require('./_lib/noticias');

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
