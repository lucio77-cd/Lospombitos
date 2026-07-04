// ============================================================
//  api/daytrade-precos.js — Preço ao vivo pro Game Estudo
// ============================================================

const { precosTodos } = require('./lib/precosCripto');

module.exports = async (req, res) => {
  try {
    const precos = await precosTodos();
    res.status(200).json({ precos, timestamp: Date.now() });
  } catch (e) {
    console.error('[api/daytrade-precos]', e.message);
    res.status(500).json({ error: 'Erro ao buscar preços: ' + e.message });
  }
};
