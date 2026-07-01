// ============================================================
//  /api/gemini.js — Proxy serverless para a API Gemini
//
//  Por que isso existe:
//  Antes, GEMINI_API_KEY ficava hardcoded em germinador.js e
//  arte-semanal.js, visível para qualquer pessoa no DevTools.
//  Agora a chave vive só aqui, como variável de ambiente da
//  Vercel, e o navegador chama este endpoint (mesma origem).
//
//  Configuração necessária na Vercel:
//  Project Settings → Environment Variables →
//    GEMINI_API_KEY = <sua nova chave, gerada após revogar a antiga>
//  (NÃO prefixe com NEXT_PUBLIC_ ou VITE_ — isso a exporia de novo)
// ============================================================

module.exports = async (req, res) => {
  // Só aceita POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido. Use POST.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[api/gemini] GEMINI_API_KEY não configurada no ambiente da Vercel.');
    res.status(500).json({ error: 'Serviço de IA temporariamente indisponível.' });
    return;
  }

  const { prompt, temperature, maxOutputTokens } = req.body || {};

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Campo "prompt" (string) é obrigatório.' });
    return;
  }

  // Limite de segurança para evitar prompts absurdamente grandes
  if (prompt.length > 8000) {
    res.status(400).json({ error: 'Prompt excede o tamanho máximo permitido.' });
    return;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: typeof temperature === 'number' ? temperature : 0.9,
          maxOutputTokens: typeof maxOutputTokens === 'number' ? maxOutputTokens : 300,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => '');
      console.error('[api/gemini] Erro upstream:', geminiRes.status, errBody);
      res.status(502).json({ error: 'Erro ao consultar o serviço de IA.' });
      return;
    }

    const data = await geminiRes.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!texto) {
      res.status(502).json({ error: 'Resposta vazia do serviço de IA.' });
      return;
    }

    res.status(200).json({ texto });
  } catch (e) {
    console.error('[api/gemini] Erro inesperado:', e);
    res.status(500).json({ error: 'Erro inesperado ao consultar o serviço de IA.' });
  }
};
