// ============================================================
//  germinador.js — Tela de "germinação" do perfil (germinar.html)
//
//  Contrato esperado por germinar.html:
//    async function iniciarProcessoDeArte(dadosUsuario) -> boolean
//  germinar.html chama isso depois de buscar o doc de usuarios/{uid};
//  se retornar true, manda o usuário pro feed.html.
//
//  O que este arquivo faz:
//  - Avatar: NÃO gera nada aqui de propósito. auth.js já salva
//    foto_perfil com a própria foto do Google do usuário
//    (finalizarCadastroPombito / germinarEsalvarPombito) no momento
//    do cadastro — quando esta tela carrega, o avatar já está pronto
//    no Firestore. Reescrever isso aqui seria duplicar trabalho.
//  - Frase de boas-vindas: pede pro Gemini (via /api/gemini — a chave
//    fica só no servidor, nunca aqui) uma frase curta e única,
//    usando o nome do perfil recém-criado. Se a IA falhar por
//    qualquer motivo (sem GEMINI_API_KEY configurada, rate limit,
//    timeout, sem internet), cai numa frase fixa — o cadastro nunca
//    trava por causa disso.
// ============================================================

async function iniciarProcessoDeArte(dadosUsuario) {
  const status = document.getElementById('status');
  const FRASE_FALLBACK = 'Seu Pombito está pronto pra alçar voo no mercado! 🪶';

  const nome = dadosUsuario?.nome || dadosUsuario?.username || 'Pombito';

  if (status) status.innerText = 'Preparando sua saudação...';

  let frase = FRASE_FALLBACK;

  try {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Sessão inválida.');

    const prompt =
      `Você é a voz de boas-vindas de "Los Pombitos", um simulador de investimentos ` +
      `com tema de pombos. Escreva UMA frase curta (máximo 20 palavras), animada e ` +
      `bem-humorada, dando boas-vindas a ${nome}, que acabou de criar o perfil. ` +
      `Pode fazer trocadilho com pombos e investimentos. Responda só com a frase, ` +
      `sem aspas e sem explicação.`;

    const idToken = await user.getIdToken();
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ prompt, temperature: 1, maxOutputTokens: 60 }),
    });

    if (res.ok) {
      const data = await res.json();
      const texto = (data.texto || '').trim();
      if (texto) frase = texto;
    } else {
      console.warn('[germinador] /api/gemini respondeu', res.status);
    }
  } catch (e) {
    console.warn('[germinador] Falha ao gerar saudação com IA, usando frase fixa:', e.message);
  }

  if (status) status.innerText = frase;

  // Pequena pausa só pra dar tempo de ler a frase antes de ir pro feed —
  // sem isso a animação do ovo pulsando passa rápido demais. Se achar
  // longa/curta demais, é só mudar os 1800 aqui.
  await new Promise((r) => setTimeout(r, 1800));

  return true;
}
