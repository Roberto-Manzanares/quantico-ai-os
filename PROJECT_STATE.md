# Quantico AI OS - Estado Del Proyecto

## Estado Actual

Fase: V0.24 implemented.

Version objetivo: V0.24.

Codigo implementado: si para V0.24.

Estado actual: V0.24 implementada y validada.

Ultimo hito: implementacion de V0.24 Controlled Run Closure Command.

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

Tests actuales: 217/217 pass.

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

Commit de cierre V0.15: `504722a75f71cd2f6e854303016ce4ef730d473a`.

V0.16: comienza como fase documental separada.

Titulo V0.16: Execution Audit Timeline Read API.

Objetivo V0.16: definir una Read API minima para consultar la linea de tiempo auditable de una ejecucion usando solo datos persistidos existentes.

Razon V0.16: V0.14/V0.15 ya exponen metricas agregadas de seguridad de autoridad; V0.16 agrega trazabilidad cronologica por ejecucion sin duplicar esas metricas ni ampliar autoridad.

Superficie API V0.16: `getExecutionAuditTimeline(executionId)`.

Fuentes V0.16: Execution persistida, execution events, Authority Decision Audit Log entries, Budget Ledger entries, pending approval cuando exista, evaluacion y metricas persistidas.

Semantica V0.16: `found` aplica si existe la Execution persistida; `not_found` solo aplica si no existe. Cada timeline item debe provenir de evidencia realmente persistida. No se fabrican eventos derivados como registros independientes. Evaluation, approval o selection embebidos en Execution pueden representarse con `source = "execution"`. Sources especificos como `authority_audit`, `budget_ledger`, `event`, `approval` o `evaluation` solo se usan con registros persistidos independientes. Si una fuente no tiene timestamp confiable, no se inventa; se refleja en `dataQuality` y `reason`.

Limites V0.16: no cambiar Router COST-FIRST, no cambiar `advisorAuthority`, no ampliar autoridad, no ejecutar provider calls, no hacer writes, no agregar dashboard, no introducir nueva base de datos, no agregar fallback ni retries.

V0.16: cerrada y congelada.

Commit de cierre V0.16: `96fa79fb8b94d64bd39d28eae4d56e3952c678a4`.

V0.17: comienza como fase documental separada.

Titulo V0.17: Execution Audit Index Read API.

Objetivo V0.17: definir una Read API minima para listar ejecuciones persistidas con un resumen auditable de estado operacional, reutilizando V0.16 Execution Audit Timeline como fuente de composicion por ejecucion.

Razon V0.17: V0.16 permite auditar una ejecucion concreta si ya se conoce su `executionId`; V0.17 agrega descubrimiento y priorizacion operacional de ejecuciones sin duplicar metricas ni ampliar autoridad.

Superficie API V0.17: `listExecutionAuditSummaries(options?)` y `getExecutionAuditSummary(executionId)`.

Semantica V0.17: cada summary deriva de la Execution persistida y de la timeline V0.16. `getExecutionAuditSummary` devuelve `found` si existe Execution y `not_found` solo si no existe. Si timeline V0.16 devuelve `found` pero `partial` o `inconsistent`, el summary sigue siendo `found` y preserva `timelineDataQuality`. El indice propaga `dataQuality` complete/partial/inconsistent desde las timelines y marca `requiresAttention` de forma deterministica unicamente desde condiciones explicitas: `timelineDataQuality = "partial"` o `"inconsistent"`, o `executionStatus = "failed"`, `"needs_human"` o `"awaiting_approval"`. En cualquier otro caso, `requiresAttention = false`.

Limites V0.17: no cambiar Router COST-FIRST, no cambiar `advisorAuthority`, no ampliar autoridad, no ejecutar provider calls, no hacer writes, no agregar dashboard, no introducir nueva base de datos, no agregar fallback ni retries, no modificar ProviderAdapter, no duplicar metricas V0.14/V0.15, no reimplementar la timeline V0.16, no agregar scoring/severidad/heuristicas para `requiresAttention` y no usar evaluacion causal ni metricas V0.14/V0.15 para decidir atencion.

V0.17: cerrada y congelada.

Commit de cierre V0.17: `65b691b30b4b3f678e8843147b7a1a5d082c1f1a`.

V0.18: comienza como fase documental separada.

Titulo V0.18: Controlled Operational Execution Profile.

Objetivo V0.18: definir un perfil operacional minimo para ejecutar objetivos reales de forma controlada, presupuestada y auditable, reutilizando el Kernel existente, V0.16 Execution Audit Timeline y V0.17 Execution Audit Index.

Capacidad nueva V0.18: empaquetar objetivo, restricciones, presupuesto estricto, criterios deterministas, politica de aprobacion, modo de ejecucion y requisitos de auditoria post-ejecucion antes de lanzar una ejecucion real.

Razon V0.18: V0.16 y V0.17 ya permiten inspeccionar ejecuciones persistidas; el siguiente paso hacia operacion real es estandarizar como se lanza una ejecucion controlada, no crear otra capa read-only.

Superficie V0.18: `runControlledExecution(profile)` como operacion futura minima.

Semantica V0.18: `runControlledExecution(profile)` no reimplementa Kernel, Router, Token Governor, Budget Enforcement, Human Approval Gate ni Evaluator. `dry_run` valida configuracion y calcula elegibilidad/costo estimado usando componentes existentes con provider calls = 0; no simula outcome ni marca ejecucion como `succeeded`. `live` delega una sola ejecucion al Kernel existente, nunca salta Human Approval Gate y permite provider call solo si el perfil es valido y los gates existentes lo permiten. La salida operacional combina resultado Kernel, V0.16 timeline y V0.17 audit summary.

Resultados V0.18: `profile_validated`, `profile_rejected`, `dry_run_ready`, `execution_pending_approval`, `execution_completed` y `execution_failed`.

Limites V0.18: no cambiar Router COST-FIRST, no cambiar `advisorAuthority`, no ampliar autoridad, no crear una segunda autoridad operacional, no agregar fallback ni retries implicitos, no agregar dashboard, no introducir nueva base de datos, no modificar ProviderAdapter, no duplicar metricas V0.14/V0.15, no reimplementar timeline V0.16 ni index V0.17, no permitir live sin presupuesto estricto ni criterios deterministas verificables.

V0.18: implementada y validada por dry-run.

Commit de cierre V0.18: `56b65830f5470e6dd38c77ff232ee9aa0daf7774`.

V0.19: comienza como fase documental separada.

Titulo V0.19: Controlled Execution Run Manifest.

Objetivo V0.19: persistir un manifiesto operacional auditable por cada invocacion de `runControlledExecution(profile)`, identificado por `runId`, incluyendo `dry_run`, `live` y `profile_rejected`, sin duplicar Kernel, Timeline, Audit Index, Budget Ledger ni Authority Audit.

Problema operacional V0.19: V0.18 estandariza como lanzar una ejecucion controlada, pero los intentos operacionales que no crean una Execution del Kernel, como `profile_rejected` o `dry_run_ready`, necesitan identidad operacional, idempotencia y evidencia persistida propia para auditoria y trazabilidad.

Capacidad nueva V0.19: registrar `runId`, modo, fingerprint/snapshot sanitizado del perfil operacional, validacion, estado resultante, timestamps, seleccion estimada o efectiva cuando exista, costos estimados/actuales disponibles, referencias auditables a timeline/audit summary/ledger/authority audit cuando exista `executionId`, y razon auditable del desenlace.

Superficie V0.19: `runControlledExecution(profile)` debe emitir un Controlled Execution Run Manifest append-only e idempotente por `runId` como registro de la invocacion operacional. No es una nueva capa de observabilidad y no define una Read API como objetivo principal.

Lifecycle V0.19: `run_created`, `profile_rejected`, `dry_run_ready`, `live_pending_approval`, `live_completed` y `live_failed`.

Persistence outcomes V0.19: `manifest_recorded` y `manifest_record_failed`. No son estados del lifecycle operacional.

Invariantes V0.19: `executionId` se enlaza solo cuando el Kernel realmente crea una Execution; no se crean executions ficticias para `dry_run` o `profile_rejected`; no provider calls para `dry_run` o `profile_rejected`; maximo una provider call por execution attempt; Human Approval Gate no se salta; Router COST-FIRST, `advisorAuthority`, ProviderAdapter, V0.16 Timeline y V0.17 Audit Index permanecen intactos; el manifest no persiste prompts completos, API keys, workspace IDs ni secretos.

Limites V0.19: no cambiar Router COST-FIRST, no cambiar `advisorAuthority`, no ampliar autoridad, no agregar fallback, retries, dashboard, nueva DB ni nuevos providers, no modificar ProviderAdapter, no reimplementar Kernel, Timeline, Audit Index ni metricas existentes, no duplicar Budget Ledger ni Authority Audit, no cambiar Execution del Kernel y no ejecutar provider calls durante la fase documental.

Commit de cierre V0.19: `b2ff554acb0c13918eaa0b8a3b937f35a8a3847d`.

V0.20: comienza como fase documental separada.

Titulo V0.20: Controlled Run Status and Approval Resolution API.

Objetivo V0.20: definir una superficie operacional minima por `runId` para consultar el estado de una invocacion controlada y resolver de forma segura un `live_pending_approval` sin crear una nueva invocacion logica.

Problema operacional V0.20: V0.19 persiste manifests por `runId`, pero sin una superficie por `runId` un operador no puede recuperar de forma uniforme un `dry_run`, `profile_rejected`, `live_pending_approval`, `live_completed` o `live_failed`, ni resolver un pending approval conservando la misma seleccion efectiva.

Capacidad nueva V0.20: `getControlledRunStatus(runId)` consulta estado operacional desde Manifest V0.19 y referencias existentes; `resolveControlledRunApproval(runId, approvalDecision)` permite resolver una aprobacion solo cuando existe `live_pending_approval` con pending approval persistida, conservando `runId`, `executionId` y `effectiveSelection`.

Contrato V0.20: `getControlledRunStatus` devuelve `found` si existe manifest y `not_found` solo si no existe. `resolveControlledRunApproval` puede devolver `approved`, `rejected`, `not_found`, `not_resolvable` o `approval_resolution_failed`. Ambas superficies deben sanitizar datos y referenciar V0.16 Timeline, V0.17 Audit Index, Budget Ledger y Authority Audit cuando existan, sin duplicar sus datos ni logica.

Invariantes V0.20: Router COST-FIRST intacto; `advisorAuthority` intacto; Human Approval Gate intacto; cero autoridad nueva; no rerouting durante resolucion de aprobacion; no reejecutar Authority Policy; no crear executions ficticias; maximo una provider call por execution attempt; `getControlledRunStatus` read-only; `resolveControlledRunApproval` no llama provider ni continua la ejecucion hasta provider; sin prompts completos, API keys, workspace IDs ni secretos.

Limites V0.20: no cambiar Router COST-FIRST, no cambiar `advisorAuthority`, no ampliar autoridad, no agregar fallback, retries, dashboard, nueva DB ni nuevos providers, no modificar ProviderAdapter, no reimplementar Kernel, Timeline, Audit Index ni metricas existentes, no duplicar Budget Ledger, Authority Audit ni Manifest V0.19, y no ejecutar provider calls durante la fase documental.

Commit de cierre V0.20: `613d91d1aa4eab49613b1620ef01bc34c835feb1`.

V0.21: comienza como fase documental separada.

Titulo V0.21: Approved Execution Continuation Primitive.

Objetivo V0.21: definir una primitiva operacional minima para continuar una Execution pausada por Human Approval Gate despues de que V0.20 resolvio la aprobacion, conservando el mismo `runId`, `executionId` y `effectiveSelection`.

Problema operacional V0.21: V0.20 resuelve aprobaciones, pero no continua la ejecucion hasta provider porque el Kernel no tiene una primitiva segura para retomar exactamente la misma Execution sin rerouting ni re-evaluacion de Authority Policy.

Capacidad nueva V0.21: `continueApprovedExecution(runId)` permite continuar una Execution aprobada usando la seleccion efectiva ya materializada, con maximo una provider call de continuacion, sin nueva Execution, sin nuevo `runId`, sin fallback ni retries.

Contrato V0.21: la operacion devuelve `continued`, `not_found`, `not_continuable` o `continuation_failed`; exige Manifest V0.19, aprobacion resuelta por V0.20, Execution existente, `effectiveSelection` recuperable, ausencia de pending approval activa y ausencia de provider call previa para ese attempt.

Invariantes V0.21: Router COST-FIRST intacto; Human Approval Gate intacto; `advisorAuthority` intacto; cero autoridad nueva; no rerouting; no reejecutar Authority Policy; no crear Execution; maximo una provider call; no duplicar Ledger, Authority Audit, Manifest, Timeline ni Audit Index; fail-closed ante evidencia incompleta o ambigua.

Limites V0.21: no cambiar Router COST-FIRST, no cambiar `advisorAuthority`, no ampliar autoridad, no agregar fallback, retries, dashboard, nueva DB ni nuevos providers, no modificar ProviderAdapter, no reimplementar Kernel completo, no ejecutar provider calls durante la fase documental.

V0.21: cerrada y congelada.

Commit de cierre V0.21: `1f8c89c8aa29d9e911368127838b6f6933c82b5b`.

Tests de cierre V0.21: 198/198 pass.

V0.22: comienza como fase documental separada.

Titulo V0.22: Controlled Approval Completion Command.

Objetivo V0.22: definir un comando operacional minimo para completar el flujo humano de un run controlado pendiente de aprobacion, componiendo V0.20 Approval Resolution y V0.21 Approved Execution Continuation en una sola operacion auditable por `runId`.

Problema operacional V0.22: V0.20 resuelve aprobaciones y V0.21 continua ejecuciones aprobadas, pero la operacion real todavia requiere coordinar manualmente dos llamadas separadas para pasar de `live_pending_approval` a resultado final.

Capacidad nueva V0.22: `completeControlledRunApproval(runId, approvalDecision)` recibe una decision humana explicita, delega la resolucion en V0.20 y, solo si la decision es `approved`, delega la continuacion en V0.21. Si la decision es `rejected`, termina sin provider calls.

Contrato V0.22: la operacion devuelve `completed`, `rejected`, `not_found`, `not_completable` o `completion_failed`; conserva `runId`, `executionId` y `effectiveSelection`; no crea nueva Execution; no llama Router COST-FIRST ni Authority Policy; no duplica Manifest, Timeline, Audit Index, Budget Ledger ni Authority Audit.

Limites V0.22: no cambiar Router COST-FIRST, Human Approval Gate, `advisorAuthority`, ProviderAdapter ni Kernel; no agregar autoridad, fallback, retries, dashboard, nueva DB ni nuevos providers; no ejecutar provider calls durante la fase documental.

Commit de cierre V0.22: `7786a7fa561a1c4458b47e15ee3e7620ba7704d2`.

Tests de cierre V0.22: 206/206 pass.

V0.23: comienza como fase documental separada.

Titulo V0.23: Controlled Run Finalization Consistency Gate.

Objetivo V0.23: definir un gate operacional minimo para cerrar un Controlled Run solo cuando el estado final persistido sea coherente entre Run Manifest V0.19, Execution, Budget Ledger y Timeline V0.16.

Problema operacional V0.23: V0.22 completa el flujo humano de aprobacion y continuacion, pero aun falta un cierre explicito que distinga resultado terminal de finalizacion auditada y coherente.

Capacidad nueva V0.23: `finalizeControlledRun(runId)` verifica evidencia persistida, devuelve un outcome de finalizacion y, cuando aplique, registra un marcador append-only compacto y referencial sin duplicar Timeline, Audit Index, Ledger, Authority Audit ni Manifest.

Contrato V0.23: la operacion devuelve `finalized`, `not_found`, `not_finalizable`, `finalization_inconsistent` o `finalization_failed`; `finalized` exige evidencia terminal coherente; `finalization_inconsistent` reporta contradicciones sin resolverlas automaticamente; no crea executions ficticias ni llama provider.

Limites V0.23: no cambiar Router COST-FIRST, Human Approval Gate, `advisorAuthority`, ProviderAdapter ni Kernel; no agregar autoridad, fallback, retries, dashboard, nueva DB ni nuevos providers; no reimplementar ni duplicar Manifest, Timeline, Audit Index, Budget Ledger o Authority Audit.

Commit de cierre V0.23: `ea138266278f4bfb0898ab7bd0b3154c929e0b3e`.

Tests de cierre V0.23: 211/211 pass.

V0.24: comienza como fase documental separada.

Titulo V0.24: Controlled Run Closure Command.

Objetivo V0.24: definir un comando operacional minimo para cerrar un Controlled Run en una sola operacion, componiendo V0.22 Controlled Approval Completion Command y V0.23 Controlled Run Finalization Consistency Gate.

Problema operacional V0.24: V0.22 completa aprobacion/continuacion y V0.23 finaliza evidencia coherente, pero el operador aun debe coordinar manualmente dos operaciones para cerrar un run pendiente o terminal.

Capacidad nueva V0.24: `closeControlledRun(runId, options?)` completa aprobacion cuando aplique y finaliza el run solo si V0.23 confirma coherencia, sin crear otra capa read-only ni duplicar subsistemas.

Contrato V0.24: la operacion devuelve `closed`, `rejected`, `not_found`, `not_closable`, `closure_inconsistent` o `closure_failed`; requiere `approvalDecision` cuando el run esta en `live_pending_approval`; usa V0.22 para completion y V0.23 para finalization.

Limites V0.24: no cambiar Router COST-FIRST, Human Approval Gate, `advisorAuthority`, ProviderAdapter ni Kernel; no agregar autoridad, fallback, retries, dashboard, nueva DB ni nuevos providers; no duplicar V0.22, V0.23, Manifest, Timeline, Audit Index, Ledger ni Authority Audit.

## Cierre V0.18

V0.18 queda lista para cierre despues de implementar y validar por dry-run Controlled Operational Execution Profile.

La validacion confirmo:

- Perfil valido -> `profile_validated`.
- Perfil invalido -> `profile_rejected` pre-provider.
- `live` sin presupuesto verificable -> `profile_rejected`.
- `dry_run` usa Context Compiler, Router COST-FIRST y Token Governor.
- `dry_run` produce provider calls = 0.
- `dry_run` no simula outcome ni marca `succeeded`.
- `dry_run_ready` validado.
- `live` delega una sola ejecucion al Kernel existente.
- Maximo una provider call por execution attempt.
- `HIGH` risk -> `execution_pending_approval`.
- Human Approval Gate no se salta.
- Post-auditoria reutiliza V0.16 Execution Audit Timeline y V0.17 Execution Audit Summary.
- `execution_completed` validado.
- `execution_failed` cubierto por mapeo del Kernel.
- Router COST-FIRST intacto.
- `advisorAuthority` intacto.
- ProviderAdapter intacto.
- Provider calls reales: 0.
- Tests: 177/177 pass.

## Cierre V0.17

V0.17 queda lista para cierre despues de implementar y validar por dry-run Execution Audit Index Read API.

La validacion confirmo:

- `getExecutionAuditSummary(executionId)` devuelve `found` si existe Execution persistida.
- `getExecutionAuditSummary(executionId)` devuelve `not_found` solo si no existe Execution.
- `timelineDataQuality` se preserva desde V0.16.
- `listExecutionAuditSummaries(options?)` descubre executions persistidas via StateMemory.
- Summaries se construyen antes de aplicar filtros.
- `requiresAttention` solo se activa por `partial`, `inconsistent`, `failed`, `needs_human` o `awaiting_approval`.
- No hay scoring, severidad ni heuristicas.
- Filtros validados: `executionStatus`, `projectId`, `dataQuality`, `requiresAttention` y combinaciones.
- `limit` se aplica al final, despues de construir summaries, filtrar y ordenar.
- Orden deterministico: `updatedAt` descendente, `createdAt` descendente, `executionId` ascendente.
- State/Memory sin cambios durante lectura.
- `listExecutions()` es read-only.
- Router COST-FIRST intacto.
- `advisorAuthority` intacto.
- Provider calls reales: 0.
- V0.17 reutiliza V0.16 Execution Audit Timeline y no reimplementa timeline.
- Tests: 171/171 pass.

## Cierre V0.16

V0.16 queda lista para cierre despues de implementar y validar por dry-run Execution Audit Timeline Read API.

La validacion confirmo:

- `found` si existe Execution persistida.
- `not_found` solo si no existe Execution.
- Timeline basado unicamente en evidencia persistida.
- Evaluation embebida usa `source = "execution"`.
- Sources independientes solo aparecen con registros independientes.
- Orden deterministico por timestamp, source y type.
- `dataQuality` distingue `complete`, `partial` e `inconsistent`.
- `inconsistent` no resuelve contradicciones automaticamente.
- Timestamps faltantes no se inventan y degradan `dataQuality` / `reason`.
- `effectiveSelection`, `authorityDecision`, ledger, `evaluationStatus` y tokens se preservan cuando hay evidencia.
- Secretos, prompts completos, API keys y workspace IDs se sanitizan.
- State/Memory sin cambios durante lectura.
- Router COST-FIRST intacto.
- `advisorAuthority` intacto.
- Provider calls reales: 0.
- Bug de `finalResultLength` corregido y cubierto por test.
- Tests: 164/164 pass.

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

- Abrir V0.25 solo documentalmente antes de tocar codigo.
- Partir de V0.24 cerrada y congelada.
- Mantener `closeControlledRun(runId, options?)` como cierre operacional compuesto ya validado.
- Evitar otra capa read-only redundante salvo necesidad operacional clara.
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
- V0.16 declara contrato de Execution Audit Timeline Read API, consulta cronologica por `executionId`, `found` si existe Execution, `not_found` solo si no existe, items respaldados por evidencia persistida, sources especificos solo con registros independientes, `dataQuality` complete/partial/inconsistent, timestamps no inventados, proteccion de secretos y limites sin writes ni autoridad nueva antes de tocar codigo.
- V0.16 queda validada con dry-run verificable de Execution Audit Timeline Read API, `found`/`not_found`, timeline solo desde evidencia persistida, sources independientes solo con registros independientes, evaluation embebida con `source = "execution"`, orden deterministico timestamp/source/type, `dataQuality` complete/partial/inconsistent, timestamps faltantes no inventados, secretos sanitizados, bug `finalResultLength` corregido, lectura read-only, Router COST-FIRST intacto, `advisorAuthority` intacto, cero provider calls reales y 164/164 tests.
- V0.17 declara contrato de Execution Audit Index Read API, listado y consulta de summaries auditables por ejecucion, reutilizacion de V0.16 timeline, `requiresAttention` booleano sin scoring, filtros read-only, orden deterministico y limites sin writes ni autoridad nueva antes de tocar codigo.
- V0.17 queda validada con dry-run verificable de Execution Audit Index Read API, summary `found`/`not_found`, `timelineDataQuality` preservado, descubrimiento via StateMemory, summaries antes de filtros, `requiresAttention` solo por condiciones explicitas, `limit` al final, orden deterministico, `listExecutions()` read-only, Router COST-FIRST intacto, `advisorAuthority` intacto, cero provider calls reales y 171/171 tests.
- V0.18 declara contrato de Controlled Operational Execution Profile para lanzar ejecuciones reales de forma controlada, presupuestada y auditable, con modo `dry_run`, modo `live`, validacion previa de presupuesto/criterios, uso del Kernel existente, Human Approval obligatorio cuando aplique, maximo una provider call por attempt, estados operacionales explicitos y post-auditoria mediante V0.16/V0.17 antes de tocar codigo.
- V0.18 queda validada con dry-run verificable de Controlled Operational Execution Profile, profile validation, dry_run sin provider calls, live delegado al Kernel, Human Approval intacto, post-auditoria V0.16/V0.17 y 177/177 tests.
- V0.19 declara contrato de Controlled Execution Run Manifest para persistir una invocacion operacional por `runId`, append-only, idempotente, sanitizada y sin executions ficticias para dry_run/rejected.
- V0.19 queda validada con run manifests para dry_run/profile_rejected/live, idempotencia, append-only, fallos de persistencia, sanitizacion, provider calls controladas y 184/184 tests.
- V0.20 declara contrato de Controlled Run Status and Approval Resolution API para consultar y resolver aprobaciones por `runId` sin continuar provider.
- V0.20 queda validada con status `found`/`not_found`, aprobacion/rechazo sin provider calls, fail-closed no resoluble, identidad preservada y 190/190 tests.
- V0.21 declara contrato de Approved Execution Continuation Primitive para continuar una Execution aprobada conservando `runId`, `executionId` y `effectiveSelection`.
- V0.21 queda validada con continuacion aprobada, not_found, not_continuable, effectiveSelection persistida, idempotencia, Ledger/Manifest sin duplicados, cero APIs reales y 198/198 tests.
- V0.22 declara contrato de Controlled Approval Completion Command para componer V0.20 Approval Resolution y V0.21 Approved Execution Continuation en una sola operacion humana, sin nueva autoridad ni logica duplicada.
- V0.22 queda cerrada y congelada con Controlled Approval Completion Command, composicion V0.20/V0.21, rechazo sin provider calls, aprobacion con identidad preservada, sin rerouting, sin nueva Authority Policy, sin nueva Execution, sin duplicados en Ledger/Manifest y 206/206 tests.
- V0.23 declara contrato de Controlled Run Finalization Consistency Gate para cerrar un run solo cuando Manifest, Execution, Ledger y Timeline tengan evidencia terminal coherente, sin duplicar subsistemas ni agregar autoridad.
- V0.23 queda implementada con `finalizeControlledRun(runId)`, outcome de finalizacion separado del lifecycle, marcador append-only compacto, deteccion de `not_found`, `not_finalizable` e inconsistencias persistidas, cero provider calls, regresion V0.22 y 211/211 tests.
- V0.24 declara e implementa `closeControlledRun(runId, options?)` para componer V0.22 Completion y V0.23 Finalization en un cierre operacional unico, con aprobacion explicita cuando aplique, rechazo con cero provider calls, runs terminales delegados directo a finalizacion, inconsistencias mapeadas a `closure_inconsistent` y 217/217 tests.
- Los riesgos iniciales estan documentados.
- Los pendientes para la siguiente fase estan listados.
- No se documentan secretos ni valores de `.env`.
