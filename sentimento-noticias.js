// ============================================================
//  api/sentimento-noticias.js — Fator Sentimento (v1, com busca real)
//
//  Substitui o agente "sentimento" que hoje é só o Claude chutando
//  um número a partir de dados de preço (ver o prompt de gerarAnalise
//  em atlas.html — o agente "sentimento" nunca vê notícia nenhuma
//  hoje). Pesquisa recente mostra que sentimento extraído de notícias
//  financeiras REAIS via LLM tem poder preditivo bem acima de chute:
//  um estudo com quase 1 milhão de notícias dos EUA (2010-2023)
//  chegou a 74% de acurácia direcional usando um LLM pra pontuar
//  sentimento por notícia.
//
//  Dois cuidados que a literatura aponta como armadilhas comuns
//  desse tipo de sistema, e que este prompt tenta mitigar
//  explicitamente:
//  1. "Look-ahead bias" — o modelo usar informação que só ficou
//     disponível DEPOIS da data que está sendo analisada. Por isso
//     pedimos explicitamente pra só considerar notícias com data
//     visível e anterior a hoje.
//  2. "Efeito de distração" — informação genérica do mercado (ou de
//     outra empresa) contaminando a nota de sentimento de UM ticker
//     específico. Por isso pedimos pra ignorar notícia que não seja
//     especificamente sobre a empresa.
//
//  Usa a Anthropic Messages API diretamente com a tool de busca web
//  (mesma chave de API que api/analise-ia.js já usa).
// ============================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function montarPrompt(ticker, nomeEmpresa) {
  const empresa = nomeEmpresa ? `${nomeEmpresa} (${ticker})` : ticker;
  return `Você é um analista de sentimento de notícias financeiras. Busque as notícias mais recentes especificamente sobre ${empresa}, na bolsa brasileira (B3), publicadas nos últimos 15 dias.

REGRAS IMPORTANTES:
1. Considere APENAS notícias que tenham data visível e sejam anteriores a ${hojeISO()}. Se não conseguir confirmar a data de uma notícia, não a use.
2. Considere APENAS notícias especificamente sobre ${empresa} — ignore notícias genéricas sobre o setor, o Ibovespa geral, ou outras empresas, a menos que impactem diretamente ${ticker}.
3. Se não encontrar notícias específicas e recentes suficientes, diga isso claramente em vez de inventar ou generalizar.
4. Resuma cada notícia com suas próprias palavras — não copie trechos literais.

Depois de pesquisar, retorne APENAS um JSON válido, sem markdown, sem texto antes ou depois, neste formato:
{
  "sentimento_score": 15,
  "direcao": "positivo",
  "confianca": 60,
  "resumo": "1-2 frases resumindo o tom geral das notícias encontradas sobre ${ticker}",
  "principais_eventos": [
    { "data": "2026-06-20", "resumo": "resumo em 1 frase, com suas próprias palavras", "impacto": "positivo" }
  ],
  "numNoticiasEncontradas": 3,
  "aviso": null
}

Onde:
- sentimento_score vai de -100 (muito negativo) a +100 (muito positivo)
- direcao é "positivo", "negativo" ou "neutro"
- confianca (0-100) deve ser BAIXA (abaixo de 40) se você encontrou poucas notícias ou nenhuma específica sobre ${ticker}
- Se não encontrar nada relevante, retorne sentimento_score: 0, direcao: "neutro", confianca: 0, numNoticiasEncontradas: 0, e explique no campo "aviso"`;
}

function extrairTexto(contentBlocks) {
  return (contentBlocks || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método não permitido. Use POST.' }); return; }
  if (!ANTHROPIC_API_KEY) { res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' }); return; }

  const { ticker, nomeEmpresa } = req.body || {};
  if (!ticker) { res.status(400).json({ error: 'Informe o ticker.' }); return; }

  try {
    const resposta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: 'user', content: montarPrompt(ticker, nomeEmpresa) }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      }),
      signal: AbortSignal.timeout(28000), // busca web demora mais que uma chamada comum
    });

    if (!resposta.ok) {
      const errText = await resposta.text().catch(() => '');
      throw new Error(`Anthropic API HTTP ${resposta.status}: ${errText.slice(0, 200)}`);
    }

    const data = await resposta.json();
    const texto = extrairTexto(data.content);
    const limpo = texto.replace(/```json|```/g, '').trim();

    let resultado;
    try {
      resultado = JSON.parse(limpo);
    } catch (parseErr) {
      console.error('[sentimento-noticias] JSON inválido do Claude:', limpo.slice(0, 300));
      res.status(200).json({
        aplicavel: false,
        motivo: 'resposta_invalida',
        aviso: 'Não consegui interpretar a resposta da análise de sentimento agora. Tente novamente.',
      });
      return;
    }

    res.status(200).json({
      aplicavel: true,
      ticker: ticker.toUpperCase(),
      ...resultado,
      avisoMetodologico: 'Sentimento extraído de notícias públicas via IA — reflete o tom da cobertura recente, não uma garantia de direção de preço. Sujeito a viés de cobertura da imprensa.',
    });
  } catch (e) {
    console.error('[api/sentimento-noticias]', ticker, e.message);
    res.status(500).json({ error: 'Erro ao buscar sentimento de notícias: ' + e.message });
  }
};
