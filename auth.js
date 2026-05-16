// ============================================================
//  LOS POMBITOS — auth.js  (versão corrigida e segura)
//  Rede social + Simuladora de Corretora
//  Comunidade fechada por convite · Capital inicial R$ 500.000
// ============================================================

// ----------------------------------------------------------
// 1. CONFIGURAÇÃO DO FIREBASE
//    ⚠️  Em produção mova estas chaves para variáveis de
//    ambiente (ex: Firebase Hosting env ou um backend).
//    Nunca suba em repositório público sem Security Rules.
// ----------------------------------------------------------
var firebaseConfig = {
  apiKey: "AIzaSyDuAp97sXt63-JKeRRVpT6AYhGqWjrDb-s",
  authDomain: "los-pombitos.firebaseapp.com",
  projectId: "los-pombitos",
  storageBucket: "los-pombitos.firebasestorage.app",
  messagingSenderId: "760554231943",
  appId: "1:760554231943:web:e84acedd43eeb32a678022",
  measurementId: "G-3YL5YL7MKK"
};

// ----------------------------------------------------------
// 2. INICIALIZAÇÃO (guard para evitar duplo init)
// ----------------------------------------------------------
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db   = firebase.firestore();
const auth = firebase.auth();

// ----------------------------------------------------------
// 3. VERIFICAÇÃO DE SESSÃO ATIVA
//    Páginas permitidas por perfil:
//    - Sem sessão        → apenas index.html e invite.html
//    - Perfil completo   → feed, investir, carteira, relatorio, ordem
//    - Perfil incompleto → apenas setup-perfil.html
// ----------------------------------------------------------

const PAGINAS_PUBLICAS = ["index.html", "invite.html", "", "/"];
const PAGINAS_MEMBRO   = [
  "feed.html", "investir.html", "carteira.html",
  "relatorio.html", "ordem.html", "setup-perfil.html"
];

auth.onAuthStateChanged(async (user) => {
  const paginaAtual = window.location.pathname.split("/").pop() || "index.html";

  if (!user) {
    // Sem sessão: redireciona para invite se tentar acessar página protegida
    if (!PAGINAS_PUBLICAS.includes(paginaAtual)) {
      window.location.href = "invite.html";
    }
    return;
  }

  // Tem sessão: verifica perfil no Firestore
  try {
    const snap = await db.collection("usuarios").doc(user.uid).get();

    if (snap.exists && snap.data().perfil_completo === true) {
      // Membro completo — pode acessar feed, praia e galeria livremente
      // Se estiver em página pública, manda pro feed
      if (PAGINAS_PUBLICAS.includes(paginaAtual)) {
        window.location.href = "feed.html";
      }
      // Nas páginas de membro não redireciona — deixa carregar normalmente
    } else {
      // Perfil incompleto → só pode estar no setup
      if (paginaAtual !== "setup-perfil.html") {
        window.location.href = "setup-perfil.html";
      }
    }
  } catch (e) {
    console.error("Erro ao verificar sessão:", e);
  }
});

// ----------------------------------------------------------
// 4. UTILITÁRIOS DE UI
//    Substitui alert() por mensagens inline na tela.
// ----------------------------------------------------------

/**
 * Exibe uma mensagem de feedback no elemento #msg-feedback.
 * @param {string} texto  - Mensagem a exibir
 * @param {"erro"|"ok"|"info"} tipo - Estilo visual
 */
function exibirMensagem(texto, tipo = "info") {
  const el = document.getElementById("msg-feedback");
  if (!el) return; // fallback silencioso se o elemento não existir
  el.textContent = texto;
  el.className = `msg-feedback msg-${tipo}`;
  el.style.display = "block";
}

/**
 * Alterna o estado do botão principal da tela.
 * @param {boolean} carregando
 * @param {string}  textoPadrao - Texto quando não está carregando
 */
function setBotaoCarregando(carregando, textoPadrao = "Entrar") {
  const btn = document.getElementById("btn-principal");
  if (!btn) return;
  btn.disabled = carregando;
  btn.textContent = carregando ? "Germinando..." : textoPadrao;
}

// ----------------------------------------------------------
// 5. GERADOR DE CÓDIGO ÚNICO
//    6 caracteres aleatórios + verificação de colisão.
// ----------------------------------------------------------
async function gerarCodigoUnico() {
  const MAX_TENTATIVAS = 10;

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
    const sufixo = Math.random().toString(36).substring(2, 8).toUpperCase();
    const codigo = `POMB-${sufixo}`;

    const snap = await db.collection("convites").doc(codigo).get();
    if (!snap.exists) {
      return codigo; // código disponível ✅
    }
  }

  throw new Error("Não foi possível gerar um código único. Tente novamente.");
}

// ----------------------------------------------------------
// 6. CADASTRO DE NOVOS MEMBROS
//    Cria os 3 códigos do novo membro em lote (batch).
// ----------------------------------------------------------
async function criarCodigos(uid) {
  const batch  = db.batch();
  const codigos = [];

  for (let i = 0; i < 3; i++) {
    const codigo  = await gerarCodigoUnico();
    const docRef  = db.collection("convites").doc(codigo);

    batch.set(docRef, {
      gerado_por:   uid,
      usado:        false,
      data_criacao: firebase.firestore.FieldValue.serverTimestamp()
    });

    codigos.push(codigo);
  }

  await batch.commit();
  return codigos;
}

// ----------------------------------------------------------
// 7. FLUXO PRINCIPAL: VALIDAR CONVITE → LOGIN GOOGLE → CADASTRO
//
//    ORDEM CORRETA:
//    1. Valida o código no Firestore (sem logar ninguém ainda)
//    2. Abre o Google para o usuário criar/usar a conta dele
//    3. Verifica se essa conta Google já é membro (acesso direto)
//    4. Consome o código atomicamente e salva o novo membro
//
//    O código SÓ é marcado como usado depois que a conta
//    Google foi criada com sucesso.
// ----------------------------------------------------------
async function validarEEntrar() {
  const input = document.getElementById("input-convite");
  if (!input) return;

  const codigoInput = input.value.trim().toUpperCase();

  if (!codigoInput) {
    exibirMensagem("Insira um código de convite válido.", "erro");
    return;
  }

  setBotaoCarregando(true, "Entrar");

  // ── PASSO 1: Validar o código ANTES de qualquer login
  //    O usuário ainda não está logado aqui.
  exibirMensagem("Verificando sua semente...", "info");

  try {
    const conviteRef  = db.collection("convites").doc(codigoInput);
    const conviteSnap = await conviteRef.get();

    if (!conviteSnap.exists) {
      exibirMensagem("Este código não existe na linhagem.", "erro");
      setBotaoCarregando(false, "Entrar");
      return;
    }

    if (conviteSnap.data().usado === true) {
      exibirMensagem("Este código já foi utilizado por outro Pombito.", "erro");
      setBotaoCarregando(false, "Entrar");
      return;
    }
  } catch (e) {
    console.error("Erro ao verificar convite:", e);
    exibirMensagem("Erro ao verificar o código. Tente novamente.", "erro");
    setBotaoCarregando(false, "Entrar");
    return;
  }

  // ── PASSO 2: Código válido! Agora abre o Google para criar a conta
  exibirMensagem("Código válido! Conectando com o Google...", "info");

  let user;
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    // Força o Google a mostrar a tela de escolha de conta sempre
    provider.setCustomParameters({ prompt: "select_account" });

    const resultado = await auth.signInWithPopup(provider);
    user = resultado.user;

  } catch (e) {
    setBotaoCarregando(false, "Entrar");
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") {
      exibirMensagem("Login cancelado. Seu código continua válido, tente novamente.", "info");
    } else {
      exibirMensagem("Erro no Google: " + e.message, "erro");
    }
    return;
  }

  // ── PASSO 3: Conta Google criada — verificar se já é membro
  //    Se já tem perfil completo, vai direto ao feed (sem consumir código).
  try {
    const usuarioSnap = await db.collection("usuarios").doc(user.uid).get();
    if (usuarioSnap.exists && usuarioSnap.data().perfil_completo === true) {
      exibirMensagem("Bem-vindo de volta, Pombito! 🪶", "ok");
      window.location.href = "feed.html";
      return;
    }
  } catch (e) {
    console.error("Erro ao verificar membro existente:", e);
  }

  // ── PASSO 4: Conta nova confirmada — agora consome o código atomicamente
  //    Só chegamos aqui se:
  //    - o código era válido (passo 1)
  //    - a conta Google foi criada (passo 2)
  //    - o usuário não era membro (passo 3)
  try {
    exibirMensagem("Registrando na linhagem...", "info");

    await db.runTransaction(async (transaction) => {
      const conviteRef  = db.collection("convites").doc(codigoInput);
      const conviteSnap = await transaction.get(conviteRef);

      // Verifica de novo dentro da transação — proteção contra race condition
      if (!conviteSnap.exists || conviteSnap.data().usado === true) {
        throw new Error("Este código foi usado por outra pessoa agora mesmo. Peça um novo convite.");
      }

      // Marca como usado atomicamente — só agora, após conta criada
      transaction.update(conviteRef, {
        usado:     true,
        quem_usou: user.uid,
        data_uso:  firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    // ── PASSO 5: Salvar o novo membro e gerar seus 3 códigos
    await finalizarCadastroPombito(user);

  } catch (e) {
    console.error("Erro ao registrar na linhagem:", e);
    exibirMensagem(e.message || "Erro inesperado. Tente novamente.", "erro");
    // Desloga para não deixar o usuário num estado inconsistente
    await auth.signOut();
    setBotaoCarregando(false, "Entrar");
  }
}

// ----------------------------------------------------------
// 8. FINALIZAR CADASTRO DO NOVO POMBITO
//    Salva dados iniciais + gera os 3 novos códigos do membro.
// ----------------------------------------------------------
async function finalizarCadastroPombito(user) {
  try {
    const docRef  = db.collection("usuarios").doc(user.uid);
    const docSnap = await docRef.get();

    // Se perfil já existia e estava completo, vai direto ao feed
    if (docSnap.exists && docSnap.data().perfil_completo === true) {
      window.location.href = "feed.html";
      return;
    }

    exibirMensagem("Gerando seus códigos de convite...", "info");

    // Gera os 3 códigos exclusivos deste membro
    const novosCodigos = await criarCodigos(user.uid);

    // Salva dados iniciais do membro (sem sobrescrever campos existentes)
    await docRef.set({
      uid:                user.uid,
      nome:               user.displayName || "Pombito",
      email:              user.email,
      foto_google:        user.photoURL || null,
      meus_codigos:       novosCodigos,
      // Capital inicial da corretora simulada
      saldo_disponivel:   500000.00,
      saldo_investido:    0,
      patrimonio_total:   500000.00,
      rentabilidade_pct:  0,
      // Perfil de investidor (preenchido no setup)
      perfil_investidor:  null,
      // Controle
      perfil_completo:    false,
      data_adesao:        firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    window.location.href = "setup-perfil.html";

  } catch (e) {
    console.error("Erro ao finalizar cadastro:", e);
    // Propaga o erro para quem chamou tratar
    throw e;
  }
}

// ----------------------------------------------------------
// 9. COMPLETAR PERFIL (setup-perfil.html)
//    Chamada quando o usuário salva username + foto.
// ----------------------------------------------------------
async function germinarEsalvarPombito(dadosFicha) {
  const user = auth.currentUser;

  if (!user) {
    exibirMensagem("Sessão expirada. Faça login novamente.", "erro");
    window.location.href = "invite.html";
    return false;
  }

  setBotaoCarregando(true, "Salvar");
  exibirMensagem("Salvando seu perfil...", "info");

  try {
    const fotoPadrao = `https://api.dicebear.com/7.x/identicon/svg?seed=${user.uid}`;
    const fotoFinal  = user.photoURL || fotoPadrao;

    await db.collection("usuarios").doc(user.uid).set({
      ...dadosFicha,
      foto_perfil:     fotoFinal,
      perfil_completo: true,
      data_germina:    firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Cria carteira no Firestore se não existir
    const carteiraRef = db.collection("carteiras").doc(user.uid);
    const carteiraSnap = await carteiraRef.get();
    if (!carteiraSnap.exists) {
      await carteiraRef.set({
        uid:              user.uid,
        saldo_disponivel: 500000.00,
        saldo_investido:  0,
        patrimonio_total: 500000.00,
        posicoes:         [],
        historico_ordens: [],
        criada_em:        firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    window.location.href = "feed.html";
    return true;

  } catch (e) {
    console.error("Erro ao salvar perfil:", e);
    exibirMensagem("Não foi possível salvar o perfil: " + e.message, "erro");
    setBotaoCarregando(false, "Salvar");
    return false;
  }
}

// ----------------------------------------------------------
// 10. LOGOUT
// ----------------------------------------------------------
async function sairDaOrdem() {
  const confirmou = confirm("Deseja realmente sair do Ninho?");
  if (!confirmou) return;

  try {
    await auth.signOut();
    // Redireciona para login (invite.html), não para setup
    window.location.href = "invite.html";
  } catch (e) {
    console.error("Erro ao sair:", e);
    exibirMensagem("Erro ao sair. Tente novamente.", "erro");
  }
}

// ----------------------------------------------------------
// 11. CARREGAR DADOS DO USUÁRIO LOGADO (uso no feed/perfil)
//    Retorna os dados do Firestore ou null se não logado.
// ----------------------------------------------------------
async function obterDadosMembro() {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    const snap = await db.collection("usuarios").doc(user.uid).get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    console.error("Erro ao obter dados do membro:", e);
    return null;
  }
}
