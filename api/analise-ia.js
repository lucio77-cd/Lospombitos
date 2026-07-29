// ============================================================
//  /api/analise-ia.js — Proxy serverless para a API Gemini
//
//  Por que isso existe:
//  relatorio.html chamava a API de IA direto do navegador, SEM
//  chave — isso sempre resultava em erro e caía no fallback
//  estático. Além disso, mesmo com chave, ela nunca deve ficar
//  no client. Este endpoint resolve os dois problemas.
//
//  Trocado de Anthropic pra Gemini: mesma GEMINI_API_KEY que já
//  é usada em api/gemini.js (germinador.js) — não precisa de
//  chave nova nem de variável de ambiente nova. O contrato de
//  resposta continua { texto: "..." }, então atlas.html não
//  precisou mudar nada na forma de consumir este endpoint.
//
//  Configuração necessária na Vercel (se ainda não tiver):
//  Project Settings → Environment Variables →
//    GEMINI_API_KEY = <sua chave da API do Gemini>
//
//  ⚠️ Exige login (verificarToken): antes deste endpoint aceitava
//  qualquer POST, sem checar quem chamava — ou seja, qualquer
//  pessoa na internet podia gastar sua cota de API sem nem ter
//  conta no app.
// ============================================================

const MODEL = 'gemini-1.5-flash';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido. Use POST.' });
    return;
  }

  try {
    await require('./_lib/firebaseAdmin').verificarToken(req);
  } catch (e) {
    res.status(e.status || 401).json({ error: e.message });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[api/analise-ia] GEMINI_API_KEY não configurada no ambiente da Vercel.');
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 3000, // prompts do Atlas pedem JSON longo (agentes + síntese)
        },
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => '');
      console.error('[api/analise-ia] Erro upstream:', geminiRes.status, errBody);
      res.status(502).json({ error: 'Erro ao consultar o serviço de análise.' });
      return;
    }

    const data = await geminiRes.json();
    const candidato = data?.candidates?.[0];

    // Gemini pode cortar a resposta por segurança ou por limite de
    // tokens — nesses casos não vem texto, e o motivo fica em
    // finishReason (SAFETY, MAX_TOKENS, RECITATION etc.)
    const texto = candidato?.content?.parts?.map((p) => p.text || '').join('') || '';

    if (!texto) {
      console.error('[api/analise-ia] Resposta vazia do Gemini. finishReason:', candidato?.finishReason);
      res.status(502).json({ error: 'Resposta vazia do serviço de análise.' });
      return;
    }

    res.status(200).json({ texto });
  } catch (e) {
    console.error('[api/analise-ia] Erro inesperado:', e);
    res.status(500).json({ error: 'Erro inesperado ao consultar o serviço de análise.' });
  }
};
