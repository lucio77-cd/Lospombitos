// auth.js

// 1. Suas chaves (Não mexa aqui, estão corretas)
const firebaseConfig = {
  apiKey: "AIzaSyDuAp97sXt63-JKeRRVpT6AYhGqWjrDb-s",
  authDomain: "los-pombitos.firebaseapp.com",
  projectId: "los-pombitos",
  storageBucket: "los-pombitos.firebasestorage.app",
  messagingSenderId: "760554231943",
  appId: "1:760554231943:web:e84acedd43eeb32a678022",
  measurementId: "G-3YL5YL7MKK"
};

// 2. A CORREÇÃO: Inicialização Forçada
// Se o Firebase ainda não foi iniciado, inicia agora.
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase da Ordem Inicializado!");
}

// 3. Definição das variáveis globais
const db = firebase.firestore();
const auth = firebase.auth();
const MASTER_CODE = "131213";

// --- Suas funções (finalizarCadastroPombito e germinarEsalvarPombito) seguem abaixo ---
// Mantenha o restante do código que já tínhamos...

async function finalizarCadastroPombito(user, codigoUsado) {
    try {
        await db.collection("usuarios").doc(user.uid).set({
            uid: user.uid,
            nome: user.displayName || "Novo Pombino",
            email: user.email,
            status: "Membro Alpha",
            convites_restantes: 3,
            perfil_completo: false,
            pombcoins: 10,
            data_adesao: firebase.firestore.FieldValue.serverTimestamp()
        });

        await db.collection("convites").doc(codigoUsado).set({
            status: "usado",
            usado_por: user.uid,
            data_uso: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        const batch = db.batch();
        for (let i = 0; i < 3; i++) {
            const novoCodigo = Math.floor(100000 + Math.random() * 900000).toString();
            batch.set(db.collection("convites").doc(novoCodigo), {
                codigo: novoCodigo,
                status: "pendente",
                gerado_por: user.uid
            });
        }
        await batch.commit();

        window.location.href = "setup-perfil.html";
    } catch (error) {
        console.error("Erro no cadastro:", error);
    }
}

async function germinarEsalvarPombito(dadosFicha, user) {
    try {
        const pombitoUrl = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${user.uid}`;
        await db.collection("usuarios").doc(user.uid).set({
            ...dadosFicha,
            username: dadosFicha.username.toLowerCase().replace(/\s/g, ''),
            foto_perfil: pombitoUrl,
            perfil_completo: true
        }, { merge: true });
        return true;
    } catch (error) {
        console.error("Erro na germinação:", error);
        return false;
    }
}
