// ============================================================
//  /api/analise-ia.js — Proxy serverless para a API Anthropic
//
//  Por que isso existe:
//  relatorio.html chamava https://api.anthropic.com direto do
//  navegador, SEM chave — isso sempre resultava em 401 e caía
//  no fallback estático. Além disso, mesmo com chave, ela nunca
//  deve ficar no client. Este endpoint resolve os dois problemas.
//
//  Configuração necessária na Vercel:
//  Project Settings → Environment Variables →
//    ANTHROPIC_API_KEY = <sua chave da API da Anthropic>
// ============================================================

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido. Use POST.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[api/analise-ia] ANTHROPIC_API_KEY não configurada no ambiente da Vercel.');
    res.status(500).json({ error: 'Serviço de análise temporariamente indisponível.' });
    return;
  }

  const { prompt } = req.body || {};

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Campo "prompt" (string) é obrigatório.' });
    return;
  }

  if (prompt.length > 6000) {
    res.status(400).json({ error: 'Prompt excede o tamanho máximo permitido.' });
    return;
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text().catch(() => '');
      console.error('[api/analise-ia] Erro upstream:', anthropicRes.status, errBody);
      res.status(502).json({ error: 'Erro ao consultar o serviço de análise.' });
      return;
    }

    const data = await anthropicRes.json();
    const texto = (data.content || [])
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('');

    if (!texto) {
      res.status(502).json({ error: 'Resposta vazia do serviço de análise.' });
      return;
    }

    res.status(200).json({ texto });
  } catch (e) {
    console.error('[api/analise-ia] Erro inesperado:', e);
    res.status(500).json({ error: 'Erro inesperado ao consultar o serviço de análise.' });
  }
};
