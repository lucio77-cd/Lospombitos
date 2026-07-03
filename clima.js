// ============================================================
//  api/_lib/clima.js — Série diária de clima + acumulado móvel
//
//  Diferença pra versão anterior: aqui a variável testada é
//  chuva ACUMULADA numa janela de 30 dias (captura seca/período
//  chuvoso prolongado, que é o que de fato estressa uma safra),
//  não o valor de UM dia isolado — que é ruído, não sinal.
// ============================================================

async function serieDiaria(lat, lon, dataInicio, dataFim) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dataInicio}&end_date=${dataFim}&daily=precipitation_sum,temperature_2m_mean&timezone=America%2FSao_Paulo`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = await res.json();
  const dias = data?.daily?.time || [];
  const chuva = data?.daily?.precipitation_sum || [];
  const temp = data?.daily?.temperature_2m_mean || [];
  const serie = {};
  dias.forEach((d, i) => { serie[d] = { chuva: chuva[i], temp: temp[i] }; });
  return serie;
}

function addDias(dataStr, n) {
  const d = new Date(dataStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Dado um mapa {data: {chuva, temp}}, retorna um novo mapa {data: chuvaAcumulada30d}
// somando a chuva dos 30 dias anteriores (inclusive) a cada data.
function acumulado30d(serieClima) {
  const datasOrdenadas = Object.keys(serieClima).sort();
  const acumulado = {};
  for (const data of datasOrdenadas) {
    let soma = 0, faltam = false;
    for (let i = 0; i < 30; i++) {
      const d = addDias(data, -i);
      const v = serieClima[d]?.chuva;
      if (typeof v === 'number') soma += v;
      else { faltam = true; }
    }
    if (!faltam) acumulado[data] = soma;
  }
  return acumulado;
}

module.exports = { serieDiaria, acumulado30d, addDias };
