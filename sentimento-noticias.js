// ============================================================
//  api/sentimento-noticias.js — Fator Sentimento (v2, duas fontes)
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
//  DUAS FONTES, não uma:
//  1. Google News RSS — buscado por NÓS, direto, sem chave de API.
//     Dá manchete + data + fonte confiáveis, sem depender da busca
//     interna do Claude. Também funciona como fallback: se a chamada
//     à Anthropic falhar por qualquer motivo, ainda devolvemos essas
//     manchetes cruas em vez de um erro genérico.
//  2. Claude (Messages API) com a tool de busca web — interpreta e
//     pontua o sentimento, usando as manchetes da RSS como contexto
//     inicial confiável e podendo complementar com busca própria.
//
//  Dois cuidados que a literatura aponta como armadilhas comuns desse
//  tipo de sistema, mitigados explicitamente no prompt:
//  1. "Look-ahead bias" — usar informação que só ficou disponível
//     DEPOIS da data analisada. Por isso as datas da RSS são
//     explícitas e o prompt pede pra ignorar notícia sem data clara.
//  2. "Efeito de distração" — notícia genérica do mercado (ou de
//     outra empresa) contaminando a nota de UM ticker específico.
// ============================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function decodificarEntidades(txt) {
  return (txt || '')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .trim();
}

// ── Fonte 1: Google News RSS. Público, sem chave, cobre bem imprensa
// brasileira. Parsing por regex simples — é XML pequeno e previsível,
// não vale a pena trazer uma dependência de parser XML só pra isso. ──
async function buscarNoticiasRSS(ticker, nomeEmpresa) {
  const termo = encodeURIComponent(`${nomeEmpresa || ''} ${ticker} B3`.trim());
  const url = `https://news.google.com/rss/search?q=${termo}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AtlasBot/1.0)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Google News RSS HTTP ${res.status}`);
  const xml = await res.text();

  const itens = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .slice(0, 8)
    .map((m) => {
      const bloco = m[1];
      const titulo = decodificarEntidades((bloco.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
      const pubDate = (bloco.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
      const dataISO = pubDate ? new Date(pubDate).toISOString().slice(0, 10) : null;
      const fonte = decodificarEntidades((bloco.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1]);
      return { titulo, data: dataISO, fonte };
    })
    .filter((n) => n.titulo);

  return itens;
}

function montarPrompt(ticker, nomeEmpresa, manchetes) {
  const empresa = nomeEmpresa ? `${nomeEmpresa} (${ticker})` : ticker;
  const contextoManchetes = manchetes.length
    ? `Já encontramos estas manchetes recentes via Google News (use como base, complemente com busca própria se necessário):\n` +
      manchetes.map((m) => `- [${m.data || 'data desconhecida'}] ${m.fonte ? m.fonte + ': ' : ''}${m.titulo}`).join('\n')
    : 'Não encontramos manchetes pré-buscadas — faça a busca você mesmo.';

  return `Você é um analista de sentimento de notícias financeiras. Analise o sentimento das notícias recentes (últimos 15 dias) especificamente sobre ${empresa}, na bolsa brasileira (B3).

${contextoManchetes}

REGRAS IMPORTANTES:
1. Considere APENAS notícias com data visível e anterior a ${hojeISO()}. Se não conseguir confirmar a data de uma notícia, não a use.
2. Considere APENAS notícias especificamente sobre ${empresa} — ignore notícia genérica do setor, do Ibovespa geral, ou de outra empresa, a menos que impacte diretamente ${ticker}.
3. Se as manchetes acima não forem suficientes, pode buscar mais, mas não invente nem generalize.
4. Resuma cada notícia com suas próprias palavras — não copie o título literalmente.

Depois de analisar, retorne APENAS um JSON válido, sem markdown, sem texto antes ou depois, neste formato:
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

  const { ticker, nomeEmpresa } = req.body || {};
  if (!ticker) { res.status(400).json({ error: 'Informe o ticker.' }); return; }

  // ── Fonte 1: RSS (nunca deixa a rota inteira cair se falhar) ──
  let manchetes = [];
  let rssFalhou = false;
  try {
    manchetes = await buscarNoticiasRSS(ticker, nomeEmpresa);
  } catch (e) {
    console.warn('[sentimento-noticias] RSS falhou:', ticker, e.message);
    rssFalhou = true;
  }

  // ── Fonte 2: Claude (interpretação). Se ANTHROPIC_API_KEY faltar ou
  // a chamada falhar, cai pro fallback de manchetes cruas em vez de 500. ──
  if (!ANTHROPIC_API_KEY) {
    if (manchetes.length) {
      res.status(200).json({
        aplicavel: false,
        motivo: 'sem_analise_ia',
        aviso: 'IA de sentimento não configurada no servidor (ANTHROPIC_API_KEY ausente) — mostrando manchetes brutas, sem interpretação.',
        manchetesCruas: manchetes,
        fontes: ['Google News RSS'],
      });
    } else {
      res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor, e a busca de notícias (RSS) também falhou.' });
    }
    return;
  }

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
        messages: [{ role: 'user', content: montarPrompt(ticker, nomeEmpresa, manchetes) }],
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
      throw new Error('resposta_invalida');
    }

    const fontes = [];
    if (manchetes.length) fontes.push('Google News RSS');
    fontes.push('Claude (interpretação + busca web)');

    res.status(200).json({
      aplicavel: true,
      ticker: ticker.toUpperCase(),
      ...resultado,
      fontes,
      avisoMetodologico: 'Sentimento extraído de notícias públicas via IA — reflete o tom da cobertura recente, não uma garantia de direção de preço. Sujeito a viés de cobertura da imprensa.',
    });
  } catch (e) {
    console.error('[api/sentimento-noticias] Claude falhou:', ticker, e.message);
    // ── Fallback final: se a IA falhou mas a RSS trouxe algo, ainda
    // devolve valor útil em vez de um card de erro vazio. ──
    if (manchetes.length) {
      res.status(200).json({
        aplicavel: false,
        motivo: 'analise_ia_falhou',
        aviso: `Não consegui interpretar o sentimento agora (${e.message}) — mostrando as manchetes encontradas, sem análise.`,
        manchetesCruas: manchetes,
        fontes: ['Google News RSS'],
      });
    } else {
      res.status(500).json({ error: `Erro ao buscar sentimento de notícias (RSS ${rssFalhou ? 'falhou' : 'sem resultados'}, IA falhou): ${e.message}` });
    }
  }
};

