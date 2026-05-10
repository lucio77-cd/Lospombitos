// ============================================================
//  germinador.js — A Câmara de Arte da Ordem
//  
//  FLUXO:
//  1. Gemini analisa música + filme + cor → gera DNA visual
//  2. DNA é interpretado → paleta + personalidade únicas
//  3. SVG pixel art do Pombito é gerado programaticamente
//  4. SVG → PNG → Firebase Storage
//  5. URL salva no Firestore como foto_perfil
// ============================================================

const GEMINI_API_KEY = "AIzaSyCdQ1MThqZ5Y1Ciir99U8u3vgLuSBJMj5Q";

// ----------------------------------------------------------
// ENTRADA PRINCIPAL
// ----------------------------------------------------------
async function iniciarProcessoDeArte(dadosUsuario) {
  const statusEl = document.getElementById('status');

  const setStatus = (msg) => {
    console.log("[Germinador]", msg);
    if (statusEl) statusEl.innerText = msg;
  };

  try {
    setStatus("Sintonizando sua alma nos pixels...");

    // ── PASSO 1: Gemini gera o DNA visual ──
    const dnaVisual = await gerarDNAvisual(dadosUsuario);
    console.log("DNA Visual:", dnaVisual);

    setStatus("Decodificando sua essência...");

    // ── PASSO 2: Interpreta o DNA em parâmetros visuais ──
    const parametros = await interpretarDNA(dnaVisual, dadosUsuario);
    console.log("Parâmetros visuais:", parametros);

    setStatus("Germinando sua forma única...");

    // ── PASSO 3: Gera o SVG pixel art do Pombito ──
    const svgString = gerarPombitoSVG(parametros);

    setStatus("Revelando nos archivos da Ordem...");

    // ── PASSO 4: SVG → PNG → Firebase Storage ──
    const fotoUrl = await salvarArteNoStorage(svgString, dadosUsuario.uid);

    // ── PASSO 5: Atualiza o Firestore ──
    await db.collection("usuarios").doc(dadosUsuario.uid).update({
      foto_perfil:   fotoUrl,
      dna_visual:    dnaVisual,
      parametros_arte: parametros,
      foto_gerada:   true,
      status_perfil: "VIVO"
    });

    setStatus("Alçando voo... 🕊️");
    return fotoUrl;

  } catch (error) {
    console.error("[Germinador] Erro:", error);
    if (statusEl) statusEl.innerText = "Erro na germinação. Usando arte padrão...";

    // Fallback: gera um pombito padrão sem Gemini
    try {
      const parametrosPadrao = gerarParametrosPadrao(dadosUsuario);
      const svgFallback      = gerarPombitoSVG(parametrosPadrao);
      const fotoFallback     = await salvarArteNoStorage(svgFallback, dadosUsuario.uid);

      await db.collection("usuarios").doc(dadosUsuario.uid).update({
        foto_perfil:   fotoFallback,
        foto_gerada:   true,
        status_perfil: "VIVO"
      });

      return fotoFallback;
    } catch(e2) {
      console.error("[Germinador] Falhou até o fallback:", e2);
      return null;
    }
  }
}

// ----------------------------------------------------------
// PASSO 1: GEMINI → DNA VISUAL
// ----------------------------------------------------------
async function gerarDNAvisual(dadosUsuario) {
  const prompt = `
You are an art director for a secret pigeon brotherhood called "Los Pombitos".
Analyze this member's profile and return ONLY a valid JSON object (no markdown, no explanation):

Member data:
- Favorite music: "${dadosUsuario.musica}"
- Favorite movie: "${dadosUsuario.filme}"
- Chosen color: "${dadosUsuario.cor}"
- Name: "${dadosUsuario.nome}"

Return this exact JSON structure with your analysis:
{
  "mood": "one word: heroic | melancholic | playful | mystical | rebellious | serene | fierce | dreamy",
  "energy": "one word: calm | electric | burning | flowing | explosive | gentle",
  "era": "one word: ancient | medieval | futuristic | retro | timeless | cyberpunk",
  "pattern": "one word describing feather pattern: striped | dotted | gradient | solid | speckled | cosmic",
  "expression": "one word: wise | defiant | curious | proud | mysterious | joyful | intense",
  "halo": true or false (true if the music/movie has spiritual or legendary themes),
  "accessories": "none | crown | eyepatch | scarf | glasses | medal",
  "color_mood": "dark | vibrant | pastel | neon | muted | golden"
}`;

  const resposta = await consultarGemini(prompt);

  // Limpa possível markdown e faz parse do JSON
  const limpo = resposta.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(limpo);
  } catch(e) {
    console.warn("Gemini não retornou JSON limpo, usando defaults:", resposta);
    return gerarParametrosPadrao(dadosUsuario);
  }
}

// ----------------------------------------------------------
// PASSO 2: INTERPRETAR DNA → PALETA + PARÂMETROS VISUAIS
// ----------------------------------------------------------
async function interpretarDNA(dna, dadosUsuario) {
  // Mapeia a cor escolhida pelo usuário para um hex
  const corHex = resolverCor(dadosUsuario.cor);

  // Paletas por mood
  const paletasMood = {
    heroic:      { corpo: '#d4bc84', asa: '#8b6914', bico: '#f5b800', olho: '#1a0a00' },
    melancholic: { corpo: '#b8c4d4', asa: '#4a6080', bico: '#7a9ab0', olho: '#0a0a1a' },
    playful:     { corpo: '#f0c8a0', asa: '#e07840', bico: '#ff9800', olho: '#1a0800' },
    mystical:    { corpo: '#c8a8d8', asa: '#6a3090', bico: '#9c60c0', olho: '#0a001a' },
    rebellious:  { corpo: '#d0a898', asa: '#802010', bico: '#c03020', olho: '#0a0000' },
    serene:      { corpo: '#a8d0b8', asa: '#306850', bico: '#50a878', olho: '#001a08' },
    fierce:      { corpo: '#d8b090', asa: '#a04010', bico: '#d86020', olho: '#1a0400' },
    dreamy:      { corpo: '#d0b8e8', asa: '#806098', bico: '#b090d0', olho: '#08000a' },
  };

  const paleta = paletasMood[dna.mood] || paletasMood.heroic;

  // Mescla a cor do usuário no fundo
  const fundo = corHex;

  // Acessório → coordenadas e forma
  const acessorioMap = {
    none:     null,
    crown:    { tipo: 'crown' },
    eyepatch: { tipo: 'eyepatch' },
    scarf:    { tipo: 'scarf' },
    glasses:  { tipo: 'glasses' },
    medal:    { tipo: 'medal' },
  };

  return {
    fundo,
    corpo:       paleta.corpo,
    asa:         paleta.asa,
    bico:        paleta.bico,
    olho:        paleta.olho,
    halo:        dna.halo === true,
    acessorio:   acessorioMap[dna.accessories] || null,
    pattern:     dna.pattern || 'solid',
    expression:  dna.expression || 'proud',
    mood:        dna.mood || 'heroic',
    energy:      dna.energy || 'calm',
    era:         dna.era || 'timeless',
    color_mood:  dna.color_mood || 'golden',
    corUsuario:  corHex,
  };
}

// ----------------------------------------------------------
// PASSO 3: GERAR SVG PIXEL ART DO POMBITO
// Cada parâmetro influencia a aparência final
// ----------------------------------------------------------
function gerarPombitoSVG(p) {
  const W = 200, H = 200;
  const px = 8; // tamanho de cada "pixel"

  // Grade pixel: cada número é um bloco px×px
  // 0 = fundo, 1 = corpo, 2 = asa, 3 = bico, 4 = olho, 5 = pupila/brilho, 6 = halo, 7 = detalhe
  const grade = [
    [0,0,0,0,6,6,6,6,6,6,6,6,6,6,0,0,0,0,0,0],
    [0,0,0,6,0,0,0,0,0,0,0,0,0,0,6,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,1,4,4,1,1,1,3,3,3,0,0],
    [0,1,1,1,1,1,1,1,1,1,4,5,1,1,1,3,3,0,0,0],
    [0,0,1,1,1,7,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,2,2,1,1,1,1,1,1,1,1,1,1,1,2,2,2,0,0,0],
    [2,2,2,2,1,1,1,1,1,1,1,1,1,2,2,2,2,2,0,0],
    [2,2,2,2,2,1,1,1,1,1,1,1,2,2,2,2,2,2,0,0],
    [0,2,2,2,2,2,2,1,1,1,1,2,2,2,2,2,2,0,0,0],
    [0,0,2,2,2,2,2,2,1,1,2,2,2,2,2,2,0,0,0,0],
    [0,0,0,2,2,2,2,2,2,2,2,2,2,2,2,0,0,0,0,0],
    [0,0,0,0,2,2,2,2,2,2,2,2,2,2,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0],
    [0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0],
    [0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0],
  ];

  // Expressão altera o pixel do olho e sobrancelha
  const expressaoDetalhe = {
    wise:       '#ffffff',
    defiant:    '#ff4400',
    curious:    '#00ccff',
    proud:      '#f0d080',
    mysterious: '#cc00ff',
    joyful:     '#ffffff',
    intense:    '#ff0000',
  };
  const corDetalhe = expressaoDetalhe[p.expression] || '#ffffff';

  // Padrão nas asas
  const padroesAsa = {
    striped:   (x, y) => (y % 2 === 0) ? ajustarBrilho(p.asa, 20) : p.asa,
    dotted:    (x, y) => (x % 3 === 0 && y % 3 === 0) ? ajustarBrilho(p.asa, 30) : p.asa,
    gradient:  (x, y) => ajustarBrilho(p.asa, Math.floor((x / 20) * 40) - 20),
    solid:     ()     => p.asa,
    speckled:  (x, y) => ((x + y) % 4 === 0) ? ajustarBrilho(p.asa, 25) : p.asa,
    cosmic:    (x, y) => (x % 2 === 0) ? ajustarBrilho(p.asa, -10) : ajustarBrilho(p.asa, 30),
  };
  const getCorAsa = padroesAsa[p.pattern] || padroesAsa.solid;

  // Mapa de cores por código
  const corMap = (codigo, x, y) => {
    switch(codigo) {
      case 0: return null;           // transparente (fundo)
      case 1: return p.corpo;
      case 2: return getCorAsa(x, y);
      case 3: return p.bico;
      case 4: return p.olho;
      case 5: return corDetalhe;     // pupila/brilho varia com expressão
      case 6: return p.halo ? '#f0d080' : null;  // halo só se true
      case 7: return ajustarBrilho(p.corpo, -20); // sombra no pescoço
      default: return null;
    }
  };

  // Constrói os blocos pixel
  let blocos = '';
  grade.forEach((linha, row) => {
    linha.forEach((codigo, col) => {
      const cor = corMap(codigo, col, row);
      if (cor) {
        const x = col * px;
        const y = row * px;
        const opacity = (codigo === 6) ? '0.7' : '1';
        blocos += `<rect x="${x}" y="${y}" width="${px}" height="${px}" fill="${cor}" opacity="${opacity}"/>`;
      }
    });
  });

  // Acessório
  let acessorioSVG = '';
  if (p.acessorio) {
    acessorioSVG = gerarAcessorio(p.acessorio.tipo, px, p);
  }

  // Partículas de energia (mood)
  let particulas = '';
  if (p.energy === 'electric' || p.energy === 'explosive') {
    particulas = `
      <circle cx="170" cy="30" r="3" fill="#f0d080" opacity="0.8"/>
      <circle cx="185" cy="50" r="2" fill="#f0d080" opacity="0.6"/>
      <circle cx="160" cy="55" r="2" fill="#f0d080" opacity="0.5"/>
      <circle cx="20" cy="40" r="3" fill="#f0d080" opacity="0.7"/>
      <circle cx="10" cy="60" r="2" fill="#f0d080" opacity="0.5"/>`;
  }

  // Brilho no canto (era futurista)
  let brilho = '';
  if (p.era === 'futuristic' || p.era === 'cyberpunk') {
    brilho = `<rect x="0" y="0" width="${W}" height="4" fill="#00ffcc" opacity="0.3"/>
              <rect x="0" y="0" width="4" height="${H}" fill="#00ffcc" opacity="0.2"/>`;
  }

  // Monta o SVG final
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">
  <!-- Fundo -->
  <rect width="${W}" height="${H}" fill="${p.fundo}"/>
  
  <!-- Efeito de fundo por era -->
  ${p.era === 'ancient' ? `<rect width="${W}" height="${H}" fill="url(#ancient)" opacity="0.15"/>` : ''}
  ${p.era === 'cosmic'  ? `<rect width="${W}" height="${H}" fill="url(#cosmic)"  opacity="0.2"/>` : ''}
  
  <!-- Definições de gradientes -->
  <defs>
    <radialGradient id="ancient" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#c9a84c" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#0a0a0f" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cosmic" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#6a0dad" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#00ccff" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  
  ${brilho}
  ${particulas}
  
  <!-- Corpo pixel art -->
  ${blocos}
  
  <!-- Acessório -->
  ${acessorioSVG}
  
  <!-- Borda pixel -->
  <rect width="${W}" height="${H}" fill="none" stroke="${ajustarBrilho(p.fundo, -30)}" stroke-width="4"/>
  
  <!-- Assinatura da Ordem -->
  <text x="${W - 4}" y="${H - 4}" 
    font-family="monospace" font-size="6" 
    fill="${ajustarBrilho(p.fundo, -20)}" 
    text-anchor="end" opacity="0.5">LOS POMBITOS</text>
</svg>`;
}

// ----------------------------------------------------------
// ACESSÓRIOS
// ----------------------------------------------------------
function gerarAcessorio(tipo, px, p) {
  switch(tipo) {
    case 'crown':
      return `
        <rect x="${4*px}" y="${1*px}" width="${px}" height="${2*px}" fill="#f0d080"/>
        <rect x="${6*px}" y="${0}"    width="${px}" height="${2*px}" fill="#f0d080"/>
        <rect x="${8*px}" y="${1*px}" width="${px}" height="${2*px}" fill="#f0d080"/>
        <rect x="${4*px}" y="${2*px}" width="${6*px}" height="${px}" fill="#f0d080"/>
        <rect x="${5*px}" y="${1*px}" width="${px}"  height="${px}"  fill="#ff4444"/>
        <rect x="${7*px}" y="${0}"    width="${px}"  height="${px}"  fill="#4444ff"/>`;

    case 'eyepatch':
      return `
        <rect x="${9*px}" y="${4*px}" width="${3*px}" height="${2*px}" fill="#0a0a0f"/>
        <rect x="${8*px}" y="${4*px}" width="${px}"   height="${px}"   fill="#0a0a0f"/>
        <rect x="${12*px}" y="${4*px}" width="${px}"  height="${px}"   fill="#0a0a0f"/>`;

    case 'glasses':
      return `
        <rect x="${8*px}"  y="${4*px}" width="${3*px}" height="${2*px}" fill="none" stroke="#c9a84c" stroke-width="2"/>
        <rect x="${12*px}" y="${4*px}" width="${3*px}" height="${2*px}" fill="none" stroke="#c9a84c" stroke-width="2"/>
        <rect x="${11*px}" y="${4*px}" width="${px}"   height="${px}"   fill="#c9a84c"/>`;

    case 'scarf':
      return `
        <rect x="${2*px}" y="${7*px}" width="${14*px}" height="${2*px}" fill="#cc2200"/>
        <rect x="${2*px}" y="${8*px}" width="${3*px}"  height="${4*px}" fill="#cc2200"/>
        <rect x="${3*px}" y="${9*px}" width="${2*px}"  height="${2*px}" fill="#ff4422"/>`;

    case 'medal':
      return `
        <rect x="${7*px}" y="${8*px}" width="${px}"  height="${3*px}" fill="#c9a84c"/>
        <circle cx="${7*px + 4}" cy="${8*px + 3*px + 4}" r="6" fill="#f0d080"/>
        <circle cx="${7*px + 4}" cy="${8*px + 3*px + 4}" r="4" fill="#c9a84c"/>`;

    default:
      return '';
  }
}

// ----------------------------------------------------------
// PASSO 4: SVG → PNG → FIREBASE STORAGE
// ----------------------------------------------------------
async function salvarArteNoStorage(svgString, uid) {
  return new Promise((resolve, reject) => {
    // Converte SVG para Blob
    const blob    = new Blob([svgString], { type: 'image/svg+xml' });
    const url     = URL.createObjectURL(blob);
    const img     = new Image();

    img.onload = async () => {
      try {
        // Desenha em canvas para exportar como PNG
        const canvas  = document.createElement('canvas');
        canvas.width  = 200;
        canvas.height = 200;
        const ctx     = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        // Canvas → Blob PNG
        canvas.toBlob(async (pngBlob) => {
          try {
            const storageRef = storage.ref(`pombitos/${uid}/perfil.png`);

            const metadata   = {
              contentType: 'image/png',
              customMetadata: { gerado_por: 'germinador-v2', uid }
            };

            const snapshot = await storageRef.put(pngBlob, metadata);
            const downloadUrl = await snapshot.ref.getDownloadURL();
            resolve(downloadUrl);
          } catch(e) {
            reject(e);
          }
        }, 'image/png', 1.0);

      } catch(e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };

    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error('Falha ao carregar SVG para canvas: ' + e));
    };

    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
  });
}

// ----------------------------------------------------------
// CONSULTA AO GEMINI
// ----------------------------------------------------------
async function consultarGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents:         [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 300 }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

// ----------------------------------------------------------
// UTILITÁRIOS
// ----------------------------------------------------------

// Parâmetros padrão quando Gemini falha
function gerarParametrosPadrao(dadosUsuario) {
  const cor = resolverCor(dadosUsuario.cor || 'azul');
  return {
    fundo:      cor,
    corpo:      '#e8d4a0',
    asa:        '#c9a84c',
    bico:       '#f5b800',
    olho:       '#0a0a0f',
    halo:       true,
    acessorio:  null,
    pattern:    'solid',
    expression: 'proud',
    mood:       'heroic',
    energy:     'calm',
    era:        'timeless',
    color_mood: 'golden',
    corUsuario: cor,
  };
}

// Converte nome de cor em português para hex
function resolverCor(nomeCor) {
  const mapa = {
    'azul':         '#1a4fff', 'azul celeste':  '#87ceeb', 'azul mar':    '#006994',
    'verde':        '#2d8a4e', 'verde mar':     '#2e8b57',  'verde limão': '#9acd32',
    'vermelho':     '#cc2200', 'rosa':          '#e75480',  'roxo':        '#6a0dad',
    'laranja':      '#e86a1a', 'amarelo':       '#f5b800',  'preto':       '#1a1a2e',
    'branco':       '#f2ead8', 'dourado':       '#c9a84c',  'cinza':       '#4a4a5a',
    'marrom':       '#7a4e2d', 'bege':          '#d4b896',  'ciano':       '#00b4d8',
    'violeta':      '#7c3aed', 'turquesa':      '#40e0d0',  'coral':       '#ff6b6b',
    'lilás':        '#b09ac0', 'vinho':         '#722f37',  'salmão':      '#fa8072',
    'azul noite':   '#191970', 'verde escuro':  '#1a4a2e',  'azul royal':  '#4169e1',
    'blue':         '#1a4fff', 'green':         '#2d8a4e',  'red':         '#cc2200',
    'yellow':       '#f5b800', 'purple':        '#6a0dad',  'orange':      '#e86a1a',
    'pink':         '#e75480', 'black':         '#1a1a2e',  'white':       '#f2ead8',
    'gold':         '#c9a84c', 'gray':          '#4a4a5a',  'grey':        '#4a4a5a',
  };

  const chave = (nomeCor || '').toLowerCase().trim();
  return mapa[chave] || '#1a4fff'; // padrão azul
}

// Ajusta brilho de um hex (+pos = mais claro, -neg = mais escuro)
function ajustarBrilho(hex, delta) {
  if (!hex || hex.length < 7) return hex;
  const r = Math.min(255, Math.max(0, parseInt(hex.slice(1,3), 16) + delta));
  const g = Math.min(255, Math.max(0, parseInt(hex.slice(3,5), 16) + delta));
  const b = Math.min(255, Math.max(0, parseInt(hex.slice(5,7), 16) + delta));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}
