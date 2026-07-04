// ============================================================
//  api/_lib/ativos-clima.js — Quais ativos têm mecanismo causal
//  plausível com clima, e qual
//
//  Isto substitui a ideia de "testar clima contra qualquer
//  ticker". Só entram aqui ativos onde existe uma cadeia causal
//  conhecida (clima → safra → preço, ou chuva → reservatório →
//  geração → preço da elétrica). Pra qualquer ticker fora deste
//  mapa (bancos, tech, cripto, petróleo, industriais genéricos),
//  o app não roda NENHUM teste estatístico — porque testar sem
//  motivo é como a gente acaba com "sinais" falsos.
//
//  categoria: 'agro' | 'hidro'
//  regiao (agro): cidade de referência da região produtora
//  subsistema (hidro): subsistema ONS ('SE_CO' | 'S' | 'NE' | 'N')
// ============================================================

module.exports = {
  // ── Agro (chuva/seca afeta safra, com defasagem de semanas) ──
  SLCE3: { categoria: 'agro', nome: 'SLC Agrícola',      regiao: { nome: 'Sorriso (MT)',        lat: -12.5453, lon: -55.7217 } },
  SMTO3: { categoria: 'agro', nome: 'São Martinho',      regiao: { nome: 'Ribeirão Preto (SP)', lat: -21.1775, lon: -47.8103 } },
  RAIZ4: { categoria: 'agro', nome: 'Raízen',            regiao: { nome: 'Ribeirão Preto (SP)', lat: -21.1775, lon: -47.8103 } },
  AGRO3: { categoria: 'agro', nome: 'BrasilAgro',        regiao: { nome: 'Barreiras (BA)',      lat: -12.1425, lon: -45.0 } },
  TTEN3: { categoria: 'agro', nome: '3tentos',           regiao: { nome: 'Rio Verde (GO)',      lat: -17.7975, lon: -50.9267 } },
  KEPL3: { categoria: 'agro', nome: 'Kepler Weber',      regiao: { nome: 'Rio Verde (GO)',      lat: -17.7975, lon: -50.9267 } },
  CAML3: { categoria: 'agro', nome: 'Camil Alimentos',   regiao: { nome: 'Chapecó (SC)',        lat: -27.0965, lon: -52.6183 } },
  BEEF3: { categoria: 'agro', nome: 'Minerva',           regiao: { nome: 'Rio Verde (GO)',      lat: -17.7975, lon: -50.9267 } },
  MRFG3: { categoria: 'agro', nome: 'Marfrig',           regiao: { nome: 'Rio Verde (GO)',      lat: -17.7975, lon: -50.9267 } },
  JBSS3: { categoria: 'agro', nome: 'JBS',               regiao: { nome: 'Rio Verde (GO)',      lat: -17.7975, lon: -50.9267 } },

  // ── Hidrelétricas / transmissoras (nível de reservatório → geração) ──
  ELET3: { categoria: 'hidro', nome: 'Eletrobras',        subsistema: 'SE_CO' },
  ELET6: { categoria: 'hidro', nome: 'Eletrobras',        subsistema: 'SE_CO' },
  ENGI11:{ categoria: 'hidro', nome: 'Energisa',          subsistema: 'NE' },
  CPFE3: { categoria: 'hidro', nome: 'CPFL Energia',      subsistema: 'SE_CO' },
  TAEE11:{ categoria: 'hidro', nome: 'Taesa',             subsistema: 'SE_CO' },
  EQTL3: { categoria: 'hidro', nome: 'Equatorial',        subsistema: 'NE' },
  AURE3: { categoria: 'hidro', nome: 'Auren Energia',     subsistema: 'SE_CO' },
  AESB3: { categoria: 'hidro', nome: 'AES Brasil',        subsistema: 'S' },
  GEPA3: { categoria: 'hidro', nome: 'Geração Paranapanema', subsistema: 'SE_CO' },
  GEPA4: { categoria: 'hidro', nome: 'Geração Paranapanema', subsistema: 'SE_CO' },
};

// Subsistemas ONS e um município de referência em cada um, usado só
// pra exibir "onde" pro usuário — o dado de EAR em si vem do CSV do ONS.
module.exports.SUBSISTEMAS = {
  SE_CO: 'Sudeste/Centro-Oeste',
  S:     'Sul',
  NE:    'Nordeste',
  N:     'Norte',
};
