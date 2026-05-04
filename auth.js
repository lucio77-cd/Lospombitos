// auth.js
// Configuração global do Firebase
var firebaseConfig = {
  apiKey: "AIzaSyDuAp97sXt63-JKeRRVpT6AYhGqWjrDb-s",
  authDomain: "los-pombitos.firebaseapp.com",
  projectId: "los-pombitos",
  storageBucket: "los-pombitos.firebasestorage.app",
  messagingSenderId: "760554231943",
  appId: "1:760554231943:web:e84acedd43eeb32a678022",
  measurementId: "G-3YL5YL7MKK"
};

// Inicializa o Firebase apenas se não houver um app ativo
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Atalhos globais para facilitar o uso nos outros arquivos
const db = firebase.firestore();
const auth = firebase.auth();

/**
 * FUNÇÃO 1: Usada no invite.html logo após o login do Google
 */
async function finalizarCadastroPombito(user, codigoUsado) {
    try {
        console.log("Criando registro inicial para:", user.uid);
        await db.collection("usuarios").doc(user.uid).set({
            uid: user.uid,
            nome: user.displayName || "Pombino Anonimo",
            email: user.email,
            status: "Membro Alpha",
            convites_restantes: 3,
            perfil_completo: false,
            pombcoins: 10,
            data_adesao: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log("Registro inicial OK! Redirecionando para setup...");
        window.location.href = "setup-perfil.html";
    } catch (error) {
        console.error("Erro ao salvar no Firestore:", error);
        alert("Erro de permissão no banco: " + error.message);
    }
}

/**
 * FUNÇÃO 2: Usada no setup-perfil.html
 */
async function germinarEsalvarPombito(dadosFicha, user) {
    try {
        console.log("Germinando perfil para:", user.uid);
        
        // NOVO CÓDIGO DE AVATAR APLICADO AQUI:
        const pombitoUrl = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${user.uid}&primaryColor=607d8b`;
        
        // Atualiza o documento com os novos dados da ficha
        await db.collection("usuarios").doc(user.uid).set({
            ...dadosFicha,
            foto_perfil: pombitoUrl,
            perfil_completo: true,
            data_germina: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return true;
    } catch (e) {
        console.error("Erro técnico no Firestore:", e);
        return false;
    }
}

// Função para deslogar da Ordem
async function sairDaOrdem() {
    try {
        const confirmacao = confirm("Deseja realmente sair do Ninho?");
        if (confirmacao) {
            await firebase.auth().signOut();
            window.location.href = "invite.html";
        }
    } catch (error) {
        console.error("Erro ao sair:", error);
        alert("A maré está agitada e não permitiu sua saída.");
    }
}
