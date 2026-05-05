// auth.js - O Cérebro da Ordem

// 1. CONFIGURAÇÃO (Sempre no topo)
var firebaseConfig = {
  apiKey: "AIzaSyDuAp97sXt63-JKeRRVpT6AYhGqWjrDb-s",
  authDomain: "los-pombitos.firebaseapp.com",
  projectId: "los-pombitos",
  storageBucket: "los-pombitos.firebasestorage.app",
  messagingSenderId: "760554231943",
  appId: "1:760554231943:web:e84acedd43eeb32a678022",
  measurementId: "G-3YL5YL7MKK"
};

// 2. INICIALIZAÇÃO IMEDIATA
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const auth = firebase.auth();

/**
 * FUNÇÃO: finalizarCadastroPombito
 * Aplica a lógica de linhagem: Gera 3 códigos únicos para cada novo membro.
 */
async function finalizarCadastroPombito(user) {
    try {
        const docRef = db.collection("usuarios").doc(user.uid);
        const docSnap = await docRef.get();

        // Se já for veterano (perfil completo), vai direto para o feed
        if (docSnap.exists && docSnap.data().perfil_completo === true) {
            window.location.href = "feed.html";
            return;
        }

        console.log("Gerando a linhagem: 3 sementes únicas...");
        const novosCodigos = [];
        
        for (let i = 0; i < 3; i++) {
            // Gera um código aleatório (ex: POMB-X8R2)
            const randomId = Math.random().toString(36).substring(2, 6).toUpperCase();
            const codigo = `POMB-${randomId}`;
            novosCodigos.push(codigo);

            // Salva na coleção mestre de convites para que outros possam usar para entrar
            await db.collection("convites").doc(codigo).set({
                gerado_por: user.uid,
                usado: false,
                data_criacao: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        // Salva os dados iniciais no perfil do usuário
        await docRef.set({
            uid: user.uid,
            nome: user.displayName || "Novo Pombito",
            email: user.email,
            meus_codigos: novosCodigos, // Os 3 códigos que aparecerão no feed
            pombcoins: 10,               // Saldo inicial bônus
            perfil_completo: false,      // Ainda precisa escolher o @username
            data_adesao: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log("Sementes plantadas. Indo para Setup de Perfil.");
        window.location.href = "setup-perfil.html";

    } catch (e) {
        console.error("Erro técnico na portaria:", e);
        alert("A maré bloqueou sua entrada: " + e.message);
    }
}

/**
 * FUNÇÃO: germinarEsalvarPombito
 * Finaliza o perfil do usuário (Username e Avatar).
 */
async function germinarEsalvarPombito(dadosFicha, user) {
    try {
        // Usa a foto do Google se existir, senão gera um identicon
        const fotoPadrao = `https://api.dicebear.com/7.x/identicon/svg?seed=${user.uid}&backgroundColor=b6e3f4`;
        const pombitoUrl = user.photoURL || fotoPadrao;

        await db.collection("usuarios").doc(user.uid).set({
            ...dadosFicha,
            foto_perfil: pombitoUrl,
            perfil_completo: true,
            data_germina: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return true;
    } catch (e) {
        console.error("Erro ao salvar perfil final:", e);
        return false;
    }
}

/**
 * Função global para logout
 */
async function sairDaOrdem() {
    try {
        if (confirm("Deseja realmente sair do Ninho?")) {
            await auth.signOut();
            window.location.href = "invite.html";
        }
    } catch (error) {
        console.error("Erro ao sair:", error);
    }
}
