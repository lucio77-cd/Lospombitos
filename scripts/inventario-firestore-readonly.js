#!/usr/bin/env node
'use strict';

/**
 * Inventário LEGADO SOMENTE DE LEITURA.
 *
 * Não contém chamadas de escrita. Use uma identidade de serviço com
 * permissões de leitura apenas, preferencialmente em um projeto de cópia.
 * Não imprimir documentos, UIDs, nomes, e-mails ou valores individuais.
 *
 * Exemplo:
 *   GOOGLE_APPLICATION_CREDENTIALS=/caminho/credencial-local.json \
 *   node scripts/inventario-firestore-readonly.js \
 *     --project-id ID_EXATO --confirm-project-id ID_EXATO
 *
 * Nunca coloque credenciais no repositório ou no relatório.
 */

const admin = require('firebase-admin');

const COLECOES = {
  usuarios: [
    'saldo_disponivel', 'saldo_investido', 'patrimonio_total',
    'rentabilidade_pct', 'pombcoins', 'perfil_completo', 'data_adesao',
    'data_germina',
  ],
  carteiras: [
    'saldo_disponivel', 'saldo_investido', 'patrimonio_total',
    'posicoes', 'historico_ordens', 'criado_em', 'atualizado_em',
  ],
  ordens: [
    'uid', 'ticker', 'tipo', 'lado', 'quantidade', 'preco', 'total',
    'status', 'data',
  ],
  perfis_publicos: [
    'uid', 'perfil_completo', 'data_adesao', 'data_germina',
  ],
  posts: ['uid', 'tipo', 'data'],
  convites: ['gerado_por', 'usado', 'quem_usou'],
  pagamentos: ['uid', 'status', 'valor', 'data'],
};

function argumentos(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const nome = argv[i];
    if (!nome.startsWith('--')) throw new Error('Argumento inválido.');
    const valor = argv[i + 1];
    if (!valor || valor.startsWith('--')) throw new Error(`Falta valor para ${nome}.`);
    args[nome.slice(2)] = valor;
    i += 1;
  }
  return args;
}

function tipoCampo(valor) {
  if (valor === null) return 'nulo';
  if (Array.isArray(valor)) return 'array';
  if (valor instanceof Date) return 'data';
  if (typeof valor === 'number') return Number.isFinite(valor) ? 'numero' : 'numero_nao_finito';
  if (typeof valor === 'string') return 'texto';
  if (typeof valor === 'boolean') return 'booleano';
  if (valor && typeof valor === 'object' && typeof valor.toDate === 'function') return 'timestamp';
  if (typeof valor === 'object') return 'objeto';
  return typeof valor;
}

function criarResumo(nome) {
  return {
    colecao: nome,
    documentos: 0,
    campos: Object.fromEntries((COLECOES[nome] || []).map(campo => [
      campo,
      { ausente: 0, tipos: {} },
    ])),
    financeiros_negativos: {},
    uid_ausente_ou_divergente: 0,
  };
}

function contarCampo(resumo, doc, campo) {
  const destino = resumo.campos[campo];
  if (!destino) return;
  if (!Object.prototype.hasOwnProperty.call(doc, campo)) {
    destino.ausente += 1;
    return;
  }
  const tipo = tipoCampo(doc[campo]);
  destino.tipos[tipo] = (destino.tipos[tipo] || 0) + 1;
  if (['saldo_disponivel', 'saldo_investido', 'patrimonio_total', 'pombcoins', 'valor'].includes(campo)
      && typeof doc[campo] === 'number' && doc[campo] < 0) {
    resumo.financeiros_negativos[campo] = (resumo.financeiros_negativos[campo] || 0) + 1;
  }
}

async function inventariar(db) {
  const resultado = {
    modo: 'somente_leitura',
    gerado_em_utc: new Date().toISOString(),
    projeto: db.projectId,
    aviso: 'Contagens e tipos agregados; nenhum documento ou valor individual é exibido.',
    colecoes: [],
    falhas: [],
  };

  for (const [nome, campos] of Object.entries(COLECOES)) {
    const resumo = criarResumo(nome);
    try {
      // select limita os campos lidos aos necessários para o inventário.
      // Não usa set/update/create/delete/batch/transaction.
      const snapshot = await db.collection(nome).select(...campos).get();
      resumo.documentos = snapshot.size;
      for (const documento of snapshot.docs) {
        const dados = documento.data();
        for (const campo of campos) contarCampo(resumo, dados, campo);

        if (['ordens', 'posts'].includes(nome)) {
          if (typeof dados.uid !== 'string' || !dados.uid) {
            resumo.uid_ausente_ou_divergente += 1;
          }
        }
        if (nome === 'perfis_publicos' && dados.uid !== documento.id) {
          resumo.uid_ausente_ou_divergente += 1;
        }
      }
      resultado.colecoes.push(resumo);
    } catch (erro) {
      // Não registrar mensagem bruta, que pode conter detalhes do ambiente.
      resultado.falhas.push({ colecao: nome, tipo_erro: erro?.code || 'erro_de_leitura' });
    }
  }

  // Comparação de existência por ID entre usuarios e carteiras, sem emitir IDs.
  try {
    const [usuarios, carteiras] = await Promise.all([
      db.collection('usuarios').select().get(),
      db.collection('carteiras').select().get(),
    ]);
    const idsUsuarios = new Set(usuarios.docs.map(doc => doc.id));
    const idsCarteiras = new Set(carteiras.docs.map(doc => doc.id));
    resultado.cruzamento = {
      usuarios_sem_carteira: usuarios.docs.filter(doc => !idsCarteiras.has(doc.id)).length,
      carteiras_sem_usuario: carteiras.docs.filter(doc => !idsUsuarios.has(doc.id)).length,
      presentes_em_ambas: [...idsUsuarios].filter(id => idsCarteiras.has(id)).length,
      nota: 'Somente contagens; nenhuma lista de IDs é incluída.',
    };
  } catch (erro) {
    resultado.falhas.push({ colecao: 'cruzamento_usuarios_carteiras', tipo_erro: erro?.code || 'erro_de_leitura' });
  }

  return resultado;
}

async function main() {
  let args;
  try {
    args = argumentos(process.argv);
  } catch {
    console.error('Uso: node scripts/inventario-firestore-readonly.js --project-id ID --confirm-project-id ID');
    process.exitCode = 2;
    return;
  }

  const projeto = args['project-id'];
  const confirmacao = args['confirm-project-id'];
  if (!projeto || !confirmacao || projeto !== confirmacao) {
    console.error('Bloqueado: informe --project-id e --confirm-project-id com o mesmo ID exato.');
    process.exitCode = 2;
    return;
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('Bloqueado: FIRESTORE_EMULATOR_HOST está definido; remova-o ou execute uma ferramenta própria para o Emulator.');
    process.exitCode = 2;
    return;
  }

  try {
    const app = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: projeto,
    }, `inventario-readonly-${projeto}`);
    const db = app.firestore();
    const resultado = await inventariar(db);
    console.log(JSON.stringify(resultado, null, 2));
    if (resultado.falhas.length) process.exitCode = 1;
  } catch (erro) {
    console.error('Inventário interrompido. Verifique a identidade de leitura e o Project ID; detalhes omitidos por segurança.');
    process.exitCode = 1;
  } finally {
    try {
      await admin.app(`inventario-readonly-${projeto}`).delete();
    } catch {
      // Não há ação de dados aqui; apenas encerra a conexão do SDK.
    }
  }
}

if (require.main === module) main();

module.exports = { argumentos, tipoCampo, criarResumo, contarCampo, inventariar };
