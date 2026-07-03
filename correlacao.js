// ============================================================
//  api/_lib/correlacao.js — Correlação de Pearson entre duas séries
//
//  Retorna um número entre -1 e 1. Perto de 0 = sem relação
//  estatística. É exatamente esse número que decide se o app
//  mostra um sinal de alta/baixa ou "sem relação aparente" —
//  não existe lista manual de "ativos permitidos", os dados
//  reais é que filtram.
// ============================================================

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 8) return null; // amostra pequena demais pra confiar em qualquer correlação

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

  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

// Classificação transparente da força da correlação — usada pra decidir
// o texto mostrado ao usuário (nunca inventa "sobe"/"desce" com base fraca).
function forcaCorrelacao(r) {
  const abs = Math.abs(r);
  if (abs < 0.2) return 'sem relação aparente';
  if (abs < 0.4) return 'relação fraca';
  if (abs < 0.6) return 'relação moderada';
  return 'relação forte';
}

module.exports = { pearson, forcaCorrelacao };
