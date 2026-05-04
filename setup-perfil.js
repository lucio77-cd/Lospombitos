// setup-perfil.js

const db = firebase.firestore();
const auth = firebase.auth();

// Note que adicionei 'dadosFicha' como parâmetro para receber o que vem do formulário
async function finalizarGerminacao(dadosFicha, user) {
    
    if (!user) {
        alert("Sessão inválida.");
        return false;
    }

    const username = dadosFicha.username;

    try {
        // 1. Verificar se o username já existe
        const snapshot = await db.collection("usuarios")
                                 .where("username", "==", username)
                                 .get();

        if (!snapshot.empty) {
            alert("Este @username já pertence a outro pombino.");
            return false;
        }

        // 2. Gerar o Pombito 8-bit (A 'seed' garante que seja único por UID)
        const pombitoUrl = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${user.uid}`;

        // 3. Salvar todos os dados da ficha + o avatar
        await db.collection("usuarios").doc(user.uid).set({
            uid: user.uid,
            nome: dadosFicha.nome,
            username: username,
            idade: dadosFicha.idade,
            sexo: dadosFicha.sexo,
            musica: dadosFicha.musica,
            filme: dadosFicha.filme,
            cor_favorita: dadosFicha.cor,
            foto_perfil: pombitoUrl,
            pombcoins: 10, // Damos 10 moedas de boas-vindas!
            data_criacao: firebase.firestore.FieldValue.serverTimestamp()
        });

        console.log("Perfil Germinado!");
        return true; // Retorna true para o HTML saber que pode redirecionar

    } catch (error) {
        console.error("Erro no Firestore:", error);
        return false;
    }
}
