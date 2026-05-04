// germinador.js - O Especialista em Arte da Ordem
const GEMINI_API_KEY = "AIzaSyCdQ1MThqZ5Y1Ciir99U8u3vgLuSBJMj5Q";

async function iniciarProcessoDeArte(dadosUsuario) {
    const status = document.getElementById('status');
    const db = firebase.firestore();
    
    try {
        status.innerText = "Sintonizando sua música nos pixels...";

        // 1. Chamada ao Gemini para criar o "DNA" do Pombito
        const promptParaIA = `Analise estes dados de um usuário: 
        Música: ${dadosUsuario.musica}, Filme: ${dadosUsuario.filme}, Cor: ${dadosUsuario.cor}. 
        Crie uma descrição curta e técnica (em inglês) para um gerador de imagem. 
        A descrição deve ser para um: '8-bit pixel art pigeon portrait, front view, facing camera, only head and chest'. 
        O fundo deve ser ${dadosUsuario.cor}. 
        A personalidade deve ser influenciada pela música e filme citados.`;

        const dnaVisual = await consultarGemini(promptParaIA);
        console.log("DNA Visual Gerado:", dnaVisual);

        status.innerText = "Germinando sua forma única...";

        // 2. Simulação da URL da imagem baseada no DNA
        // No futuro, aqui conectaremos com o endpoint de imagem (Imagen 3)
        // Por enquanto, usamos uma imagem base que representa o sucesso do processo
        const imagemFinalUrl = "https://placeholder.com/pombo-8bit-exemplo.png"; 

        // 3. Atualizamos o Firestore com o resultado da "mágica"
        await db.collection("usuarios").doc(dadosUsuario.uid).update({
            foto_perfil: imagemFinalUrl,
            dna_visual: dnaVisual, // Guardamos o prompt para saber como o pombinho foi criado
            foto_gerada: true,
            status_perfil: "VIVO"
        });

        status.innerText = "Alçando voo...";
        return true;

    } catch (error) {
        console.error("Erro na câmara de germinação:", error);
        status.innerText = "Erro na germinação. Tentando novamente...";
        return false;
    }
}

async function consultarGemini(prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}
