// Configuração do Firebase - Los Pombitos
const firebaseConfig = {
  apiKey: "AIzaSyDuAp97sXt63-JKeRRVpT6AYhGqWjrDb-s",
  authDomain: "los-pombitos.firebaseapp.com",
  projectId: "los-pombitos",
  storageBucket: "los-pombitos.firebasestorage.app",
  messagingSenderId: "760554231943",
  appId: "1:760554231943:web:e84acedd43eeb32a678022",
  measurementId: "G-3YL5YL7MKK"
};

// Inicializa o Firebase apenas se ainda não foi inicializado
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Definimos as instâncias globalmente (sem o 'const' na frente dentro do escopo global)
// Isso garante que o setup-perfil.js consiga ler 'db' e 'auth' diretamente
window.db = firebase.firestore();
window.auth = firebase.auth();
window.storage = firebase.storage();

console.log("Firebase da Ordem inicializado com sucesso.");
