// ============================================================
//  etl/lib/bcb.js — Séries temporais do Banco Central (SGS)
//
//  Códigos de série usados (públicos, sem necessidade de token):
//    11   = Selic diária (taxa efetiva ao dia, % a.d.)
//    12   = CDI diário (% a.d.)
//    433  = IPCA mensal (% a.m.)
//
//  Documentação: https://dadosabertos.bcb.gov.br/dataset/11-taxa-de-juro---selic
// ============================================================

const CODIGOS = {
  selic: 11,
  cdi: 12,
  ipca: 433,
};

// Formato de data exigido pela SGS: DD/MM/AAAA
function paraFormatoBCB(dataISO) {
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

/**
 * Busca uma série do BCB entre duas datas (formato ISO "AAAA-MM-DD").
 * Retorna array de { data (ISO), valor (number) }, ordenado por data.
 */
async function buscarSerieBCB(indicador, dataInicioISO, dataFimISO) {
  const codigo = CODIGOS[indicador];
  if (!codigo) throw new Error(`Indicador BCB desconhecido: ${indicador}`);

  const dataInicial = paraFormatoBCB(dataInicioISO);
  const dataFinal    = paraFormatoBCB(dataFimISO);

  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados` +
    `?formato=json&dataInicial=${dataInicial}&dataFinal=${dataFinal}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`BCB respondeu ${res.status} pra ${indicador}`);

  const dados = await res.json();
  // BCB devolve [{data: "02/01/2015", valor: "0.038954"}, ...]
  return dados.map(d => {
    const [dia, mes, ano] = d.data.split('/');
    return { data: `${ano}-${mes}-${dia}`, valor: parseFloat(d.valor) };
  }).sort((a, b) => a.data.localeCompare(b.data));
}

module.exports = { buscarSerieBCB, CODIGOS };
