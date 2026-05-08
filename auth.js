// ============================================================
//  LOS POMBITOS — auth.js  (versão corrigida e segura)
//  Comunidade fechada: só entra quem recebe um código POMB-XXXXX
//  Cada membro ganha 3 códigos para convidar quem quiser
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
//    Roda ao carregar qualquer página.
//    Usuário já logado com perfil completo → feed.
//    Usuário logado sem perfil → setup.
//    Usuário sem sessão → fica na tela de convite.
// ----------------------------------------------------------
auth.onAuthStateChanged(async (user) => {
  const paginaAtual = window.location.pathname.split("/").pop();

  if (!user) {
    // Sem sessão: só pode estar em invite.html
    if (paginaAtual !== "invite.html") {
      window.location.href = "invite.html";
    }
    return;
  }

  // Tem sessão: verifica perfil no Firestore
  try {
    const snap = await db.collection("usuarios").doc(user.uid).get();

    if (snap.exists && snap.data().perfil_completo === true) {
      // Membro completo → feed (a não ser que já esteja lá)
      if (paginaAtual !== "feed.html") {
        window.location.href = "feed.html";
      }
    } else {
      // Logado mas sem perfil completo → setup
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
// 7. FLUXO PRINCIPAL: VALIDAR CONVITE → LOGIN → CADASTRO
//    Chamado pelo botão na invite.html.
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
  exibirMensagem("Verificando sua semente...", "info");

  let resultadoLogin;

  try {
    // ── PASSO 1: Login com Google ANTES da transação
    //    (signInWithPopup não pode rodar dentro de uma transação Firestore)
    const provider = new firebase.auth.GoogleAuthProvider();
    resultadoLogin = await auth.signInWithPopup(provider);

  } catch (e) {
    // Usuário fechou o popup ou erro no Google
    setBotaoCarregando(false, "Entrar");
    if (e.code === "auth/popup-closed-by-user") {
      exibirMensagem("Login cancelado. Tente novamente.", "info");
    } else {
      exibirMensagem("Erro no login: " + e.message, "erro");
    }
    return;
  }

  const user = resultadoLogin.user;

  try {
    // ── PASSO 2: Verificar se usuário já é membro
    const usuarioSnap = await db.collection("usuarios").doc(user.uid).get();
    if (usuarioSnap.exists && usuarioSnap.data().perfil_completo === true) {
      // Já é membro, não precisa de convite
      window.location.href = "feed.html";
      return;
    }

    // ── PASSO 3: Transação atômica para consumir o convite
    //    Garante que dois usuários não usem o mesmo código ao mesmo tempo.
    await db.runTransaction(async (transaction) => {
      const conviteRef  = db.collection("convites").doc(codigoInput);
      const conviteSnap = await transaction.get(conviteRef);

      if (!conviteSnap.exists) {
        throw new Error("Este código não existe na linhagem.");
      }

      const dados = conviteSnap.data();

      if (dados.usado) {
        throw new Error("Este código já foi utilizado por outro Pombito.");
      }

      // Marca como usado atomicamente
      transaction.update(conviteRef, {
        usado:      true,
        quem_usou: user.uid,
        data_uso:  firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    // ── PASSO 4: Criar documento do novo membro + seus 3 códigos
    await finalizarCadastroPombito(user);

  } catch (e) {
    console.error("Erro na entrada:", e);
    exibirMensagem(e.message || "Erro inesperado. Tente novamente.", "erro");
    // Faz logout para não deixar o usuário logado sem ter passado pelo convite
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
      uid:             user.uid,
      nome:            user.displayName || "Pombito",
      email:           user.email,
      foto_google:     user.photoURL || null,
      meus_codigos:    novosCodigos,
      pombcoins:       10,
      perfil_completo: false,
      data_adesao:     firebase.firestore.FieldValue.serverTimestamp()
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

