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

const ATIVOS = require('./lib/ativos-clima');
const MERCADOS_GLOBAIS = require('./lib/mercados-globais');
const { serieDiaria, acumulado30d, addDias, serieSolDiaria } = require('./lib/clima');
const { earHistorico } = require('./lib/ons');
const { oniHistorico } = require('./lib/oni');
const { cambioHistorico } = require('./lib/cambio');
const { historicoYahoo } = require('./lib/yahoo');
const { pearson, pValorCorrelacao, alfaBonferroni } = require('./lib/estatistica');

const DIAS_HISTORICO = 150; // precisa de folga pra acumulado 30d + lag 45d

function hoje(offsetDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}

// ── Histórico de preço E volume ──
// Mudou pra também trazer volume: a literatura (estudo do Shanghai Stock
// Exchange, mercado por ordem como o B3) encontrou que clima afeta o
// VOLUME/liquidez de negociação, não necessariamente o retorno do preço —
// então testamos as duas variáveis-alvo agora, não só preço.
async function precoHistorico(tipo, ticker) {
  if (tipo === 'cripto') {
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(ticker.toLowerCase())}/market_chart?vs_currency=brl&days=${DIAS_HISTORICO}&interval=daily`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = await res.json();
    const precos = data.prices || [];
    const volumes = data.total_volumes || [];
    return precos.map(([ts, preco], i) => ({
      data: new Date(ts).toISOString().slice(0, 10),
      preco,
      volume: volumes[i]?.[1] ?? null,
    }));
  }
  const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker.toUpperCase())}?range=6mo&interval=1d&fundamental=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`brapi HTTP ${res.status}`);
  const data = await res.json();
  const serie = data?.results?.[0]?.historicalDataPrice || [];
  return serie
    .filter((p) => p.close > 0)
    .map((p) => ({
      data: new Date(p.date * 1000).toISOString().slice(0, 10),
      preco: p.close,
      volume: typeof p.volume === 'number' ? p.volume : null,
    }));
}

function variacaoDiaria(pontos) {
  const porData = {};
  for (let i = 1; i < pontos.length; i++) {
    const ant = pontos[i - 1].preco, atu = pontos[i].preco;
    if (ant > 0) porData[pontos[i].data] = ((atu - ant) / ant) * 100;
  }
  return porData;
}

// Volume anômalo = volume do dia ÷ média móvel de 20 dias anteriores.
// >1 significa volume acima do normal. Essa é a métrica padrão de "volume
// anormal" usada em estudos de evento — não usar volume bruto (tem
// tendência própria de crescimento do mercado ao longo do tempo).
function volumeAnomalo(pontos) {
  const comVolume = pontos.filter((p) => typeof p.volume === 'number' && p.volume > 0);
  if (comVolume.length < 25) return {}; // sem volume suficiente pra ter média móvel confiável

  const porData = {};
  for (let i = 20; i < comVolume.length; i++) {
    const janela = comVolume.slice(i - 20, i).map((p) => p.volume);
    const media = janela.reduce((a, b) => a + b, 0) / janela.length;
    if (media > 0) porData[comVolume[i].data] = comVolume[i].volume / media;
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

function testar(nome, variavelPorData, alvoPorData, lagDias, alvo) {
  const { xs, ys } = alinharComLag(alvoPorData, variavelPorData, lagDias);
  const { r, n } = pearson(xs, ys);
  if (r === null) return null;
  const p = pValorCorrelacao(r, n);
  return { nome, alvo, lagDias, r: Math.round(r * 1000) / 1000, p, n };
}

// Testa a mesma variável explicativa (chuva, ONI, EAR...) contra as DUAS
// variáveis-alvo possíveis — preço e volume — e devolve os testes que
// deram certo. A literatura (estudo do Shanghai Stock Exchange) sugere que
// clima tende a mexer mais com volume/liquidez do que com o preço em si;
// testar as duas é o jeito de descobrir isso pros nossos dados, em vez de
// assumir.
function testarPrecoEVolume(nome, variavelPorData, variacaoPorData, volumePorData, lagDias) {
  const resultados = [];
  const tPreco = testar(nome, variavelPorData, variacaoPorData, lagDias, 'preço');
  if (tPreco) resultados.push(tPreco);
  if (Object.keys(volumePorData).length) {
    const tVolume = testar(nome, variavelPorData, volumePorData, lagDias, 'volume');
    if (tVolume) resultados.push(tVolume);
  }
  return resultados;
}

// Aceita a chave direta (IBOVESPA, DOLAR...) ou o símbolo Yahoo cru (^BVSP, USDBRL=X...)
function resolverMercadoGlobal(tickerUpper) {
  if (MERCADOS_GLOBAIS[tickerUpper]) return tickerUpper;
  const semAcento = tickerUpper.replace(/[^A-Z0-9]/g, '');
  const chave = Object.keys(MERCADOS_GLOBAIS).find((k) => {
    const s = MERCADOS_GLOBAIS[k].simboloYahoo.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return s === semAcento || k === semAcento;
  });
  return chave || null;
}

// Fator comportamental: sol na cidade da bolsa × retorno do índice/câmbio,
// testando defasagem de 0 a 3 dias (efeito de humor é rápido, não semanas).
async function analisarMercadoGlobal(chave) {
  const m = MERCADOS_GLOBAIS[chave];
  const dataFim = hoje(-3);
  const dataInicio = hoje(-3 - DIAS_HISTORICO);

  const [precoResult, solResult] = await Promise.allSettled([
    historicoYahoo(m.simboloYahoo, DIAS_HISTORICO + 10),
    serieSolDiaria(m.lat, m.lon, dataInicio, dataFim),
  ]);

  if (precoResult.status === 'rejected') {
    console.error('[clima-precos:global] Yahoo falhou:', chave, precoResult.reason?.message);
    return { aplicavel: false, motivo: 'fonte_preco_falhou', aviso: `Não consegui buscar o histórico de preço de ${m.nome} agora (Yahoo Finance instável ou bloqueado). Tente de novo em alguns minutos.` };
  }
  if (solResult.status === 'rejected') {
    console.error('[clima-precos:global] Open-Meteo falhou:', chave, solResult.reason?.message);
    return { aplicavel: false, motivo: 'fonte_clima_falhou', aviso: `Não consegui buscar o histórico de sol em ${m.cidade} agora (Open-Meteo instável). Tente de novo em alguns minutos.` };
  }

  const pontosPreco = precoResult.value;
  const solSerie = solResult.value;

  if (pontosPreco.length < 30) {
    return { aplicavel: false, motivo: 'historico_curto', aviso: 'Histórico de preço curto demais pra este índice/câmbio ainda.' };
  }

  const variacaoPorData = variacaoDiaria(pontosPreco);
  const volumePorData = volumeAnomalo(pontosPreco);

  const testes = [0, 1, 2, 3]
    .flatMap((lag) => testarPrecoEVolume(`Horas de sol — ${m.cidade}`, solSerie, variacaoPorData, volumePorData, lag));

  if (!testes.length) {
    return { aplicavel: false, motivo: 'sem_dados', aviso: 'Não consegui obter dados suficientes agora. Tente novamente mais tarde.' };
  }

  const alfaCorrigido = alfaBonferroni(testes.length);
  const significativos = testes
    .filter((t) => t.p !== null && t.p < alfaCorrigido)
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  return {
    aplicavel: true,
    mecanismo: 'comportamental',
    contexto: { categoria: 'mercado_global', ativo: m.nome, cidade: m.cidade },
    periodo: { inicio: dataInicio, fim: dataFim },
    numTestes: testes.length,
    alfaCorrigido: Math.round(alfaCorrigido * 10000) / 10000,
    testes: testes.map((t) => ({ ...t, p: t.p !== null ? Math.round(t.p * 10000) / 10000 : null })),
    sinal: significativos[0] || null,
    aviso: significativos.length
      ? null
      : `As horas de sol em ${m.cidade} não passaram no limiar estatístico corrigido (p < ${Math.round(alfaCorrigido*10000)/10000}) — sem efeito de humor detectável no período. Isso é o mais comum: a literatura acadêmica descreve esse efeito como pequeno e nem sempre presente.`,
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método não permitido. Use POST.' }); return; }

  const { ticker, tipo } = req.body || {};
  if (!ticker) { res.status(400).json({ error: 'Informe o ticker.' }); return; }

  const tickerUpper = ticker.toUpperCase().trim();
  const aliasGlobal = resolverMercadoGlobal(tickerUpper);
  const config = ATIVOS[tickerUpper];

  if (aliasGlobal) {
    try {
      const resultado = await analisarMercadoGlobal(aliasGlobal);
      res.status(200).json(resultado);
    } catch (e) {
      console.error('[api/clima-precos:global]', tickerUpper, e.message);
      res.status(500).json({ error: 'Erro ao calcular o fator comportamental: ' + e.message });
    }
    return;
  }

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
    const volumePorData = volumeAnomalo(pontosPreco);

    const dataFim = hoje(-5);   // Open-Meteo/ONS têm alguns dias de atraso
    const dataInicio = hoje(-5 - DIAS_HISTORICO);

    let testes = [];
    let contexto = {};

    if (config.categoria === 'agro') {
      const [climaSerie, oniSerie, cambioSerie] = await Promise.all([
        serieDiaria(config.regiao.lat, config.regiao.lon, dataInicio, dataFim).catch((e) => {
          console.error('[clima-precos:agro] Open-Meteo falhou:', tickerUpper, e.message);
          return null;
        }),
        oniHistorico(8).catch((e) => { console.warn('[clima-precos:agro] NOAA ONI falhou:', e.message); return []; }),
        cambioHistorico(DIAS_HISTORICO + 10).catch((e) => { console.warn('[clima-precos:agro] AwesomeAPI falhou:', e.message); return {}; }),
      ]);

      if (climaSerie === null) {
        res.status(200).json({ aplicavel: false, motivo: 'fonte_clima_falhou', aviso: `Não consegui buscar o histórico de chuva de ${config.regiao.nome} agora (Open-Meteo instável). Tente de novo em alguns minutos.` });
        return;
      }

      const chuva30d = acumulado30d(climaSerie);

      // ONI é mensal — replica o valor do mês pra cada dia daquele mês
      const oniPorDia = {};
      for (const p of oniSerie) {
        const prefixo = `${p.ano}-${String(p.mes).padStart(2, '0')}`;
        for (const data of Object.keys(variacaoPorData)) {
          if (data.startsWith(prefixo)) oniPorDia[data] = p.anomalia;
        }
      }

      for (const lag of [15, 30, 45]) testes.push(...testarPrecoEVolume(`Chuva acumulada 30d — ${config.regiao.nome}`, chuva30d, variacaoPorData, volumePorData, lag));
      for (const lag of [15, 30, 45]) testes.push(...testarPrecoEVolume('Índice ONI (El Niño/La Niña)', oniPorDia, variacaoPorData, volumePorData, lag));
      testes.push(...testarPrecoEVolume('Câmbio USD/BRL', cambioSerie, variacaoPorData, volumePorData, 0));

      contexto = { categoria: 'agro', regiao: config.regiao.nome, ativo: config.nome };

    } else if (config.categoria === 'hidro') {
      const earSerie = await earHistorico(config.subsistema, dataInicio, dataFim).catch((e) => {
        console.error('[clima-precos:hidro] ONS falhou:', tickerUpper, e.message);
        return null;
      });

      if (earSerie === null) {
        res.status(200).json({ aplicavel: false, motivo: 'fonte_clima_falhou', aviso: `Não consegui buscar o nível de reservatório do ONS agora (fonte instável, ou CSV muito grande pro tempo limite da função). Tente de novo em alguns minutos.` });
        return;
      }

      for (const lag of [0, 7, 14]) testes.push(...testarPrecoEVolume(`Nível de reservatório (EAR) — ${ATIVOS.SUBSISTEMAS[config.subsistema]}`, earSerie, variacaoPorData, volumePorData, lag));

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
