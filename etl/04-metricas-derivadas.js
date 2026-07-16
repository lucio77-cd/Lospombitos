// ============================================================
//  etl/04-metricas-derivadas.js
//
//  Roda POR ÚLTIMO — depende de 01-macro.js e 02-precos.js já
//  terem rodado. Calcula, dia a dia, pra cada ativo:
//
//    retorno_1m/3m/6m/12m   — variação % vs N dias úteis atrás
//    volatilidade_anualizada — desvio-padrão dos retornos diários
//                              (janela móvel de 21 dias) × √252
//    beta_ibov              — cov(retorno ativo, retorno Ibov) /
//                              var(retorno Ibov), janela móvel de 252 dias
//    sharpe                 — (retorno anualizado − taxa livre de risco) /
//                              volatilidade anualizada, janela de 252 dias
//    max_drawdown_ate_aqui  — pior queda do pico até aqui, DESDE O
//                              INÍCIO da série (cumulativo, não é
//                              janela móvel — é "o pior que já
//                              aconteceu até esse dia")
//    score_momentum         — percentil (0-100) do retorno_12m do
//                              ativo comparado com TODOS os outros
//                              ativos NA MESMA DATA (ranking relativo,
//                              não valor absoluto)
//    score_value/quality    — null por enquanto (dependem dos
//                              fundamentos da CVM, Fase 2 do projeto —
//                              ver design). score_geral também fica
//                              null até isso existir, pra não fingir
//                              uma nota completa com 1/3 dos fatores.
//
//  Rodar: node etl/04-metricas-derivadas.js
// ============================================================

const fs = require('fs');
const path = require('path');
const { getDb, admin } = require('./lib/firebaseAdmin');

const JANELA_VOL_DIAS    = 21;   // ~1 mês útil
const JANELA_BETA_DIAS   = 252;  // ~1 ano útil
const DIAS_UTEIS_ANO     = 252;

const JANELAS_RETORNO = { retorno_1m: 21, retorno_3m: 63, retorno_6m: 126, retorno_12m: 252 };

function media(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
function desvioPadrao(arr) {
  const m = media(arr);
  return Math.sqrt(media(arr.map(v => (v - m) ** 2)));
}
function covariancia(a, b) {
  const ma = media(a), mb = media(b);
  let soma = 0;
  for (let i = 0; i < a.length; i++) soma += (a[i] - ma) * (b[i] - mb);
  return soma / a.length;
}

async function carregarSerieCompletaTicker(db, ticker) {
  const snap = await db.collection('precos_historicos').where('ticker', '==', ticker).get();
  let dias = [];
  snap.forEach(doc => { dias = dias.concat(doc.data().dias || []); });
  dias.sort((a, b) => a.data.localeCompare(b.data));
  return dias;
}

async function carregarSerieMacro(db, indicador) {
  const doc = await db.collection('macro').doc(indicador).get();
  const serie = doc.exists ? (doc.data().serie || []) : [];
  const mapa = new Map(serie.map(p => [p.data, p.valor]));
  return mapa;
}

function main_calcularParaAtivo(dias, mapaIbov, mapaSelic) {
  const fechamentos = dias.map(d => d.fechamento_ajustado);
  const retDiario = [null]; // retorno diário do próprio ativo (índice alinhado com `dias`)
  for (let i = 1; i < fechamentos.length; i++) {
    retDiario.push(fechamentos[i - 1] > 0 ? (fechamentos[i] / fechamentos[i - 1] - 1) : null);
  }

  // Retorno diário do Ibovespa, alinhado por data (não por índice —
  // datas sem pregão de um dos dois lados não têm par)
  const ibovPorData = {};
  const datasIbov = [...mapaIbov.keys()].sort();
  for (let i = 1; i < datasIbov.length; i++) {
    const anterior = mapaIbov.get(datasIbov[i - 1]);
    const atual = mapaIbov.get(datasIbov[i]);
    ibovPorData[datasIbov[i]] = anterior > 0 ? (atual / anterior - 1) : null;
  }

  let picoMaximo = -Infinity;
  let piorDrawdown = 0;

  const resultado = [];

  for (let i = 0; i < dias.length; i++) {
    const linha = { data: dias[i].data };

    // Retornos vs N dias úteis atrás
    for (const [campo, janela] of Object.entries(JANELAS_RETORNO)) {
      if (i >= janela && fechamentos[i - janela] > 0) {
        linha[campo] = arred((fechamentos[i] / fechamentos[i - janela] - 1) * 100);
      } else {
        linha[campo] = null; // ainda não tem histórico suficiente (ex: IPO recente)
      }
    }

    // Volatilidade anualizada (janela móvel)
    if (i >= JANELA_VOL_DIAS) {
      const janela = retDiario.slice(i - JANELA_VOL_DIAS + 1, i + 1).filter(v => v != null);
      linha.volatilidade_anualizada = janela.length >= JANELA_VOL_DIAS * 0.8
        ? arred(desvioPadrao(janela) * Math.sqrt(DIAS_UTEIS_ANO) * 100)
        : null;
    } else {
      linha.volatilidade_anualizada = null;
    }

    // Beta vs Ibovespa (janela móvel de 1 ano, pareado por data)
    if (i >= JANELA_BETA_DIAS) {
      const pares = [];
      for (let j = i - JANELA_BETA_DIAS + 1; j <= i; j++) {
        const rAtivo = retDiario[j];
        const rIbov = ibovPorData[dias[j].data];
        if (rAtivo != null && rIbov != null) pares.push([rAtivo, rIbov]);
      }
      if (pares.length >= JANELA_BETA_DIAS * 0.6) {
        const a = pares.map(p => p[0]), b = pares.map(p => p[1]);
        const varIbov = covariancia(b, b);
        linha.beta_ibov = varIbov > 0 ? arred(covariancia(a, b) / varIbov, 3) : null;
      } else {
        linha.beta_ibov = null;
      }
    } else {
      linha.beta_ibov = null;
    }

    // Sharpe (janela de 1 ano): (retorno anualizado - taxa livre de risco) / vol anualizada
    if (i >= JANELA_BETA_DIAS && linha.volatilidade_anualizada > 0) {
      const retAnual = linha.retorno_12m;
      const selicNaData = mapaSelic.get(dias[i].data);
      // Selic vem em % ao dia útil — anualiza composto (aproximação padrão de mercado)
      const selicAnualPct = selicNaData != null ? (Math.pow(1 + selicNaData / 100, DIAS_UTEIS_ANO) - 1) * 100 : null;
      linha.sharpe = (retAnual != null && selicAnualPct != null)
        ? arred((retAnual - selicAnualPct) / linha.volatilidade_anualizada, 3)
        : null;
    } else {
      linha.sharpe = null;
    }

    // Max drawdown CUMULATIVO até aqui (desde o início da série, não é janela móvel)
    picoMaximo = Math.max(picoMaximo, fechamentos[i]);
    const drawdownHoje = picoMaximo > 0 ? (fechamentos[i] / picoMaximo - 1) * 100 : 0;
    piorDrawdown = Math.min(piorDrawdown, drawdownHoje);
    linha.max_drawdown_ate_aqui = arred(piorDrawdown);

    // Value/Quality/score_geral ficam null até a Fase 2 (fundamentos CVM)
    linha.score_value   = null;
    linha.score_quality = null;
    linha.score_momentum = null; // preenchido na 2ª passada (ranking entre pares)
    linha.score_geral   = null;

    resultado.push(linha);
  }

  return resultado;
}

function arred(n, casas = 2) {
  if (n == null || isNaN(n)) return null;
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

async function main() {
  const db = getDb();
  const listaPath = path.join(__dirname, 'ibovespa-tickers.json');
  const { ativos } = JSON.parse(fs.readFileSync(listaPath, 'utf8'));

  console.log('[metricas] Carregando séries macro (Selic, Ibovespa)...');
  const mapaSelic = await carregarSerieMacro(db, 'selic');
  const mapaIbov  = await carregarSerieMacro(db, 'ibovespa');

  if (!mapaSelic.size || !mapaIbov.size) {
    console.error('[metricas] macro/selic ou macro/ibovespa vazio — rode 01-macro.js primeiro.');
    process.exit(1);
  }

  // ── Passada 1: calcula tudo exceto o ranking de momentum ──
  const porTicker = {}; // ticker -> array de linhas (por data)

  for (const { ticker } of ativos) {
    console.log(`[metricas] Calculando ${ticker}...`);
    const dias = await carregarSerieCompletaTicker(db, ticker);
    if (!dias.length) {
      console.warn(`[metricas] ${ticker} sem preços carregados — pulando (rode 02-precos.js primeiro).`);
      continue;
    }
    porTicker[ticker] = main_calcularParaAtivo(dias, mapaIbov, mapaSelic);
  }

  // ── Passada 2: ranking de momentum entre pares, por data ──
  console.log('[metricas] Calculando ranking de momentum entre os ativos...');
  const todasAsDatas = new Set();
  for (const ticker in porTicker) porTicker[ticker].forEach(l => todasAsDatas.add(l.data));

  // Índice rápido: data -> [{ticker, idx, retorno_12m}]
  const porData = {};
  for (const ticker in porTicker) {
    porTicker[ticker].forEach((linha, idx) => {
      if (linha.retorno_12m == null) return;
      if (!porData[linha.data]) porData[linha.data] = [];
      porData[linha.data].push({ ticker, idx, retorno_12m: linha.retorno_12m });
    });
  }

  for (const data in porData) {
    const grupo = porData[data].sort((a, b) => a.retorno_12m - b.retorno_12m);
    const n = grupo.length;
    grupo.forEach((item, posicao) => {
      // Percentil 0-100: pior retorno do grupo = 0, melhor = 100
      const percentil = n > 1 ? arred((posicao / (n - 1)) * 100, 1) : 50;
      porTicker[item.ticker][item.idx].score_momentum = percentil;
    });
  }

  // ── Grava tudo, agrupado por ano (mesma estrutura de precos_historicos) ──
  console.log('[metricas] Gravando no Firestore...');
  for (const ticker in porTicker) {
    const linhas = porTicker[ticker];
    const porAno = {};
    for (const linha of linhas) {
      const ano = linha.data.slice(0, 4);
      if (!porAno[ano]) porAno[ano] = [];
      porAno[ano].push(linha);
    }

    const batch = db.batch();
    for (const ano in porAno) {
      const ref = db.collection('metricas_derivadas').doc(`${ticker}_${ano}`);
      batch.set(ref, {
        ticker,
        ano: Number(ano),
        dias: porAno[ano],
        atualizado_em: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
    console.log(`[metricas] ${ticker}: gravado (${Object.keys(porAno).length} anos).`);
  }

  console.log('[metricas] Concluído.');
}

main().catch(e => {
  console.error('[metricas] Erro fatal:', e);
  process.exit(1);
});
