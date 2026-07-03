// ============================================================
//  api/clima-precos.js — "Fator Climático" do Atlas
//
//  Para o ticker pesquisado, busca o histórico de preço dos
//  últimos ~90 dias e o histórico de clima (chuva + temperatura)
//  das cidades em api/_lib/cidades.js no mesmo período, e calcula
//  a correlação estatística entre as duas séries, cidade por
//  cidade. Não existe uma lista de "ativos que valem a pena" —
//  o número de correlação é que decide o que aparece como sinal
//  e o que aparece como "sem relação aparente".
// ============================================================

const CIDADES = require('./_lib/cidades');
const { pearson, forcaCorrelacao } = require('./_lib/correlacao');

const DIAS_HISTORICO = 90;
const ATRASO_ARQUIVO_CLIMA = 5; // dados do Open-Meteo têm alguns dias de atraso

function formatarData(d) {
  return d.toISOString().slice(0, 10);
}

// ── Histórico de preço ──
async function precoHistorico(tipo, ticker) {
  if (tipo === 'cripto') {
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(ticker.toLowerCase())}/market_chart?vs_currency=brl&days=${DIAS_HISTORICO}&interval=daily`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = await res.json();
    const pontos = (data.prices || []).map(([ts, preco]) => ({
      data: new Date(ts).toISOString().slice(0, 10),
      preco,
    }));
    return pontos;
  }

  if (tipo === 'acoes' || tipo === 'acao' || tipo === 'fiis') {
    const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker.toUpperCase())}?range=3mo&interval=1d&fundamental=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`brapi HTTP ${res.status}`);
    const data = await res.json();
    const serie = data?.results?.[0]?.historicalDataPrice || [];
    return serie
      .filter((p) => p.close > 0)
      .map((p) => ({
        data: new Date(p.date * 1000).toISOString().slice(0, 10),
        preco: p.close,
      }));
  }

  return null; // tesouro/cdb/lci — sem série de mercado pra correlacionar
}

// ── Histórico de clima de uma cidade ──
async function climaHistorico(cidade, dataInicio, dataFim) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${cidade.lat}&longitude=${cidade.lon}&start_date=${dataInicio}&end_date=${dataFim}&daily=precipitation_sum,temperature_2m_mean&timezone=America%2FSao_Paulo`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status} (${cidade.nome})`);
  const data = await res.json();
  const dias = data?.daily?.time || [];
  const chuva = data?.daily?.precipitation_sum || [];
  const temp = data?.daily?.temperature_2m_mean || [];

  const porData = {};
  dias.forEach((d, i) => { porData[d] = { chuva: chuva[i], temp: temp[i] }; });
  return porData;
}

// Transforma série de preços em série de variação % diária (o que
// realmente correlaciona com clima — preço bruto tem tendência própria).
function variacaoDiaria(pontos) {
  const porData = {};
  for (let i = 1; i < pontos.length; i++) {
    const anterior = pontos[i - 1].preco;
    const atual = pontos[i].preco;
    if (anterior > 0) {
      porData[pontos[i].data] = ((atual - anterior) / anterior) * 100;
    }
  }
  return porData;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido. Use POST.' });
    return;
  }

  const { ticker, tipo } = req.body || {};
  if (!ticker || !tipo) {
    res.status(400).json({ error: 'Informe ticker e tipo.' });
    return;
  }

  try {
    const pontosPreco = await precoHistorico(tipo, ticker);

    if (pontosPreco === null) {
      res.status(200).json({
        aplicavel: false,
        aviso: 'Este tipo de ativo não tem histórico de preço de mercado pra correlacionar com clima (é calculado por fórmula, não negociado em bolsa).',
      });
      return;
    }

    if (pontosPreco.length < 15) {
      res.status(200).json({
        aplicavel: false,
        aviso: 'Histórico de preço curto demais pra calcular uma correlação confiável ainda.',
      });
      return;
    }

    const variacaoPorData = variacaoDiaria(pontosPreco);
    const datasComVariacao = Object.keys(variacaoPorData);

    const fim = new Date();
    fim.setDate(fim.getDate() - ATRASO_ARQUIVO_CLIMA);
    const inicio = new Date(fim);
    inicio.setDate(inicio.getDate() - DIAS_HISTORICO);
    const dataInicioStr = formatarData(inicio);
    const dataFimStr = formatarData(fim);

    // Busca o clima de todas as cidades em paralelo
    const resultadosClima = await Promise.allSettled(
      CIDADES.map((c) => climaHistorico(c, dataInicioStr, dataFimStr))
    );

    const porCidade = CIDADES.map((cidade, i) => {
      const r = resultadosClima[i];
      if (r.status !== 'fulfilled') return { ...cidade, erro: true };

      const climaPorData = r.value;
      const chuvaSerie = [];
      const tempSerie = [];
      const variacaoSerie = [];

      for (const data of datasComVariacao) {
        const c = climaPorData[data];
        if (c && typeof c.chuva === 'number' && typeof c.temp === 'number') {
          chuvaSerie.push(c.chuva);
          tempSerie.push(c.temp);
          variacaoSerie.push(variacaoPorData[data]);
        }
      }

      const rChuva = pearson(chuvaSerie, variacaoSerie);
      const rTemp = pearson(tempSerie, variacaoSerie);

      return {
        nome: cidade.nome,
        uf: cidade.uf,
        amostras: variacaoSerie.length,
        r_chuva: rChuva,
        r_temp: rTemp,
      };
    }).filter((c) => !c.erro && c.amostras >= 8);

    // Ordena pela correlação mais forte (chuva ou temperatura, o que for maior em módulo)
    porCidade.sort((a, b) => {
      const fa = Math.max(Math.abs(a.r_chuva || 0), Math.abs(a.r_temp || 0));
      const fb = Math.max(Math.abs(b.r_chuva || 0), Math.abs(b.r_temp || 0));
      return fb - fa;
    });

    const top = porCidade.slice(0, 8).map((c) => {
      const usaChuva = Math.abs(c.r_chuva || 0) >= Math.abs(c.r_temp || 0);
      const r = usaChuva ? c.r_chuva : c.r_temp;
      return {
        nome: c.nome,
        uf: c.uf,
        variavel: usaChuva ? 'chuva' : 'temperatura',
        r: Math.round((r || 0) * 1000) / 1000,
        forca: forcaCorrelacao(r || 0),
        amostras: c.amostras,
      };
    });

    const melhor = top[0] || null;
    const sinal =
      melhor && Math.abs(melhor.r) >= 0.2
        ? {
            cidade: `${melhor.nome} (${melhor.uf})`,
            variavel: melhor.variavel,
            r: melhor.r,
            forca: melhor.forca,
            direcao: melhor.r > 0 ? 'positiva' : 'negativa',
          }
        : null;

    res.status(200).json({
      aplicavel: true,
      periodo: { inicio: dataInicioStr, fim: dataFimStr, dias: DIAS_HISTORICO },
      cidades: top,
      sinal,
      aviso: sinal
        ? null
        : 'Nenhuma cidade mostrou correlação estatística relevante entre clima e o histórico de preço deste ativo no período — é o esperado pra maioria dos ativos, que não têm relação direta com o clima.',
    });
  } catch (e) {
    console.error('[api/clima-precos]', ticker, e.message);
    res.status(500).json({ error: 'Erro ao calcular o fator climático.' });
  }
};
