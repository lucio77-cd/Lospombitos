# Inventário preliminar de dados legados e evidências Firebase

**Projeto:** Lospombitos  
**Branch:** `codex/seguranca-carteira-pv01-pv03`  
**Status:** análise estática do repositório; nenhuma leitura foi feita diretamente no Firestore de produção  
**Data do registro:** 2026-10-16

## 1. Limite da evidência

Este documento registra apenas o que pode ser confirmado no código versionado. O acesso ao Firebase Console, aos documentos reais do Firestore, aos logs de produção e às regras publicadas não foi estabelecido nesta etapa. Portanto, nenhum número de contas, saldo ou divergência real é conhecido.

**Não interpretar este inventário como auditoria concluída dos dados de produção.** Nenhum documento foi criado, atualizado, apagado ou exportado.

## 2. Fontes identificadas no código

| Fonte | Uso identificado | Risco legado / verificação necessária |
|---|---|---|
| `usuarios/{uid}` | Perfil privado e campos financeiros históricos | O código antigo pode ter misturado perfil, e-mail e campos financeiros no mesmo documento. Inventariar campos presentes e dependências antes de remover qualquer campo. |
| `carteiras/{uid}` | Carteira usada pela API de ordens | É a fonte financeira consultada pela API atual. Verificar documentos ausentes, saldos inválidos, estrutura de posições e divergências com histórico. |
| `ordens/{id}` | Histórico de ordens | Confirmar status, vínculo por UID, datas, quantidade, preço e total. Não assumir que toda ordem registrada foi executada. |
| `perfis_publicos/{uid}` | Diretório social com lista permitida de campos públicos | A sincronização é progressiva pelo fluxo do usuário. Verificar perfis ausentes e documentos com campos inesperados; não copiar dados privados/financeiros. |
| `posts/{id}` | Feed social e posts automáticos de trade | Identificar dependências e validar vínculo do UID e tipo do post. Não tratar post de trade como livro contábil sem confirmação. |
| `usuarios/{uid}/pomb_historico/{docId}` | Subcoleção histórica permitida pelas regras versionadas | Confirmar se existe na instância real e se tem relevância financeira. |
| `convites/{codigo}` | Fluxo de convites | Não é fonte de saldo; verificar somente se cadastro/adesão depender de convites. |
| `pagamentos/{id}` | Regras versionadas restringem acesso; uso precisa ser confirmado | A própria documentação das regras marca a área para revisão. Verificar existência, esquema e consumidores antes de decidir qualquer tratamento. |

A lista acima é um ponto de partida derivado do código, não uma lista completa de coleções reais. As regras versionadas mencionam outras coleções antigas ou não auditadas; a existência, uso e conteúdo delas precisam ser confirmados no Console e por inventário autorizado.

## 3. Campos financeiros encontrados no código

### Carteira
- `saldo_disponivel`
- `saldo_investido`
- `patrimonio_total`
- `posicoes`
- `historico_ordens`
- datas de criação/atualização

### Perfil privado legado
- `saldo_disponivel`
- `saldo_investido`
- `patrimonio_total`
- `rentabilidade_pct`
- `pombcoins`

Os campos podem não existir em todos os documentos. A presença no código não prova que existam em produção nem que os valores estejam corretos.

### Outros dados relacionados
- Ordens: `uid`, `ticker`, `tipo`, `lado`, `quantidade`, `preco`, `total`, `status`, `data`.
- Perfil público permitido: `uid`, `nome`, `username`, `foto_perfil`, `perfil_completo`, `perfil_investidor`, `bio`, `musica`, `filme`, `cor`, `data_adesao`, `data_germina`.

## 4. Observações de risco confirmadas no código

1. A API de ordens consulta `carteiras/{uid}` e recusa a operação quando a carteira não existe; ela não deve presumir saldo inicial.
2. A inicialização atual cria perfil privado e carteira numa transação, mas a política atual ainda atribui capital simulado de 500.000 a contas consideradas novas. A política de produto precisa de aprovação explícita antes de futuras mudanças.
3. O serviço atual trata perfil/carteira parciais e contas fora da janela de cadastro como casos de reconciliação (HTTP 409), em vez de completar automaticamente.
4. O perfil público é sincronizado em fluxos de login/feed/perfil; logo, documentos públicos ausentes podem representar migração progressiva ainda não executada, e não necessariamente perda de perfil privado.
5. As regras versionadas no repositório se identificam como rascunho reconstruído. Não são evidência das regras atualmente publicadas no Firebase.
6. A execução da ordem ainda contém caminhos de preço informados pelo cliente para ordens limitadas/stop e certos produtos de renda fixa, conforme comentário no código. Isso deve ser analisado separadamente da migração de dados e não pode ser considerado validado por este inventário.

## 5. Procedimento de coleta somente de leitura

A coleta deve ser realizada por pessoa autorizada, no projeto e ambiente confirmados, sem compartilhar credenciais no chat ou no repositório.

### Evidência A — identidade do projeto e regras
- Confirmar Project ID no Firebase Console e relacioná-lo ao ambiente esperado.
- Abrir Firestore Database → Rules e capturar/exportar as regras publicadas com data/hora.
- Registrar versão/hash ou cópia íntegra das regras e comparar com `firestore.rules` da branch.
- Registrar diferenças sem publicar nada.
- Verificar configurações relevantes de Authentication, service accounts, índices e Functions/Hosting/Vercel, sem revelar segredos.

### Evidência B — inventário de esquema
- Usar ferramenta administrativa autorizada em modo somente leitura para listar nomes de coleções e subcoleções e contar documentos.
- Para cada coleção, identificar nomes de campos e tipos sem exportar valores pessoais desnecessários.
- Para documentos financeiros, gerar contagens agregadas: ausente, nulo, tipo incorreto, negativo, não finito, estrutura inesperada e UID divergente.
- Não imprimir e-mails, tokens, chaves, bios ou documentos completos no relatório.

### Evidência C — consistência financeira
- Comparar presença e tipos dos campos em perfil privado e carteira.
- Calcular divergências entre valores financeiros legados e carteira sem alterar os documentos.
- Validar invariantes aritméticos apenas quando o esquema e a regra de negócio forem confirmados. Por exemplo, patrimônio pode não ser igual a saldo disponível + saldo investido se houver posições avaliadas de outra forma, taxas ou regras específicas.
- Agrupar por categoria de triagem (consistente, parcial, antiga sem dados, divergente, inválida, origem inconclusiva).
- Cruzar ordens e histórico com cautela: status e semântica de execução precisam ser confirmados antes de usar ordens como fonte de reconciliação.

### Evidência D — backup e restauração
- Antes de qualquer futura escrita, confirmar estratégia de exportação/snapshot suportada para o ambiente e permissões mínimas.
- Registrar escopo, horário, projeto e local protegido do backup.
- Testar restauração em projeto isolado; não restaurar sobre produção para testar.
- Não anexar exportação com dados pessoais/financeiros a issues ou PR públicos.

## 6. Modelo de relatório de inventário

Preencher somente com resultados reais da coleta autorizada.

| Indicador | Resultado | Evidência / responsável |
|---|---|---|
| Project ID e ambiente confirmados | Pendente | Pendente |
| Regras publicadas capturadas | Pendente | Pendente |
| Diferença entre regras publicadas e versionadas | Pendente | Pendente |
| Total de documentos por coleção | Pendente | Pendente |
| Perfis privados sem carteira | Pendente | Pendente |
| Carteiras sem perfil privado | Pendente | Pendente |
| Contas antigas sem ambos os documentos | Pendente | Pendente |
| Campos financeiros legados presentes | Pendente | Pendente |
| Saldos ausentes/nulos/tipo incorreto/negativos | Pendente | Pendente |
| Divergências entre perfil legado e carteira | Pendente | Pendente |
| Ordens/históricos inconclusivos | Pendente | Pendente |
| Perfis públicos ausentes ou inválidos | Pendente | Pendente |
| Backup verificado por restauração isolada | Pendente | Pendente |
| Dependências de campos financeiros legados no frontend/API | Pendente | Pendente |

## 7. Critérios para encerrar a etapa de evidências

Esta etapa somente pode ser marcada como concluída quando:
- [ ] O ambiente e o Project ID estiverem confirmados.
- [ ] As regras realmente publicadas estiverem registradas e comparadas ao repositório.
- [ ] O inventário de coleções e esquemas tiver sido obtido em modo somente leitura.
- [ ] As contagens e classificações estiverem reproduzíveis.
- [ ] As divergências estiverem documentadas sem correção automática.
- [ ] As fontes de verdade e semântica de ordens/posições estiverem aprovadas.
- [ ] O backup e a restauração tiverem evidência verificável.
- [ ] Não houver credenciais ou exportações sensíveis em logs, issues ou PRs.

## 8. Próxima decisão

Até que as evidências sejam reunidas, a migração permanece bloqueada. O próximo passo operacional é obter do responsável autorizado as regras publicadas e o resultado do inventário somente leitura, ou configurar acesso seguro e restrito para essa coleta. Não solicitar nem armazenar chaves privadas, tokens de serviço ou arquivos de credenciais no repositório.
