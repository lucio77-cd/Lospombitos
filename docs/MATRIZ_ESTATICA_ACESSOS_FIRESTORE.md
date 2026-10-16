# Matriz estática de acessos Firestore — Lospombitos

**Status:** análise estática da branch `codex/seguranca-carteira-pv01-pv03`.  
**Limite importante:** esta matriz descreve o código e o arquivo firestore.rules versionados na branch; **não comprova quais regras estão publicadas no Firebase de produção**. O usuário informou que não consegue distinguir regras publicadas de alterações pendentes no Console. Não foi feita leitura do banco de produção, publicação de regras, operação financeira ou alteração de saldo.

## 1. Escopo e método

Foram cruzados os caminhos Firestore encontrados no cliente e nos endpoints server-side: auth.js, feed.html, perfil.html, carteira.html, ordem.html, relatorio.html, germinar.html, api/inicializar-carteira.js, api/_lib/inicializarCarteiraService.js, api/executar-ordem.js, api/snapshot-diario.js, firestore.rules e firebase.json.

É uma revisão de código, não um teste executado. As conclusões de “permitido/negado” abaixo são previsões pela regra versionada e precisam ser confirmadas no Emulator com dados sintéticos.

## 2. Matriz por caminho e operação

| Caminho | Chamador / operação observada | Regra versionada na branch | Comportamento esperado se negado / observações |
|---|---|---|---|
| usuarios/{uid} | Cliente: ler o próprio perfil em auth.js, feed.html, germinar.html, perfil.html, carteira.html, ordem.html e relatorio.html. | read somente para o dono autenticado. | Login/validação de sessão pode não concluir; páginas que capturam erro podem cair em valores padrão ou mostrar erro. Leitura de outro UID deve falhar. |
| usuarios/{uid} | Cliente: atualizar perfil em auth.js com set merge. | create negado; atualização somente pelo dono e se as chaves alteradas estiverem na lista permitida: nome, foto_perfil, perfil_completo, data_germina, username, bio, perfil_investidor, musica, filme, cor. | Se o documento não existir, ou o payload alterar campo não permitido, a gravação deve falhar. A tela de cadastro deve exibir erro; não deve criar o perfil diretamente. A inicialização é feita pelo endpoint server-side. |
| usuarios/{uid}/pomb_historico/{docId} | Não foi encontrado uso ativo no cliente nas páginas inspecionadas. | Dono autenticado pode ler/criar; atualização e exclusão negadas. | Operação de outro usuário, update ou delete deve falhar. Confirmar se a subcoleção ainda é funcional ou legado sem consumidor. |
| perfis_publicos/{uid} | Cliente: ler perfil público individual em perfil.html; listar diretório em feed.html; sincronizar perfil em auth.js e feed.html. | Leitura para qualquer usuário autenticado. Criação/atualização só pelo dono; somente campos públicos listados; uid deve corresponder ao ID e perfil_completo deve ser booleano. Exclusão negada. | Falha na sincronização é capturada e registrada no console; o perfil público pode ficar desatualizado/ausente. O diretório pode exibir erro ou ficar vazio. Usuário não autenticado não deve ler/listar. |
| carteiras/{uid} | Cliente: leitura do próprio saldo/posições em perfil.html, carteira.html, ordem.html e relatorio.html. | Leitura somente pelo dono autenticado; criação, atualização e exclusão do cliente negadas. | Falha de leitura pode impedir carregamento ou provocar fallback visual. Nenhum cliente deve conseguir alterar saldo/posições diretamente. Inicialização e ordens são escritas por Admin SDK no servidor, fora da avaliação destas regras. |
| carteiras/{uid}/historico_valor/{data} | Cliente lê em carteira.html; endpoint agendado escreve em api/snapshot-diario.js. | Não há regra explícita para a subcoleção; o catch-all nega leitura e escrita de cliente. Admin SDK do endpoint ignora Firestore Rules. | A leitura da página é capturada com fallback para lista vazia; o gráfico/linha histórica pode aparecer vazio sem mostrar o motivo. Este é um desalinhamento estático entre caminho usado e regras da branch. |
| ordens/{id} | Cliente consulta as próprias ordens em perfil.html e carteira.html; endpoint de ordem cria registros. | Leitura somente se autenticado e resource.data.uid == request.auth.uid; toda escrita do cliente negada. | Consulta deve incluir filtro uid igual ao UID autenticado para que a regra possa autorizar todos os documentos. Leitura direta de ordem alheia e escrita pelo cliente devem falhar. As consultas observadas incluem o filtro. Endpoint server-side grava via Admin SDK. |
| posts/{id} | Cliente lê feed/timeline e posts do perfil; cria post de texto e atualiza likes em feed.html; endpoint de ordem cria post de trade. | Leitura para autenticados. Criação pelo dono do post, desde que tipo != trade. Atualização limitada a likes e curtido_por, adicionando/removendo apenas o UID do próprio usuário e alterando o contador em ±1. Exclusão pelo dono. | Feed pode mostrar erro; criação mostra mensagem de falha; like reverte o estado visual e informa que não foi possível curtir. Criação de tipo trade pelo cliente deve falhar; post de trade é criado pelo servidor via Admin SDK. |
| convites/{codigo} | Nenhum uso ativo do caminho foi encontrado no código cliente da branch; o comentário de regras menciona fluxo esperado/antigo. | get público; list negado. Criação por autenticado para si próprio com usado == false. Atualização exige que estivesse não usado, passe a usado e quem_usou seja o usuário autenticado. Exclusão negada. | Listagem, exclusão e operações sem as condições devem falhar. A atualização não restringe quais outras chaves podem mudar; uma atualização válida também pode alterar outros campos. Confirmar formato e uso real antes de propor regra corretiva. |
| pagamentos/{id} | Nenhuma leitura/escrita cliente foi encontrada nas páginas inspecionadas. | Leitura somente pelo dono autenticado; todas as escritas negadas. | Escritas de cliente falham. Confirmar se é coleção ainda usada por fluxo externo ou legado. |
| Qualquer outro caminho | Não há acesso explícito correspondente na branch; inclui nomes citados como transacoes, galeria, leiloes, lances e caminhos não mapeados. | Catch-all: leitura e escrita negadas. | Requisições de cliente devem falhar com permissão negada. Antes de manter esta política, inventariar os recursos ainda necessários para não quebrar funcionalidades antigas. |

## 3. Acessos server-side: não são cobertos pelas Security Rules

O Firebase Admin SDK usa IAM/credenciais de servidor e ignora as Firestore Security Rules. Portanto, as regras do cliente não substituem validação e autorização dentro dos endpoints.

| Endpoint | Caminhos / operação | Proteção observada no código | Verificação pendente |
|---|---|---|---|
| api/inicializar-carteira.js + api/_lib/inicializarCarteiraService.js | Lê usuarios/{uid} e carteiras/{uid}; pode criar os dois documentos em transação. | Verifica ID token Firebase, obtém o usuário autenticado e aplica decisão de inicialização/janela de criação. | Testes unitários e de endpoint para token inválido, conta antiga, estado parcial, já inicializada e conta nova. Não executar contra produção durante esta fase. |
| api/executar-ordem.js | Lê e atualiza carteiras/{uid}; cria ordens/{id} e posts/{id} em transação. | Verifica token; valida tipo/lado/ticker/quantidade e exige carteira existente; usa cotação de servidor para ordens a mercado de ações/FIIs/cripto. | Auditoria separada dos preços fornecidos pelo cliente em ordens limitadas/stop e renda fixa. Validar autenticação, saldo insuficiente, quantidade de venda, atomicidade e erros apenas com mocks/emulador. |
| api/snapshot-diario.js | Lista todas as carteiras e grava carteiras/{uid}/historico_valor/{data}. | Exige Authorization: Bearer CRON_SECRET; usa Admin SDK. O cron está configurado em vercel.json. | Testar ausência/valor inválido do segredo e dados sintéticos. Não chamar endpoint de produção nem compartilhar o segredo. Como percorre todas as carteiras, revisar logs e permissões do cron em auditoria separada. |

## 4. Achados priorizados

### A1 — Histórico de patrimônio negado por falta de regra explícita (alta prioridade funcional)

- Código cliente: carteira.html lê carteiras/{uid}/historico_valor.
- Escrita server-side: api/snapshot-diario.js salva nessa subcoleção via Admin SDK.
- Regras da branch: existe regra para o documento pai carteiras/{uid}, mas ela não se estende automaticamente à subcoleção; o catch-all nega o caminho filho.
- Efeito esperado: a leitura pelo cliente falha e é convertida silenciosamente em lista vazia. O cron pode continuar gravando, pois Admin SDK ignora as regras.
- Próximo passo seguro: incluir casos de permitir leitura do histórico próprio e negar leitura do histórico alheio no plano do Emulator; decidir a regra adequada antes de alterar firestore.rules.

### A2 — Atualização de convite não limita as chaves modificáveis (alta prioridade de integridade, uso real a confirmar)

A condição de allow update em convites/{codigo} verifica estado anterior, estado novo e quem_usou, mas não usa diff(...).affectedKeys().hasOnly(...). Se esse fluxo estiver ativo, outras propriedades do convite podem ser alteradas na mesma atualização autorizada. Confirmar esquema e fluxo antes de propor regra corretiva.

### A3 — Criação de posts sem validação completa do esquema (prioridade média)

A regra impede que o cliente crie posts de trade e exige uid igual ao usuário autenticado, mas não limita as chaves nem valida os tipos/valores de todos os campos. Avaliar payloads com campos extras, contadores iniciais incoerentes e valores malformados no Emulator. Não apertar a regra sem validar os campos reais usados pelo feed.

### A4 — Fallback de saldo visual em ordem.html (risco de interface, não de autorização)

A leitura de ordem.html usa c.saldo_disponivel ?? u.saldo_disponivel ?? 500000 para exibição. Se a carteira não existir ou a leitura falhar, a tela pode mostrar saldo legado ou o valor padrão. O endpoint de ordem, por outro lado, recusa carteira inexistente. Isso pode criar divergência visual e merece correção separada; não indica, por si só, que o endpoint aceitará uma ordem com saldo presumido.

### A5 — Falhas de leitura podem virar valores padrão (observabilidade)

Em relatorio.html, falhas ao ler usuário/carteira são capturadas e resultam em perfil padrão e posições vazias. Em carteira.html, a falha do histórico é convertida em lista vazia. Os testes devem distinguir “coleção vazia” de “permissão negada”, para que uma regra incorreta não pareça ausência normal de dados.

### A6 — Coleções/subcoleções com regra, mas sem consumidor localizado

Não foi encontrado uso ativo, nas páginas inspecionadas, de convites, pagamentos ou usuarios/{uid}/pomb_historico. Isso não prova que sejam inúteis: confirmar integrações externas e versões antigas antes de remover ou ampliar regras.

## 5. Matriz proposta para Firebase Emulator (dados inteiramente sintéticos)

Executar com projeto de teste, @firebase/rules-unit-testing e as regras locais da branch, nunca com credenciais ou dados de produção. O Emulator deve receber explicitamente o arquivo de regras; sem isso, ele pode iniciar com regras abertas.

| ID | Identidade | Operação | Resultado esperado |
|---|---|---|---|
| U01 | anônimo | ler usuarios/alice | Negado |
| U02 | Alice | ler usuarios/alice | Permitido |
| U03 | Bob | ler usuarios/alice | Negado |
| U04 | Alice | atualizar usuarios/alice alterando só bio | Permitido, se documento sintético pré-existente |
| U05 | Alice | alterar saldo_disponivel em usuarios/alice | Negado |
| U06 | Alice | criar usuarios/alice pelo cliente | Negado |
| P01 | autenticado | listar/ler perfis_publicos | Permitido |
| P02 | anônimo | ler/listar perfis_publicos | Negado |
| P03 | Alice | criar/atualizar perfil público com UID próprio e campos permitidos | Permitido |
| P04 | Alice | inserir campo privado/financeiro no perfil público | Negado |
| C01 | Alice | ler carteiras/alice | Permitido |
| C02 | Bob | ler carteiras/alice | Negado |
| C03 | Alice | criar/atualizar/excluir carteiras/alice pelo cliente | Negado |
| H01 | Alice | ler carteiras/alice/historico_valor/2026-01-01 | Negado pela regra atual; registrar como falha funcional esperada a corrigir depois |
| H02 | Bob | ler histórico de Alice | Negado |
| O01 | Alice | consultar ordens com where uid == Alice | Permitido |
| O02 | Alice | consultar ordens sem filtro de UID | Negado |
| O03 | Bob | ler ordem cujo uid é Alice | Negado |
| O04 | Alice | criar/alterar/excluir ordem pelo cliente | Negado |
| S01 | autenticado | ler feed posts | Permitido |
| S02 | Alice | criar post com uid=Alice, tipo=texto | Permitido |
| S03 | Alice | criar post tipo=trade pelo cliente | Negado |
| S04 | Alice | curtir post como Alice, adicionando apenas seu UID e incrementando likes em 1 | Permitido |
| S05 | Bob | alterar texto/ticker/UID do post alheio | Negado |
| S06 | Alice | excluir post de Bob | Negado |
| I01 | anônimo | obter convites/CODIGO por ID | Permitido pela regra atual |
| I02 | anônimo | listar convites | Negado |
| I03 | Alice | atualizar convite não usado para usado com quem_usou=Alice | Permitido pela regra atual; testar alteração simultânea de campo extra para demonstrar A2 |
| I04 | Alice | excluir convite | Negado |
| PG01 | Alice | ler pagamento com uid=Alice | Permitido |
| PG02 | Bob | ler pagamento de Alice | Negado |
| X01 | autenticado | ler/escrever caminho não mapeado | Negado |

**Regra de segurança para a execução:** preparar dados somente via contexto de teste com regras desativadas no Emulator; todas as operações avaliadas devem usar contexto de cliente autenticado/anônimo. Não usar firebase-admin contra o projeto real para estes testes.

## 6. Critério de conclusão da fase estática

- [x] Caminhos de leitura/escrita identificados nas páginas e endpoints listados acima.
- [x] Regras correspondentes da branch mapeadas, inclusive catch-all.
- [x] Efeitos esperados de negação anotados quando o código permite inferi-los.
- [x] Lacunas que exigem decisão ou confirmação de uso registradas.
- [ ] Confirmar se há outros arquivos/integrações fora da branch ou consumidores externos.
- [ ] Rodar testes de regras no Firebase Emulator com dados sintéticos.
- [ ] Revisar resultados e propor alterações de regras somente em branch, sem publicar.

## 7. Referências

- [Regras versionadas na branch](../firestore.rules)
- [Cliente de carteira](../carteira.html)
- [Endpoint de snapshot diário](../api/snapshot-diario.js)
- [Endpoint de execução de ordem](../api/executar-ordem.js)
- [Endpoint de inicialização](../api/inicializar-carteira.js)
- [Documentação oficial Firebase — testar regras do Firestore no Emulator](https://firebase.google.com/docs/firestore/security/test-rules-emulator)
- [Documentação oficial Firebase — testes de regras](https://firebase.google.com/docs/rules/unit-tests)
