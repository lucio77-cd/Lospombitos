// ============================================================
//  api/_lib/mercados-globais.js — Fator Comportamental
//
//  Mecanismo diferente do agro/hidro: aqui não é fundamento
//  (safra, reservatório), é humor. Estudos de finanças
//  comportamentais (Saunders 1993; Hirshleifer & Shumway 2003,
//  "Good Day Sunshine: Stock Returns and the Weather") encontraram
//  correlação pequena mas estatisticamente significativa entre
//  luz solar NA CIDADE DA BOLSA e o retorno do índice naquele dia
//  — a explicação proposta é que humor influenciado pelo tempo
//  afeta apetite a risco de quem está operando. Por isso aqui a
//  variável é 'sunshine_duration' (não chuva) e a cidade é sempre
//  a sede da bolsa, não uma região produtora.
// ============================================================

module.exports = {
  IBOVESPA:  { nome: 'Ibovespa',        simboloYahoo: '^BVSP',   cidade: 'São Paulo',    lat: -23.5505, lon: -46.6333 },
  SP500:     { nome: 'S&P 500',         simboloYahoo: '^GSPC',   cidade: 'Nova York',    lat: 40.7128,  lon: -74.0060 },
  DOWJONES:  { nome: 'Dow Jones',       simboloYahoo: '^DJI',    cidade: 'Nova York',    lat: 40.7128,  lon: -74.0060 },
  NASDAQ:    { nome: 'Nasdaq',          simboloYahoo: '^IXIC',   cidade: 'Nova York',    lat: 40.7128,  lon: -74.0060 },
  FTSE100:   { nome: 'FTSE 100',        simboloYahoo: '^FTSE',   cidade: 'Londres',      lat: 51.5074,  lon: -0.1278 },
  DAX:       { nome: 'DAX',             simboloYahoo: '^GDAXI',  cidade: 'Frankfurt',    lat: 50.1109,  lon: 8.6821 },
  CAC40:     { nome: 'CAC 40',          simboloYahoo: '^FCHI',   cidade: 'Paris',        lat: 48.8566,  lon: 2.3522 },
  NIKKEI:    { nome: 'Nikkei 225',      simboloYahoo: '^N225',   cidade: 'Tóquio',       lat: 35.6762,  lon: 139.6503 },
  HANGSENG:  { nome: 'Hang Seng',       simboloYahoo: '^HSI',    cidade: 'Hong Kong',    lat: 22.3193,  lon: 114.1694 },

  DOLAR: { nome: 'Dólar (USD/BRL)', simboloYahoo: 'USDBRL=X', cidade: 'São Paulo', lat: -23.5505, lon: -46.6333 },
  EURO:  { nome: 'Euro (EUR/BRL)',  simboloYahoo: 'EURBRL=X', cidade: 'São Paulo', lat: -23.5505, lon: -46.6333 },
};
