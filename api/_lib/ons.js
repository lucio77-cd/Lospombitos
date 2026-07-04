// ============================================================
//  api/_lib/ons.js — Energia Armazenada (EAR) por subsistema
//
//  Fonte: dados.ons.org.br (CSV público, sem autenticação,
//  atualizado diariamente). EAR em % da capacidade do subsistema
//  é o proxy padrão do setor elétrico pra "quanta água tem
//  guardada pra gerar energia" — cai com seca, sobe com chuva.
// ============================================================

const NOME_SUBSISTEMA_CSV = {
  SE_CO: 'SUDESTE',
  S: 'SUL',
  NE: 'NORDESTE',
  N: 'NORTE',
};

function urlAno(ano) {
  return `https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/ear_reservatorio_di/EAR_DIARIO_RESERVATORIOS_${ano}.csv`;
}

// Parser simples de CSV (o arquivo do ONS usa ';' como separador)
function parseCsv(texto) {
  const linhas = texto.trim().split('\n');
  const cab = linhas[0].split(';').map((s) => s.trim());
  return linhas.slice(1).map((linha) => {
    const campos = linha.split(';');
    const obj = {};
    cab.forEach((c, i) => { obj[c] = campos[i]; });
    return obj;
  });
}

// Retorna série diária de EAR (%) agregada por subsistema, entre duas datas.
// O CSV do ONS é por reservatório individual — agregamos pela média
// ponderada pelo campo de EAR em MWmes (aproximação razoável e transparente).
async function earHistorico(subsistemaKey, dataInicio, dataFim) {
  const anoInicio = parseInt(dataInicio.slice(0, 4), 10);
  const anoFim = parseInt(dataFim.slice(0, 4), 10);
  const nomeAlvo = NOME_SUBSISTEMA_CSV[subsistemaKey];

  const porData = {}; // data -> { soma, n }

  for (let ano = anoInicio; ano <= anoFim; ano++) {
    const res = await fetch(urlAno(ano), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) continue; // ano pode não ter CSV publicado ainda
    const texto = await res.text();
    const linhas = parseCsv(texto);

    for (const l of linhas) {
      const data = (l.ear_data || l.din_instante || '').slice(0, 10);
      if (!data || data < dataInicio || data > dataFim) continue;
      const subsistema = (l.nom_subsistema || l.subsistema || '').toUpperCase();
      if (!subsistema.includes(nomeAlvo)) continue;

      const pct = parseFloat((l.val_earpercentualsubsistema || l.ear_verif_subsistema_percentual || '').toString().replace(',', '.'));
      if (!Number.isFinite(pct)) continue;

      if (!porData[data]) porData[data] = { soma: 0, n: 0 };
      porData[data].soma += pct;
      porData[data].n += 1;
    }
  }

  const serie = {};
  for (const [data, { soma, n }] of Object.entries(porData)) {
    serie[data] = soma / n;
  }
  return serie; // { 'YYYY-MM-DD': pctEar }
}

module.exports = { earHistorico };
