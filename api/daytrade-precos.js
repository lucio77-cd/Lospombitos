// ============================================================
//  api/daytrade-precos.js — Preço ao vivo pro Game Estudo
// ============================================================

module.exports = async (req, res) => {
  try {
    // require() feito AQUI DENTRO (não no topo do arquivo) — se o módulo
    // não for encontrado por qualquer motivo (nome errado, arquivo faltando,
    // etc.), isso agora vira um JSON de erro legível em vez de uma tela de
    // crash genérica da Vercel.
    const { precosTodos } = require('./_lib/precosCripto');
    const precos = await precosTodos();
    res.status(200).json({ precos, timestamp: Date.now() });
  } catch (e) {
    console.error('[api/daytrade-precos]', e.message);
    res.status(500).json({ error: 'Erro ao buscar preços: ' + e.message });
  }
};
