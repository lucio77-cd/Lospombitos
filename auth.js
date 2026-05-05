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

// 2. INICIALIZAÇÃO IMEDIATA (Evita o erro de App [DEFAULT])
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const auth = firebase.auth();

/**
 * FUNÇÃO: finalizarCadastroPombito
 * Chamada no invite.html após o login do Google.
 * Gerencia veteranos, novos membros e gera os 3 códigos iniciais.
 */
async function finalizarCadastroPombito(user, codigoUsado) {
    try {
        console.log("Iniciando verificação de linhagem...");
        const docRef = db.collection("usuarios").doc(user.uid);
        const docSnap = await docRef.get();

        // Se já completou o perfil, pula o setup
        if (docSnap.exists() && docSnap.data().perfil_completo === true) {
            console.log("Veterano identificado!");
            window.location.href = "feed.html";
            return;
        }

        // Se for NOVO, gera 3 códigos de convite únicos
        console.log("Novo Pombito! Gerando 3 sementes de convite...");
        const codigosGerados = [];
        for (let i = 0; i < 3; i++) {
            const randomId = Math.random().toString(36).substring(2, 6).toUpperCase();
            const novoCodigo = `POMB-${randomId}`;
            codigosGerados.push(novoCodigo);

            // Registra o código na coleção global de convites
            await db.collection("convites").doc(novoCodigo).set({
                gerado_por: user.uid,
                usado: false,
                quem_usou: null,
                data_criacao: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        // Salva rascunho do usuário com os códigos
        await docRef.set({
            uid: user.uid,
            nome: user.displayName || "Pombino Anonimo",
            email: user.email,
            status: "Membro Alpha",
            convites_restantes: 3,
            meus_codigos: codigosGerados, 
            perfil_completo: false,
            pombcoins: 10,
            data_adesao: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log("Registro inicial OK. Indo para Setup.");
        window.location.href = "setup-perfil.html";

    } catch (error) {
        console.error("Erro na portaria:", error);
        alert("A maré bloqueou sua entrada: " + error.message);
    }
}

/**
 * FUNÇÃO: germinarEsalvarPombito
 * Chamada no setup-perfil.html para finalizar a ficha.
 */
async function germinarEsalvarPombito(dadosFicha, user) {
    try {
        // Gera o avatar geométrico (identicon) para evitar rostos humanos
        const pombitoUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${user.uid}&backgroundColor=b6e3f4`;

        await db.collection("usuarios").doc(user.uid).set({
            ...dadosFicha,
            foto_perfil: pombitoUrl,
            perfil_completo: true,
            data_germina: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return true;
    } catch (e) {
        console.error("Erro técnico ao germinar:", e);
        return false;
    }
}

/**
 * Função global para sair da Ordem
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
