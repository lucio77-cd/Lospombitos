// ============================================================
//  etl/05-seed-etapas.js
//
//  Popula a coleção `etapas` com as 8 fases do jogo (design já
//  fechado na conversa). Roda 1x (usa set com ID determinístico,
//  seguro rodar de novo pra atualizar texto/prêmio sem duplicar).
//
//  Rodar: node etl/05-seed-etapas.js
// ============================================================

const { getDb, admin } = require('./lib/firebaseAdmin');

const ETAPAS = [
  {
    id: 'e1-primeiros-passos',
    ordem: 1,
    nome: 'Primeiros Passos',
    descricao: 'Um período tranquilo pra aprender a comprar, vender e avançar o tempo. Sem pressão — o objetivo aqui é se acostumar com o jogo.',
    data_inicio_simulada: '2015-01-01',
    data_fim_simulada:    '2015-03-31',
    meta_tipo: 'retorno_pct',
    meta_valor: 0, // termina com qualquer lucro (>= 0%)
    premio: { pombcoins: 5000, badge: 'Pombito Iniciante', titulo: null },
  },
  {
    id: 'e2-a-recessao',
    ordem: 2,
    nome: 'A Recessão',
    descricao: 'O Brasil entra em recessão. Juros disparam, confiança despenca. Sobreviver aqui é mais importante que crescer.',
    data_inicio_simulada: '2015-01-01',
    data_fim_simulada:    '2016-06-30',
    meta_tipo: 'perda_maxima',
    meta_valor: 25, // não pode perder mais que 25% do patrimônio
    premio: { pombcoins: 8000, badge: 'Sobrevivente', titulo: 'Cabeça Fria' },
  },
  {
    id: 'e3-ano-de-eleicao',
    ordem: 3,
    nome: 'Ano de Eleição',
    descricao: 'Volatilidade política cria oportunidade. Quem só segura e reza empata com o índice — quem lê o cenário supera.',
    data_inicio_simulada: '2018-01-01',
    data_fim_simulada:    '2018-12-31',
    meta_tipo: 'bater_ibovespa',
    meta_valor: 0, // retorno > retorno do Ibovespa no mesmo período
    premio: { pombcoins: 15000, badge: null, titulo: null },
  },
  {
    id: 'e4-o-crash',
    ordem: 4,
    nome: 'O Crash',
    descricao: 'Fevereiro de 2020. O mercado despenca ~40% em semanas. Curta e violenta — a lição aqui é timing de proteção.',
    data_inicio_simulada: '2020-02-01',
    data_fim_simulada:    '2020-04-30',
    meta_tipo: 'perda_maxima',
    meta_valor: 10, // meta agressiva: não perder mais que 10% num crash de -40%
    premio: { pombcoins: 10000, badge: 'Sobrevivi ao Crash', titulo: 'Nervos de Aço' },
  },
  {
    id: 'e5-a-recuperacao',
    ordem: 5,
    nome: 'A Recuperação',
    descricao: 'O mercado sobe forte pós-crash. Reconhecer a hora de crescer agressivo, não só defender.',
    data_inicio_simulada: '2020-05-01',
    data_fim_simulada:    '2021-12-31',
    meta_tipo: 'retorno_pct',
    meta_valor: 80,
    premio: { pombcoins: 25000, badge: null, titulo: null },
  },
  {
    id: 'e6-juro-alto',
    ordem: 6,
    nome: 'Juro Alto',
    descricao: 'Ações de crescimento sofrem, setores defensivos performam melhor. A lição é rotação setorial.',
    data_inicio_simulada: '2022-01-01',
    data_fim_simulada:    '2022-12-31',
    meta_tipo: 'bater_ibovespa',
    meta_valor: 0,
    premio: { pombcoins: 15000, badge: null, titulo: 'Estrategista' },
  },
  {
    id: 'e7-a-virada',
    ordem: 7,
    nome: 'A Virada',
    descricao: 'A etapa final da progressão — bater um retorno forte E superar o índice, ao mesmo tempo.',
    data_inicio_simulada: '2023-01-01',
    data_fim_simulada:    '2024-12-31',
    meta_tipo: 'retorno_pct_e_bater_ibovespa',
    meta_valor: 50,
    premio: { pombcoins: 50000, badge: 'Lenda de Los Pombitos', titulo: 'Mestre Investidor' },
  },
  {
    id: 'e8-modo-livre',
    ordem: 8,
    nome: 'Modo Livre',
    descricao: 'Os 10 anos inteiros, sem meta fixa. Escolha seu início e fim, e jogue pelo ranking geral.',
    data_inicio_simulada: '2015-01-01',
    data_fim_simulada:    '2025-12-31',
    meta_tipo: 'livre',
    meta_valor: null,
    premio: null,
    requer_etapas_concluidas: ['e1-primeiros-passos','e2-a-recessao','e3-ano-de-eleicao','e4-o-crash','e5-a-recuperacao','e6-juro-alto','e7-a-virada'],
  },
];

async function main() {
  const db = getDb();

  for (const etapa of ETAPAS) {
    const { id, ...dados } = etapa;
    await db.collection('etapas').doc(id).set({
      ...dados,
      atualizado_em: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`[seed-etapas] ${id}: ok`);
  }

  console.log(`[seed-etapas] Concluído — ${ETAPAS.length} etapas gravadas.`);
}

main().catch(e => {
  console.error('[seed-etapas] Erro fatal:', e);
  process.exit(1);
});
