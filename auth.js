// 1. CONFIGURAÇÃO (Credenciais do Firebase)
var firebaseConfig = {
  apiKey: "AIzaSyDuAp97sXt63-JKeRRVpT6AYhGqWjrDb-s",
  authDomain: "los-pombitos.firebaseapp.com",
  projectId: "los-pombitos",
  storageBucket: "los-pombitos.firebasestorage.app",
  messagingSenderId: "760554231943",
  appId: "1:760554231943:web:e84acedd43eeb32a678022",
  measurementId: "G-3YL5YL7MKK"
};

// 2. INICIALIZAÇÃO
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const auth = firebase.auth();

/**
 * FUNÇÃO: validarEEntrar
 * Acionada pelo botão de convite. Resolve o problema de leitura de código.
 */
async function validarEEntrar() {
    // Pega o valor do input, remove espaços e coloca em maiúsculo (ex: POMB-49JU)
    const codigoInput = document.getElementById('input-convite').value.trim().toUpperCase();

    if (!codigoInput) {
        alert("Acesse o ninho com uma semente válida.");
        return;
    }

    try {
        console.log("Tentando germinar semente:", codigoInput);
        
        // Busca no Firestore tratando o ID como String
        const docSnap = await db.collection("convites").doc(codigoInput).get();

        // CORREÇÃO CRÍTICA: .exists é propriedade (sem parênteses) no SDK Compat
        if (!docSnap.exists) {
            alert("Esta semente não existe na linhagem.");
            return;
        }

        const dadosConvite = docSnap.data();
        if (dadosConvite.usado) {
            alert("Esta semente já floresceu em outra conta.");
            return;
        }

        // Se o código é válido, prossegue com login do Google
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        
        // Marca o convite como usado imediatamente
        await db.collection("convites").doc(codigoInput).update({
            usado: true,
            quem_usou: result.user.uid,
            data_uso: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Finaliza o cadastro técnico
        await finalizarCadastroPombito(result.user);

    } catch (e) {
        console.error("Erro na portaria:", e);
        alert("Erro técnico: " + e.message);
    }
}

/**
 * FUNÇÃO: finalizarCadastroPombito
 * Garante que veteranos pulem o setup e novos ganhem sementes.
 */
async function finalizarCadastroPombito(user) {
    try {
        const docRef = db.collection("usuarios").doc(user.uid);
        const docSnap = await docRef.get();

        // Se já for membro completo, vai para o feed
        if (docSnap.exists && docSnap.data().perfil_completo === true) {
            window.location.href = "feed.html";
            return;
        }

        console.log("Semeando 3 novos códigos para sua conta...");
        const novosCodigos = [];
        
        for (let i = 0; i < 3; i++) {
            const randomId = Math.random().toString(36).substring(2, 6).toUpperCase();
            const codigo = `POMB-${randomId}`;
            novosCodigos.push(codigo);

            await db.collection("convites").doc(codigo).set({
                gerado_por: user.uid,
                usado: false,
                data_criacao: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        // Salva dados iniciais (incluindo saldo inicial para o Pombo-Finances)
        await docRef.set({
            uid: user.uid,
            nome: user.displayName || "Pombito",
            email: user.email,
            meus_codigos: novosCodigos,
            pombcoins: 10,               // Capital inicial para simulação
            perfil_completo: false,
            data_adesao: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        window.location.href = "setup-perfil.html";

    } catch (e) {
        alert("A maré subiu demais: " + e.message);
    }
}

/**
 * FUNÇÃO: germinarEsalvarPombito
 * Completa o perfil com Username e Foto.
 */
async function germinarEsalvarPombito(dadosFicha, user) {
    try {
        const fotoPadrao = `https://api.dicebear.com/7.x/identicon/svg?seed=${user.uid}`;
        const pombitoUrl = user.photoURL || fotoPadrao;

        await db.collection("usuarios").doc(user.uid).set({
            ...dadosFicha,
            foto_perfil: pombitoUrl,
            perfil_completo: true,
            data_germina: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Logout
 */
async function sairDaOrdem() {
    if (confirm("Deseja realmente sair do Ninho?")) {
        await auth.signOut();
        window.location.href = "invite.html";
    }
}
