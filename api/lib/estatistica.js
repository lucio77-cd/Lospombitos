// ============================================================
//  api/_lib/estatistica.js
//
//  Diferença crucial pra versão anterior: aqui a gente calcula
//  p-valor de verdade (não só compara |r| com um limiar fixo),
//  e corrige pelo número real de testes feitos (Bonferroni).
//  Como agora testamos poucas variáveis por ativo (3 a 9, não
//  70), a correção é muito menos punitiva e o resultado continua
//  interpretável.
// ============================================================

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 8) return { r: null, n };

  const mediaX = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const mediaY = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mediaX;
    const dy = ys[i] - mediaY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  if (denX === 0 || denY === 0) return { r: 0, n };
  return { r: num / Math.sqrt(denX * denY), n };
}

// ── p-valor bicaudal de r via distribuição t (df = n-2) ──
// Implementação padrão (Numerical Recipes) da função beta incompleta
// regularizada — é assim que se calcula p-valor de correlação na prática,
// sem depender de bibliotecas de estatística externas.
function logGamma(x) {
  const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091,
               -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) { y += 1; ser += cof[j] / y; }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betacf(a, b, x) {
  const MAXIT = 100, EPS = 3e-7, FPMIN = 1e-30;
  let qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;  if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;  if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function betai(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
  return 1 - bt * betacf(b, a, 1 - x) / b;
}

// p-valor bicaudal pra correlação r com n observações
function pValorCorrelacao(r, n) {
  if (r === null || n < 8) return null;
  const df = n - 2;
  if (Math.abs(r) >= 0.999999) return 0;
  const t = r * Math.sqrt(df / (1 - r * r));
  const x = df / (df + t * t);
  return betai(df / 2, 0.5, x);
}

// Bonferroni: dado que fizemos `numTestes` testes independentes,
// qual o alfa (limiar de p-valor) que ainda mantém 5% de falso-positivo
// no conjunto todo.
function alfaBonferroni(numTestes, alfaGlobal = 0.05) {
  return alfaGlobal / numTestes;
}

module.exports = { pearson, pValorCorrelacao, alfaBonferroni };
