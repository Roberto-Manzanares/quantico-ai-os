# Quantico AI OS - Estado Del Proyecto

## Estado Actual

Fase: V0.15 closed.

Version objetivo: V0.15.

Codigo implementado: si para V0.15.

Estado actual: V0.15 cerrada y congelada.

Ultimo hito: cierre formal de V0.15 Authority Runtime Safety Metrics Read API.

Provider validado V0.1: OpenAI.

Endpoint validado V0.1: Responses API.

Modelo usado V0.1: `gpt-5-nano`.

Resultado V0.1: `succeeded` / evaluation `pass`.

Provider validado V0.2: Anthropic.

Modelo usado V0.2: `claude-haiku-4-5-20251001`.

Resultado V0.2: `succeeded` / evaluation `pass`.

Tokens V0.2: input 202 / output 23.

Costo estimado V0.2: $0.000295.

Latencia V0.2: 1141ms.

Stop reason V0.2: `end_turn`.

Tests actuales: 158/158 pass.

Ultimo commit funcional V0.1: `8b913d00f2f8dee1f6e733f45c745dec028a05af`.

Commit de cierre V0.1: `36739d1dc9112e629c0e15283ab9697a4f427a37`.

V0.1: cerrada y congelada.

V0.2: cerrada y congelada.

Commit de cierre V0.2: `5906331bbe82f08911a8670c30e5cdc941230172`.

Objetivo V0.2: validacion real Anthropic y paridad multi-provider.

Restriccion de diseno V0.2: COST-FIRST POLICY.

V0.3: cerrada y congelada.

Objetivo V0.3: COST-FIRST Router real.

Commit de cierre V0.3: `976a9031cb08120b5a04791f05d9eda5abd35627`.

V0.4: cerrada y congelada.

Titulo V0.4: Actual Cost Accounting + Budget Ledger.

Objetivo V0.4: cerrar el ciclo economico del Kernel comparando costo estimado pre-ejecucion contra costo real post-ejecucion y persistiendo un ledger auditable.

Commit de cierre V0.4: `2b8df9eb7d5fb8962d95bd90ebafee95295cf301`.

V0.5: cerrada y congelada.

Titulo V0.5: Budget Enforcement.

Objetivo V0.5: usar el Budget Ledger como fuente de verdad operativa para impedir nuevas llamadas cuando el gasto acumulado mas el costo estimado de la siguiente llamada exceda un limite configurado.

Commit de cierre V0.5: `3c07c85634c27dc9c72311d5a973e3d17a01f5f2`.

V0.6: implementada y validada por dry-run.

Titulo V0.6: Provider Scorecard minimo.

Objetivo V0.6: observar y resumir desempeno por provider/model usando solo datos operacionales existentes, sin cambiar decisiones de routing.

Commit de cierre V0.6: `9120bc008b106b0963a9659ce4d55e4c20cfb412`.

V0.7: implementada y validada por dry-run.

Titulo V0.7: Provider Scorecard Read API.

Objetivo V0.7: exponer el Provider Scorecard minimo mediante API y/o CLI read-only para inspeccion auditable sin cambiar Router COST-FIRST.

Commit de cierre V0.7: `c027fe81fe395c8f58f1af929d5e625ef83c2a3b`.

V0.8: implementada y validada por dry-run.

Titulo V0.8: Shadow Routing Advisor.

Objetivo V0.8: comparar la decision real del Router COST-FIRST contra una recomendacion historica derivada solo del Provider Scorecard, sin autoridad de routing.

Commit de cierre V0.8: `37328a6b8d94980748f78809229705d31723cef8`.

V0.9: implementada y validada por dry-run.

Titulo V0.9: Shadow Routing Evaluation Log.

Objetivo V0.9: persistir y consultar un historial auditable de comparaciones entre seleccion COST-FIRST real y recomendacion shadow, sin autoridad de seleccion.

Commit de cierre V0.9: `4ca05b43aebc053f90bfbd3193b259e3f5c77f3a`.

V0.10: implementada y validada por dry-run.

Titulo V0.10: Shadow Routing Analysis Report.

Objetivo V0.10: leer el Shadow Routing Evaluation Log y generar un reporte deterministico de patrones de match/divergence y evidencia disponible, sin cambiar routing ni autoridad.

Commit de cierre V0.10: `e6df48c2c75109b3551cf11ea7d7bf3abd2788f8`.

V0.11: implementada y validada por dry-run.

Titulo V0.11: Limited Shadow Authority Policy.

Objetivo V0.11: definir una politica explicita, reversible y fail-closed para permitir influencia limitada del Shadow Routing Advisor en una fase futura, usando solo evidencia V0.10 y manteniendo Router COST-FIRST como fallback seguro.

Politica V0.11 refinada: una recomendacion shadow solo puede sustituir COST-FIRST si `evidenceStatus = "sufficient"`, `dataQuality = "complete"`, provider/model esta en allowlist explicita, supera umbrales minimos de pass rate/success rate, demuestra una ventaja minima verificable y no excede el margen maximo de costo adicional configurado.

Semantica de metricas V0.11: `evaluationPassRate` y `successRate` provienen del Scorecard historico; `costFirstEstimatedCostUsd` y `shadowEstimatedCostUsd` se calculan para la llamada actual con pricing verificable y los mismos tokens estimados. `averageActualCostUsd` historico no autoriza presupuesto.

Commit de cierre V0.11: `86a1bb1383bf11838047822360c17a4bceb5d8a9`.

V0.12: implementada y validada por dry-run.

Titulo V0.12: Authority Decision Audit Log.

Objetivo V0.12: persistir y leer de forma auditable cada evaluacion de autoridad producida por la Limited Shadow Authority Policy, sin conectar todavia esa politica al runtime real de ejecucion.

Commit de cierre V0.12: `fe40524eb19111f62a6c972a6fbaed92e9e1d62c`.

V0.13: comienza como fase documental separada.

Titulo V0.13: Authority Runtime Integration.

Objetivo V0.13: integrar la Limited Shadow Authority Policy al flujo real del Kernel de forma controlada, auditable y fail-closed, determinando una unica `effectiveSelection` antes de presupuesto, aprobacion humana y llamada al provider.

Flujo V0.13: Context Compiler -> Router COST-FIRST -> Authority Policy -> `effectiveSelection` -> Token Governor -> Budget Enforcement -> Human Approval Gate -> Provider -> Evaluator -> Ledger / Audit.

Refinamiento V0.13: `authority_failed_closed` significa que Authority Policy falla o queda ambigua, se usa COST-FIRST como `effectiveSelection` y se continua hacia Token Governor/Budget Enforcement. `authority_audit_failed` significa que fallo la persistencia de la decision de autoridad; la ejecucion se detiene antes de provider y no continua ni siquiera con COST-FIRST.

V0.13: cerrada y congelada.

Commit de cierre V0.13: `1e1c2885dc30788841b4c8607f17b5420e43f641`.

V0.14: comienza como fase documental separada.

Titulo V0.14: Authority Runtime Safety Metrics.

Objetivo V0.14: definir metricas read-only sobre decisiones reales de autoridad para medir intervenciones, bloqueos, fail-closed, costo adicional autorizado y outcomes comparables sin ampliar autoridad ni cambiar Router COST-FIRST.

Fuentes V0.14: Authority Decision Audit Log, Budget Ledger, ejecuciones persistidas y `evaluationStatus` persistido.

Semantica V0.14: para cada `executionId`, solo se atribuye outcome a la `effectiveSelection` realmente ejecutada. La alternativa no ejecutada queda con `counterfactualOutcome = "unavailable"` y `comparisonStatus = "insufficient_data"` cuando no exista evidencia ejecutada comparable. Los agregados de outcomes allowed vs blocked son descriptivos, no causales. El costo adicional autorizado puede calcularse desde audit/pricing aunque no exista comparacion de outcome valida.

Limites V0.14: no cambiar Router COST-FIRST, no cambiar `advisorAuthority`, no ampliar autoridad, no ejecutar provider calls, no agregar fallback, retries, dashboard, ML ni nueva base de datos.

V0.14: cerrada y congelada.

Commit de cierre V0.14: `eaadcecd3fb74c8b303b3eed5ca308bd18159f50`.

V0.15: comienza como fase documental separada.

Titulo V0.15: Authority Runtime Safety Metrics Read API.

Objetivo V0.15: definir una Read API minima para consultar el reporte completo de Authority Runtime Safety Metrics y vistas por `executionId` cuando aplique, reutilizando `AuthorityRuntimeSafetyMetricsV014`.

Superficie API V0.15: `getAuthorityRuntimeSafetyMetrics()` para reporte completo y `getAuthorityRuntimeSafetyMetricsForExecution(executionId)` para consulta auditable por ejecucion.

Semantica V0.15: `not_found` solo aplica cuando no existe evidencia de autoridad para un `executionId`; `found` aplica cuando existe evidencia de autoridad aunque el reporte sea parcial o contenga `comparisonStatus = "insufficient_data"`. El `reason` debe explicar si el resultado es completo, parcial o insuficiente. La implementacion debe reutilizar exclusivamente `AuthorityRuntimeSafetyMetricsV014` para calcular metricas.

Limites V0.15: no cambiar Router COST-FIRST, no cambiar `advisorAuthority`, no ampliar autoridad, no ejecutar provider calls, no hacer writes, no agregar dashboard, no introducir nueva base de datos, no agregar fallback ni retries.

V0.15: cerrada y congelada.

## Cierre V0.15

V0.15 queda lista para cierre despues de implementar y validar por dry-run Authority Runtime Safety Metrics Read API.

La validacion confirmo:

- Full report devuelve `found`.
- Query por `executionId` devuelve `found` cuando existe evidencia de autoridad aunque `dataQuality` sea `partial`.
- `not_found` ocurre solo cuando no existe evidencia de autoridad.
- `partial` e `insufficient_data` se preservan.
- `actualOutcome` se preserva.
- `counterfactualOutcome = "unavailable"` se preserva.
- Read API reutiliza `AuthorityRuntimeSafetyMetricsV014` sin duplicar logica de metricas.
- State/Memory sin cambios.
- Router COST-FIRST intacto.
- `advisorAuthority` intacto.
- Provider calls reales: 0.
- Tests: 158/158 pass.

## Cierre V0.14

V0.14 queda lista para cierre despues de implementar y validar por dry-run Authority Runtime Safety Metrics.

La validacion confirmo:

- Metricas globales: `totalAuthorityEvaluations`, `allowedInterventions`, `blockedInterventions`, `allowedRate` y `blockedRate`.
- Fail-closed: `failClosedCount` y `failClosedByReason`.
- Costo: `totalAdditionalCostUsdAuthorized`, `averageAdditionalCostUsdAuthorized` y `maxAdditionalCostUsdObserved`.
- `actualOutcome` corresponde solo a la `effectiveSelection` realmente ejecutada.
- `counterfactualOutcome = "unavailable"` para la alternativa no ejecutada.
- `comparisonStatus = "insufficient_data"` cuando no existe evidencia comparable real.
- No se declara mejora/empeoramiento causal entre COST-FIRST y shadow sin evidencia ejecutada comparable.
- Agregados allowed vs blocked son descriptivos, no causales.
- `dataQuality` y razones auditables correctas ante ejecucion faltante, ejecucion no terminal, `evaluationStatus` faltante y ledger faltante/no calculable.
- Componente read-only: State/Memory sin cambios.
- Router COST-FIRST intacto.
- `advisorAuthority` intacto.
- Provider calls reales: 0.
- Tests: 154/154 pass.

## Cierre V0.13

V0.13 queda lista para cierre despues de implementar y validar por dry-run la integracion de Authority Runtime.

La validacion confirmo:

- Shadow allowed usa shadow en Token Governor, Budget Enforcement, Provider y Budget Ledger.
- `authority_failed_closed` continua con COST-FIRST como `effectiveSelection`.
- `authority_audit_failed` detiene la ejecucion antes de provider.
- Token Governor reject no reroutea ni reevalua Authority Policy.
- Budget Enforcement reject no reroutea ni reevalua Authority Policy.
- `needs_human` + approve conserva exactamente la misma `effectiveSelection`.
- Maximo una provider call por execution attempt.
- Una sola Authority Decision Audit entry por intento.
- Budget Ledger sin entradas duplicadas.
- Router COST-FIRST intacto.
- Provider calls reales: 0.
- Tests: 148/148 pass.

## Cierre V0.12

V0.12 queda lista para cierre despues de implementar y validar por dry-run el Authority Decision Audit Log.

La validacion confirmo:

- Caso `allowed` persistido completo.
- Caso `blocked` persistido completo.
- `effectiveSelection` correcto en ambos casos.
- `listEntries()` verificado.
- `listEntries(executionId)` verificado.
- `summarize()` correcto.
- Resumen vacio devuelve ceros.
- Append-only verificado.
- Persistencia sobrevive reinicio de `FileStateMemory`.
- No se persisten prompts ni secretos.
- Router COST-FIRST intacto.
- Policy sigue sin conectarse al runtime/API/CLI.
- Provider calls reales: 0.
- Tests: 142/142 pass.

## Cierre V0.11

V0.11 queda lista para cierre despues de implementar y validar por dry-run la Limited Shadow Authority Policy.

La validacion confirmo:

- Intervencion permitida con `advisorAuthority = "limited"`.
- Seleccion efectiva = shadow solo cuando todos los umbrales pasan.
- Todos los casos de bloqueo fail-closed verificados.
- Rollback deja `advisorAuthority = "none"` y seleccion efectiva COST-FIRST.
- `auditRecord` completo en permitido y bloqueado.
- Router COST-FIRST intacto.
- Provider calls reales: 0.
- Tests: 134/134 pass.

Defaults economicos V0.2:

- OpenAI: `gpt-5-nano`, input $0.05 / 1M tokens, output $0.40 / 1M tokens.
- Anthropic: `claude-haiku-4-5-20251001`, alias `claude-haiku-4-5`, input $1.00 / 1M tokens, output $5.00 / 1M tokens.

Modelos removidos como defaults economicos: `gpt-4.1-mini` y `claude-3-5-haiku-latest`.

Claude Haiku 3.5 no debe usarse como default aunque sea ligeramente mas barato porque esta retirado de Claude API normal.

Presupuestos smoke V0.2: OpenAI `maxCostUsd` 0.001; Anthropic `maxCostUsd` 0.001.

## Objetivo Del Producto

Crear una capa de orquestacion multimodelo que recibe un objetivo humano y decide que contexto, proveedor de IA y herramientas usar para ejecutarlo, verificarlo y registrar costo/resultado.

## Alcance Confirmado Para V0.1

Incluido:

- Orchestrator
- Context Compiler
- Model Router
- Token Governor
- State/Memory
- Evaluator
- Human Approval Gate
- Providers iniciales: OpenAI y Anthropic
- Medicion de tokens, costo, latencia y resultado
- CLI/API minima

Excluido:

- Dashboard
- WhatsApp
- Voz
- CRM
- Billing

## Artefactos Creados

- `SPEC.md`
- `ARCHITECTURE.md`
- `AGENTS.md`
- `PROJECT_STATE.md`
- `DECISIONS.md`
- Skeleton tecnico TypeScript/Node.js
- Runner manual OpenAI `smoke:openai`
- Runner manual Anthropic `smoke:anthropic`

## Supuestos Actuales

- V0.1 opera con TypeScript y Node.js.
- State/Memory usa persistencia local estructurada y reemplazable.
- OpenAI y Anthropic mantienen adapters con contrato comun.
- La medicion de costo usa estimaciones basadas en tabla configurable de precios.
- La aprobacion humana forma parte del flujo de ejecucion.
- No se deben incluir secretos ni valores de `.env` en documentacion, logs o commits.

## Cierre V0.1

V0.1 queda cerrada documentalmente despues de validar una ejecucion real satisfactoria del Kernel contra OpenAI mediante Responses API.

La ejecucion validada recorrio el flujo:

- Context Compiler
- Model Router
- Token Governor
- Human Approval Gate
- OpenAI Adapter
- Evaluator
- State/Memory

La validacion confirmo:

- Estado final `succeeded`.
- Evaluacion `pass`.
- Provider OpenAI ejecutado via Responses API.
- Modelo `gpt-5-nano`.
- Presupuesto de costo/tokens aplicado.
- Resultado persistido sin incluir secretos.

## Cierre V0.2

V0.2 queda cerrada despues de validar una ejecucion real satisfactoria del Kernel contra Anthropic mediante Messages API.

La validacion confirmo:

- Estado final `succeeded`.
- Evaluacion `pass`.
- Provider Anthropic ejecutado con `claude-haiku-4-5-20251001`.
- Input/output tokens: 202 / 23.
- Costo estimado: $0.000295.
- Latencia: 1141ms.
- Stop reason: `end_turn`.
- COST-FIRST POLICY documentada para tareas simples.
- Soporte opcional de `ANTHROPIC_WORKSPACE_ID` para API keys identity-linked.
- Diagnostico seguro Anthropic sin imprimir secretos.

## Cierre V0.3

V0.3 queda cerrada despues de validar una ejecucion real satisfactoria del Kernel con Router COST-FIRST.

La validacion confirmo:

- Execution ID: `exec_mtf5gevi`.
- Provider/model seleccionado: OpenAI / `gpt-5-nano`.
- Costo estimado candidato OpenAI `gpt-5-nano`: $0.000018.
- Costo estimado candidato Anthropic `claude-haiku-4-5-20251001`: $0.000262.
- Input/output tokens reales: 127 / 24.
- Estado final: `succeeded`.
- Evaluacion: `pass`.
- Latencia: 2240ms.
- Provider calls: OpenAI 1 / Anthropic 0.

`estimatedCostUsd` representa el costo pre-ejecucion usado por Model Router y Token Governor para seleccionar y validar presupuesto. No representa un recalculo posterior basado en usage real.

## Cierre V0.4

V0.4 queda cerrada despues de validar por dry-run el Budget Ledger persistible con snapshot historico de pricing.

La validacion confirmo:

- Execution ID: `exec_v04_dryrun`.
- Provider/model: OpenAI / `gpt-5-nano`.
- Estimated input/output tokens: 112 / 30.
- `estimatedCostUsd`: 0.000018.
- Actual input/output tokens: 127 / 24.
- `actualCostUsd`: 0.000016.
- `costDeltaUsd`: -0.000002.
- Latencia: 2240ms.
- `calculationStatus`: `calculated`.
- Pricing snapshot persistido: `inputPricePerMillion` 0.05 y `outputPricePerMillion` 0.40.
- Un cambio posterior de pricing no altera entradas historicas del ledger.
- Una ejecucion `approval pending` no crea entrada de ledger.
- Una ejecucion terminal sin provider crea entrada `not_applicable`.
- El ledger no persiste prompts ni secretos.

## Cierre V0.5

V0.5 queda cerrada despues de validar por dry-run el Budget Enforcement acumulado por ejecucion y proyecto.

La validacion confirmo:

- Execution projected: 0.00060 -> `allowed`.
- Project projected: 0.00090 -> `allowed`.
- `maxExecutionCostUsd` 0.00059 -> `blocked_execution_budget`.
- `maxProjectCostUsd` 0.00089 -> `blocked_project_budget`.
- `maxProjectCostUsd` sin `projectId` -> `budget_unknown`.
- `missing_usage` aplicable -> `budget_unknown`.
- Provider calls en bloqueos y `budget_unknown`: 0.
- Tests: 87/87 pass.

## Cierre V0.6

V0.6 queda lista para cierre despues de implementar y validar por dry-run el Provider Scorecard minimo.

La validacion sintetica confirmo:

- 2 ejecuciones OpenAI / `gpt-5-nano`.
- 2 ejecuciones Anthropic / `claude-haiku-4-5-20251001`.
- Mezcla de estados `succeeded` y `failed`.
- Mezcla de evaluaciones `pass` y `fail`.
- Costos y latencias distintas.
- 1 registro con costo faltante para forzar `dataQuality` `partial`.

Resultados del dry-run:

- `openai:gpt-5-nano`: 2 ejecuciones, 1 `succeeded`, 1 `failed`, 1 `pass`, 1 `fail`.
- `openai:gpt-5-nano`: `totalActualCostUsd` 0.000036, `averageActualCostUsd` 0.000018, `averageLatencyMs` 2000.
- `openai:gpt-5-nano`: `lastUpdatedAt` `2026-08-30T12:01:00.000Z`, `dataQuality` `complete`.
- `anthropic:claude-haiku-4-5-20251001`: 2 ejecuciones, 1 `succeeded`, 1 `failed`, 1 `pass`, 1 `fail`.
- `anthropic:claude-haiku-4-5-20251001`: `totalActualCostUsd` 0.000295, `averageActualCostUsd` 0.000295, `averageLatencyMs` 1220.5.
- `anthropic:claude-haiku-4-5-20251001`: `lastUpdatedAt` `2026-08-30T12:03:00.000Z`, `dataQuality` `partial`.
- Separacion por `provider:model` verificada.
- Tests: 92/92 pass.

## Cierre V0.7

V0.7 queda lista para cierre despues de implementar y validar por dry-run la Provider Scorecard Read API.

La validacion confirmo:

- `listProviderScorecards()` devuelve scorecards de OpenAI y Anthropic.
- `getProviderScorecard()` devuelve `found` para un provider/model existente.
- `getProviderScorecard()` devuelve `not_found` auditable con razon para un provider/model inexistente.
- Las metricas devueltas son iguales a las metricas V0.6.
- La lectura no modifica State/Memory.
- Router COST-FIRST permanece intacto.
- Tests: 96/96 pass.

Resultados del dry-run:

- `openai:gpt-5-nano`: 2 ejecuciones, 1 `succeeded`, 1 `failed`, 1 `pass`, 1 `fail`.
- `openai:gpt-5-nano`: `totalActualCostUsd` 0.000036, `averageActualCostUsd` 0.000018, `averageLatencyMs` 2000, `dataQuality` `complete`.
- `anthropic:claude-haiku-4-5-20251001`: 2 ejecuciones, 1 `succeeded`, 1 `failed`, 1 `pass`, 1 `fail`.
- `anthropic:claude-haiku-4-5-20251001`: `totalActualCostUsd` 0.000295, `averageActualCostUsd` 0.000295, `averageLatencyMs` 1220.5, `dataQuality` `partial`.

## Cierre V0.8

V0.8 queda lista para cierre despues de implementar y validar por dry-run el Shadow Routing Advisor.

La validacion confirmo:

- Match entre seleccion COST-FIRST y recomendacion shadow verificado.
- Divergence entre seleccion COST-FIRST y recomendacion shadow verificado.
- Exclusion por dataQuality insuficiente verificada.
- Precedencia deterministica verificada:
  - evaluation pass rate.
  - success rate.
  - cost.
  - latency.
  - provider:model.
- Razones y metricas auditables verificadas.
- `advisorAuthority` siempre `none`.
- Router COST-FIRST intacto.
- Provider calls: 0.
- Tests: 106/106 pass.

## Cierre V0.9

V0.9 queda lista para cierre despues de implementar y validar por dry-run el Shadow Routing Evaluation Log.

La validacion confirmo:

- 1 match persistido.
- 1 divergence persistido.
- 1 `insufficient_data` persistido.
- `listEntries()` devuelve 3 entradas.
- Filtro por `executionId` correcto.
- Persistencia sobrevive reinicio de `FileStateMemory`.
- `differenceReason` y metricas auditables persistidas.
- `advisorAuthority` siempre `none`.
- Router COST-FIRST intacto.
- Provider calls adicionales: 0.
- Tests: 114/114 pass.

Agregados validados:

- `totalEvaluations`: 3.
- `matchCount`: 1.
- `divergenceCount`: 1.
- `insufficientDataCount`: 1.
- `matchRate`: 0.333333.
- `divergenceRate`: 0.333333.

## Cierre V0.10

V0.10 queda lista para cierre despues de implementar y validar por dry-run el Shadow Routing Analysis Report.

La validacion confirmo:

- `evidenceStatus` `insufficient` y `sufficient` verificados.
- `minimumEvaluationsRequired`: 5.
- Requiere `matchCount > 0`.
- Requiere `divergenceCount > 0`.
- Requiere `insufficientDataRate < 0.5`.
- Divergencias completas con `differenceReason`, `metricsUsed` y `shadowRecommendation`.
- Patrones `actualSelection -> shadowRecommendation` correctos.
- `advisorAuthority` siempre `none`.
- Router COST-FIRST intacto.
- Provider calls: 0.
- Tests: 122/122 pass.

Reporte suficiente validado:

- `totalEvaluations`: 5.
- `matchCount`: 3.
- `divergenceCount`: 2.
- `insufficientDataCount`: 0.
- `matchRate`: 0.6.
- `divergenceRate`: 0.4.
- `evidenceStatus`: `sufficient`.

## Pendiente Para Siguiente Fase

- Mantener el reporte read-only y sin autoridad operativa.
- Mantener autoridad limitada explicitamente reversible.
- Mantener `advisorAuthority = "none"` como rollback seguro.
- Mantener Router COST-FIRST como fallback seguro.
- Exigir `evidenceStatus = "sufficient"` y `dataQuality` suficiente antes de cualquier influencia shadow.
- Exigir `dataQuality = "complete"` para sustitucion.
- Exigir `minimumShadowEvaluationPassRate` 0.8 y `minimumShadowSuccessRate` 0.8.
- Exigir ventaja minima verificable: `minimumEvaluationPassRateAdvantage` 0.2 o `minimumSuccessRateAdvantage` 0.1.
- Exigir margen maximo de costo adicional: `maxAdditionalCostRatio` 0.25 y `maxAdditionalCostUsdPerIntervention` configurado.
- Exigir `shadowEstimatedCostUsd <= costFirstEstimatedCostUsd * 1.25` usando costos calculados para la llamada actual.
- Exigir allowlist explicita por provider/model.
- Exigir presupuesto maximo verificable para cualquier intervencion.
- Bloquear influencia shadow cuando falte pricing, el pricing no sea comparable, falte presupuesto seguro, evidencia suficiente, data quality completa, metricas comparables o auditoria.
- No agregar ranking automatico, fallback ni retries.
- Mantener Budget Enforcement entre Token Governor y Human Approval Gate.
- Mantener `maxExecutionCostUsd` y `maxProjectCostUsd` como presupuestos acumulados opcionales.
- Mantener `projectId` explicito obligatorio cuando `maxProjectCostUsd` este activo.
- Mantener fail-closed cuando no pueda demostrarse gasto acumulado de forma segura.
- Mantener `estimatedCostUsd` como costo pre-ejecucion de Router/Token Governor.
- Mantener `actualCostUsd` como costo post-ejecucion calculado desde usage real y snapshot de pricing registrado en el ledger.
- Mantener ledger auditable por ejecucion, provider y modelo.
- Mantener Router COST-FIRST con pricing configurado y verificable.
- Mantener Token Governor como autoridad final de presupuesto.
- Mantener Provider Scorecard como observador; no decide ni cambia Router COST-FIRST.
- Mantener el alcance fuera de dashboard, WhatsApp, voz, CRM y billing hasta decision explicita.
- No implementar aprendizaje automatico, ranking opaco, fallback automatico, retries, dashboard, routing historico, alertas automaticas ni nuevos providers sin decision explicita.

## Criterio De Cierre V0.2

Una ejecucion real exitosa contra Anthropic debe recorrer el mismo Kernel end-to-end y terminar con evaluacion verificable, metricas y persistencia, sin introducir logica especifica de Anthropic fuera de su adapter.

## Riesgos Detectados

- Scope creep hacia dashboard, CRM, WhatsApp, voz o billing antes de validar la capa central.
- Diferencias entre APIs de OpenAI y Anthropic pueden filtrarse al Orchestrator si los adapters no estan bien delimitados.
- Medicion de costo puede ser incorrecta si precios/modelos no son configurables y actualizables.
- El Context Compiler puede volverse demasiado complejo si intenta resolver memoria semantica avanzada en V0.1.
- Evaluator puede dar falsa confianza si no define criterios concretos por ejecucion.
- Human Approval Gate puede bloquear demasiado o demasiado poco si la politica de riesgo no es explicita.

## Criterios De Aceptacion Del Estado Del Proyecto

- Los cinco documentos base existen en la raiz del proyecto.
- Los documentos declaran explicitamente alcance incluido y excluido.
- Existe skeleton tecnico validado para V0.1.
- Existe commit funcional de validacion real OpenAI: `8b913d00f2f8dee1f6e733f45c745dec028a05af`.
- Existe commit de cierre V0.1: `36739d1dc9112e629c0e15283ab9697a4f427a37`.
- V0.2 declara objetivo, alcance y criterio de cierre antes de tocar codigo.
- V0.2 queda validada contra Anthropic real con estado `succeeded` y evaluacion `pass`.
- V0.3 declara objetivo, alcance, algoritmo, precedencia y casos limite antes de tocar codigo.
- V0.3 queda validada con Router COST-FIRST real seleccionando OpenAI `gpt-5-nano` sobre Anthropic `claude-haiku-4-5-20251001` por menor costo estimado compatible.
- V0.4 declara contrato de ledger, semantica estimated vs actual, estados de costo real y casos limite antes de tocar codigo.
- V0.4 queda validada con dry-run verificable de Budget Ledger, costo real, delta, snapshots historicos y acumulados persistibles.
- V0.5 declara contrato de Budget Enforcement, precedencia de gates, fail-closed, casos limite y estrategia minima de projectId antes de tocar codigo.
- V0.5 queda validada con dry-run verificable de Budget Enforcement, bloqueos acumulados, fail-closed y cero llamadas a provider en bloqueos.
- V0.6 declara contrato de Provider Scorecard minimo, agregados, casos limite y criterios de aceptacion antes de tocar codigo.
- V0.6 queda validada con dry-run verificable de Provider Scorecard, agregados por provider/model, `dataQuality` parcial y 92/92 tests.
- V0.7 declara contrato de Provider Scorecard Read API, consulta por provider/model, listado agregado, casos limite y criterios de aceptacion antes de tocar codigo.
- V0.7 queda validada con dry-run verificable de Provider Scorecard Read API, consulta `found`, consulta `not_found`, lectura read-only y 96/96 tests.
- V0.8 declara contrato de Shadow Routing Advisor, comparacion contra Router COST-FIRST, reglas deterministicas, casos limite y criterios de aceptacion antes de tocar codigo.
- V0.8 queda validada con dry-run verificable de Shadow Routing Advisor, match/divergence, precedencia deterministica, `advisorAuthority` `none`, cero provider calls y 106/106 tests.
- V0.9 declara contrato de Shadow Routing Evaluation Log, persistencia, lectura historica, agregados match/divergence, casos limite y criterios de aceptacion antes de tocar codigo.
- V0.9 queda validada con dry-run verificable de Shadow Routing Evaluation Log, match/divergence/insufficient_data, lectura historica, filtro por executionId, persistencia tras reinicio, agregados y 114/114 tests.
- V0.10 declara contrato de Shadow Routing Analysis Report, evidencia disponible, patrones observables, casos limite y criterios de aceptacion antes de tocar codigo.
- V0.10 queda validada con dry-run verificable de Shadow Routing Analysis Report, estados `insufficient` y `sufficient`, evidencia suficiente con 5 evaluaciones, Router COST-FIRST intacto, cero provider calls y 122/122 tests.
- V0.11 declara contrato de Limited Shadow Authority Policy, condiciones exactas de influencia, umbrales deterministas, limites por provider/model, margen maximo de costo, presupuesto maximo, bloqueo inmediato, rollback y auditoria obligatoria antes de tocar codigo.
- V0.11 queda validada con dry-run verificable de Limited Shadow Authority Policy, intervencion limitada permitida solo con umbrales completos, bloqueos fail-closed, rollback a `advisorAuthority = "none"`, auditoria completa, Router COST-FIRST intacto, cero provider calls reales y 134/134 tests.
- V0.12 declara contrato de Authority Decision Audit Log, persistencia auditable, lectura historica, agregados allowed/blocked, bloqueos por razon, casos limite y criterios de aceptacion antes de tocar codigo.
- V0.12 queda validada con dry-run verificable de Authority Decision Audit Log, casos allowed/blocked completos, lectura historica y por executionId, agregados correctos, append-only, persistencia tras reinicio, cero prompts/secretos persistidos, Router COST-FIRST intacto, policy sin runtime/API/CLI, cero provider calls reales y 142/142 tests.
- V0.13 declara contrato de Authority Runtime Integration, flujo canonico, `effectiveSelection` inmutable por intento, invariantes, estados de fallo, auditoria obligatoria, validacion exclusiva de presupuesto sobre seleccion efectiva y garantia de maximo una provider call por execution attempt antes de tocar codigo.
- V0.13 queda validada con dry-run verificable de Authority Runtime Integration, shadow allowed aplicado sobre `effectiveSelection`, fallos fail-closed/audit-failed, rechazos sin rerouting, reanudacion humana conservando seleccion efectiva, audit/ledger sin duplicados, Router COST-FIRST intacto y 148/148 tests.
- V0.14 declara contrato de Authority Runtime Safety Metrics, metricas read-only sobre decisiones reales de autoridad, comparaciones de outcome solo con evidencia ejecutada suficiente, `actualOutcome`, `counterfactualOutcome = "unavailable"` para alternativas no ejecutadas, agregados descriptivos no causales, `dataQuality`, razones auditables y limites sin ampliar autoridad antes de tocar codigo.
- V0.14 queda validada con dry-run verificable de Authority Runtime Safety Metrics, metricas globales, fail-closed, costo adicional autorizado, outcomes no contrafactuales, `insufficient_data`, lectura read-only, Router COST-FIRST intacto, `advisorAuthority` intacto, cero provider calls reales y 154/154 tests.
- V0.15 declara contrato de Authority Runtime Safety Metrics Read API, reporte completo, consulta por `executionId`, `found` / `not_found` auditable donde `found` no implica datos completos, preservacion de `dataQuality` e `insufficient_data`, reutilizacion exclusiva de `AuthorityRuntimeSafetyMetricsV014` y limites sin writes ni autoridad nueva antes de tocar codigo.
- V0.15 queda validada con dry-run verificable de Authority Runtime Safety Metrics Read API, full report `found`, query por `executionId` `found` con evidencia parcial, `not_found` solo sin evidencia de autoridad, preservacion de `partial`, `insufficient_data`, `actualOutcome`, `counterfactualOutcome = "unavailable"`, lectura read-only, Router COST-FIRST intacto, `advisorAuthority` intacto, cero provider calls reales y 158/158 tests.
- Los riesgos iniciales estan documentados.
- Los pendientes para la siguiente fase estan listados.
- No se documentan secretos ni valores de `.env`.
