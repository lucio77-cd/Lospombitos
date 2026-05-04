// auth.js
// Coloquei var para garantir que seja lido em qualquer lugar
var firebaseConfig = {
  apiKey: "AIzaSyDuAp97sXt63-JKeRRVpT6AYhGqWjrDb-s",
  authDomain: "los-pombitos.firebaseapp.com",
  projectId: "los-pombitos",
  storageBucket: "los-pombitos.firebasestorage.app",
  messagingSenderId: "760554231943",
  appId: "1:760554231943:web:e84acedd43eeb32a678022",
  measurementId: "G-3YL5YL7MKK"
};

// Inicializa o Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Atalhos globais
const db = firebase.firestore();
const auth = firebase.auth();

// Função que cria o registro no banco
async function finalizarCadastroPombito(user, codigoUsado) {
    try {
        console.log("Criando documento para o UID:", user.uid);
        await db.collection("usuarios").doc(user.uid).set({
            uid: user.uid,
            nome: user.displayName || "Pombino Anonimo",
            email: user.email,
            status: "Membro Alpha",
            convites_restantes: 3,
            perfil_completo: false,
            pombcoins: 10,
            data_adesao: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log("Sucesso! Indo para o setup...");
        window.location.href = "setup-perfil.html";
    } catch (error) {
        console.error("Erro ao salvar no Firestore:", error);
        alert("Erro de permissão no banco: " + error.message);
    }
}
