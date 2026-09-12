// ============================================================
//  glossario.js — Glossário financeiro compartilhado (tooltip)
//
//  O QUE É: um dicionário de termos financeiros + um componente que
//  mostra a explicação num balãozinho quando o usuário toca no termo.
//  Feito pra ser usado em qualquer página do site, sem depender de
//  nenhuma outra biblioteca.
//
//  COMO USAR:
//    1. Inclua este script no HTML, perto do fim do <body>:
//         <script src="glossario.js"></script>
//
//    2. Em qualquer lugar do HTML (ou de um template que você monta
//       via JavaScript com innerHTML), marque o termo assim:
//         <span class="glossario-termo" data-termo="pl">P/L</span>
//
//       O "pl" tem que bater com uma chave do objeto TERMOS abaixo.
//
//    3. Pronto. Não precisa chamar nenhuma função — o script já fica
//       escutando cliques em qualquer .glossario-termo da página,
//       mesmo em conteúdo criado DEPOIS (ex: cards que o relatorio.html
//       monta via fetch). Funciona por toque, não por hover — pensado
//       pra celular.
//
//  COMO ADICIONAR UM TERMO NOVO:
//    Só acrescente uma linha no objeto TERMOS logo abaixo, no formato:
//      chave: { titulo: 'Nome curto', texto: 'Explicação em 1-3 frases' }
//    Escreva o texto pensando em alguém que nunca investiu — sem
//    jargão dentro da própria explicação.
// ============================================================

(function () {

  const TERMOS = {
    pl: {
      titulo: 'P/L — Preço sobre Lucro',
      texto: 'Mostra quantos anos de lucro (no ritmo atual) seriam necessários pra "pagar" o preço da ação. P/L de 10 significa: se a empresa continuar lucrando o mesmo valor, levaria 10 anos pra esse lucro somado igualar o preço pago. Quanto menor, em geral mais "barata" a ação parece — mas não é uma regra absoluta, cada setor tem uma faixa considerada normal.'
    },
    pvp: {
      titulo: 'P/VP — Preço sobre Valor Patrimonial',
      texto: 'Compara o preço da ação com o que a empresa "vale no papel" (patrimônio dividido pelo número de ações). P/VP menor que 1 quer dizer que a ação custa menos do que o patrimônio contábil da empresa — pode ser uma pechincha, ou pode ser um sinal de que o mercado desconfia daquele patrimônio.'
    },
    ev_ebitda: {
      titulo: 'EV/EBITDA',
      texto: 'Parecido com o P/L, mas olha o valor total da empresa (incluindo dívidas) dividido pela geração de caixa operacional (EBITDA). É usado pra comparar empresas de setores parecidos, mesmo que tenham níveis de dívida diferentes.'
    },
    dy: {
      titulo: 'Dividend Yield (DY)',
      texto: 'Quanto a empresa pagou em dividendos nos últimos 12 meses, comparado ao preço atual da ação — em porcentagem. DY de 6% significa: quem tem essa ação recebeu, em dividendos, o equivalente a 6% do preço dela no último ano. Não é garantia de que vai se repetir.'
    },
    roe: {
      titulo: 'ROE — Retorno sobre Patrimônio',
      texto: 'Mostra o quão eficiente a empresa é em transformar o dinheiro dos sócios em lucro. ROE de 15% quer dizer que, pra cada R$100 de patrimônio, a empresa gerou R$15 de lucro no ano. Quanto maior, mais eficiente — mas vale comparar com empresas do mesmo setor.'
    },
    preco_medio: {
      titulo: 'Preço médio',
      texto: 'A média do preço que você pagou em TODAS as compras daquele ativo, ponderada pela quantidade de cada compra. Se você comprar mais do mesmo ativo depois, esse número muda — ele sempre representa "quanto custou, em média, cada cota/ação que você tem hoje".'
    },
    valor_pago: {
      titulo: 'Valor pago',
      texto: 'Preço médio multiplicado pela quantidade que você tem hoje. É "quanto saiu do seu bolso", parado no tempo — não muda com a cotação do mercado, só muda se você comprar ou vender mais.'
    },
    valor_hoje: {
      titulo: 'Valor hoje',
      texto: 'Preço atual de mercado multiplicado pela quantidade que você tem. Esse número sobe e desce com a cotação — é "quanto sua posição valeria se você vendesse agora".'
    },
    patrimonio_total: {
      titulo: 'Patrimônio total',
      texto: 'A soma de tudo: o dinheiro disponível (que você ainda não investiu) mais o valor de mercado de todas as suas posições. É o retrato completo de quanto sua carteira vale neste exato momento.'
    },
    rentabilidade: {
      titulo: 'Rentabilidade',
      texto: 'Quanto seu patrimônio cresceu (ou encolheu) em porcentagem, comparado ao capital inicial que você começou. Rentabilidade de +5% quer dizer que sua carteira vale 5% a mais do que você colocou nela.'
    },
    ordem_mercado: {
      titulo: 'Ordem a mercado',
      texto: 'Você compra ou vende pelo preço que estiver valendo AGORA, sem escolher um valor específico. É mais rápida (executa na hora), mas você não controla exatamente por quanto vai sair.'
    },
    ordem_limite: {
      titulo: 'Ordem limite',
      texto: 'Você escolhe o preço máximo (pra comprar) ou mínimo (pra vender) que aceita. A ordem só executa se o mercado chegar nesse preço — pode demorar ou nunca acontecer, mas você tem controle sobre o valor.'
    },
    fii: {
      titulo: 'FII — Fundo de Investimento Imobiliário',
      texto: 'Um fundo que junta o dinheiro de vários investidores pra comprar imóveis (shoppings, galpões, prédios comerciais) ou papéis ligados a imóveis. Em troca, costuma distribuir o aluguel recebido como rendimento mensal aos cotistas.'
    },
    renda_fixa: {
      titulo: 'Renda fixa',
      texto: 'Investimentos onde a regra de rendimento é combinada no momento da aplicação (uma taxa fixa, ou atrelada ao CDI/Selic) — diferente de uma ação, cujo preço varia livremente no mercado. Geralmente mais previsível, mas com potencial de ganho menor no longo prazo.'
    },
    cdi: {
      titulo: 'CDI / Selic',
      texto: 'Taxas básicas de juros da economia brasileira, usadas como referência pra quase todo investimento de renda fixa. Quando alguém diz "rende 110% do CDI", está comparando o retorno daquele investimento com essa taxa de referência.'
    },
    beta: {
      titulo: 'Beta',
      texto: 'Mede o quanto um ativo costuma se mexer em relação ao mercado como um todo (o Ibovespa, no Brasil). Beta 1 significa que ele costuma variar parecido com o mercado; beta 2 significa que costuma variar o dobro (pra cima ou pra baixo); beta 0,5, a metade.'
    },
    volatilidade: {
      titulo: 'Volatilidade',
      texto: 'O quanto o preço de um ativo costuma oscilar num período. Alta volatilidade significa preço "nervoso" — pode subir ou descer bastante em pouco tempo. Baixa volatilidade significa preço mais estável.'
    },
    acao: {
      titulo: 'Ação',
      texto: 'Uma pequena parte de uma empresa. Ao comprar uma ação, você passa a ser sócio (mesmo que muito pequeno) daquela empresa, e pode ganhar de duas formas: valorização do preço, ou dividendos.'
    },
    cripto: {
      titulo: 'Criptomoeda',
      texto: 'Uma moeda digital que não é emitida por nenhum governo ou banco central. Negocia 24 horas por dia, todos os dias (diferente da bolsa, que só funciona em horário comercial), e costuma ter volatilidade bem mais alta.'
    },
  };

  let popoverAtual = null;

  function fecharPopover() {
    if (popoverAtual) {
      popoverAtual.remove();
      popoverAtual = null;
    }
  }

  function abrirPopover(elemento, chave) {
    const dados = TERMOS[chave];
    if (!dados) {
      console.warn('[glossario.js] termo não encontrado:', chave);
      return;
    }

    const pop = document.createElement('div');
    pop.className = 'glossario-popover';
    pop.dataset.termoAberto = chave;
    pop.innerHTML =
      '<p class="glossario-popover-titulo">' + dados.titulo + '</p>' +
      '<p class="glossario-popover-texto">' + dados.texto + '</p>';

    document.body.appendChild(pop);

    // Posiciona perto do termo tocado, sem deixar vazar da tela.
    const r = elemento.getBoundingClientRect();
    const largura = Math.min(300, window.innerWidth - 24);
    pop.style.width = largura + 'px';

    let esquerda = r.left;
    if (esquerda + largura > window.innerWidth - 12) esquerda = window.innerWidth - largura - 12;
    if (esquerda < 12) esquerda = 12;
    pop.style.left = esquerda + 'px';

    const altura = pop.getBoundingClientRect().height;
    let topo = r.bottom + 8;
    if (topo + altura > window.innerHeight - 12) topo = r.top - altura - 8;
    if (topo < 8) topo = 8;
    pop.style.top = topo + 'px';

    popoverAtual = pop;
  }

  function injetarEstilos() {
    if (document.getElementById('glossario-style')) return;
    const style = document.createElement('style');
    style.id = 'glossario-style';
    style.textContent =
      '.glossario-termo{border-bottom:1.5px dotted #5b2a99;cursor:pointer;white-space:nowrap}' +
      '.glossario-popover{position:fixed;z-index:9999;background:#fff;border:1.5px solid #e3d9f5;' +
        'border-radius:14px;padding:12px 14px;box-shadow:0 8px 24px rgba(30,15,60,.18);' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;animation:glossarioFade .15s ease}' +
      '.glossario-popover-titulo{font-family:"DM Mono",monospace;font-size:11px;letter-spacing:.5px;' +
        'color:#5b2a99;margin:0 0 6px;font-weight:700}' +
      '.glossario-popover-texto{font-size:12.5px;line-height:1.55;color:#3a3444;margin:0}' +
      '@keyframes glossarioFade{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(style);
  }

  // Delegação de evento no documento inteiro — funciona mesmo pra
  // termos que ainda nem existem quando a página carrega (ex: um card
  // que só é criado depois de um fetch terminar).
  document.addEventListener('click', function (e) {
    const termoEl = e.target.closest('.glossario-termo');

    if (termoEl) {
      e.stopPropagation();
      const chave = termoEl.dataset.termo;
      const jaEstaAberto = popoverAtual && popoverAtual.dataset.termoAberto === chave;
      fecharPopover();
      if (!jaEstaAberto) abrirPopover(termoEl, chave);
      return;
    }

    if (popoverAtual && !e.target.closest('.glossario-popover')) {
      fecharPopover();
    }
  });

  injetarEstilos();
})();
