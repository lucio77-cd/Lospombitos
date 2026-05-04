// ==========================================
// 1. CONFIGURAÇÕES E INSTÂNCIAS
// ==========================================
// Garante que o db e auth estejam acessíveis em todos os arquivos
const db = firebase.firestore();
const auth = firebase.auth();
const MASTER_CODE = "131213";

// ==========================================
// 2. LÓGICA DE CONVITES (Primeiro Acesso)
// ==========================================
async function finalizarCadastroPombito(user, codigoUsado) {
    try {
        // Cria o esqueleto do perfil
        await db.collection("usuarios").doc(user.uid).set({
            uid: user.uid,
            nome: user.displayName || "Novo Pombino",
            email: user.email,
            status: "Membro Alpha",
            convites_restantes: 3,
            perfil_completo: false, // Indica que ainda precisa passar pelo setup
            pombcoins: 10, // Bônus de entrada
            data_adesao: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Marca o convite como usado
        await db.collection("convites").doc(codigoUsado).set({
            status: "usado",
            usado_por: user.uid,
            data_uso: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Gera a linhagem (3 códigos)
        const batch = db.batch();
        for (let i = 0; i < 3; i++) {
            const novoCodigo = Math.floor(100000 + Math.random() * 900000).toString();
            const ref = db.collection("convites").doc(novoCodigo);
            batch.set(ref, {
                codigo: novoCodigo,
                status: "pendente",
                gerado_por: user.uid
            });
        }
        await batch.commit();

        window.location.href = "setup-perfil.html";
    } catch (error) {
        console.error("Erro no cadastro inicial:", error);
    }
}

// ==========================================
// 3. GERMINAÇÃO DA IDENTIDADE (Setup Perfil)
// ==========================================
async function germinarEsalvarPombito(dadosFicha, user) {
    try {
        // 1. Validação de Username Único
        const usernameRef = db.collection("usuarios").where("username", "==", dadosFicha.username);
        const snapshot = await usernameRef.get();
        
        if (!snapshot.empty) {
            alert("Este @username já foi reivindicado por outro irmão.");
            return false;
        }

        // 2. Geração automática do Avatar 8-bit (Baseado no UID)
        const pombitoUrl = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${user.uid}`;

        // 3. Merge dos dados finais
        await db.collection("usuarios").doc(user.uid).set({
            nome: dadosFicha.nome,
            username: dadosFicha.username.toLowerCase().replace(/\s/g, ''),
            idade: dadosFicha.idade,
            sexo: dadosFicha.sexo,
            musica: dadosFicha.musica,
            filme: dadosFicha.filme,
            cor_favorita: dadosFicha.cor,
            foto_perfil: pombitoUrl, // O link da imagem pixelada
            perfil_completo: true
        }, { merge: true });

        console.log("Identidade Germinada!");
        return true;
    } catch (error) {
        console.error("Erro na germinação:", error);
        alert("A maré falhou. Verifique sua conexão.");
        return false;
    }
}
