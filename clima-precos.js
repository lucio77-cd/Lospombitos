// ============================================================
//  api/clima-precos.js — "Fator Climático" do Atlas (v2)
//
//  Reescrita completa. A versão anterior testava 35 cidades × 2
//  variáveis (70 testes) contra QUALQUER ticker, o que gera
//  "sinal" falso em ~99% das buscas só por acaso estatístico
//  (problema de comparações múltiplas). Esta versão:
//
//  1. Só roda pra ativos com mecanismo causal conhecido
//     (api/_lib/ativos-clima.js) — pra todo o resto, não testa
//     nada e diz isso claramente.
//  2. Usa variáveis com sentido causal: chuva ACUMULADA em 30
//     dias (não ponto diário), índice ONI (regime climático),
//     e câmbio USD/BRL como controle — não "qualquer cidade".
//  3. Testa poucas combinações de defasagem (o preço reage com
//     atraso à safra, não no mesmo dia) — 7 testes pra agro, 3
//     pra hidrelétricas, não 70.
//  4. Calcula p-valor de verdade e aplica Bonferroni pro número
//     real de testes rodados.
// ============================================================

const ATIVOS = require('./_lib/ativos-clima');
const { serieDiaria, acumulado30d, addDias } = require('./_lib/clima');
const { earHistorico } = require('./_lib/ons');
const { oniHistorico } = require('./_lib/oni');
const { cambioHistorico } = require('./_lib/cambio');
const { pearson, pValorCorrelacao, alfaBonferroni } = require('./_lib/estatistica');

const DIAS_HISTORICO = 150; // precisa de folga pra acumulado 30d + lag 45d

function hoje(offsetDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}

// ── Histórico de preço (igual à v1) ──
async function precoHistorico(tipo, ticker) {
  if (tipo === 'cripto') {
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(ticker.toLowerCase())}/market_chart?vs_currency=brl&days=${DIAS_HISTORICO}&interval=daily`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = await res.json();
    return (data.prices || []).map(([ts, preco]) => ({ data: new Date(ts).toISOString().slice(0, 10), preco }));
  }
  const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker.toUpperCase())}?range=6mo&interval=1d&fundamental=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`brapi HTTP ${res.status}`);
  const data = await res.json();
  const serie = data?.results?.[0]?.historicalDataPrice || [];
  return serie.filter((p) => p.close > 0).map((p) => ({ data: new Date(p.date * 1000).toISOString().slice(0, 10), preco: p.close }));
}

function variacaoDiaria(pontos) {
  const porData = {};
  for (let i = 1; i < pontos.length; i++) {
    const ant = pontos[i - 1].preco, atu = pontos[i].preco;
    if (ant > 0) porData[pontos[i].data] = ((atu - ant) / ant) * 100;
  }
  return porData;
}

// Junta duas séries {data: valor} deslocando a variável explicativa
// `lagDias` pra trás (ex.: lag=30 compara preço de hoje com clima de
// 30 dias atrás) e devolve arrays alinhados prontos pra correlação.
function alinharComLag(variacaoPorData, variavelPorData, lagDias) {
  const xs = [], ys = [];
  for (const data of Object.keys(variacaoPorData)) {
    const dataDefasada = addDias(data, -lagDias);
    const v = variavelPorData[dataDefasada];
    if (typeof v === 'number') { xs.push(v); ys.push(variacaoPorData[data]); }
  }
  return { xs, ys };
}

function testar(nome, variavelPorData, variacaoPorData, lagDias) {
  const { xs, ys } = alinharComLag(variacaoPorData, variavelPorData, lagDias);
  const { r, n } = pearson(xs, ys);
  if (r === null) return null;
  const p = pValorCorrelacao(r, n);
  return { nome, lagDias, r: Math.round(r * 1000) / 1000, p, n };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método não permitido. Use POST.' }); return; }

  const { ticker, tipo } = req.body || {};
  if (!ticker) { res.status(400).json({ error: 'Informe o ticker.' }); return; }

  const tickerUpper = ticker.toUpperCase().trim();
  const config = ATIVOS[tickerUpper];

  if (!config) {
    res.status(200).json({
      aplicavel: false,
      motivo: 'sem_mecanismo',
      aviso: `${tickerUpper} não tem uma cadeia causal conhecida com clima (não é agro nem geração hidrelétrica), então o app não testa nada — testar sem motivo é o principal jeito de gerar um "sinal" que na verdade é só coincidência estatística.`,
    });
    return;
  }

  try {
    const pontosPreco = await precoHistorico(tipo, tickerUpper);
    if (pontosPreco.length < 40) {
      res.status(200).json({ aplicavel: false, motivo: 'historico_curto', aviso: 'Histórico de preço curto demais pra testar com defasagem de até 45 dias.' });
      return;
    }
    const variacaoPorData = variacaoDiaria(pontosPreco);

    const dataFim = hoje(-5);   // Open-Meteo/ONS têm alguns dias de atraso
    const dataInicio = hoje(-5 - DIAS_HISTORICO);

    let testes = [];
    let contexto = {};

    if (config.categoria === 'agro') {
      const [climaSerie, oniSerie, cambioSerie] = await Promise.all([
        serieDiaria(config.regiao.lat, config.regiao.lon, dataInicio, dataFim),
        oniHistorico(8).catch(() => []),
        cambioHistorico(DIAS_HISTORICO + 10).catch(() => ({})),
      ]);

      const chuva30d = acumulado30d(climaSerie);

      // ONI é mensal — replica o valor do mês pra cada dia daquele mês
      const oniPorDia = {};
      for (const p of oniSerie) {
        const prefixo = `${p.ano}-${String(p.mes).padStart(2, '0')}`;
        for (const data of Object.keys(variacaoPorData)) {
          if (data.startsWith(prefixo)) oniPorDia[data] = p.anomalia;
        }
      }

      for (const lag of [15, 30, 45]) testes.push(testar(`Chuva acumulada 30d — ${config.regiao.nome}`, chuva30d, variacaoPorData, lag));
      for (const lag of [15, 30, 45]) testes.push(testar('Índice ONI (El Niño/La Niña)', oniPorDia, variacaoPorData, lag));
      testes.push(testar('Câmbio USD/BRL', cambioSerie, variacaoPorData, 0));

      contexto = { categoria: 'agro', regiao: config.regiao.nome, ativo: config.nome };

    } else if (config.categoria === 'hidro') {
      const earSerie = await earHistorico(config.subsistema, dataInicio, dataFim);
      for (const lag of [0, 7, 14]) testes.push(testar(`Nível de reservatório (EAR) — ${ATIVOS.SUBSISTEMAS[config.subsistema]}`, earSerie, variacaoPorData, lag));

      contexto = { categoria: 'hidro', subsistema: ATIVOS.SUBSISTEMAS[config.subsistema], ativo: config.nome };
    }

    testes = testes.filter(Boolean);

    if (!testes.length) {
      res.status(200).json({ aplicavel: false, motivo: 'sem_dados', aviso: 'Não consegui obter dados suficientes das fontes climáticas/elétricas agora. Tente novamente mais tarde.' });
      return;
    }

    const alfaCorrigido = alfaBonferroni(testes.length);
    const significativos = testes
      .filter((t) => t.p !== null && t.p < alfaCorrigido)
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

    res.status(200).json({
      aplicavel: true,
      contexto,
      periodo: { inicio: dataInicio, fim: dataFim },
      numTestes: testes.length,
      alfaCorrigido: Math.round(alfaCorrigido * 10000) / 10000,
      testes: testes.map((t) => ({ ...t, p: t.p !== null ? Math.round(t.p * 10000) / 10000 : null })),
      sinal: significativos[0] || null,
      aviso: significativos.length
        ? null
        : `Nenhuma das ${testes.length} variáveis testadas passou no limiar estatístico corrigido (p < ${Math.round(alfaCorrigido*10000)/10000}) — não há relação com significância suficiente no período, mesmo sendo um ativo onde clima é mecanismo plausível.`,
    });
  } catch (e) {
    console.error('[api/clima-precos]', tickerUpper, e.message);
    res.status(500).json({ error: 'Erro ao calcular o fator climático: ' + e.message });
  }
};
