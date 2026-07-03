// ============================================================
//  api/_lib/fatores-fundamentais.js — Fatores Value/Quality/Momentum
//
//  Baseado nos três fatores mais replicados da literatura de
//  finanças empírica (Fama-French HML/SMB, momentum de Jegadeesh
//  & Titman, e o fator Quality de Asness/Frazzini/Pedersen —
//  "Value and Momentum Everywhere" mostra que combinar os três
//  é mais robusto do que usar cada um isolado). Existe evidência
//  específica para o Brasil replicando esses fatores no B3.
//
//  IMPORTANTE — limitação assumida: os scores abaixo são heurísticas
//  baseadas em faixas típicas de mercado (não z-score contra pares
//  do mesmo setor, que exigiria baixar fundamentos de todo o setor
//  a cada busca — caro demais pra rodar em serverless a cada clique).
//  Pra evolução futura: cachear fundamentos setoriais em batch
//  (ex: 1x por dia) e comparar via z-score real contra o setor.
// ============================================================

// ── Value: quanto menor P/L e P/VP, mais "barato" o ativo está
// (heurística de faixas típicas do mercado brasileiro; não é
// comparação contra o setor específico do ativo) ──
function scoreValue(pl, pvp) {
  const partes = [];

  if (typeof pl === 'number' && pl > 0) {
    let s;
    if (pl < 8) s = 95;
    else if (pl < 12) s = 78;
    else if (pl < 18) s = 55;
    else if (pl < 25) s = 32;
    else s = 12;
    partes.push(s);
  } else if (typeof pl === 'number' && pl <= 0) {
    partes.push(8); // prejuízo — P/L negativo ou zerado
  }

  if (typeof pvp === 'number' && pvp > 0) {
    let s;
    if (pvp < 1) s = 95;
    else if (pvp < 1.5) s = 78;
    else if (pvp < 2.5) s = 55;
    else if (pvp < 4) s = 32;
    else s = 12;
    partes.push(s);
  }

  if (!partes.length) return null;
  const score = Math.round(partes.reduce((a, b) => a + b, 0) / partes.length);
  return {
    score,
    label: score >= 75 ? 'Descontado' : score >= 55 ? 'Razoável' : score >= 32 ? 'Caro' : 'Muito caro',
    pl: pl || null,
    pvp: pvp || null,
  };
}

// ── Quality: rentabilidade sobre patrimônio (ROE) e margem líquida.
// Empresas de alta qualidade geram retorno consistente sobre o
// capital investido — é o fator QMJ (Quality Minus Junk) ──
function scoreQuality(roe, margem) {
  const partes = [];

  if (typeof roe === 'number') {
    let s;
    if (roe > 20) s = 95;
    else if (roe > 15) s = 82;
    else if (roe > 10) s = 62;
    else if (roe > 5) s = 40;
    else if (roe > 0) s = 20;
    else s = 5;
    partes.push(s);
  }

  if (typeof margem === 'number') {
    let s;
    if (margem > 20) s = 95;
    else if (margem > 10) s = 75;
    else if (margem > 5) s = 50;
    else if (margem > 0) s = 25;
    else s = 5;
    partes.push(s);
  }

  if (!partes.length) return null;
  const score = Math.round(partes.reduce((a, b) => a + b, 0) / partes.length);
  return {
    score,
    label: score >= 75 ? 'Alta qualidade' : score >= 50 ? 'Qualidade média' : score >= 25 ? 'Qualidade fraca' : 'Qualidade ruim',
    roe: roe ?? null,
    margem: margem ?? null,
  };
}

// ── Momentum: retorno de ~12 meses pulando o último mês (padrão
// acadêmico "12-1" de Jegadeesh & Titman — pula o mês mais recente
// porque reversão de curtíssimo prazo é um efeito diferente de
// momentum e atrapalha o sinal se incluído) ──
function scoreMomentum(pontosHistorico) {
  if (!pontosHistorico || pontosHistorico.length < 40) return null;

  const precos = pontosHistorico.map((p) => p.preco);
  const n = precos.length;

  // ~21 pregões = 1 mês. Se não tiver 1 ano completo, usa o que houver
  // (mínimo ~40 pregões, ~2 meses) e sinaliza a amostra menor.
  const idxFim = Math.max(0, n - 1 - 21);
  const idxInicio = 0;
  if (idxFim <= idxInicio) return null;

  const precoFim = precos[idxFim];
  const precoInicio = precos[idxInicio];
  if (!(precoInicio > 0)) return null;

  const retornoPct = ((precoFim / precoInicio) - 1) * 100;
  const diasAmostra = idxFim - idxInicio;
  const amostraCompleta = diasAmostra >= 200; // ~10 meses+

  let score;
  if (retornoPct > 30) score = 95;
  else if (retornoPct > 15) score = 80;
  else if (retornoPct > 5) score = 62;
  else if (retornoPct > -5) score = 48;
  else if (retornoPct > -15) score = 28;
  else score = 10;

  return {
    score,
    label: score >= 75 ? 'Momentum forte' : score >= 50 ? 'Momentum neutro/positivo' : score >= 28 ? 'Momentum fraco' : 'Momentum negativo',
    retornoPct: Math.round(retornoPct * 10) / 10,
    diasAmostra,
    amostraCompleta,
  };
}

// ── Combina os três em um score geral. Pesos iguais-ish inspirados
// em Asness/Moskowitz/Pedersen (2013) — value e momentum tendem a
// se complementar (correlação historicamente negativa entre eles),
// por isso não faz sentido dar peso dominante a nenhum dos dois ──
function scoreGeral(value, quality, momentum) {
  const pesos = { value: 0.35, quality: 0.35, momentum: 0.30 };
  let somaScore = 0, somaPeso = 0;

  if (value)    { somaScore += value.score    * pesos.value;    somaPeso += pesos.value; }
  if (quality)  { somaScore += quality.score  * pesos.quality;  somaPeso += pesos.quality; }
  if (momentum) { somaScore += momentum.score * pesos.momentum; somaPeso += pesos.momentum; }

  if (somaPeso === 0) return null;
  const geral = Math.round(somaScore / somaPeso);
  const classificacao =
    geral >= 75 ? 'Forte'
    : geral >= 60 ? 'Favorável'
    : geral >= 40 ? 'Neutro'
    : geral >= 25 ? 'Fraco'
    : 'Muito fraco';

  return { score: geral, classificacao };
}

module.exports = { scoreValue, scoreQuality, scoreMomentum, scoreGeral };
