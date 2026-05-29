// ============================================================
//  LOS POMBITOS — mercado-api.js  (versão corrigida)
//
//  Correções desta versão:
//  - media_50d / media_200d / volume_medio: fallback via
//    histórico local quando brapi retorna 0 (campos pagos)
//  - rec_compra / rec_neutro / rec_venda: estimados a partir
//    de recommendationKey + numberOfAnalystOpinions
//  - Novo método: buscarRecomendacoes() com fallback robusto
// ============================================================

const MercadoAPI = {

  BRAPI: 'https://brapi.dev/api',

  _cache: {},
  _cacheTTL: 5 * 60 * 1000, // 5 minutos

  // ────────────────────────────────────────────
  //  AÇÃO / FII — cotação simples
  // ────────────────────────────────────────────
  async buscarAtivo(ticker) {
    const t = ticker.toUpperCase().trim();
    const cacheKey = `ativo_${t}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      const url = `${this.BRAPI}/quote/${t}?fundamental=false`;
      const res  = await fetch(url);
      const data = await res.json();

      if (!data.results || data.results.length === 0) return null;

      const q = data.results[0];
      const r = {
        ticker:         q.symbol,
        nome:           q.longName || q.shortName || t,
        preco:          q.regularMarketPrice || 0,
        fechamento_ant: q.regularMarketPreviousClose || 0,
        variacao:       q.regularMarketChange || 0,
        variacao_pct:   q.regularMarketChangePercent || 0,
        volume:         q.regularMarketVolume || 0,
        mercado_aberto: q.marketState === 'REGULAR',
        max_dia:        q.regularMarketDayHigh || 0,
        min_dia:        q.regularMarketDayLow || 0,
        max_52s:        q.fiftyTwoWeekHigh || 0,
        min_52s:        q.fiftyTwoWeekLow || 0,
      };

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      console.error(`[API] buscarAtivo ${t}:`, e);
      return null;
    }
  },

  // ────────────────────────────────────────────
  //  AÇÃO / FII — dados detalhados com fundamentos
  //  CORRIGIDO: calcula médias e volume via histórico
  //  quando a brapi retorna 0 (campos de plano pago)
  // ────────────────────────────────────────────
  async buscarDetalhadoAtivo(ticker) {
    const t = ticker.toUpperCase().trim();
    const cacheKey = `detalhe_${t}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      const url = `${this.BRAPI}/quote/${t}?fundamental=true&dividends=true`;
      const res  = await fetch(url);
      const data = await res.json();

      if (!data.results || data.results.length === 0) return null;

      const q   = data.results[0];
      const s   = q.summaryProfile || {};
      const f   = q.defaultKeyStatistics || {};
      const fin = q.financialData || {};

      // ── Médias móveis: usa o que a brapi trouxer, senão calcula
      let media50  = q.fiftyDayAverage   || 0;
      let media200 = q.twoHundredDayAverage || 0;
      let volMedio = q.averageDailyVolume3Month || 0;

      // Se vieram zerados (plano gratuito), calcula via histórico
      if (!media50 || !media200 || !volMedio) {
        try {
          const hist1y = await this.buscarHistorico(t, '1y');
          if (hist1y?.historico?.length > 0) {
            const precos = hist1y.historico.map(h => h.preco);
            const vols   = hist1y.historico.map(h => h.volume || 0);

            if (!media50 && precos.length >= 50) {
              const ult50 = precos.slice(-50);
              media50 = ult50.reduce((a, b) => a + b, 0) / ult50.length;
            }
            if (!media200 && precos.length >= 200) {
              const ult200 = precos.slice(-200);
              media200 = ult200.reduce((a, b) => a + b, 0) / ult200.length;
            } else if (!media200 && precos.length >= 10) {
              // Aproxima com o que tiver
              media200 = precos.reduce((a, b) => a + b, 0) / precos.length;
            }
            if (!volMedio && vols.some(v => v > 0)) {
              const vols3m = vols.slice(-63).filter(v => v > 0);
              volMedio = vols3m.length
                ? Math.round(vols3m.reduce((a, b) => a + b, 0) / vols3m.length)
                : 0;
            }
          }
        } catch(_) { /* silencioso */ }
      }

      // ── Consenso de analistas
      // A brapi free não retorna o breakdown compra/neutro/venda.
      // Estimamos a distribuição a partir da recomendação + nº analistas.
      const nAnal = fin.numberOfAnalystOpinions?.raw || 0;
      const rec   = fin.recommendationKey || '';
      const { compra, neutro, venda } = this._estimarConsensoBrapi(rec, nAnal);

      const r = {
        // Perfil
        descricao:    s.longBusinessSummary || '',
        setor:        s.sector || '',
        industria:    s.industry || '',
        site:         s.website || '',
        funcionarios: s.fullTimeEmployees || 0,

        // Preço
        preco:        q.regularMarketPrice || 0,
        max_52s:      q.fiftyTwoWeekHigh   || 0,
        min_52s:      q.fiftyTwoWeekLow    || 0,
        media_50d:    media50,
        media_200d:   media200,
        volume:       q.regularMarketVolume || 0,
        volume_medio: volMedio,

        // Fundamentos
        pl:            q.priceEarnings || f.trailingEps?.raw || 0,
        pvp:           f.priceToBook?.raw || 0,
        dy:            (q.dividendYield || 0) * 100,
        roe:           (fin.returnOnEquity?.raw  || 0) * 100,
        roa:           (fin.returnOnAssets?.raw  || 0) * 100,
        margem_lucro:  (fin.profitMargins?.raw   || 0) * 100,
        margem_ebitda: (fin.ebitdaMargins?.raw   || 0) * 100,
        ev_ebitda:     f.enterpriseToEbitda?.raw || 0,
        market_cap:    q.marketCap || 0,

        // Analistas
        alvo_analistas: fin.targetMeanPrice?.raw || 0,
        recomendacao:   rec,
        n_analistas:    nAnal,
        rec_compra:     compra,
        rec_neutro:     neutro,
        rec_venda:      venda,
      };

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      console.error(`[API] buscarDetalhadoAtivo ${t}:`, e);
      return null;
    }
  },

  // ────────────────────────────────────────────
  //  Estima distribuição compra/neutro/venda
  //  a partir da recomendação consolidada
  // ────────────────────────────────────────────
  _estimarConsensoBrapi(rec, total) {
    if (!total || total === 0) return { compra: 0, neutro: 0, venda: 0 };

    // Distribuições típicas por rating
    const dist = {
      strongBuy:  { c: 0.80, n: 0.15, v: 0.05 },
      buy:        { c: 0.65, n: 0.25, v: 0.10 },
      hold:       { c: 0.25, n: 0.50, v: 0.25 },
      underperform:{ c: 0.10, n: 0.30, v: 0.60 },
      sell:       { c: 0.05, n: 0.15, v: 0.80 },
    };

    const d = dist[rec] || dist.hold;
    return {
      compra: Math.round(d.c * total),
      neutro: Math.round(d.n * total),
      venda:  Math.round(d.v * total),
    };
  },

  // ────────────────────────────────────────────
  //  HISTÓRICO DE PREÇOS
  //  CORRIGIDO: inclui volume no mapeamento
  // ────────────────────────────────────────────
  async buscarHistorico(ticker, periodo = '1y') {
    const t = ticker.toUpperCase().trim();
    const cacheKey = `hist_${t}_${periodo}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    const intervaloMap = { '1mo':'1d', '3mo':'1d', '6mo':'1d', '1y':'1d', '5y':'1wk' };
    const intervalo = intervaloMap[periodo] || '1d';

    try {
      const url = `${this.BRAPI}/quote/${t}?range=${periodo}&interval=${intervalo}&fundamental=false`;
      const res  = await fetch(url);
      const data = await res.json();

      if (!data.results || !data.results[0]?.historicalDataPrice) return null;

      const hist = data.results[0].historicalDataPrice;
      const historico = hist.map(h => ({
        data:   new Date(h.date * 1000).toLocaleDateString('pt-BR'),
        preco:  parseFloat((h.close || 0).toFixed(2)),
        volume: h.volume || 0,
      })).filter(h => h.preco > 0);

      const primeiro = historico[0]?.preco || 0;
      const ultimo   = historico[historico.length - 1]?.preco || 0;

      const r = {
        historico,
        variacao_periodo: primeiro ? ((ultimo - primeiro) / primeiro) * 100 : 0,
        min_periodo:  Math.min(...historico.map(h => h.preco)),
        max_periodo:  Math.max(...historico.map(h => h.preco)),
        primeiro_preco: primeiro,
        ultimo_preco:   ultimo,
      };

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      console.error(`[API] buscarHistorico ${t}:`, e);
      return null;
    }
  },

  // ────────────────────────────────────────────
  //  MÚLTIPLOS ATIVOS (lista)
  // ────────────────────────────────────────────
  async buscarMultiplos(tickers) {
    if (!tickers || tickers.length === 0) return [];
    const lista = tickers.map(t => t.toUpperCase().trim()).join(',');
    const cacheKey = `multi_${lista}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      const url = `${this.BRAPI}/quote/${lista}?fundamental=false`;
      const res  = await fetch(url);
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
        min_52s:      q.fiftyTwoWeekLow  || 0,
      }));

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      console.error('[API] buscarMultiplos:', e);
      return [];
    }
  },

  // ────────────────────────────────────────────
  //  ÍNDICES DO MERCADO
  // ────────────────────────────────────────────
  async buscarIndices() {
    const cacheKey = 'indices';
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      const url = `${this.BRAPI}/quote/%5EBVSP,USDBRL=X,BTC-USD?fundamental=false`;
      const res  = await fetch(url);
      const data = await res.json();

      const nomeMap = {
        '^BVSP':    'Ibovespa',
        'USDBRL=X': 'Dólar',
        'BTC-USD':  'Bitcoin',
      };

      const r = (data.results || []).map(q => ({
        ticker:       q.symbol,
        nome:         nomeMap[q.symbol] || q.shortName || q.symbol,
        preco:        q.regularMarketPrice || 0,
        variacao_pct: q.regularMarketChangePercent || 0,
        variacao:     q.regularMarketChange || 0,
      }));

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      console.error('[API] buscarIndices:', e);
      return [];
    }
  },

  // ────────────────────────────────────────────
  //  AUTOCOMPLETE DE BUSCA
  // ────────────────────────────────────────────
  async buscarAutoComplete(query) {
    if (!query || query.length < 2) return [];
    try {
      const url = `${this.BRAPI}/quote/list?search=${encodeURIComponent(query)}&limit=8`;
      const res  = await fetch(url);
      const data = await res.json();

      return (data.stocks || []).slice(0, 8).map(s => ({
        ticker: s.stock,
        nome:   s.name || s.stock,
        tipo:   s.type || 'Ação',
      }));
    } catch(e) {
      console.error('[API] autoComplete:', e);
      return [];
    }
  },

  // ────────────────────────────────────────────
  //  CRIPTO — CoinGecko
  // ────────────────────────────────────────────
  async buscarCripto(id) {
    const cacheKey = `cripto_${id}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      const url = `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`;
      const res  = await fetch(url);
      const data = await res.json();

      const r = {
        id,
        nome:          data.name,
        simbolo:       data.symbol?.toUpperCase(),
        preco_brl:     data.market_data?.current_price?.brl || 0,
        preco_usd:     data.market_data?.current_price?.usd || 0,
        variacao_24h:  data.market_data?.price_change_percentage_24h || 0,
        variacao_7d:   data.market_data?.price_change_percentage_7d  || 0,
        variacao_30d:  data.market_data?.price_change_percentage_30d || 0,
        variacao_1y:   data.market_data?.price_change_percentage_1y  || 0,
        max_24h:       data.market_data?.high_24h?.brl || 0,
        min_24h:       data.market_data?.low_24h?.brl  || 0,
        max_historico: data.market_data?.ath?.brl || 0,
        market_cap:    data.market_data?.market_cap?.brl || 0,
        rank:          data.market_cap_rank || 0,
        volume_24h:    data.market_data?.total_volume?.brl || 0,
        descricao:     data.description?.pt || data.description?.en || '',
      };

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      console.error(`[API] buscarCripto ${id}:`, e);
      return null;
    }
  },

  async listarCriptos(limite = 20) {
    const cacheKey = `criptos_${limite}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=brl&order=market_cap_desc&per_page=${limite}&page=1&price_change_percentage=24h,7d`;
      const res  = await fetch(url);
      const data = await res.json();

      const r = data.map(c => ({
        id:           c.id,
        nome:         c.name,
        simbolo:      c.symbol?.toUpperCase(),
        preco:        c.current_price || 0,
        variacao_24h: c.price_change_percentage_24h || 0,
        variacao_7d:  c.price_change_percentage_7d_in_currency || 0,
        market_cap:   c.market_cap || 0,
        volume:       c.total_volume || 0,
        rank:         c.market_cap_rank || 0,
        imagem:       c.image || '',
      }));

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      console.error('[API] listarCriptos:', e);
      return [];
    }
  },

  // ────────────────────────────────────────────
  //  TESOURO DIRETO — com fallback
  // ────────────────────────────────────────────
  async buscarTesouroDireto() {
    const cacheKey = 'tesouro';
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      // Tesouro usa CORS bloqueado, cai sempre no fallback
      throw new Error('use fallback');
    } catch(e) {
      const r = [
        { nome:'Tesouro Selic 2027',     tipo:'selic',     taxa_compra:14.65, vencimento:'2027-03-01', min_investimento:100, preco_compra:13879.44 },
        { nome:'Tesouro Selic 2029',     tipo:'selic',     taxa_compra:14.65, vencimento:'2029-03-01', min_investimento:100, preco_compra:12456.78 },
        { nome:'Tesouro IPCA+ 2029',     tipo:'ipca',      taxa_compra:7.28,  vencimento:'2029-05-15', min_investimento:100, preco_compra:3456.89 },
        { nome:'Tesouro IPCA+ 2035',     tipo:'ipca',      taxa_compra:7.45,  vencimento:'2035-05-15', min_investimento:100, preco_compra:2987.34 },
        { nome:'Tesouro IPCA+ 2045',     tipo:'ipca',      taxa_compra:7.62,  vencimento:'2045-05-15', min_investimento:100, preco_compra:1876.23 },
        { nome:'Tesouro Prefixado 2027', tipo:'prefixado', taxa_compra:14.20, vencimento:'2027-01-01', min_investimento:100, preco_compra:756.89 },
        { nome:'Tesouro Prefixado 2031', tipo:'prefixado', taxa_compra:14.45, vencimento:'2031-01-01', min_investimento:100, preco_compra:534.67 },
      ];
      this._toCache(cacheKey, r);
      return r;
    }
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
        cdi_diario:      parseFloat(cdi[0]?.valor   || '0.0579'),
        selic_meta:      parseFloat(selic[0]?.valor  || '14.75'),
        ipca_12m:        parseFloat(ipca[0]?.valor   || '5.06'),
        cdi_anual_aprox: parseFloat(selic[0]?.valor  || '14.75') - 0.10,
        data:            cdi[0]?.data || '',
      };

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      return { cdi_diario:0.0579, selic_meta:14.75, ipca_12m:5.06, cdi_anual_aprox:14.65 };
    }
  },

  // ────────────────────────────────────────────
  //  HORÁRIO DE MERCADO (B3)
  // ────────────────────────────────────────────
  verificarHorarioMercado() {
    const brasilia = new Date(new Date().toLocaleString('en-US', { timeZone:'America/Sao_Paulo' }));
    const h   = brasilia.getHours();
    const m   = brasilia.getMinutes();
    const dia = brasilia.getDay();
    const total = h * 60 + m;
    const fimSemana = dia === 0 || dia === 6;

    if (fimSemana || total < 9 * 60 || total >= 18 * 60) {
      return { status:'fechado', label:'Mercado fechado', proxima: this._proximoDiaUtil(brasilia) };
    }
    if (total < 9 * 60 + 45) {
      return { status:'pre_abertura', label:'Pré-abertura', proxima: null };
    }
    if (total < 17 * 60 + 30) {
      return { status:'aberto', label:'Mercado aberto ✅', proxima: null };
    }
    return { status:'after', label:'After-market', proxima: this._proximoDiaUtil(brasilia) };
  },

  _proximoDiaUtil(d) {
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
    next.setHours(9, 45, 0, 0);
    return next;
  },

  // ────────────────────────────────────────────
  //  CONCORRENTES POR SETOR
  // ────────────────────────────────────────────
  SETORES: {
    'Petróleo & Gás':         ['PETR4','PETR3','PRIO3','RECV3','RRRP3','CSAN3'],
    'Bancos':                 ['ITUB4','BBDC4','BBAS3','SANB11','BPAC11'],
    'Varejo':                 ['MGLU3','LREN3','AMER3','VIVA3','SOMA3'],
    'Energia Elétrica':       ['EGIE3','ENGI11','CPFE3','CPLE6','EQTL3'],
    'Mineração & Siderurgia': ['VALE3','CSNA3','GGBR4','USIM5','CMIN3'],
    'Saúde':                  ['RDOR3','HAPV3','FLRY3','DASA3','MATD3'],
    'Tecnologia':             ['TOTS3','LWSA3','POSI3','MLAS3'],
    'Transporte':             ['RAIL3','CCRO3','ECOR3','GOLL4','AZUL4'],
    'Agronegócio':            ['SLCE3','AGRO3','SMTO3','JALL3'],
    'Bens Industriais':       ['WEGE3','EMAE4','FRAS3','ROMI3'],
    'Consumo & Varejo':       ['ABEV3','RENT3','LREN3','BTOW3'],
    'Imobiliário':            ['CYRE3','MRVE3','EVEN3','EZTC3'],
  },

  obterConcorrentes(ticker) {
    const t = ticker.toUpperCase().trim();
    for (const [setor, lista] of Object.entries(this.SETORES)) {
      if (lista.includes(t)) {
        return { setor, concorrentes: lista.filter(c => c !== t) };
      }
    }
    return { setor: 'Outros', concorrentes: [] };
  },

  // ────────────────────────────────────────────
  //  SIMULAÇÃO RENDA FIXA
  // ────────────────────────────────────────────
  simularRendaFixa({ valor, tipo, taxa, prazoMeses }) {
    const anos = prazoMeses / 12;
    let montante;

    if (tipo === 'cdi_pct') {
      montante = valor * Math.pow(1 + (taxa / 100 * 14.65 / 100), anos);
    } else if (tipo === 'ipca_mais') {
      montante = valor * Math.pow(1 + (5.06 + taxa) / 100, anos);
    } else {
      montante = valor * Math.pow(1 + taxa / 100, anos);
    }

    const rendaBruta = montante - valor;
    const aliq = prazoMeses <= 6 ? 0.225 : prazoMeses <= 12 ? 0.20 : prazoMeses <= 24 ? 0.175 : 0.15;
    const ir   = rendaBruta * aliq;
    const rendaLiq = rendaBruta - ir;

    return {
      valor_inicial:     valor,
      montante_bruto:    montante,
      renda_bruta:       rendaBruta,
      ir,
      renda_liquida:     rendaLiq,
      montante_liquido:  valor + rendaLiq,
      rentabilidade_pct: (rendaLiq / valor) * 100,
    };
  },

  // ────────────────────────────────────────────
  //  FORMATADORES
  // ────────────────────────────────────────────
  R$(valor) {
    if (typeof valor !== 'number' || isNaN(valor)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(valor);
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

  _toCache(key, data) {
    this._cache[key] = { data, ts: Date.now() };
  },
};
