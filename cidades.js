// ============================================================
//  api/_lib/cidades.js — Cidades usadas no Fator Climático
//
//  "Todas as cidades do Brasil" na prática seriam ~5.570
//  municípios — inviável consultar tudo isso ao vivo a cada
//  análise sem travar a API. Este é um conjunto prático: as 27
//  capitais + alguns polos agrícolas/industriais relevantes.
//  Para adicionar mais, é só incluir { nome, uf, lat, lon }.
// ============================================================

module.exports = [
  // Capitais
  { nome: 'São Paulo',        uf: 'SP', lat: -23.5505, lon: -46.6333 },
  { nome: 'Rio de Janeiro',   uf: 'RJ', lat: -22.9068, lon: -43.1729 },
  { nome: 'Belo Horizonte',   uf: 'MG', lat: -19.9167, lon: -43.9345 },
  { nome: 'Salvador',         uf: 'BA', lat: -12.9714, lon: -38.5014 },
  { nome: 'Brasília',         uf: 'DF', lat: -15.7939, lon: -47.8828 },
  { nome: 'Fortaleza',        uf: 'CE', lat: -3.7172,  lon: -38.5433 },
  { nome: 'Curitiba',         uf: 'PR', lat: -25.4284, lon: -49.2733 },
  { nome: 'Recife',           uf: 'PE', lat: -8.0476,  lon: -34.8770 },
  { nome: 'Porto Alegre',     uf: 'RS', lat: -30.0346, lon: -51.2177 },
  { nome: 'Manaus',           uf: 'AM', lat: -3.1190,  lon: -60.0217 },
  { nome: 'Belém',            uf: 'PA', lat: -1.4558,  lon: -48.4902 },
  { nome: 'Goiânia',          uf: 'GO', lat: -16.6869, lon: -49.2648 },
  { nome: 'Campo Grande',     uf: 'MS', lat: -20.4697, lon: -54.6201 },
  { nome: 'Cuiabá',           uf: 'MT', lat: -15.6014, lon: -56.0979 },
  { nome: 'São Luís',         uf: 'MA', lat: -2.5307,  lon: -44.3068 },
  { nome: 'Maceió',           uf: 'AL', lat: -9.6498,  lon: -35.7089 },
  { nome: 'Natal',            uf: 'RN', lat: -5.7945,  lon: -35.2110 },
  { nome: 'Teresina',         uf: 'PI', lat: -5.0892,  lon: -42.8019 },
  { nome: 'João Pessoa',      uf: 'PB', lat: -7.1195,  lon: -34.8450 },
  { nome: 'Aracaju',          uf: 'SE', lat: -10.9472, lon: -37.0731 },
  { nome: 'Florianópolis',    uf: 'SC', lat: -27.5954, lon: -48.5480 },
  { nome: 'Vitória',          uf: 'ES', lat: -20.3155, lon: -40.3128 },
  { nome: 'Porto Velho',      uf: 'RO', lat: -8.7619,  lon: -63.9039 },
  { nome: 'Boa Vista',        uf: 'RR', lat: 2.8235,   lon: -60.6758 },
  { nome: 'Macapá',           uf: 'AP', lat: 0.0349,   lon: -51.0694 },
  { nome: 'Rio Branco',       uf: 'AC', lat: -9.9754,  lon: -67.8249 },
  { nome: 'Palmas',           uf: 'TO', lat: -10.1689, lon: -48.3317 },

  // Polos agrícolas / industriais relevantes (fora das capitais)
  { nome: 'Sorriso (MT)',        uf: 'MT', lat: -12.5453, lon: -55.7217 },  // soja/milho
  { nome: 'Rio Verde (GO)',      uf: 'GO', lat: -17.7975, lon: -50.9267 }, // soja/milho
  { nome: 'Ribeirão Preto (SP)', uf: 'SP', lat: -21.1775, lon: -47.8103 }, // cana/etanol
  { nome: 'Londrina (PR)',       uf: 'PR', lat: -23.3103, lon: -51.1628 }, // soja/café
  { nome: 'Uberlândia (MG)',     uf: 'MG', lat: -18.9186, lon: -48.2772 }, // agro/logística
  { nome: 'Barreiras (BA)',      uf: 'BA', lat: -12.1425, lon: -45.0} ,     // soja/algodão oeste da Bahia
  { nome: 'Chapecó (SC)',        uf: 'SC', lat: -27.0965, lon: -52.6183 }, // agropecuária/proteína animal
  { nome: 'Marabá (PA)',         uf: 'PA', lat: -5.3688,  lon: -49.1178 }, // mineração/pecuária
];
