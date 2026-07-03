// ============================================================
//  api/fatores-fundamentais.js — Fatores Value/Quality/Momentum
//
//  Recebe do frontend os fundamentos que o Atlas já busca hoje
//  (pl, pvp, roe, margem — vindos de MercadoAPI.buscarDetalhadoAtivo,
//  que já chama a brapi.dev com fundamental=true). Isso evita
//  duplicar a chamada e evita ter que reconciliar nomes de campo
//  da brapi de novo aqui — usamos exatamente os números que já
//  aparecem pro usuário no card de análise.
//
//  A única chamada nova feita AQUI é o histórico de preço de ~1 ano
//  (pra calcular momentum 12-1), porque o histórico de 6 meses que
//  o restante do Atlas já busca não cobre a janela padrão acadêmica.
//
//  Duas fontes pro histórico, com fallback automático: brapi.dev
//  primeiro (mesma fonte do resto do app); se falhar ou vier vazio,
//  cai pro Yahoo Finance (api/_lib/yahoo.js, que o Atlas já usa pra
//  índices/câmbio) usando o sufixo .SA do ticker na B3.
// ============================================================

const { scoreValue, scoreQuality, scoreMomentum, scoreGeral } = require('./_lib/fatores-fundamentais');
const { historicoYahoo } = require('./_lib/yahoo');

async function historicoBrapi(ticker) {
  const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker.toUpperCase())}?range=1y&interval=1d&fundamental=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`brapi HTTP ${res.status}`);
  const data = await res.json();
  const serie = data?.results?.[0]?.historicalDataPrice || [];
  return serie
    .filter((p) => p.close > 0)
    .map((p) => ({ data: new Date(p.date * 1000).toISOString().slice(0, 10), preco: p.close }));
}

async function historicoComFallback(ticker) {
  try {
    const pontos = await historicoBrapi(ticker);
    if (pontos.length >= 40) return { pontos, fonte: 'brapi.dev' };
    throw new Error('histórico brapi curto demais');
  } catch (e) {
    console.warn('[fatores-fundamentais] brapi falhou, tentando Yahoo:', ticker, e.message);
    const pontosYahoo = await historicoYahoo(`${ticker.toUpperCase()}.SA`, 380);
    return { pontos: pontosYahoo, fonte: 'Yahoo Finance (fallback)' };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método não permitido. Use POST.' }); return; }

  const { ticker, pl, pvp, roe, margem } = req.body || {};
  if (!ticker) { res.status(400).json({ error: 'Informe o ticker.' }); return; }

  try {
    const value = scoreValue(
      typeof pl === 'number' ? pl : parseFloat(pl),
      typeof pvp === 'number' ? pvp : parseFloat(pvp)
    );
    const quality = scoreQuality(
      typeof roe === 'number' ? roe : parseFloat(roe),
      typeof margem === 'number' ? margem : parseFloat(margem)
    );

    let momentum = null;
    let avisoMomentum = null;
    let fonteHistorico = null;
    try {
      const { pontos, fonte } = await historicoComFallback(ticker);
      fonteHistorico = fonte;
      momentum = scoreMomentum(pontos);
      if (!momentum) avisoMomentum = 'Histórico de preço curto demais pra calcular momentum de 12 meses.';
    } catch (e) {
      console.error('[fatores-fundamentais] as duas fontes de histórico falharam:', ticker, e.message);
      avisoMomentum = 'Não consegui buscar o histórico de preço agora (brapi.dev e Yahoo Finance indisponíveis) pra calcular momentum.';
    }

    const geral = scoreGeral(value, quality, momentum);

    if (!value && !quality && !momentum) {
      res.status(200).json({
        aplicavel: false,
        motivo: 'sem_dados',
        aviso: 'Não há dados fundamentalistas suficientes pra este ativo (comum em BDRs, ETFs, fundos imobiliários e ações recém-listadas).',
      });
      return;
    }

    res.status(200).json({
      aplicavel: true,
      ticker: ticker.toUpperCase(),
      value,
      quality,
      momentum,
      avisoMomentum,
      fonteHistorico,
      geral,
      aviso: 'Scores heurísticos por faixas de mercado, não comparação direta contra o setor do ativo. Fator histórico, não garantia de retorno futuro.',
    });
  } catch (e) {
    console.error('[api/fatores-fundamentais]', ticker, e.message);
    res.status(500).json({ error: 'Erro ao calcular fatores fundamentalistas: ' + e.message });
  }
};

