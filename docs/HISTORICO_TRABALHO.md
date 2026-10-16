# Histórico de trabalho — Lospombitos

**Branch de acompanhamento:** `codex/seguranca-carteira-pv01-pv03`  
**PR relacionado:** [#1 — Separate public profiles and secure wallet initialization](https://github.com/lucio77-cd/Lospombitos/pull/1)  
**Última atualização deste registro:** 2026-10-16

Este histórico organiza as etapas realizadas e separa alterações no código, documentação, testes automatizados e evidências manuais. Não significa que a migração ou a validação de produção estejam concluídas.

## Linha do tempo

| Data | Etapa | Registro e limite |
|---|---|---|
| 2026-10-15 | Início do trabalho de segurança na carteira e nos perfis | Aberto o PR #1 em branch separada, mantendo-o como rascunho. Objetivo: separar dados públicos e privados e proteger a inicialização da carteira. Sem merge ou implantação em produção. |
| 2026-10-15 | Proteções de carteira e perfil | Implementados no branch o serviço de inicialização da carteira no servidor, a validação do token e da data de criação da conta, a remoção do saldo alternativo de R$ 500.000 quando falta carteira e a separação dos campos públicos e privados. As regras versionadas são uma proposta no repositório, não prova das regras publicadas no Firebase. |
| 2026-10-15 | Testes automatizados iniciais | Foi registrado resultado positivo para 10 testes unitários e 8 testes de regras com Firestore Emulator no commit funcional então verificado. Esse resultado não comprova, por si só, o estado dos commits posteriores nem a configuração de produção. |
| 2026-10-16 | Plano de validação e tratamento de legados | Adicionado `docs/PLANO_VALIDACAO_CADASTRO_MIGRACAO_LEGADOS.md`, definindo invariantes, classificação de contas, critérios de aprovação, testes, auditoria e reversão. A decisão foi não conceder capital automaticamente a contas antigas e não sobrescrever saldos existentes. Nenhuma migração foi executada. |
| 2026-10-16 | Inventário preliminar e evidências Firebase | Adicionado `docs/INVENTARIO_LEGADOS_E_EVIDENCIAS_FIREBASE.md`. A análise foi estática, baseada no código versionado; não houve leitura direta do Firestore de produção nem confirmação das regras publicadas. |
| 2026-10-16 | Coletor de inventário somente leitura | Adicionado `scripts/inventario-firestore-readonly.js`, com testes em `tests/inventarioFirestoreReadonly.test.js` e integração ao comando de testes. O coletor foi preparado para produzir contagens agregadas e apontar campos ausentes, tipos e valores financeiros negativos sem imprimir IDs ou valores pessoais. **Ainda não foi executado contra o Firebase.** A execução de CI do commit mais recente precisa ser verificada antes de registrar aprovação. |
| 2026-10-16 | Teste manual de venda no celular habitual | O usuário informou que realizou uma ordem de venda no celular em que costuma usar o Lospombitos, que a operação funcionou e confirmou os quatro pontos de verificação mencionados na conversa. Isso é evidência manual do cenário testado; o ambiente utilizado (produção ou teste) ainda não foi identificado neste registro. Não comprova todos os cenários nem substitui testes automatizados ou auditoria dos dados. |

## Situação atual

- **PR #1:** manter aberto e em rascunho até revisão e autorização explícita.
- **Migração e limpeza de legados:** não executadas.
- **Firebase de produção:** nenhuma alteração de dados ou publicação de regras foi realizada por estas etapas.
- **Coletor de inventário:** implementado no branch, ainda sem execução confirmada contra o Firebase.
- **CI do commit mais recente:** não marcar como aprovado até consultar o resultado efetivo.
- **Próxima evidência pendente:** identificar se o teste manual de venda foi realizado em produção ou em ambiente de teste; depois, verificar o CI atual e planejar a coleta somente leitura autorizada.

## Regra de atualização do histórico

Acrescentar novas entradas por data, sem reescrever etapas anteriores como concluídas quando ainda estiverem pendentes. Distinguir sempre: alteração no código, teste automatizado, teste manual, leitura de produção e mudança efetiva de produção.
