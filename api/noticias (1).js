// ============================================================
//  api/_lib/noticias.js — Manchetes recentes via Google News RSS
//
//  Sem chave, sem API oficial — Google News expõe um feed RSS
//  público pra qualquer busca. Não tem SLA nem documentação
//  oficial (é um formato estável há anos, mas pode mudar sem
//  aviso). Retorna título, fonte e data de cada manchete.
// ============================================================

function extrairTag(bloco, tag) {
  const m = bloco.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  return m[1]
    .replace('<![CDATA[', '').replace(']]>', '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

async function buscarNoticias(query, maxItens = 8) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-BR`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SoldoBot/1.0)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Google News RSS HTTP ${res.status}`);
  const xml = await res.text();

  const itens = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return itens.slice(0, maxItens).map((bloco) => ({
    titulo: extrairTag(bloco, 'title'),
    fonte: extrairTag(bloco, 'source'),
    data: extrairTag(bloco, 'pubDate'),
    link: extrairTag(bloco, 'link'),
  })).filter((n) => n.titulo);
}

module.exports = { buscarNoticias };
