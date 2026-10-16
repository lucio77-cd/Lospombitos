# Plano de validação do cadastro e migração segura de dados legados

**Projeto:** Lospombitos  
**Status:** documento de planejamento — não autoriza migração, alteração de dados nem publicação em produção  
**Branch de referência:** `codex/seguranca-carteira-pv01-pv03`

## 1. Objetivo e limites

Definir condições verificáveis para validar o cadastro, classificar registros legados e, somente após aprovação, executar uma eventual migração controlada.

Este documento é planejamento. Não executar agora:
- migração ou limpeza de documentos;
- criação, correção ou substituição de saldos;
- publicação de regras do Firestore;
- implantação em produção ou alteração do projeto Firebase;
- mesclagem do PR.

## 2. Invariantes de segurança

1. **A migração não concede capital.** Nenhum registro legado recebe saldo inicial, bônus ou valor padrão por estar vazio, ausente ou inconsistente.
2. **Não sobrescrever saldos existentes.** Nenhum saldo, patrimônio, posição, ordem ou histórico é substituído automaticamente.
3. **Não inferir saldo oficial por conveniência.** Um campo ausente, nulo, inválido ou divergente não equivale a zero.
4. **Carteira como fonte financeira definida pelo código atual.** `carteiras/{uid}` é a fonte utilizada pela API de ordens. Campos financeiros antigos em `usuarios/{uid}` são tratados como legado, não como fonte de atualização.
5. **Sem exclusão durante a primeira migração.** A primeira execução deve ser aditiva e não destrutiva. Limpeza de campos antigos é uma etapa separada, com aprovação própria.
6. **Servidor autorizado.** Operações financeiras e de migração devem usar ambiente administrativo controlado; nunca confiar em valores enviados pelo navegador.
7. **Idempotência.** Reexecutar uma etapa não pode criar capital, duplicar registros ou repetir ajustes.
8. **Auditoria rastreável.** Cada decisão deve registrar identificador do caso, categoria, contagens, resultado e motivo, sem despejar tokens, credenciais ou dados pessoais desnecessários nos logs.
9. **Parada segura.** Em dúvida, conflito ou erro parcial, interromper o registro afetado e encaminhar para reconciliação manual.
10. **Sem promessa de reversão mágica.** Reversão deve considerar as transações legítimas ocorridas depois da migração; nunca restaurar um snapshot antigo cegamente sobre dados mais recentes.

### Decisão pendente sobre capital de novos cadastros

O código atual de inicialização concede saldo simulado de 500.000 unidades monetárias a contas consideradas novas dentro da janela de cadastro. Isso é distinto da migração legada, que jamais deve conceder capital. Antes de implementar mudanças adicionais no cadastro, o responsável pelo produto deve confirmar expressamente se esse capital inicial simulado continua sendo uma regra funcional aprovada. Este documento não altera esse comportamento.

## 3. Validação do cadastro

### 3.1 Classificação por estado

| Perfil privado `usuarios/{uid}` | Carteira `carteiras/{uid}` | Idade da conta / evidência | Resultado esperado |
|---|---|---|---|
| Existe | Existe | Qualquer idade | Não inicializar nem substituir; validar integridade e classificar como existente |
| Existe | Ausente | Qualquer idade | Bloquear inicialização automática; reconciliação |
| Ausente | Existe | Qualquer idade | Bloquear inicialização automática; reconciliação |
| Ausente | Ausente | Conta comprovadamente nova e dentro da janela aprovada | Elegível para fluxo de cadastro novo somente conforme política de capital aprovada |
| Ausente | Ausente | Conta antiga, data indisponível ou inconsistência temporal | Bloquear; reconciliação |
| Existe | Existe | Campos financeiros inválidos, negativos, não finitos ou estrutura inesperada | Preservar evidências e bloquear operações financeiras até análise; não corrigir automaticamente |

A presença dos dois documentos, por si só, não prova que os saldos estão corretos. É necessário validar tipos, invariantes financeiros e consistência com ordens/histórico disponíveis.

### 3.2 Validações obrigatórias do endpoint

- Aceitar somente o método HTTP previsto e exigir token Firebase válido.
- Obter o UID do token verificado, nunca do corpo da requisição.
- Confirmar a existência e a data de criação da conta pelo Firebase Admin.
- Tratar data de criação ausente, inválida ou futura como caso de reconciliação.
- Fazer a leitura de perfil e carteira e a decisão de criação numa transação Firestore.
- Usar criação condicional que falhe se o documento já existir.
- Se os documentos estiverem ambos presentes, retornar resultado idempotente sem alterar campos.
- Se houver estado parcial ou conta fora da janela permitida, retornar conflito controlado (HTTP 409) sem escrita.
- Não assumir saldo padrão quando a carteira não existe.
- Não registrar token, chave privada, e-mail completo ou payload financeiro completo em logs de erro.

A janela temporal atualmente usada deve ser confirmada e testada nas fronteiras exatas antes de qualquer aprovação de produção.

## 4. Inventário e reconciliação dos dados legados

### 4.1 Fontes a inventariar

- `usuarios/{uid}`: campos financeiros legados e dados privados.
- `carteiras/{uid}`: saldo disponível, saldo investido, patrimônio, posições e datas de atualização.
- `ordens/{id}`: ordens associadas ao UID, status, quantidade, preço, total e data.
- Outras coleções financeiras encontradas na instância real: inventariar antes de definir sua relevância. Não presumir que a lista do repositório é completa.
- Regras efetivamente publicadas no Firebase Console: evidência ainda necessária.

### 4.2 Categorias de triagem

- **A — consistente:** perfil e carteira presentes; tipos e invariantes válidos; sem divergência material identificada.
- **B — perfil sem carteira:** não criar carteira nem capital automaticamente.
- **C — carteira sem perfil:** preservar carteira; não reconstruir perfil silenciosamente.
- **D — conta antiga sem documentos:** não conceder capital; investigar histórico e origem do cadastro.
- **E — divergência financeira:** saldos ou patrimônio diferem entre documentos, ou não batem com ordens/histórico; bloquear ajuste automático.
- **F — estrutura inválida:** campos ausentes, tipo incorreto, valor negativo, número não finito, UID divergente ou documento duplicado/orfão.
- **G — origem inconclusiva:** evidência insuficiente para determinar qual valor é confiável.

Categorias B–G exigem reconciliação documentada. A categoria A ainda precisa passar pelas verificações globais e de amostragem definidas antes da migração.

### 4.3 Procedimento de reconciliação

1. Gerar relatório somente de leitura, com contagens por categoria e identificadores internos mínimos.
2. Comparar os campos financeiros legados com a carteira, ordens e histórico disponíveis, considerando que ordem registrada não prova necessariamente que a execução foi concluída.
3. Definir a fonte autoritativa por tipo de dado e por período, com responsável e justificativa.
4. Registrar divergência, evidências consultadas, valor preservado, decisão aprovada e aprovador.
5. Não efetuar ajustes em lote baseados em uma única amostra ou em suposições.
6. Submeter casos inconclusivos para decisão manual; manter bloqueados até decisão.
7. Não apagar dados de origem na fase de reconciliação.

## 5. Plano de migração segura

### Fase 0 — evidências e autorização
- Confirmar projeto Firebase e ambientes (desenvolvimento, homologação e produção).
- Obter cópia/exportação consistente e protegida dos dados relevantes.
- Capturar e revisar as regras atualmente publicadas, índices, funções e configurações pertinentes.
- Confirmar a política de capital inicial para novos cadastros.
- Aprovar o mapeamento de campos, a fonte de verdade e os responsáveis.

**Saída:** inventário aprovado, política definida e evidências armazenadas com acesso restrito.

### Fase 1 — simulação somente de leitura
- Executar análise sem escrever no Firestore.
- Produzir contagem total e contagem por categoria.
- Gerar relatório de valores ausentes, inválidos e divergentes sem expor dados pessoais desnecessários.
- Registrar versão do código, horário, ambiente e identificador da execução.
- Repetir a simulação e explicar qualquer variação.

**Saída:** relatório reproduzível e diferenças explicadas.

### Fase 2 — ensaio isolado
- Usar projeto Firebase de homologação com dados sintéticos ou uma cópia devidamente protegida e autorizada.
- Exercitar sucesso, interrupção, repetição, conflito e recuperação.
- Demonstrar que a rotina não concede capital, não sobrescreve valores existentes e não apaga origem.
- Verificar logs e permissões administrativas.

**Saída:** todos os testes críticos aprovados; nenhum dado real alterado.

### Fase 3 — aprovação do lote piloto
- Selecionar lote pequeno e representativo, com registros de baixo risco e previamente classificados.
- Aprovação explícita do responsável pelos dados e do responsável técnico.
- Definir janela, plano de interrupção, monitoramento e critério de sucesso antes de iniciar.

**Saída:** autorização registrada para lote e escopo específicos.

### Fase 4 — execução controlada
- Executar com privilégio mínimo e identificador único de execução.
- Revalidar pré-condições imediatamente antes de cada escrita.
- Usar transações ou operações condicionais; interromper diante de conflito.
- Registrar contagens de lidos, elegíveis, migrados, ignorados, conflitantes e falhos.
- Não executar limpeza destrutiva no mesmo lote.

**Saída:** relatório pós-execução comparado ao plano, com divergências zero ou explicadas e aprovadas.

### Fase 5 — observação e eventual limpeza separada
- Monitorar cadastro, login, consulta de perfil, leitura da carteira e execução de ordens.
- Só considerar remoção de campos legados numa proposta futura independente, após confirmar que nenhum cliente, função ou relatório ainda depende deles.
- Exigir backup verificável, aprovação explícita e plano de restauração próprio antes de qualquer limpeza.

## 6. Auditoria, backup e reversão

### Auditoria mínima por execução
- ID único da execução, ambiente, versão/commit e horário.
- Escopo e critérios de seleção.
- Quantidade de documentos lidos, elegíveis, migrados, ignorados, em conflito e falhos.
- Identificador do registro afetado, tipo de ação e resultado, evitando armazenar conteúdo sensível completo.
- Valores anteriores e posteriores somente em registro de auditoria protegido quando indispensável para reconciliação; nunca em logs públicos.
- Identidade do aprovador, operador e motivo para exceções manuais.
- Hashes ou checksums de relatórios/exportações quando aplicável.

### Requisitos de backup
- Exportação ou snapshot consistente antes de qualquer escrita.
- Confirmação de que o backup pode ser acessado e restaurado em ambiente de teste.
- Acesso restrito, prazo de retenção definido e proteção adequada dos dados.
- Registro do ponto temporal e do escopo coberto pelo backup.

### Plano de reversão
- Preferir mudanças aditivas e não destrutivas.
- Para cada alteração, manter operação inversa específica e evidência do estado anterior.
- Se ocorrer falha, interromper o lote e preservar logs; não continuar automaticamente.
- Restaurar somente registros que não tenham recebido alterações legítimas posteriores ou reconciliar essas alterações antes.
- Testar reversão no ambiente isolado.
- A reversão deve ser aprovada e executada por responsável autorizado; não presumir que restaurar um backup global seja seguro.

## 7. Matriz de testes e resultados esperados

| Teste | Resultado esperado |
|---|---|
| Token ausente, inválido ou expirado | Requisição negada; nenhuma escrita |
| Método HTTP não permitido | HTTP 405; nenhuma escrita |
| Conta nova elegível e ambos documentos ausentes | Somente comportamento explicitamente aprovado para cadastro novo; nenhuma duplicação |
| Ambos documentos já existem | Retorno idempotente; conteúdo inalterado |
| Apenas perfil ou apenas carteira existe | HTTP 409 / reconciliação; conteúdo inalterado |
| Conta antiga sem documentos | HTTP 409 / reconciliação; nenhum capital criado |
| Data de criação inválida ou futura | Bloqueio; nenhuma escrita |
| Duas inicializações concorrentes | No máximo uma inicialização; nenhum documento ou capital duplicado |
| Carteira ausente durante execução de ordem | Ordem recusada; não presumir saldo inicial |
| Saldo existente divergente do perfil legado | Nenhuma substituição automática; conflito auditado |
| Campos financeiros no perfil público | Regras negam a escrita |
| Cliente tenta alterar saldo, patrimônio, carteira ou ordem | Regras negam a operação |
| Usuário tenta ler perfil privado de terceiro | Regras negam a leitura |
| Reexecução da simulação | Mesmas classificações, salvo mudanças de dados explicadas |
| Interrupção parcial de lote | Execução pode ser retomada sem duplicação; falhas identificadas |
| Reversão em homologação | Estado anterior recuperado sem apagar alterações legítimas posteriores |
| Regras de produção comparadas às regras versionadas | Diferenças documentadas e aprovadas; sem publicação automática |

Os testes unitários e do Emulator já existentes são uma base, não prova completa de segurança. Precisam ser complementados por testes de concorrência, validação de dados financeiros, recuperação e integração em homologação.

## 8. Evidências ainda pendentes

- [ ] Captura ou exportação das regras **realmente publicadas** no Firebase Console, com projeto e data identificados.
- [ ] Confirmação de que o projeto Firebase e a conta de serviço usados em cada ambiente são os esperados.
- [ ] Inventário somente de leitura das coleções e campos financeiros reais, incluindo documentos antigos, incompletos e órfãos.
- [ ] Contagens por categoria e relatório de divergências, sem presumir o volume ou a qualidade dos dados.
- [ ] Confirmação da regra de capital inicial simulado para novos cadastros.
- [ ] Confirmação da janela de cadastro considerada segura e do comportamento esperado nas fronteiras temporais.
- [ ] Evidência de backup/exportação e ensaio de restauração.
- [ ] Revisão de todas as rotas e telas que ainda leem campos financeiros de `usuarios/{uid}`.
- [ ] Verificação de coleções e regras que o rascunho do repositório identifica como não auditadas ou removidas.
- [ ] Execução de testes de integração e fluxo real em homologação.

## 9. Critérios objetivos para autorizar implementação

A implementação da migração só pode começar quando **todos** os itens abaixo forem verdadeiros:

- [ ] O escopo e o ambiente estão identificados sem ambiguidade.
- [ ] As regras publicadas no Firebase foram verificadas e comparadas com o repositório.
- [ ] A fonte de verdade de cada campo financeiro foi aprovada.
- [ ] A política de capital inicial de novos cadastros foi decidida explicitamente.
- [ ] Existe inventário reproduzível, com categorias e totais reconciliados.
- [ ] Todos os casos conflitantes estão resolvidos ou formalmente excluídos do lote.
- [ ] O backup foi verificado por um ensaio de restauração.
- [ ] A simulação de leitura foi repetida e seus resultados explicados.
- [ ] Testes unitários, regras no Emulator, integração e concorrência passaram.
- [ ] A idempotência, a auditoria, a interrupção segura e a reversão foram demonstradas em homologação.
- [ ] Há aprovação explícita do responsável pelo produto/dados e do responsável técnico para o lote e janela definidos.
- [ ] O plano de monitoramento e os limites de interrupção estão escritos.

Se qualquer item falhar, a migração permanece **bloqueada**. A ausência de evidência não será tratada como aprovação.

## 10. Critérios de conclusão do trabalho de planejamento

O planejamento estará concluído quando:
1. Este documento for revisado e aprovado.
2. As pendências de evidência estiverem listadas com responsáveis e status.
3. A política de capital inicial estiver resolvida.
4. A matriz de testes tiver responsáveis e resultados registrados.
5. O relatório de inventário/reconciliação estiver disponível, sem alterações nos dados de produção.
6. Houver decisão formal de avançar, adiar ou excluir cada categoria de registro.

**Situação atual:** planejamento documentado; validação de produção e migração não autorizadas. Nenhum dado Firebase foi alterado por este documento.
