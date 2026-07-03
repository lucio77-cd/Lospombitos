// ============================================================
//  api/_lib/oni.js — Índice ONI (El Niño / La Niña)
//
//  Fonte: NOAA CPC, texto público, resolução mensal (médias
//  móveis de 3 meses), sem autenticação. É o indicador padrão
//  de regime climático usado por analistas de commodities pra
//  entender o pano de fundo da safra (El Niño costuma trazer
//  mais chuva no Sul e seca no Norte/Nordeste do Brasil, e
//  vice-versa em La Niña — mas o efeito varia por região).
// ============================================================

const URL_ONI = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';

// Retorna série mensal { 'YYYY-MM': anomalia } cobrindo os últimos `meses`.
async function oniHistorico(meses = 6) {
  const res = await fetch(URL_ONI, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`NOAA ONI HTTP ${res.status}`);
  const texto = await res.text();

  const linhas = texto.trim().split('\n').slice(1); // pula cabeçalho
  const SEAS_MES_CENTRAL = {
    DJF: 1, JFM: 2, FMA: 3, MAM: 4, AMJ: 5, MJJ: 6,
    JJA: 7, JAS: 8, ASO: 9, SON: 10, OND: 11, NDJ: 12,
  };

  const pontos = [];
  for (const linha of linhas) {
    const campos = linha.trim().split(/\s+/);
    if (campos.length < 4) continue;
    const [seas, yr, , anom] = campos;
    const mes = SEAS_MES_CENTRAL[seas];
    if (!mes) continue;
    pontos.push({ ano: parseInt(yr, 10), mes, anomalia: parseFloat(anom) });
  }

  return pontos.slice(-meses);
}

module.exports = { oniHistorico };
