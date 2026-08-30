# Quantico AI OS - Estado Del Proyecto

## Estado Actual

Fase: V0.7 ready to close.

Version objetivo: V0.7.

Codigo implementado: si.

Estado actual: V0.7 implementada y validada por dry-run.

Ultimo hito: dry-run final de Provider Scorecard Read API.

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

Tests actuales: 96/96 pass.

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

## Pendiente Para Siguiente Fase

- Definir V0.8 documentalmente antes de tocar codigo.
- Mantener Router COST-FIRST sin cambios.
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
- Los riesgos iniciales estan documentados.
- Los pendientes para la siguiente fase estan listados.
- No se documentan secretos ni valores de `.env`.
