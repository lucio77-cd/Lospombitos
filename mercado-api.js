// ============================================================
//  mercado-api.js — Dados de Mercado em Tempo Real
//
//  APIs gratuitas sem necessidade de cadastro:
//  - Yahoo Finance (ações B3, FIIs, índices)
//  - CoinGecko (cripto)
//  - Tesouro Direto (API oficial do governo)
//  - BACEN (CDI, SELIC, IPCA)
// ============================================================

const MercadoAPI = {

  PROXY: 'https://corsproxy.io/?',
  _cache: {},
  _cacheTTL: 5 * 60 * 1000,

  // ────────────────────────────────────────────
  //  AÇÕES & FIIs
  // ────────────────────────────────────────────

  async buscarAtivo(ticker) {
    const symbol   = this._formatarSymbol(ticker);
    const cacheKey = `ativo_${symbol}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      const url = `${this.PROXY}${encodeURIComponent(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
      )}`;
      const res  = await fetch(url);
      const data = await res.json();
      const meta = data.chart.result[0].meta;

      const r = {
        ticker,
        symbol,
        nome:           meta.longName || meta.shortName || ticker,
        preco:          meta.regularMarketPrice,
        fechamento_ant: meta.chartPreviousClose,
        variacao:       meta.regularMarketPrice - meta.chartPreviousClose,
        variacao_pct:   ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
        volume:         meta.regularMarketVolume,
        mercado_aberto: meta.marketState === 'REGULAR',
      };

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      console.error(`[API] Erro ${ticker}:`, e);
      return null;
    }
  },

  async buscarDetalhadoAtivo(ticker) {
    const symbol   = this._formatarSymbol(ticker);
    const cacheKey = `detalhe_${symbol}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      const modulos = 'financialData,summaryDetail,defaultKeyStatistics,assetProfile,recommendationTrend';
      const url = `${this.PROXY}${encodeURIComponent(
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=${modulos}`
      )}`;
      const res  = await fetch(url);
      const data = await res.json();
      const d    = data.quoteSummary.result[0];

      const r = {
        // Perfil
        descricao:      d.assetProfile?.longBusinessSummary || '',
        setor:          d.assetProfile?.sector || '',
        industria:      d.assetProfile?.industry || '',
        site:           d.assetProfile?.website || '',
        funcionarios:   d.assetProfile?.fullTimeEmployees || 0,

        // Preço e analistas
        preco:          d.financialData?.currentPrice?.raw || 0,
        alvo_analistas: d.financialData?.targetMeanPrice?.raw || 0,
        recomendacao:   d.financialData?.recommendationKey || '',
        n_analistas:    d.financialData?.numberOfAnalystOpinions?.raw || 0,

        // Fundamentos
        pl:             d.summaryDetail?.trailingPE?.raw || 0,
        pvp:            d.defaultKeyStatistics?.priceToBook?.raw || 0,
        dy:             d.summaryDetail?.dividendYield?.raw ? d.summaryDetail.dividendYield.raw * 100 : 0,
        roe:            d.financialData?.returnOnEquity?.raw ? d.financialData.returnOnEquity.raw * 100 : 0,
        roa:            d.financialData?.returnOnAssets?.raw ? d.financialData.returnOnAssets.raw * 100 : 0,
        margem_lucro:   d.financialData?.profitMargins?.raw ? d.financialData.profitMargins.raw * 100 : 0,
        margem_ebitda:  d.financialData?.ebitdaMargins?.raw ? d.financialData.ebitdaMargins.raw * 100 : 0,
        ev_ebitda:      d.defaultKeyStatistics?.enterpriseToEbitda?.raw || 0,
        market_cap:     d.summaryDetail?.marketCap?.raw || 0,

        // 52 semanas
        max_52s:        d.summaryDetail?.fiftyTwoWeekHigh?.raw || 0,
        min_52s:        d.summaryDetail?.fiftyTwoWeekLow?.raw || 0,
        media_50d:      d.summaryDetail?.fiftyDayAverage?.raw || 0,
        media_200d:     d.summaryDetail?.twoHundredDayAverage?.raw || 0,

        // Volume
        volume:         d.summaryDetail?.volume?.raw || 0,
        volume_medio:   d.summaryDetail?.averageVolume?.raw || 0,

        // Recomendações
        rec_compra:     d.recommendationTrend?.trend?.[0]?.strongBuy + d.recommendationTrend?.trend?.[0]?.buy || 0,
        rec_neutro:     d.recommendationTrend?.trend?.[0]?.hold || 0,
        rec_venda:      d.recommendationTrend?.trend?.[0]?.sell + d.recommendationTrend?.trend?.[0]?.strongSell || 0,
      };

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      console.error(`[API] Erro detalhe ${ticker}:`, e);
      return null;
    }
  },

  async buscarHistorico(ticker, periodo = '1y') {
    const symbol   = this._formatarSymbol(ticker);
    const cacheKey = `hist_${symbol}_${periodo}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    const intervalo = periodo === '5y' ? '1wk' : '1d';

    try {
      const url = `${this.PROXY}${encodeURIComponent(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${intervalo}&range=${periodo}`
      )}`;
      const res    = await fetch(url);
      const data   = await res.json();
      const result = data.chart.result[0];

      const timestamps = result.timestamp || [];
      const closes     = result.indicators.quote[0].close || [];

      const historico = timestamps.map((ts, i) => ({
        data:  new Date(ts * 1000).toLocaleDateString('pt-BR'),
        preco: closes[i] ? parseFloat(closes[i].toFixed(2)) : null,
      })).filter(p => p.preco !== null);

      const primeiro = historico[0]?.preco || 0;
      const ultimo   = historico[historico.length - 1]?.preco || 0;

      const r = {
        historico,
        variacao_periodo: primeiro ? ((ultimo - primeiro) / primeiro) * 100 : 0,
        min_periodo:      Math.min(...historico.map(h => h.preco)),
        max_periodo:      Math.max(...historico.map(h => h.preco)),
        primeiro_preco:   primeiro,
        ultimo_preco:     ultimo,
      };

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      console.error(`[API] Erro histórico ${ticker}:`, e);
      return null;
    }
  },

  async buscarMultiplos(tickers) {
    const symbols  = tickers.map(t => this._formatarSymbol(t)).join(',');
    const cacheKey = `multi_${symbols}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      const url = `${this.PROXY}${encodeURIComponent(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`
      )}`;
      const res    = await fetch(url);
      const data   = await res.json();
      const quotes = data.quoteResponse.result;

      const r = quotes.map(q => ({
        ticker:       q.symbol.replace('.SA', ''),
        nome:         q.shortName || q.longName || q.symbol,
        preco:        q.regularMarketPrice,
        variacao_pct: q.regularMarketChangePercent,
        variacao:     q.regularMarketChange,
        volume:       q.regularMarketVolume,
        market_cap:   q.marketCap,
        pl:           q.trailingPE,
        dy:           q.dividendYield ? q.dividendYield * 100 : 0,
      }));

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      console.error('[API] Erro múltiplos:', e);
      return [];
    }
  },

  async buscarIndices() {
    const mapa = {
      '^BVSP':   'Ibovespa',
      'BRL=X':   'Dólar',
      'EURUSD=X':'Euro',
      'BTC-USD': 'Bitcoin',
      '^DJI':    'Dow Jones',
    };
    try {
      const lista = await this.buscarMultiplos(Object.keys(mapa));
      return lista.map(r => ({ ...r, nome: mapa[r.ticker] || r.nome }));
    } catch(e) { return []; }
  },

  async buscarAutoComplete(query) {
    if (!query || query.length < 2) return [];
    try {
      const url = `${this.PROXY}${encodeURIComponent(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${query}&newsCount=0&listsCount=0`
      )}`;
      const res   = await fetch(url);
      const data  = await res.json();
      return (data.quotes || [])
        .filter(q => q.exchDisp === 'SAO' || q.exchDisp === 'BRE' || q.typeDisp === 'Cryptocurrency')
        .slice(0, 8)
        .map(q => ({
          ticker:   q.symbol.replace('.SA', ''),
          nome:     q.shortname || q.longname || q.symbol,
          tipo:     q.quoteType,
        }));
    } catch(e) { return []; }
  },

  // ────────────────────────────────────────────
  //  CRIPTO — CoinGecko
  // ────────────────────────────────────────────

  async buscarCripto(id) {
    const cacheKey = `cripto_${id}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      const url  = `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`;
      const res  = await fetch(url);
      const data = await res.json();

      const r = {
        id,
        nome:          data.name,
        simbolo:       data.symbol.toUpperCase(),
        preco_brl:     data.market_data.current_price.brl,
        preco_usd:     data.market_data.current_price.usd,
        variacao_24h:  data.market_data.price_change_percentage_24h,
        variacao_7d:   data.market_data.price_change_percentage_7d,
        variacao_30d:  data.market_data.price_change_percentage_30d,
        variacao_1y:   data.market_data.price_change_percentage_1y,
        max_24h:       data.market_data.high_24h.brl,
        min_24h:       data.market_data.low_24h.brl,
        max_historico: data.market_data.ath.brl,
        min_historico: data.market_data.atl.brl,
        market_cap:    data.market_data.market_cap.brl,
        rank:          data.market_cap_rank,
        volume_24h:    data.market_data.total_volume.brl,
        descricao:     data.description?.pt || data.description?.en || '',
      };

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      console.error(`[API] Erro cripto ${id}:`, e);
      return null;
    }
  },

  async listarCriptos(limite = 20) {
    const cacheKey = `criptos_${limite}`;
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      const url  = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=brl&order=market_cap_desc&per_page=${limite}&page=1&price_change_percentage=24h,7d`;
      const res  = await fetch(url);
      const data = await res.json();

      const r = data.map(c => ({
        id:           c.id,
        nome:         c.name,
        simbolo:      c.symbol.toUpperCase(),
        preco:        c.current_price,
        variacao_24h: c.price_change_percentage_24h,
        variacao_7d:  c.price_change_percentage_7d_in_currency,
        market_cap:   c.market_cap,
        volume:       c.total_volume,
        rank:         c.market_cap_rank,
        imagem:       c.image,
      }));

      this._toCache(cacheKey, r);
      return r;
    } catch(e) { return []; }
  },

  // ────────────────────────────────────────────
  //  TESOURO DIRETO
  // ────────────────────────────────────────────

  async buscarTesouroDireto() {
    const cacheKey = 'tesouro';
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      const url  = `${this.PROXY}${encodeURIComponent('https://www.tesourodireto.com.br/json/br/com/b3/tesouro/bond/searchBondsAut.json')}`;
      const res  = await fetch(url);
      const data = await res.json();

      const r = (data.response.TrsrBdTradgList || []).map(t => ({
        nome:             t.TrsrBd.nm,
        vencimento:       t.TrsrBd.mtrtyDt,
        taxa_compra:      t.TrsrBd.anulInvstmtRate,
        taxa_venda:       t.TrsrBd.anulRedRate,
        preco_compra:     t.TrsrBd.untrInvstmtVal,
        min_investimento: t.TrsrBd.minInvstmtAmt,
        tipo:             this._tipoTesouro(t.TrsrBd.nm),
      }));

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      return [
        { nome:'Tesouro Selic 2027',     tipo:'selic',     taxa_compra:13.65, vencimento:'2027-03-01', min_investimento:100 },
        { nome:'Tesouro IPCA+ 2029',     tipo:'ipca',      taxa_compra:6.89,  vencimento:'2029-05-15', min_investimento:100 },
        { nome:'Tesouro Prefixado 2027', tipo:'prefixado', taxa_compra:13.45, vencimento:'2027-01-01', min_investimento:100 },
        { nome:'Tesouro IPCA+ 2035',     tipo:'ipca',      taxa_compra:7.12,  vencimento:'2035-05-15', min_investimento:100 },
      ];
    }
  },

  _tipoTesouro(nome) {
    if (nome.includes('Selic'))     return 'selic';
    if (nome.includes('IPCA'))      return 'ipca';
    if (nome.includes('Prefixado')) return 'prefixado';
    return 'outro';
  },

  // ────────────────────────────────────────────
  //  BACEN — CDI, SELIC, IPCA
  // ────────────────────────────────────────────

  async buscarTaxasBacen() {
    const cacheKey = 'bacen';
    if (this._fromCache(cacheKey)) return this._fromCache(cacheKey);

    try {
      const [cdi, selic, ipca] = await Promise.all([
        fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json').then(r => r.json()),
        fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json').then(r => r.json()),
        fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/1?formato=json').then(r => r.json()),
      ]);

      const r = {
        cdi_diario:      parseFloat(cdi[0]?.valor || '0'),
        selic_meta:      parseFloat(selic[0]?.valor || '0'),
        ipca_12m:        parseFloat(ipca[0]?.valor || '0'),
        cdi_anual_aprox: parseFloat(selic[0]?.valor || '13.75') - 0.1,
        data:            cdi[0]?.data || '',
      };

      this._toCache(cacheKey, r);
      return r;
    } catch(e) {
      return { cdi_anual_aprox:13.65, selic_meta:13.75, ipca_12m:4.83 };
    }
  },

  // ────────────────────────────────────────────
  //  HORÁRIO DE MERCADO
  // ────────────────────────────────────────────

  verificarHorarioMercado() {
    const brasilia  = new Date(new Date().toLocaleString('en-US', { timeZone:'America/Sao_Paulo' }));
    const hora      = brasilia.getHours();
    const minuto    = brasilia.getMinutes();
    const dia       = brasilia.getDay();
    const total     = hora * 60 + minuto;
    const fimSemana = dia === 0 || dia === 6;

    if (fimSemana || total < 9*60 || total >= 18*60) {
      return { status:'fechado',      label:'Mercado fechado',   proxima: this._proximoDiaUtil(brasilia) };
    }
    if (total >= 9*60 && total < 9*60+45) {
      return { status:'pre_abertura', label:'Pré-abertura',      proxima: null };
    }
    if (total >= 9*60+45 && total < 17*60+30) {
      return { status:'aberto',       label:'Mercado aberto ✅', proxima: null };
    }
    return { status:'after',          label:'After-market',      proxima: this._proximoDiaUtil(brasilia) };
  },

  _proximoDiaUtil(d) {
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
    next.setHours(9, 45, 0, 0);
    return next;
  },

  // ────────────────────────────────────────────
  //  CONCORRENTES B3 por setor
  // ────────────────────────────────────────────

  SETORES: {
    'Petróleo & Gás':        ['PETR4','PETR3','PRIO3','RECV3','RRRP3','CSAN3'],
    'Bancos':                ['ITUB4','BBDC4','BBAS3','SANB11','BPAC11'],
    'Varejo':                ['MGLU3','LREN3','AMER3','VIVA3','SOMA3'],
    'Energia Elétrica':      ['EGIE3','ENGI11','CPFE3','CPLE6','EQTL3'],
    'Mineração & Siderurgia':['VALE3','CSNA3','GGBR4','USIM5','CMIN3'],
    'Saúde':                 ['RDOR3','HAPV3','FLRY3','DASA3','MATD3'],
    'Tecnologia':            ['TOTVS3','LWSA3','POSI3','MLAS3'],
    'Transporte':            ['RAIL3','CCRO3','ECOR3','GOLL4','AZUL4'],
    'Agronegócio':           ['SLCE3','AGRO3','SMTO3','JALL3'],
    'Imobiliário':           ['CYRE3','MRVE3','EVEN3','EZTC3'],
  },

  obterConcorrentes(ticker) {
    const t = ticker.toUpperCase();
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

    if      (tipo === 'cdi_pct')    montante = valor * Math.pow(1 + (taxa/100 * 13.65/100), anos);
    else if (tipo === 'ipca_mais')  montante = valor * Math.pow(1 + (4.83 + taxa) / 100, anos);
    else                            montante = valor * Math.pow(1 + taxa / 100, anos);

    const rendaBruta  = montante - valor;
    const aliquotaIR  = prazoMeses <= 6 ? 0.225 : prazoMeses <= 12 ? 0.20 : prazoMeses <= 24 ? 0.175 : 0.15;
    const ir          = rendaBruta * aliquotaIR;
    const rendaLiq    = rendaBruta - ir;

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
    return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(valor);
  },

  pct(valor, casas = 2) {
    return `${valor >= 0 ? '+' : ''}${valor.toFixed(casas)}%`;
  },

  bigNum(valor) {
    if (valor >= 1e12) return `R$ ${(valor/1e12).toFixed(2)}T`;
    if (valor >= 1e9)  return `R$ ${(valor/1e9).toFixed(2)}B`;
    if (valor >= 1e6)  return `R$ ${(valor/1e6).toFixed(2)}M`;
    return this.R$(valor);
  },

  // ────────────────────────────────────────────
  //  CACHE
  // ────────────────────────────────────────────

  _formatarSymbol(ticker) {
    const t = ticker.toUpperCase().trim();
    if (t.includes('.') || t.startsWith('^') || t.endsWith('-USD') || t.endsWith('=X')) return t;
    if (/^[A-Z]{4}\d{1,2}$/.test(t)) return `${t}.SA`;
    return t;
  },

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

