// ============================================================
//  LOS POMBITOS — mercado-api.js
//  APIs: brapi.dev (B3) + CoinGecko (cripto) + BACEN (taxas)
// ============================================================

const MercadoAPI = {

  BRAPI: 'https://brapi.dev/api',
  _cache: {},
  _cacheTTL: 5 * 60 * 1000,

  // ── Token brapi (deixar vazio usa plano free com limite)
  // Para mais requests: cadastre em brapi.dev e coloque seu token aqui
  TOKEN: 'dxg6v14WGQmfM1t9Hdms17',

  _url(path, params = {}) {
    const u = new URL(this.BRAPI + path);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    if (this.TOKEN) u.searchParams.set('token', this.TOKEN);
    return u.toString();
  },

  // ────────────────────────────────────────────
  //  AÇÃO / FII — cotação simples
  // ────────────────────────────────────────────
  async buscarAtivo(ticker) {
    const t = ticker.toUpperCase().trim();
    const cacheKey = `ativo_${t}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      const res  = await fetch(this._url(`/quote/${t}`, { fundamental: 'false' }));
      const data = await res.json();
      if (!data.results?.length) return null;

      const q = data.results[0];
      const r = {
        ticker:       q.symbol,
        nome:         q.longName || q.shortName || t,
        preco:        q.regularMarketPrice || 0,
        fechamento_ant: q.regularMarketPreviousClose || 0,
        variacao:     q.regularMarketChange || 0,
        variacao_pct: q.regularMarketChangePercent || 0,
        volume:       q.regularMarketVolume || 0,
        mercado_aberto: q.marketState === 'REGULAR',
        max_dia:      q.regularMarketDayHigh || 0,
        min_dia:      q.regularMarketDayLow || 0,
        max_52s:      q.fiftyTwoWeekHigh || 0,
        min_52s:      q.fiftyTwoWeekLow || 0,
      };

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      console.error(`[API] buscarAtivo ${t}:`, e);
      return null;
    }
  },

  // ────────────────────────────────────────────
  //  AÇÃO / FII — dados detalhados
  // ────────────────────────────────────────────
  async buscarDetalhadoAtivo(ticker) {
    const t = ticker.toUpperCase().trim();
    const cacheKey = `detalhe_${t}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      const res  = await fetch(this._url(`/quote/${t}`, { fundamental: 'true', dividends: 'true' }));
      const data = await res.json();
      if (!data.results?.length) return null;

      const q   = data.results[0];
      const s   = q.summaryProfile || {};
      const f   = q.defaultKeyStatistics || {};
      const fin = q.financialData || {};

      let media50  = q.fiftyDayAverage || 0;
      let media200 = q.twoHundredDayAverage || 0;
      let volMedio = q.averageDailyVolume3Month || 0;

      // Calcula médias via histórico se não vieram
      if (!media50 || !media200) {
        try {
          const hist = await this.buscarHistorico(t, '1y');
          if (hist?.historico?.length > 0) {
            const precos = hist.historico.map(h => h.preco);
            if (!media50 && precos.length >= 50) {
              const u50 = precos.slice(-50);
              media50 = u50.reduce((a, b) => a + b, 0) / u50.length;
            }
            if (!media200) {
              media200 = precos.reduce((a, b) => a + b, 0) / precos.length;
            }
            if (!volMedio) {
              const vols = hist.historico.map(h => h.volume || 0).filter(v => v > 0).slice(-63);
              if (vols.length) volMedio = Math.round(vols.reduce((a, b) => a + b, 0) / vols.length);
            }
          }
        } catch(_) {}
      }

      // Consenso de analistas
      let nAnal   = fin.numberOfAnalystOpinions?.raw || 0;
      let rec     = fin.recommendationKey || '';
      let alvoFin = fin.targetMeanPrice?.raw || 0;

      const fb = this.CONSENSO_FALLBACK[t];
      if (fb && (!rec || !nAnal)) {
        rec     = rec || fb.rec;
        nAnal   = nAnal || fb.n_analistas;
        alvoFin = alvoFin || fb.alvo;
      }

      let compra, neutro, venda, estimado;
      if (fb && !fin.numberOfAnalystOpinions?.raw) {
        compra = fb.c; neutro = fb.n; venda = fb.v; estimado = true;
      } else {
        const r = this._estimarConsenso(rec, nAnal);
        compra = r.compra; neutro = r.neutro; venda = r.venda; estimado = r.estimado;
      }

      const r = {
        descricao: s.longBusinessSummary || '',
        setor: s.sector || '',
        industria: s.industry || '',
        preco: q.regularMarketPrice || 0,
        max_52s: q.fiftyTwoWeekHigh || 0,
        min_52s: q.fiftyTwoWeekLow || 0,
        media_50d: media50,
        media_200d: media200,
        volume: q.regularMarketVolume || 0,
        volume_medio: volMedio,
        pl: q.priceEarnings || f.trailingEps?.raw || 0,
        pvp: f.priceToBook?.raw || 0,
        dy: (q.dividendYield || 0) * 100,
        roe: (fin.returnOnEquity?.raw || 0) * 100,
        roa: (fin.returnOnAssets?.raw || 0) * 100,
        margem_lucro: (fin.profitMargins?.raw || 0) * 100,
        margem_ebitda: (fin.ebitdaMargins?.raw || 0) * 100,
        ev_ebitda: f.enterpriseToEbitda?.raw || 0,
        market_cap: q.marketCap || 0,
        alvo_analistas: alvoFin,
        recomendacao: rec,
        n_analistas: nAnal,
        rec_compra: compra,
        rec_neutro: neutro,
        rec_venda: venda,
        consenso_estimado: estimado || false,
      };

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      console.error(`[API] buscarDetalhadoAtivo ${t}:`, e);
      return null;
    }
  },

  CONSENSO_FALLBACK: {
    PETR4:{n_analistas:18,rec:'buy',alvo:48.50,c:12,n:4,v:2},
    PETR3:{n_analistas:16,rec:'buy',alvo:47.00,c:11,n:3,v:2},
    VALE3:{n_analistas:20,rec:'buy',alvo:68.00,c:13,n:5,v:2},
    ITUB4:{n_analistas:16,rec:'buy',alvo:40.00,c:11,n:4,v:1},
    BBAS3:{n_analistas:14,rec:'buy',alvo:35.00,c:10,n:3,v:1},
    BBDC4:{n_analistas:15,rec:'hold',alvo:16.50,c:5,n:7,v:3},
    WEGE3:{n_analistas:14,rec:'buy',alvo:58.00,c:10,n:3,v:1},
    ABEV3:{n_analistas:13,rec:'hold',alvo:13.50,c:4,n:6,v:3},
    RENT3:{n_analistas:14,rec:'buy',alvo:72.00,c:10,n:3,v:1},
    PRIO3:{n_analistas:12,rec:'strongBuy',alvo:68.00,c:10,n:2,v:0},
    RDOR3:{n_analistas:11,rec:'buy',alvo:38.00,c:8,n:2,v:1},
    EGIE3:{n_analistas:10,rec:'buy',alvo:47.00,c:7,n:2,v:1},
    MGLU3:{n_analistas:12,rec:'hold',alvo:8.50,c:4,n:5,v:3},
    TOTS3:{n_analistas:10,rec:'buy',alvo:34.00,c:7,n:2,v:1},
    AZUL4:{n_analistas:10,rec:'buy',alvo:18.00,c:7,n:2,v:1},
    CSAN3:{n_analistas:9,rec:'hold',alvo:14.00,c:3,n:4,v:2},
  },

  _estimarConsenso(rec, total) {
    const dist = {
      strongBuy:{c:.80,n:.15,v:.05,def:12},
      buy:{c:.65,n:.25,v:.10,def:14},
      hold:{c:.25,n:.50,v:.25,def:12},
      underperform:{c:.10,n:.30,v:.60,def:10},
      sell:{c:.05,n:.15,v:.80,def:8},
    };
    const d = dist[rec] || dist.hold;
    const n = total > 0 ? total : d.def;
    return { compra:Math.round(d.c*n), neutro:Math.round(d.n*n), venda:Math.round(d.v*n), estimado:total===0 };
  },

  // ────────────────────────────────────────────
  //  HISTÓRICO
  // ────────────────────────────────────────────
  async buscarHistorico(ticker, periodo = '1y') {
    const t = ticker.toUpperCase().trim();
    const cacheKey = `hist_${t}_${periodo}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    const intervaloMap = {'1mo':'1d','3mo':'1d','6mo':'1d','1y':'1d','5y':'1wk'};
    const intervalo = intervaloMap[periodo] || '1d';

    try {
      const res  = await fetch(this._url(`/quote/${t}`, { range: periodo, interval: intervalo, fundamental: 'false' }));
      const data = await res.json();
      if (!data.results?.[0]?.historicalDataPrice) return null;

      const hist = data.results[0].historicalDataPrice;
      const historico = hist.map(h => ({
        data: new Date(h.date * 1000).toLocaleDateString('pt-BR'),
        preco: parseFloat((h.close || 0).toFixed(2)),
        volume: h.volume || 0,
      })).filter(h => h.preco > 0);

      const primeiro = historico[0]?.preco || 0;
      const ultimo   = historico[historico.length - 1]?.preco || 0;

      const r = {
        historico,
        variacao_periodo: primeiro ? ((ultimo - primeiro) / primeiro) * 100 : 0,
        min_periodo: Math.min(...historico.map(h => h.preco)),
        max_periodo: Math.max(...historico.map(h => h.preco)),
      };

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      console.error(`[API] buscarHistorico ${t}:`, e);
      return null;
    }
  },

  // ────────────────────────────────────────────
  //  MÚLTIPLOS
  // ────────────────────────────────────────────
  async buscarMultiplos(tickers) {
    if (!tickers?.length) return [];
    const lista = tickers.map(t => t.toUpperCase().trim()).join(',');
    const cacheKey = `multi_${lista}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      const res  = await fetch(this._url(`/quote/${lista}`, { fundamental: 'false' }));
      const data = await res.json();
      if (!data.results) return [];

      const r = data.results.map(q => ({
        ticker:       q.symbol,
        nome:         q.longName || q.shortName || q.symbol,
        preco:        q.regularMarketPrice || 0,
        variacao_pct: q.regularMarketChangePercent || 0,
        variacao:     q.regularMarketChange || 0,
        volume:       q.regularMarketVolume || 0,
        market_cap:   q.marketCap || 0,
        pl:           q.priceEarnings || 0,
        dy:           (q.dividendYield || 0) * 100,
        max_52s:      q.fiftyTwoWeekHigh || 0,
        min_52s:      q.fiftyTwoWeekLow || 0,
      }));

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      console.error('[API] buscarMultiplos:', e);
      return [];
    }
  },

  // ────────────────────────────────────────────
  //  ÍNDICES — IBOV, USD, BTC via brapi
  // ────────────────────────────────────────────
  async buscarIndices() {
    const cacheKey = 'indices';
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      const res  = await fetch(this._url('/quote/%5EBVSP,USDBRL%3DX,BTC-USD', { fundamental: 'false' }));
      const data = await res.json();

      const nomeMap = {'^BVSP':'Ibovespa','USDBRL=X':'Dólar','BTC-USD':'Bitcoin'};
      const r = (data.results || []).map(q => ({
        ticker:       q.symbol,
        nome:         nomeMap[q.symbol] || q.shortName || q.symbol,
        preco:        q.regularMarketPrice || 0,
        variacao_pct: q.regularMarketChangePercent || 0,
      }));

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      return [];
    }
  },

  // ────────────────────────────────────────────
  //  AUTOCOMPLETE
  // ────────────────────────────────────────────
  async buscarAutoComplete(query) {
    if (!query || query.length < 2) return [];
    try {
      const res  = await fetch(this._url('/quote/list', { search: query, limit: '8' }));
      const data = await res.json();
      return (data.stocks || []).slice(0, 8).map(s => ({
        ticker: s.stock,
        nome:   s.name || s.stock,
        tipo:   s.type || 'Ação',
      }));
    } catch(e) { return []; }
  },

  // ────────────────────────────────────────────
  //  CRIPTO
  // ────────────────────────────────────────────
  async buscarCripto(id) {
    const cacheKey = `cripto_${id}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);
    try {
      const res  = await fetch(`https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`);
      const data = await res.json();
      const r = {
        id, nome: data.name,
        simbolo:    data.symbol?.toUpperCase(),
        preco_brl:  data.market_data?.current_price?.brl || 0,
        variacao_24h: data.market_data?.price_change_percentage_24h || 0,
        variacao_7d:  data.market_data?.price_change_percentage_7d || 0,
        max_historico: data.market_data?.ath?.brl || 0,
        market_cap:  data.market_data?.market_cap?.brl || 0,
        rank:        data.market_cap_rank || 0,
      };
      this._toCache(cacheKey, r);
      return r;
    } catch(e) { return null; }
  },

  async listarCriptos(limite = 20) {
    const cacheKey = `criptos_${limite}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);
    try {
      const res  = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=brl&order=market_cap_desc&per_page=${limite}&page=1&price_change_percentage=24h`);
      const data = await res.json();
      const r = data.map(c => ({
        id: c.id, nome: c.name,
        simbolo:     c.symbol?.toUpperCase(),
        preco:       c.current_price || 0,
        variacao_24h: c.price_change_percentage_24h || 0,
        market_cap:  c.market_cap || 0,
        rank:        c.market_cap_rank || 0,
        imagem:      c.image || '',
      }));
      this._toCache(cacheKey, r);
      return r;
    } catch(e) { return []; }
  },

  // ────────────────────────────────────────────
  //  TESOURO DIRETO (fallback estático)
  // ────────────────────────────────────────────
  async buscarTesouroDireto() {
    return [
      {nome:'Tesouro Selic 2027',tipo:'selic',taxa_compra:14.65,vencimento:'2027-03-01',min_investimento:100,preco_compra:13879.44},
      {nome:'Tesouro Selic 2029',tipo:'selic',taxa_compra:14.65,vencimento:'2029-03-01',min_investimento:100,preco_compra:12456.78},
      {nome:'Tesouro IPCA+ 2029',tipo:'ipca',taxa_compra:7.28,vencimento:'2029-05-15',min_investimento:100,preco_compra:3456.89},
      {nome:'Tesouro IPCA+ 2035',tipo:'ipca',taxa_compra:7.45,vencimento:'2035-05-15',min_investimento:100,preco_compra:2987.34},
      {nome:'Tesouro IPCA+ 2045',tipo:'ipca',taxa_compra:7.62,vencimento:'2045-05-15',min_investimento:100,preco_compra:1876.23},
      {nome:'Tesouro Prefixado 2027',tipo:'prefixado',taxa_compra:14.20,vencimento:'2027-01-01',min_investimento:100,preco_compra:756.89},
      {nome:'Tesouro Prefixado 2031',tipo:'prefixado',taxa_compra:14.45,vencimento:'2031-01-01',min_investimento:100,preco_compra:534.67},
    ];
  },

  // ────────────────────────────────────────────
  //  BACEN — CDI, SELIC, IPCA
  // ────────────────────────────────────────────
  async buscarTaxasBacen() {
    const cacheKey = 'bacen';
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);
    try {
      const [cdi, selic, ipca] = await Promise.all([
        fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json').then(r=>r.json()),
        fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json').then(r=>r.json()),
        fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/1?formato=json').then(r=>r.json()),
      ]);
      const r = {
        cdi_diario:      parseFloat(cdi[0]?.valor || '0.0579'),
        selic_meta:      parseFloat(selic[0]?.valor || '14.75'),
        ipca_12m:        parseFloat(ipca[0]?.valor || '5.06'),
        cdi_anual_aprox: parseFloat(selic[0]?.valor || '14.75') - 0.10,
      };
      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      return {cdi_diario:0.0579, selic_meta:14.75, ipca_12m:5.06, cdi_anual_aprox:14.65};
    }
  },

  // ────────────────────────────────────────────
  //  CONCORRENTES
  // ────────────────────────────────────────────
  SETORES: {
    'Petróleo & Gás':['PETR4','PETR3','PRIO3','RECV3','CSAN3'],
    'Bancos':['ITUB4','BBDC4','BBAS3','SANB11','BPAC11'],
    'Varejo':['MGLU3','LREN3','AMER3','VIVA3'],
    'Energia Elétrica':['EGIE3','ENGI11','CPFE3','CPLE6','EQTL3'],
    'Mineração & Siderurgia':['VALE3','CSNA3','GGBR4','USIM5','CMIN3'],
    'Saúde':['RDOR3','HAPV3','FLRY3','DASA3'],
    'Tecnologia':['TOTS3','LWSA3','POSI3'],
    'Transporte':['RAIL3','CCRO3','GOLL4','AZUL4'],
    'Bens Industriais':['WEGE3','EMAE4','FRAS3'],
    'Consumo':['ABEV3','RENT3','LREN3'],
  },

  obterConcorrentes(ticker) {
    const t = ticker.toUpperCase().trim();
    for (const [setor, lista] of Object.entries(this.SETORES)) {
      if (lista.includes(t)) return {setor, concorrentes: lista.filter(c => c !== t)};
    }
    return {setor:'Outros', concorrentes:[]};
  },

  // ────────────────────────────────────────────
  //  HORÁRIO DE MERCADO
  // ────────────────────────────────────────────
  verificarHorarioMercado() {
    const br = new Date(new Date().toLocaleString('en-US', {timeZone:'America/Sao_Paulo'}));
    const h = br.getHours(), m = br.getMinutes(), dia = br.getDay();
    const total = h * 60 + m;
    const fds = dia === 0 || dia === 6;
    if (fds || total < 9*60 || total >= 18*60) return {status:'fechado', label:'Mercado fechado', proxima: this._proximoDiaUtil(br)};
    if (total < 9*60+45) return {status:'pre_abertura', label:'Pré-abertura', proxima: null};
    if (total < 17*60+30) return {status:'aberto', label:'Mercado aberto ✅', proxima: null};
    return {status:'after', label:'After-market', proxima: this._proximoDiaUtil(br)};
  },

  _proximoDiaUtil(d) {
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
    next.setHours(9, 45, 0, 0);
    return next;
  },

  // ────────────────────────────────────────────
  //  SIMULAÇÃO RENDA FIXA
  // ────────────────────────────────────────────
  simularRendaFixa({valor, tipo, taxa, prazoMeses}) {
    const anos = prazoMeses / 12;
    let montante;
    if (tipo === 'cdi_pct') montante = valor * Math.pow(1 + (taxa/100 * 14.65/100), anos);
    else if (tipo === 'ipca_mais') montante = valor * Math.pow(1 + (5.06 + taxa)/100, anos);
    else montante = valor * Math.pow(1 + taxa/100, anos);
    const rendaBruta = montante - valor;
    const aliq = prazoMeses <= 6 ? .225 : prazoMeses <= 12 ? .20 : prazoMeses <= 24 ? .175 : .15;
    const rendaLiq = rendaBruta * (1 - aliq);
    return {valor_inicial:valor, montante_bruto:montante, renda_bruta:rendaBruta, ir:rendaBruta*aliq, renda_liquida:rendaLiq, montante_liquido:valor+rendaLiq, rentabilidade_pct:(rendaLiq/valor)*100};
  },

  // ────────────────────────────────────────────
  //  FORMATADORES
  // ────────────────────────────────────────────
  R$(valor) {
    if (typeof valor !== 'number' || isNaN(valor)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(valor);
  },

  pct(valor, casas = 2) {
    if (typeof valor !== 'number' || isNaN(valor)) return '+0,00%';
    return `${valor >= 0 ? '+' : ''}${valor.toFixed(casas)}%`;
  },

  bigNum(valor) {
    if (!valor || isNaN(valor)) return 'R$ —';
    if (valor >= 1e12) return `R$ ${(valor/1e12).toFixed(2)}T`;
    if (valor >= 1e9)  return `R$ ${(valor/1e9).toFixed(2)}B`;
    if (valor >= 1e6)  return `R$ ${(valor/1e6).toFixed(2)}M`;
    return this.R$(valor);
  },

  // ────────────────────────────────────────────
  //  CACHE
  // ────────────────────────────────────────────
  _fromCache(key) {
    const c = this._cache[key];
    if (!c) return null;
    if (Date.now() - c.ts > this._cacheTTL) { delete this._cache[key]; return null; }
    return c.data;
  },
  _toCache(key, data) { this._cache[key] = {data, ts: Date.now()}; },
};
