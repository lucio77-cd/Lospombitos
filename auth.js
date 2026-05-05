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
 * FUNÇÃO 1: Usada no invite.html
 * Verifica veterano e gera 3 códigos de convite para a sua rede.
 */
async function finalizarCadastroPombito(user, codigoUsado) {
    try {
        console.log("Verificando se o Pombito já existe...");
        const docRef = db.collection("usuarios").doc(user.uid);
        const docSnap = await docRef.get();

        // Se o perfil já existe e está completo, vai direto para a timeline
        if (docSnap.exists() && docSnap.data().perfil_completo === true) {
            console.log("Veterano identificado. Voando para o feed...");
            window.location.href = "feed.html";
        } else {
            console.log("Novo Pombito! Gerando convites para sua rede...");
            
            // Geração dos 3 códigos de convite exclusivos
            const codigosGerados = [];
            for (let i = 0; i < 3; i++) {
                const randomId = Math.random().toString(36).substring(2, 6).toUpperCase();
                const novoCodigo = `POMB-${randomId}`;
                codigosGerados.push(novoCodigo);

                // Registra o código na coleção 'convites' do banco
                await db.collection("convites").doc(novoCodigo).set({
                    gerado_por: user.uid,
                    usado: false,
                    quem_usou: null,
                    data_criacao: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            // Cria o registro inicial com os códigos salvos no campo 'meus_codigos'
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
            
            console.log("Convites gerados! Indo para o setup do perfil...");
            window.location.href = "setup-perfil.html";
        }
    } catch (error) {
        console.error("Erro na portaria:", error);
        alert("Erro ao processar entrada ou gerar convites: " + error.message);
    }
}

/**
 * FUNÇÃO 2: Usada no setup-perfil.html
 */
async function germinarEsalvarPombito(dadosFicha, user) {
    try {
        console.log("Germinando perfil para:", user.uid);
        
        // Gera o avatar no estilo identicon (pixelado/abstrato)
        const pombitoUrl = `
