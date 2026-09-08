# Quantico AI OS - Decisiones Iniciales

## Decision 001: MVP Cerrado En Orquestacion Core

Estado: aceptada.

Decision:

V0.1 se limita a la capa central de orquestacion multimodelo: recibir objetivo, compilar contexto, enrutar modelo, gobernar tokens/costo, ejecutar, pedir aprobacion humana cuando aplique, evaluar y registrar resultado.

Razon:

El valor central del producto es la decision operacional sobre contexto, modelo, herramientas, verificacion y medicion. Agregar canales o interfaces avanzadas antes de validar esto diluye el MVP.

Consecuencia:

No se implementan dashboard, WhatsApp, voz, CRM ni billing en V0.1.

Criterios de aceptacion:

- La documentacion de V0.1 enumera componentes incluidos y excluidos.
- Las tareas de implementacion inicial no incluyen canales, dashboard, CRM o billing.

## Decision 002: Providers Iniciales OpenAI Y Anthropic

Estado: aceptada.

Decision:

Los primeros providers soportados seran OpenAI y Anthropic.

Razon:

Permiten validar routing multimodelo con dos proveedores ampliamente usados sin abrir todavia un sistema extensible de muchos vendors.

Consecuencia:

El Model Router debe elegir entre ambos y los Provider Adapters deben normalizar sus diferencias.

Criterios de aceptacion:

- Existe un contrato comun para providers.
- OpenAI y Anthropic implementan el mismo contrato.
- El Orchestrator no depende de detalles especificos de cada provider.

## Decision 003: Medicion Como Requisito Del Producto

Estado: aceptada.

Decision:

Tokens, costo, latencia y resultado deben medirse desde V0.1.

Razon:

La orquestacion solo es confiable si cada ejecucion deja evidencia de consumo, performance y outcome.

Consecuencia:

Cada llamada a modelo debe producir metricas registradas. El resultado final debe incluir metricas agregadas.

Criterios de aceptacion:

- Cada model call registra tokens de entrada, tokens de salida, costo estimado y latencia.
- Cada ejecucion final incluye costo total estimado, latencia total y outcome.

## Decision 004: Human Approval Gate En El Flujo Central

Estado: aceptada.

Decision:

La aprobacion humana es un componente central de V0.1.

Razon:

El sistema decide y ejecuta. Por seguridad operacional, las acciones sensibles deben detenerse antes de ejecutarse.

Consecuencia:

El Orchestrator debe poder pausar y reanudar una ejecucion.

Criterios de aceptacion:

- Una accion sensible genera estado `needs_human` o `awaiting_approval`.
- Una aprobacion reanuda la ejecucion.
- Un rechazo impide ejecutar el paso rechazado.

## Decision 005: Memoria Operacional, No Memoria Avanzada

Estado: aceptada.

Decision:

State/Memory en V0.1 sera memoria operacional para trazas, estado y resultados. No sera una capa avanzada de conocimiento semantico.

Razon:

El MVP necesita auditabilidad y recuperacion de estado antes que memoria inteligente de largo plazo.

Consecuencia:

La persistencia debe guardar ejecuciones, eventos, metricas, decisiones y evaluaciones.

Criterios de aceptacion:

- Se puede consultar el estado de una ejecucion.
- Se puede revisar la secuencia de eventos de una ejecucion.
- No se requiere busqueda semantica ni memoria vectorial en V0.1.

## Decision 006: CLI/API Minima Antes Que Interfaz Visual

Estado: aceptada.

Decision:

V0.1 tendra CLI/API minima y no dashboard.

Razon:

CLI/API permite validar el motor de orquestacion sin invertir en interfaz visual prematura.

Consecuencia:

Las primeras pruebas de aceptacion se ejecutaran por CLI/API.

Criterios de aceptacion:

- La CLI puede ejecutar un objetivo y mostrar resultado con metricas.
- La API puede crear ejecucion, consultar estado, aprobar/rechazar paso pendiente y obtener resultado.
- No hay dashboard en V0.1.

## Decision 007: Evaluacion Estructurada Obligatoria

Estado: aceptada.

Decision:

Toda ejecucion debe pasar por Evaluator antes de completarse.

Razon:

El sistema no solo debe producir una respuesta, tambien debe verificar si la respuesta cumple el objetivo.

Consecuencia:

El estado final debe incluir outcome de evaluacion.

Criterios de aceptacion:

- Cada ejecucion final tiene evaluacion registrada.
- El Evaluator devuelve `pass`, `fail`, o `needs_review`.
- La razon de evaluacion queda disponible en el resultado.

## Decision 008: OpenAI Responses API Como Path Configurable

Estado: aceptada.

Decision:

OpenAI mantiene compatibilidad con Chat Completions y agrega Responses API como path explicito/configurable cuando se requiere mejor control sobre reasoning y salida visible.

Razon:

La primera ejecucion real con `gpt-5-nano` mostro que Chat Completions podia consumir tokens de salida en reasoning sin producir texto visible. Responses API permite configurar `reasoning.effort` y extraer salida visible desde la estructura REST del response.

Consecuencia:

El selector de endpoint permanece explicito/configurable. El contrato `ProviderAdapter` no cambia y el Orchestrator sigue desacoplado de detalles especificos de OpenAI.

No se adopta Responses API como unico endpoint obligatorio en V0.1.

Criterios de aceptacion:

- OpenAI puede usar Chat Completions sin cambiar el contrato comun.
- OpenAI puede usar Responses API mediante configuracion explicita.
- El contrato `ProviderAdapter` se mantiene estable.
- El parsing de Responses API extrae `output_text` visible desde la respuesta REST.
- V0.1 queda cerrada despues de una ejecucion real satisfactoria con presupuesto, evaluacion y persistencia.

## Decision 009: V0.2 Valida Anthropic Real Sin Ampliar Orquestacion

Estado: aceptada.

Decision:

V0.2 se abre como fase separada para validar Anthropic real y confirmar paridad multi-provider usando el mismo Kernel end-to-end.

Razon:

V0.1 ya valido el Kernel contra OpenAI real. El siguiente riesgo tecnico relevante es confirmar que Anthropic funciona bajo el mismo contrato `ProviderAdapter`, sin filtrar detalles del proveedor hacia Orchestrator, Model Router o Token Governor.

Consecuencia:

V0.1 queda cerrada y congelada en el commit `36739d1dc9112e629c0e15283ab9697a4f427a37`.

V0.2 no introduce fallback inteligente, scorecards, retries automaticos, dashboard ni nuevos providers.

El runner manual `npm run smoke:anthropic` se agregara posteriormente como validacion real separada de los tests unitarios.

Criterios de aceptacion:

- Anthropic ejecuta una llamada real mediante el Kernel end-to-end.
- La ejecucion conserva el contrato `ProviderAdapter` existente.
- Se registran input tokens, output tokens, costo estimado, latencia, evaluacion, errores normalizados y persistencia.
- Model Router y Token Governor se mantienen provider-agnostic.
- No existe logica especifica de Anthropic fuera de su adapter.
- El cierre V0.2 requiere una ejecucion real exitosa con evaluacion verificable.

## Decision 010: COST-FIRST POLICY Para V0.2

Estado: aceptada.

Decision:

Quantico AI OS debe priorizar por defecto el modelo de menor costo que cumpla las capacidades necesarias para la tarea.

Defaults economicos V0.2 para tareas simples:

- OpenAI: `gpt-5-nano`, input $0.05 / 1M tokens, output $0.40 / 1M tokens.
- Anthropic: `claude-haiku-4-5-20251001`, alias `claude-haiku-4-5`, input $1.00 / 1M tokens, output $5.00 / 1M tokens.

`gpt-4.1-mini` y `claude-3-5-haiku-latest` dejan de ser defaults economicos.

Claude Haiku 3.5 no debe usarse como default aunque sea ligeramente mas barato porque esta retirado de Claude API normal.

Razon:

La orquestacion debe demostrar control economico antes de ampliar automatizacion. V0.2 valida paridad multi-provider, por lo que el costo debe ser una restriccion primaria y no una metrica posterior.

Consecuencia:

Tareas simples usan modelos economicos. Modelos premium solo se usan cuando la tarea o capacidad lo justifique explicitamente.

Token Governor debe imponer `maxCostUsd` antes de cada llamada. Si el costo no puede demostrarse antes de ejecutar, la llamada no debe ejecutarse.

No hay retries automaticos, fallback inteligente ni escalamiento automatico a modelos mas caros. Cualquier escalamiento de costo requiere una decision explicita del sistema y, posteriormente, politica configurable.

Cuando varios providers puedan cumplir una tarea simple, se debe priorizar el menor costo estimado compatible con las capacidades requeridas.

Criterios de aceptacion:

- El smoke Anthropic usa el modelo Anthropic mas economico compatible disponible en la configuracion.
- Cada smoke usa salida minima necesaria y una sola llamada.
- Cada smoke declara `maxCostUsd` 0.001 antes de llamar al provider.
- Token Governor bloquea la ejecucion si falta pricing para provider/model.
- El sistema registra costo estimado y costo real disponible por ejecucion.
- No se agregan retries automaticos ni escalamiento automatico a modelos mas caros.

## Decision 011: V0.3 Implementa COST-FIRST Router Real

Estado: aceptada.

Decision:

V0.3 implementa seleccion real COST-FIRST en Model Router: entre modelos compatibles, no bloqueados y con pricing verificable, se selecciona el menor costo estimado.

Razon:

V0.1 y V0.2 validaron el Kernel real con OpenAI y Anthropic bajo el mismo contrato. El siguiente valor operacional es convertir la politica COST-FIRST documentada en comportamiento determinista del Router.

Consecuencia:

El Router debe considerar primero `task_type` y capacidades requeridas, despues bloqueos, despues overrides explicitos y finalmente costo estimado.

Los precios deben venir de configuracion. Un candidato sin pricing no puede ser tratado como costo cero.

`preferredProvider` y `preferredModel` siguen funcionando como overrides explicitos si el candidato es compatible, tiene pricing verificable y no esta bloqueado.

`blockedProviders` y `blockedModels` tienen prioridad sobre cualquier preferencia.

Token Governor conserva la validacion final de `maxCostUsd` antes de ejecutar.

No se agregan fallback automatico, retries, Provider Scorecard, routing por calidad historica, nuevos providers, dashboard ni cambios al contrato `ProviderAdapter`.

Defaults economicos V0.3:

- OpenAI: `gpt-5-nano`.
- Anthropic: `claude-haiku-4-5-20251001`.

Criterios de aceptacion:

- El Router selecciona el menor costo estimado entre candidatos compatibles con pricing conocido.
- El Router descarta candidatos incompatibles con `task_type` o capacidades requeridas antes de comparar costo.
- El Router nunca selecciona providers o modelos bloqueados.
- El Router respeta preferencias explicitas solo si siguen siendo validas y no bloqueadas.
- El Router no interpreta pricing faltante como costo cero.
- El Router falla con razon verificable si ningun candidato compatible tiene pricing.
- El desempate es determinista por `priority` y luego `provider:model`.
- Token Governor sigue aplicando `maxCostUsd` antes de cada llamada.

## Decision 012: V0.3 Cierra COST-FIRST Con Validacion Real

Estado: aceptada.

Decision:

V0.3 queda cerrada despues de una ejecucion real end-to-end donde el Router COST-FIRST selecciono automaticamente OpenAI `gpt-5-nano` frente a Anthropic `claude-haiku-4-5-20251001` por menor costo estimado compatible.

Razon:

La validacion demostro que el Kernel puede comparar candidatos configurados, aplicar pricing verificable, seleccionar el modelo mas barato compatible y ejecutar solo el provider ganador sin fallback, retries ni escalamiento.

Evidencia:

- Execution ID: `exec_mtf5gevi`.
- Candidato OpenAI `gpt-5-nano`: $0.000018 estimado.
- Candidato Anthropic `claude-haiku-4-5-20251001`: $0.000262 estimado.
- Provider/model seleccionado: OpenAI / `gpt-5-nano`.
- Input/output tokens reales: 127 / 24.
- Estado final: `succeeded`.
- Evaluacion: `pass`.
- Latencia: 2240ms.
- Provider calls: OpenAI 1 / Anthropic 0.

Consecuencia:

`estimatedCostUsd` queda definido para esta fase como el costo pre-ejecucion usado por Model Router y Token Governor para seleccion y validacion de presupuesto. No es el costo recalculado desde usage real.

El Router COST-FIRST queda validado como comportamiento real de V0.3 y no introduce cambios al contrato `ProviderAdapter`.

Criterios de aceptacion:

- La seleccion automatica favorece el menor costo estimado compatible.
- El provider perdedor no recibe llamadas.
- Token Governor valida el presupuesto antes de ejecutar.
- Evaluator produce `pass` con criterios deterministas verificables.
- State/Memory registra estado, metricas y resultado sin secretos.

## Decision 013: V0.4 Abre Actual Cost Accounting + Budget Ledger

Estado: aceptada.

Decision:

V0.4 se abre como fase separada para cerrar el ciclo economico del Kernel mediante calculo de costo real post-ejecucion y un ledger persistente auditable.

Razon:

V0.3 ya valida seleccion pre-ejecucion basada en menor costo estimado compatible. El siguiente riesgo economico es comparar esa estimacion contra usage real del provider para saber cuanto costo efectivamente produjo cada llamada.

Consecuencia:

`estimatedCostUsd` conserva su significado actual: estimacion pre-ejecucion usada por Model Router y Token Governor antes de gastar.

`actualCostUsd` se calcula despues de la respuesta usando tokens reales normalizados por el provider y el pricing aplicable registrado en el ledger.

Cada entrada del ledger debe persistir `inputPricePerMillion` y `outputPricePerMillion` como snapshot del pricing usado para calcular `actualCostUsd` en esa ejecucion. Una entrada historica del ledger nunca debe depender de consultar la tabla de precios vigente posteriormente para explicar su costo.

`actualCostUsd` no significa necesariamente importe final facturado por el provider. Billing e invoice reconciliation siguen fuera de alcance.

`costDeltaUsd` se define como:

```text
costDeltaUsd = actualCostUsd - estimatedCostUsd
```

Si falta usage real o pricing verificable post-ejecucion, no se inventa costo real ni se asume cero. El ledger debe registrar un estado explicito como `missing_usage`, `missing_pricing` o `not_applicable`.

State/Memory sigue siendo la estrategia minima de persistencia. No se introduce base de datos, dashboard, billing, facturacion, cuotas, fallback, retries, scorecards, optimizacion historica, nuevos providers, cobro, markup ni alertas automaticas.

ProviderAdapter no cambia salvo que sea estrictamente necesario por tipos existentes de usage; la preferencia es usar datos ya normalizados.

Criterios de aceptacion:

- Cada llamada con usage real y pricing configurado calcula `actualCostUsd`.
- Cada entrada de ledger registra executionId, provider, model, tokens estimados y reales, snapshot de pricing, costos estimado y real, delta, latencia y timestamp.
- Cada entrada historica puede explicar su costo usando `inputPricePerMillion` y `outputPricePerMillion` persistidos.
- Los acumulados simples por ejecucion, provider y modelo se derivan de entradas persistidas.
- La ausencia de pricing o usage real no produce costo cero falso.
- Token Governor conserva autoridad pre-ejecucion sobre `maxCostUsd`.
- El ledger queda persistido y auditable sin secretos.

## Decision 014: V0.4 Cierra Budget Ledger Con Dry-Run Verificable

Estado: aceptada.

Decision:

V0.4 queda cerrada despues de implementar y validar por dry-run el Budget Ledger persistible para costo real post-ejecucion.

Razon:

La validacion demostro que Quantico AI OS ya puede conservar `estimatedCostUsd` como costo pre-ejecucion y calcular `actualCostUsd` despues de la respuesta con usage real y snapshot historico de pricing, sin depender de la tabla vigente futura para explicar costos pasados.

Evidencia:

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

Confirmaciones:

- Cambiar posteriormente la tabla de pricing no modifica la entrada historica.
- Una ejecucion `approval pending` no crea entrada de ledger.
- Una ejecucion terminal sin provider crea entrada `not_applicable`.
- El ledger no persiste prompts, API keys, workspace IDs ni secretos.

Consecuencia:

V0.4 cierra el ciclo economico basico del Kernel. Quedan fuera billing, invoice reconciliation, dashboard, cuotas, fallback, retries, scorecards, optimizacion historica, nuevos providers, cobro, markup y alertas automaticas.

Criterios de aceptacion:

- El ledger persiste entradas calculadas con snapshots de pricing.
- Los acumulados simples se derivan solo de entradas con `actualCostUsd` calculable.
- Estados incompletos no representan datos desconocidos como cero.
- No hay entradas prematuras para ejecuciones no terminales o pendientes de aprobacion.

## Decision 015: V0.5 Abre Budget Enforcement

Estado: aceptada.

Decision:

V0.5 se abre como fase separada para usar el Budget Ledger como fuente de verdad operativa y bloquear nuevas llamadas cuando el gasto acumulado mas el costo estimado de la siguiente llamada exceda un presupuesto configurado.

Razon:

V0.4 ya registra costo real post-ejecucion y acumulados simples. El siguiente control operativo es impedir gasto adicional antes de llamar al provider cuando el presupuesto acumulado por ejecucion o proyecto ya no permite la siguiente llamada.

Consecuencia:

Se introduce un gate de Budget Enforcement despues de Token Governor y antes de Human Approval Gate.

El orden esperado queda:

```text
Context Compiler
-> Model Router
-> Token Governor
-> Budget Enforcement
-> Human Approval Gate
-> Provider
```

Token Governor mantiene autoridad sobre la llamada individual. Budget Enforcement valida acumulados historicos mas `estimatedNextCallCostUsd`.

El gate debe devolver una decision auditable:

- `allowed`.
- `blocked_execution_budget`.
- `blocked_project_budget`.
- `budget_unknown`.

Cada decision debe registrar executionId, projectId si aplica, `accumulatedActualCostUsd`, `estimatedNextCallCostUsd`, `applicableBudgetUsd`, `projectedCostUsd`, decision y razon.

Semantica fail-closed:

Si no puede demostrarse de forma segura el gasto acumulado o el costo estimado de la siguiente llamada, se bloquea con `budget_unknown`.

`missing_usage` y `missing_pricing` no se tratan como costo cero silenciosamente.

La asociacion por proyecto usara un `projectId` explicito cuando `maxProjectCostUsd` este activo. Si falta `projectId` con presupuesto de proyecto activo, Budget Enforcement debe devolver `budget_unknown`.

Si no existe `maxProjectCostUsd`, `projectId` puede seguir siendo opcional. Las ejecuciones sin `projectId` no se mezclan dentro de un proyecto artificial.

Quedan fuera billing, facturacion, cuotas por usuario u organizacion, dashboard, alertas automaticas, retries, fallback, scorecards, optimizacion historica, nuevos providers, cobro y markup.

Criterios de aceptacion:

- `maxExecutionCostUsd` bloquea si gasto real acumulado por ejecucion mas siguiente costo estimado excede el limite.
- `maxProjectCostUsd` bloquea si gasto real acumulado por proyecto mas siguiente costo estimado excede el limite.
- Un costo proyectado igual al presupuesto permite continuar.
- `maxProjectCostUsd` sin `projectId` devuelve `budget_unknown`.
- Falta de costo estimado siguiente o gasto acumulado verificable devuelve `budget_unknown`.
- Provider no se llama cuando Budget Enforcement bloquea.
- Cada decision queda registrada de forma auditable.

## Decision 016: V0.5 Cierra Budget Enforcement Con Dry-Run Verificable

Estado: aceptada.

Decision:

V0.5 queda cerrada despues de implementar y validar por dry-run Budget Enforcement como gate acumulado entre Token Governor y Human Approval Gate.

Razon:

La validacion demostro que Quantico AI OS puede bloquear antes de llamar al provider cuando el gasto acumulado real del ledger mas la siguiente llamada estimada excede presupuesto por ejecucion o proyecto.

Evidencia:

- Execution projected 0.00060 -> `allowed`.
- Project projected 0.00090 -> `allowed`.
- `maxExecutionCostUsd` 0.00059 -> `blocked_execution_budget`.
- `maxProjectCostUsd` 0.00089 -> `blocked_project_budget`.
- `maxProjectCostUsd` sin `projectId` -> `budget_unknown`.
- `missing_usage` aplicable -> `budget_unknown`.
- Provider calls en bloqueos y `budget_unknown`: 0.
- Tests: 87/87 pass.

Consecuencia:

Budget Enforcement queda validado como control pre-provider para presupuestos acumulados. Token Governor conserva autoridad sobre limites de llamada individual y Budget Ledger sigue siendo la fuente de verdad para gasto real acumulado.

Quedan fuera billing, facturacion, cuotas por usuario u organizacion, dashboard, alertas automaticas, retries, fallback, scorecards, optimizacion historica, nuevos providers, cobro y markup.

Criterios de aceptacion:

- Igualdad exacta con el presupuesto permite continuar.
- Exceso por presupuesto de ejecucion bloquea antes del provider.
- Exceso por presupuesto de proyecto bloquea antes del provider.
- Presupuesto de proyecto sin `projectId` falla cerrado con `budget_unknown`.
- Usage/pricing desconocido aplicable falla cerrado con `budget_unknown`.
- Los bloqueos y estados `budget_unknown` no llaman providers.

## Decision 017: V0.6 Abre Provider Scorecard Minimo

Estado: aceptada.

Decision:

V0.6 se abre como fase separada para crear un Provider Scorecard minimo que observe y resuma desempeno por provider/model.

Razon:

V0.5 ya controla presupuesto acumulado antes de llamar providers. El siguiente paso util es hacer visible la evidencia operacional acumulada sin permitir todavia que esa evidencia modifique decisiones automaticas de routing.

Consecuencia:

El Scorecard usara solo datos existentes:

- `actualCostUsd`.
- `latencyMs`.
- Estado final.
- `evaluationStatus`.

El Scorecard agrupara por provider/model y producira metricas simples, deterministicas y auditables:

- Conteos de ejecucion por estado.
- Conteos de evaluacion.
- Costo real total y promedio cuando exista.
- Latencia promedio cuando exista.
- Calidad de datos `complete` o `partial`.

El Scorecard solo observa y resume. No decide provider/model, no cambia Router COST-FIRST, no genera llamadas adicionales, no ejecuta fallback, no hace retries y no introduce dashboard.

Quedan fuera aprendizaje automatico, ranking opaco, scorecards que influyan en routing, optimizacion historica automatica, nuevos providers y cualquier llamada adicional.

Criterios de aceptacion:

- El Scorecard produce agregados por provider/model desde datos persistidos.
- Las metricas se calculan solo con datos disponibles y verificables.
- La falta de datos marca `partial` con razon auditable.
- El Router COST-FIRST permanece como autoridad de seleccion automatica.
- No se modifican ProviderAdapter, Token Governor, Budget Enforcement ni providers.

## Decision 018: V0.6 Cierra Provider Scorecard Minimo Con Dry-Run Verificable

Estado: aceptada.

Decision:

V0.6 queda cerrada despues de implementar y validar por dry-run el Provider Scorecard minimo como capa de observabilidad por provider/model.

Razon:

La validacion demostro que Quantico AI OS puede resumir evidencia operacional existente sin alterar Router COST-FIRST ni generar llamadas adicionales.

Evidencia:

- OpenAI / `gpt-5-nano`: 2 ejecuciones sinteticas.
- Anthropic / `claude-haiku-4-5-20251001`: 2 ejecuciones sinteticas.
- Mezcla de estados `succeeded` y `failed`.
- Mezcla de evaluaciones `pass` y `fail`.
- Costos y latencias distintas.
- 1 registro con costo faltante para confirmar `dataQuality` `partial`.
- Separacion por `provider:model` verificada.
- Tests: 92/92 pass.

Resultados:

- `openai:gpt-5-nano`: `successCount` 1, `failureCount` 1, `evaluationPassCount` 1, `evaluationFailCount` 1.
- `openai:gpt-5-nano`: `totalActualCostUsd` 0.000036, `averageActualCostUsd` 0.000018, `averageLatencyMs` 2000, `dataQuality` `complete`.
- `anthropic:claude-haiku-4-5-20251001`: `successCount` 1, `failureCount` 1, `evaluationPassCount` 1, `evaluationFailCount` 1.
- `anthropic:claude-haiku-4-5-20251001`: `totalActualCostUsd` 0.000295, `averageActualCostUsd` 0.000295, `averageLatencyMs` 1220.5, `dataQuality` `partial`.

Consecuencia:

Provider Scorecard queda disponible como observador minimo y auditable. No decide routing, no modifica COST-FIRST, no ejecuta providers, no hace fallback, no hace retries y no introduce dashboard.

Criterios de aceptacion:

- El Scorecard agrupa correctamente por provider/model.
- Los conteos por estado final y `evaluationStatus` son deterministas.
- Costo total/promedio y latencia promedio usan solo datos disponibles.
- La falta de datos marca `dataQuality` `partial` con razon auditable.
- No se agregan llamadas reales, fallback, retries, dashboard, ranking opaco ni aprendizaje automatico.

## Decision 019: V0.7 Abre Provider Scorecard Read API

Estado: aceptada.

Decision:

V0.7 se abre como fase separada para exponer el Provider Scorecard minimo mediante API y/o CLI read-only.

Razon:

V0.6 ya calcula agregados auditables por provider/model. El siguiente paso operacional es permitir consultar esos agregados sin cambiar decisiones de routing ni crear una interfaz visual prematura.

Consecuencia:

La API y/o CLI debe permitir:

- Listar scorecards agregados.
- Consultar un scorecard por `provider/model`.
- Devolver la salida auditable con metricas V0.6.
- Preservar `dataQuality` y `reason`.
- Responder `not_found` o equivalente cuando no exista scorecard para el provider/model solicitado.

La Read API es estrictamente read-only. No crea ejecuciones, no llama providers, no cambia Router COST-FIRST, no aplica ranking automatico, no ejecuta fallback y no hace retries.

Quedan fuera dashboard, ranking automatico, cambios de routing, fallback, retries, llamadas adicionales a providers, aprendizaje automatico, nuevos providers y cualquier uso del Scorecard como decisor.

Criterios de aceptacion:

- Existe una consulta read-only por `provider/model`.
- Existe listado read-only de scorecards agregados.
- La salida incluye las metricas V0.6 aplicables.
- La salida conserva razones de datos parciales.
- Una consulta sin datos devuelve `not_found` o equivalente auditable.
- No se modifica Router COST-FIRST ni ProviderAdapter.
- No se ejecutan llamadas adicionales a providers.

## Decision 020: V0.7 Cierra Provider Scorecard Read API Con Dry-Run Verificable

Estado: aceptada.

Decision:

V0.7 queda cerrada despues de implementar y validar por dry-run la Provider Scorecard Read API read-only.

Razon:

La validacion demostro que Quantico AI OS puede consultar los agregados del Provider Scorecard por API sin modificar State/Memory, sin llamar providers y sin alterar Router COST-FIRST.

Evidencia:

- `listProviderScorecards()` devuelve scorecards de OpenAI y Anthropic.
- `getProviderScorecard()` devuelve `found` para `openai:gpt-5-nano`.
- `getProviderScorecard()` devuelve `not_found` auditable para `anthropic:missing-model`.
- Las metricas devueltas coinciden con V0.6.
- La lectura no modifica State/Memory.
- Router COST-FIRST permanece intacto.
- Tests: 96/96 pass.

Resultados:

- `openai:gpt-5-nano`: `totalActualCostUsd` 0.000036, `averageActualCostUsd` 0.000018, `averageLatencyMs` 2000, `dataQuality` `complete`.
- `anthropic:claude-haiku-4-5-20251001`: `totalActualCostUsd` 0.000295, `averageActualCostUsd` 0.000295, `averageLatencyMs` 1220.5, `dataQuality` `partial`.

Consecuencia:

Provider Scorecard queda expuesto mediante API read-only minima. No decide routing, no modifica COST-FIRST, no ejecuta providers, no hace fallback, no hace retries y no introduce dashboard.

Criterios de aceptacion:

- El listado read-only devuelve todos los scorecards disponibles.
- La consulta por provider/model existente devuelve `found`.
- La consulta por provider/model inexistente devuelve `not_found` con razon auditable.
- La lectura no muta State/Memory.
- No se modifica Router COST-FIRST ni ProviderAdapter.
- No se agregan llamadas reales, fallback, retries, dashboard, ranking automatico ni aprendizaje automatico.

## Decision 021: V0.8 Abre Shadow Routing Advisor

Estado: aceptada.

Decision:

V0.8 se abre como fase separada para crear un Shadow Routing Advisor read-only que compare la decision real del Router COST-FIRST contra una recomendacion historica derivada del Provider Scorecard.

Razon:

V0.7 ya permite consultar scorecards agregados. Antes de permitir que datos historicos influyan en routing, Quantico AI OS debe observar si una recomendacion historica difiere de COST-FIRST y explicar esa diferencia sin cambiar ejecuciones reales.

Consecuencia:

El Advisor usara unicamente datos del Provider Scorecard. No consulta providers, no ejecuta llamadas adicionales, no hace fallback, no hace retries y no tiene autoridad de routing.

La decision real sigue siendo responsabilidad del Router COST-FIRST. El Shadow Routing Advisor solo devuelve:

- Seleccion real.
- Recomendacion historica.
- Si coincide o difiere.
- Razon deterministica.
- Metricas de scorecard utilizadas.
- Calidad de datos.
- `advisorAuthority` igual a `none`.

La recomendacion historica debe ser deterministica y auditable. No se permite ranking opaco, aprendizaje automatico ni optimizacion historica automatica.

Quedan fuera dashboard, cambios al Router COST-FIRST, cambios de seleccion real, fallback, retries, llamadas adicionales a providers, ranking opaco, aprendizaje automatico y nuevos providers.

Criterios de aceptacion:

- El Advisor usa solo Provider Scorecard.
- El Advisor compara seleccion real COST-FIRST contra recomendacion historica.
- La salida explica coincidencias y divergencias sin modificar ejecucion.
- Datos insuficientes devuelven `insufficient_data`.
- `advisorAuthority` es siempre `none`.
- No se modifica Router COST-FIRST ni ProviderAdapter.

## Decision 022: V0.8 Cierra Shadow Routing Advisor Con Dry-Run Verificable

Estado: aceptada.

Decision:

V0.8 queda cerrada despues de implementar y validar por dry-run el Shadow Routing Advisor como recomendador observacional sin autoridad de routing.

Razon:

La validacion demostro que Quantico AI OS puede comparar la seleccion real del Router COST-FIRST contra una recomendacion historica derivada solo del Provider Scorecard, sin modificar la ejecucion real ni llamar providers.

Evidencia:

- Match entre COST-FIRST y shadow verificado.
- Divergence entre COST-FIRST y shadow verificado.
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

Consecuencia:

Shadow Routing Advisor queda disponible como observador comparativo. No decide routing, no modifica COST-FIRST, no ejecuta providers, no hace fallback, no hace retries y no introduce dashboard.

Criterios de aceptacion:

- El Advisor produce match cuando la recomendacion coincide con COST-FIRST.
- El Advisor produce divergence cuando la recomendacion historica difiere.
- Los candidatos con datos insuficientes se excluyen.
- La precedencia deterministica se aplica en el orden documentado.
- La salida incluye razones y metricas auditables.
- `advisorAuthority` permanece siempre `none`.
- No se modifica Router COST-FIRST ni ProviderAdapter.
- No se agregan llamadas reales, fallback, retries, dashboard, ranking opaco ni aprendizaje automatico.

## Decision 023: V0.9 Abre Shadow Routing Evaluation Log

Estado: aceptada.

Decision:

V0.9 se abre como fase separada para persistir y consultar un historial auditable de comparaciones entre la seleccion real del Router COST-FIRST y la recomendacion del Shadow Routing Advisor.

Razon:

V0.8 puede comparar COST-FIRST contra una recomendacion historica, pero todavia no conserva evidencia acumulada de esas coincidencias y divergencias. Antes de otorgar cualquier autoridad futura al advisor, Quantico AI OS debe medir y auditar esas divergencias en el tiempo.

Consecuencia:

Cada evaluacion shadow debe poder persistir:

- `actualSelection`.
- `shadowRecommendation`.
- `matchesActualSelection`.
- `differenceReason`.
- Metricas usadas por el advisor.
- `advisorAuthority` siempre `none`.

El sistema debe proveer lectura auditable del historial y agregados simples:

- `totalEvaluations`.
- `matchCount`.
- `divergenceCount`.
- `insufficientDataCount`.
- `matchRate`.
- `divergenceRate`.

La persistencia debe usar State/Memory existente y archivo local estructurado. No se introduce nueva base de datos.

Quedan fuera cambios al Router COST-FIRST, provider calls adicionales, fallback, retries, dashboard, autoridad de seleccion, ranking opaco, aprendizaje automatico, optimizacion historica automatica y nuevos providers.

Criterios de aceptacion:

- El log persiste seleccion real, recomendacion shadow, match/divergence, razones y metricas usadas.
- `advisorAuthority` queda persistido como `none`.
- El historial puede listarse de forma auditable.
- Los agregados de match/divergence son deterministas.
- Datos insuficientes se registran explicitamente sin inventar recomendacion.
- No se modifica Router COST-FIRST ni ProviderAdapter.
- No se ejecutan llamadas adicionales a providers.

## Decision 024: V0.9 Cierra Shadow Routing Evaluation Log Con Dry-Run Verificable

Estado: aceptada.

Decision:

V0.9 queda cerrada despues de implementar y validar por dry-run el Shadow Routing Evaluation Log persistible.

Razon:

La validacion demostro que Quantico AI OS puede conservar historial auditable de coincidencias, divergencias e insuficiencia de datos entre Router COST-FIRST y Shadow Routing Advisor sin otorgar autoridad operativa al advisor.

Evidencia:

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

Consecuencia:

Shadow Routing Evaluation Log queda disponible como registro historico auditable. No decide routing, no modifica COST-FIRST, no ejecuta providers, no hace fallback, no hace retries y no introduce dashboard.

Criterios de aceptacion:

- El log persiste match, divergence e insufficient data.
- El historial puede listarse completo y filtrarse por `executionId`.
- Los agregados de match/divergence son deterministas.
- La persistencia sobrevive reinicio de `FileStateMemory`.
- `advisorAuthority` permanece siempre `none`.
- No se modifica Router COST-FIRST ni ProviderAdapter.
- No se agregan llamadas reales, fallback, retries, dashboard, ranking opaco ni aprendizaje automatico.

## Decision 025: V0.10 Abre Shadow Routing Analysis Report

Estado: aceptada.

Decision:

V0.10 se abre como fase separada para generar un reporte deterministico sobre el Shadow Routing Evaluation Log.

Razon:

V0.9 conserva historial de matches, divergences e insufficient data. Antes de considerar cualquier autoridad limitada futura, Quantico AI OS necesita un reporte auditable que mida patrones y declare si la evidencia historica es suficiente o insuficiente.

Consecuencia:

El reporte debe leer solo datos persistidos existentes y producir:

- Conteos y tasas de match/divergence.
- Patrones observables asociados a divergencias.
- Evidencia disponible.
- `evidenceStatus`: `sufficient` o `insufficient`.
- Razones y metricas auditables.
- `advisorAuthority` sin cambios.

El reporte no toma decisiones automaticas y no modifica ejecuciones reales.

Quedan fuera cambios al Router COST-FIRST, cambios a `advisorAuthority`, provider calls, fallback, retries, dashboard, IA evaluadora, autoridad limitada, ranking opaco, nueva base de datos y nuevos providers.

Criterios de aceptacion:

- El reporte lee el Shadow Routing Evaluation Log persistido.
- El reporte calcula patrones y tasas deterministicas.
- El reporte identifica condiciones observables de divergencia usando solo datos persistidos.
- El reporte declara `evidenceStatus` con razon auditable.
- El reporte no modifica Router COST-FIRST ni `advisorAuthority`.
- No se ejecutan provider calls ni decisiones automaticas.

## Decision 026: V0.10 Cierra Shadow Routing Analysis Report Con Dry-Run Verificable

Estado: aceptada.

Decision:

V0.10 queda cerrada despues de implementar y validar por dry-run el Shadow Routing Analysis Report.

Razon:

El reporte ya puede leer el Shadow Routing Evaluation Log persistido, resumir patrones de match/divergence y declarar evidencia suficiente o insuficiente con reglas deterministicas y auditables, sin cambiar el Router COST-FIRST ni otorgar autoridad al Advisor.

Evidencia validada:

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

Consecuencia:

Quantico AI OS puede analizar evidencia shadow acumulada y producir un reporte read-only para decidir, en una fase futura, si tiene sentido considerar autoridad limitada. V0.10 no modifica routing real, no ejecuta llamadas adicionales, no introduce fallback, retries, dashboard, IA evaluadora ni aprendizaje automatico.

## Decision 027: V0.11 Abre Limited Shadow Authority Policy

Estado: aceptada.

Decision:

V0.11 se abre como fase documental para definir una politica de autoridad limitada, explicita, reversible y fail-closed para el Shadow Routing Advisor.

Razon:

V0.10 ya puede declarar `evidenceStatus = "sufficient"` a partir de evidencia historica auditable, pero esa evidencia no debe convertirse en autoridad operativa global ni automatica. Antes de tocar codigo, Quantico AI OS necesita una politica verificable que limite donde, cuando y bajo que presupuesto el Advisor podria influir en una seleccion futura.

Politica definida:

- El Advisor solo puede influir si existe configuracion explicita de `advisorAuthority = "limited"`.
- `evidenceStatus` debe ser `sufficient`.
- `dataQuality` debe ser `complete`.
- La recomendacion debe incluir provider/model, razones y metricas auditables.
- Provider/model recomendado debe estar en una allowlist explicita.
- Provider/model recomendado no puede estar bloqueado.
- Preferred provider/model explicito conserva prioridad salvo decision documental posterior.
- Pricing debe existir y ser verificable.
- Presupuesto maximo por intervencion debe existir y cumplirse.
- La sustitucion requiere metricas comparables entre COST-FIRST y shadow.
- La recomendacion shadow debe tener `evaluationPassRate >= 0.8`.
- La recomendacion shadow debe tener `successRate >= 0.8`.
- La recomendacion shadow debe superar a COST-FIRST por al menos `0.2` en `evaluationPassRate` o por al menos `0.1` en `successRate`.
- `evaluationPassRate` y `successRate` provienen del Provider Scorecard historico por provider/model.
- `costFirstEstimatedCostUsd` y `shadowEstimatedCostUsd` se calculan para la llamada actual con pricing verificable y los mismos tokens estimados.
- `averageActualCostUsd` historico no se usa para autorizar presupuesto.
- `shadowEstimatedCostUsd <= costFirstEstimatedCostUsd * 1.25`.
- El costo adicional absoluto no puede exceder `maxAdditionalCostUsdPerIntervention`.
- El costo estimado shadow no puede exceder `maxEstimatedCostUsdPerIntervention`.
- Pricing faltante, no verificable o no comparable para la llamada actual fuerza fail-closed.
- Token Governor y Budget Enforcement conservan autoridad de presupuesto.
- Human Approval Gate sigue aplicando antes de acciones sensibles.
- Router COST-FIRST permanece como fallback seguro.

Bloqueo inmediato:

- `evidenceStatus` distinto de `sufficient`.
- `dataQuality` insuficiente o desconocida.
- Falta de `differenceReason`, `metricsUsed` o `shadowRecommendation`.
- Provider/model fuera de allowlist o bloqueado.
- Pricing faltante.
- Metricas faltantes o no comparables.
- Ventaja de calidad/resultado inferior al umbral.
- Costo adicional superior al margen relativo o absoluto permitido.
- Presupuesto insuficiente o desconocido.
- `budget_unknown`.
- Configuracion ambigua.
- Error de lectura de Scorecard, Evaluation Log o Analysis Report.
- Fallo de auditoria.

Rollback:

Rollback significa volver inmediatamente a `advisorAuthority = "none"` y usar Router COST-FIRST como seleccion efectiva. El rollback debe poder activarse por configuracion explicita, evidencia insuficiente, presupuesto inseguro, metrica faltante o inconsistente, falla de persistencia, falla de auditoria o cualquier condicion no verificable.

Auditoria:

Cada intervencion permitida o bloqueada debe registrar `executionId`, `advisorAuthority`, decision aplicada, seleccion COST-FIRST, recomendacion shadow, seleccion aplicada cuando exista, `evidenceStatus`, `dataQuality`, condiciones verificadas, umbrales aplicados, metricas COST-FIRST, metricas shadow, presupuesto verificado, delta de costo absoluto, delta de costo relativo, razon y timestamp.

Consecuencia:

V0.11 no concede autoridad global, no cambia Router COST-FIRST, no ejecuta provider calls adicionales, no introduce fallback automatico, retries, dashboard, ranking opaco ni aprendizaje automatico. La politica solo define las condiciones bajo las cuales una implementacion futura podria permitir influencia shadow limitada y reversible.

## Decision 028: V0.11 Cierra Limited Shadow Authority Policy Con Dry-Run Verificable

Estado: aceptada.

Decision:

V0.11 queda cerrada despues de implementar y validar por dry-run la Limited Shadow Authority Policy.

Razon:

La politica ya puede permitir una sustitucion limitada de COST-FIRST por una recomendacion shadow solo cuando existe evidencia suficiente, data quality completa, allowlist exacta, metricas historicas comparables, pricing verificable para la llamada actual y presupuestos configurados. Ante cualquier dato incompleto, bloqueo, pricing no comparable o presupuesto inseguro, la politica hace fail-closed y vuelve a `advisorAuthority = "none"`.

Evidencia validada:

- Intervencion permitida con `advisorAuthority = "limited"`.
- Seleccion efectiva = shadow solo cuando todos los umbrales pasan.
- `advisorAuthority = "none"` mantiene COST-FIRST.
- `evidenceStatus != "sufficient"` fuerza fail-closed.
- `dataQuality != "complete"` fuerza fail-closed.
- Shadow fuera de allowlist fuerza fail-closed.
- Provider/model bloqueado fuerza fail-closed.
- Pricing faltante o no comparable fuerza fail-closed.
- `evaluationPassRate < 0.8` fuerza fail-closed.
- `successRate < 0.8` fuerza fail-closed.
- Mejora insuficiente fuerza fail-closed.
- Costo mayor a 1.25x fuerza fail-closed.
- Delta mayor a `maxAdditionalCostUsdPerIntervention` fuerza fail-closed.
- `shadowEstimatedCostUsd > maxEstimatedCostUsdPerIntervention` fuerza fail-closed.
- Budgets obligatorios faltantes fuerzan fail-closed.
- Rollback deja `advisorAuthority = "none"` y seleccion efectiva COST-FIRST.
- `auditRecord` completo en permitido y bloqueado.
- Router COST-FIRST intacto.
- Provider calls reales: 0.
- Tests: 134/134 pass.

Consecuencia:

Quantico AI OS tiene una politica deterministica y auditable para autoridad shadow limitada, pero sigue sin autoridad global, sin fallback automatico, sin retries, sin dashboard, sin aprendizaje automatico y sin cambios al ProviderAdapter. COST-FIRST permanece como fallback seguro.

## Decision 029: V0.12 Abre Authority Decision Audit Log

Estado: aceptada.

Decision:

V0.12 se abre como fase documental para persistir y leer cada evaluacion de autoridad producida por la Limited Shadow Authority Policy.

Razon:

V0.11 define cuando una recomendacion shadow podria influir de forma limitada, reversible y fail-closed. Antes de conectar esa politica al runtime real, Quantico AI OS debe conservar un historial auditable de decisiones permitidas y bloqueadas para revisar comportamiento, razones, metricas y presupuestos sin afectar ejecuciones reales.

Contrato definido:

- Persistir `executionId`.
- Persistir `actualSelection`.
- Persistir `shadowRecommendation`.
- Persistir `authorityDecision`: `allowed` o `blocked`.
- Persistir `effectiveSelection`.
- Persistir `advisorAuthority`.
- Persistir `evidenceStatus` y `dataQuality`.
- Persistir metricas y umbrales evaluados.
- Persistir pricing y budgets usados.
- Persistir `costDelta`.
- Persistir `reason`.
- Persistir `timestamp`.

Lectura y agregados:

- `listEntries()` devuelve historial completo.
- `listEntries(executionId)` filtra por ejecucion.
- `summarize()` devuelve `totalDecisions`, `allowedCount`, `blockedCount`, `allowedRate`, `blockedRate` y `blockedByReason`.

Limites:

- No conectar todavia la politica al runtime real.
- No cambiar Router COST-FIRST.
- No ejecutar provider calls.
- No agregar fallback automatico.
- No agregar retries.
- No agregar dashboard.
- No agregar aprendizaje automatico.
- No introducir nueva base de datos.

Consecuencia:

El Authority Decision Audit Log sera observabilidad y trazabilidad de decisiones de autoridad. No concede autoridad nueva, no altera la seleccion real del Kernel y debe usar la persistencia existente de `State/Memory`.

## Decision 030: V0.12 Cierra Authority Decision Audit Log Con Dry-Run Verificable

Estado: aceptada.

Decision:

V0.12 queda cerrada despues de implementar y validar por dry-run el Authority Decision Audit Log.

Razon:

El sistema ya puede persistir decisiones de autoridad `allowed` y `blocked` con datos auditables completos, listarlas, filtrarlas por ejecucion y calcular agregados simples sin conectar la politica al runtime real ni modificar Router COST-FIRST.

Evidencia validada:

- Caso `allowed` persistido completo.
- Caso `blocked` persistido completo.
- `effectiveSelection` correcto en ambos casos.
- `listEntries()` devuelve historial completo.
- `listEntries(executionId)` filtra correctamente.
- `summarize()` calcula `totalDecisions`, `allowedCount`, `blockedCount`, `allowedRate`, `blockedRate` y `blockedByReason`.
- Resumen vacio devuelve ceros.
- Append-only verificado incluso con entradas repetidas.
- Persistencia sobrevive reinicio de `FileStateMemory`.
- No se persisten prompts ni secretos.
- Router COST-FIRST intacto.
- Policy sigue sin conectarse al runtime/API/CLI.
- Provider calls reales: 0.
- Tests: 142/142 pass.

Consecuencia:

Quantico AI OS conserva trazabilidad historica de evaluaciones de autoridad sin otorgar autoridad operativa adicional. La politica puede seguir analizandose antes de cualquier integracion futura al flujo real.

## Decision 031: V0.13 Abre Authority Runtime Integration

Estado: aceptada.

Decision:

V0.13 se abre como fase documental para integrar la Limited Shadow Authority Policy al runtime real del Kernel.

Razon:

V0.11 definio una politica de autoridad limitada y V0.12 agrego auditoria persistente de decisiones. El siguiente paso debe definir exactamente donde entra esa autoridad en el flujo real para evitar llamadas duplicadas, saltos de presupuesto, auditoria incompleta o sustituciones no verificables.

Flujo aprobado:

Context Compiler -> Router COST-FIRST -> Authority Policy -> `effectiveSelection` -> Token Governor -> Budget Enforcement -> Human Approval Gate -> Provider -> Evaluator -> Ledger / Audit.

Reglas:

- `effectiveSelection` se materializa exactamente una vez por execution attempt y queda inmutable durante ese intento.
- Authority Policy puede mantener COST-FIRST o sustituir por shadow permitido.
- Si Authority Policy falla o queda ambigua, se registra `authority_failed_closed`, se usa COST-FIRST como `effectiveSelection` y se continua hacia Token Governor/Budget Enforcement.
- Si falla la persistencia de la decision de autoridad, se registra `authority_audit_failed`, la ejecucion se detiene antes de provider y no continua ni siquiera con COST-FIRST.
- Token Governor y Budget Enforcement validan siempre y exclusivamente la `effectiveSelection` final.
- No se puede ejecutar provider antes de cerrar autoridad y presupuesto.
- Una execution attempt puede realizar maximo una provider call.
- No hay retries ni fallback automatico.
- Toda decision de autoridad se persiste en Authority Decision Audit Log.
- No se duplican ledger entries ni audit entries.
- Rollback a COST-FIRST ocurre antes de provider call.
- Si Token Governor o Budget Enforcement rechazan, no se recalcula seleccion ni se vuelve a invocar Authority Policy.
- Human Approval Gate conserva su autoridad actual.
- Human Approval Gate no provoca rerouting ni nueva evaluacion de autoridad al reanudarse; conserva la misma `effectiveSelection` del intento pendiente.

Invariantes:

- Router COST-FIRST sigue siendo la seleccion base y fallback seguro.
- Authority Policy no llama providers.
- Provider Adapter recibe solo la seleccion efectiva normalizada.
- Si falla la auditoria de autoridad, no se llama provider.
- Si Token Governor o Budget Enforcement rechazan, no se llama provider.
- Si Human Approval Gate pausa, no se llama provider antes de aprobacion.
- Reanudaciones desde Human Approval Gate usan la `effectiveSelection` ya materializada para el intento pendiente.

Estados de fallo definidos:

- `authority_failed_closed`: Authority Policy falla o queda ambigua; se usa COST-FIRST como `effectiveSelection` y la ejecucion continua hacia Token Governor/Budget Enforcement.
- `authority_audit_failed`: fallo al persistir la decision de autoridad; la ejecucion se detiene antes de provider, no continua con COST-FIRST y provider calls = 0.
- `effective_selection_missing`.
- `budget_rejected`.
- `needs_human`.
- `provider_error`.

Consecuencia:

V0.13 no implementa codigo todavia. La fase fija el contrato operativo para conectar autoridad limitada al Kernel sin romper COST-FIRST, presupuesto, aprobacion humana, ledger ni auditoria.

## Decision 032: V0.13 Cierra Authority Runtime Integration Con Dry-Run Verificable

Estado: aceptada.

Decision:

V0.13 queda cerrada despues de implementar y validar por dry-run la integracion de Authority Runtime en el flujo real del Kernel.

Razon:

La validacion demostro que Quantico AI OS puede materializar una unica `effectiveSelection` por execution attempt, auditar la decision de autoridad, validar presupuesto exclusivamente sobre esa seleccion efectiva y ejecutar como maximo una llamada a provider sin romper Router COST-FIRST.

Evidencia validada:

- Shadow allowed usa shadow como `effectiveSelection` en Token Governor, Budget Enforcement, Provider y Budget Ledger.
- `authority_failed_closed` usa COST-FIRST como `effectiveSelection` y continua normalmente hacia Token Governor/Budget Enforcement.
- `authority_audit_failed` detiene la ejecucion antes de provider.
- Token Governor reject no reroutea ni vuelve a invocar Authority Policy.
- Budget Enforcement reject no reroutea ni vuelve a invocar Authority Policy.
- `needs_human` + approve conserva exactamente la misma `effectiveSelection`.
- Maximo una provider call por execution attempt.
- Una sola Authority Decision Audit entry por intento.
- Budget Ledger sin entradas duplicadas.
- Router COST-FIRST intacto.
- Provider calls reales: 0.
- Tests: 148/148 pass.

Consecuencia:

La autoridad limitada queda integrada al runtime con comportamiento fail-closed, auditoria obligatoria y COST-FIRST como fallback seguro. No se agregan retries, fallback automatico, dashboard, provider calls adicionales, scorecards nuevos ni cambios al contrato `ProviderAdapter`.

Criterios de aceptacion:

- La seleccion efectiva se calcula una sola vez por intento y permanece inmutable.
- Authority Decision Audit Log persiste exactamente una entrada por intento antes de cualquier llamada a provider.
- Si falla la auditoria de autoridad, no se llama provider.
- Si Token Governor o Budget Enforcement rechazan, no se recalcula seleccion.
- Human Approval conserva la seleccion efectiva al pausar y aprobar.
- Budget Ledger no duplica entradas por intento.
- Router COST-FIRST permanece intacto como seleccion base y fallback seguro.

## Decision 033: V0.14 Abre Authority Runtime Safety Metrics

Estado: aceptada.

Decision:

V0.14 se abre como fase documental para definir metricas read-only sobre decisiones reales de autoridad ya persistidas.

Razon:

V0.13 integro autoridad limitada al runtime con auditoria obligatoria y fail-closed. Antes de ampliar cualquier autoridad, Quantico AI OS debe medir cuantas veces intervino shadow, cuantas veces fue bloqueado, por que razones fallo cerrado, cuanto costo adicional autorizo y si existen outcomes comparables suficientes.

Fuentes permitidas:

- Authority Decision Audit Log.
- Budget Ledger.
- Resultados de ejecucion persistidos.
- `evaluationStatus` persistido.

Contrato definido:

- `totalAuthorityEvaluations`.
- `allowedInterventions`.
- `blockedInterventions`.
- `allowedRate`.
- `blockedRate`.
- `failClosedCount`.
- `failClosedByReason`.
- `totalAdditionalCostUsdAuthorized`.
- `averageAdditionalCostUsdAuthorized`.
- `maxAdditionalCostUsdObserved`.
- `outcomeComparison`.
- `dataQuality`.
- `reasons`.
- `generatedAt`.

Semantica:

El reporte es read-only. No cambia Router COST-FIRST, no cambia `advisorAuthority`, no amplia autoridad y no ejecuta providers.

El costo adicional autorizado se calcula solo desde `costDelta` positivo de intervenciones permitidas con costo auditable. Si falta `costDelta` o el costo no es verificable, no se inventa costo ni se asume cero silenciosamente; el reporte degrada `dataQuality`.

Para cada `executionId`, solo se atribuye outcome a la `effectiveSelection` realmente ejecutada.

V0.14 nunca infiere outcome de la seleccion no ejecutada.

El reporte separa:

- `actualOutcome`: outcome observado de la `effectiveSelection` realmente ejecutada.
- `counterfactualOutcome`: `unavailable` cuando la alternativa no fue ejecutada.
- `comparisonStatus`: `comparable` o `insufficient_data`.

No se debe declarar que shadow "mejoro" o "empeoro" respecto a COST-FIRST sin evidencia ejecutada comparable.

Los agregados de outcomes allowed vs blocked son descriptivos, no causales.

Una comparacion de outcome es valida solo cuando existen decision auditada, `actualSelection`, `shadowRecommendation`, `effectiveSelection`, ejecucion terminal, `evaluationStatus`, ledger aplicable cuando se compare costo, mismo `executionId`, metricas necesarias y evidencia ejecutada comparable.

`comparisonStatus` debe quedar como `insufficient_data` si falta ejecucion, estado terminal, `evaluationStatus`, seleccion/recomendacion, ledger necesario, costo calculable, evidencia ejecutada comparable o si existen contradicciones entre audit log, ledger y ejecucion.

El costo adicional autorizado si puede calcularse desde pricing/audit aunque no exista comparacion de outcome valida.

Limites:

- No cambiar Router COST-FIRST.
- No cambiar `advisorAuthority`.
- No ampliar autoridad.
- No ejecutar provider calls.
- No agregar fallback automatico.
- No agregar retries.
- No agregar dashboard.
- No agregar aprendizaje automatico.
- No introducir nueva base de datos.
- No modificar ProviderAdapter.

Criterios de aceptacion:

- El reporte lee solo Authority Decision Audit Log, Budget Ledger y ejecuciones persistidas.
- La lectura no modifica State/Memory.
- Calcula conteos, tasas, fail-closed por razon y costos adicionales autorizados.
- Declara outcome comparable solo con evidencia suficiente y ejecutada.
- Atribuye `actualOutcome` solo a la `effectiveSelection` realmente ejecutada.
- Declara `counterfactualOutcome = "unavailable"` para alternativas no ejecutadas.
- Mantiene agregados de outcomes allowed vs blocked como descriptivos, no causales.
- Permite calcular costo adicional autorizado desde audit/pricing aunque `comparisonStatus = "insufficient_data"`.
- Marca `insufficient_data` cuando falten datos necesarios.
- Devuelve `dataQuality` y razones auditables.
- Router COST-FIRST permanece intacto y `advisorAuthority` no cambia.

## Decision 034: V0.14 Cierra Authority Runtime Safety Metrics Con Dry-Run Verificable

Estado: aceptada.

Decision:

V0.14 queda cerrada despues de implementar y validar por dry-run Authority Runtime Safety Metrics como reporte read-only sobre decisiones reales de autoridad.

Razon:

La validacion demostro que Quantico AI OS puede medir frecuencia de intervencion, bloqueos, fail-closed, costo adicional autorizado y outcomes observados sin inferir contrafactuales, sin ampliar autoridad y sin modificar Router COST-FIRST.

Evidencia validada:

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

Consecuencia:

Quantico AI OS ya puede observar seguridad operacional de autoridad limitada sin conceder autoridad nueva. El reporte mantiene separacion estricta entre outcomes observados y contrafactuales no ejecutados.

Criterios de aceptacion:

- Las metricas se calculan solo desde datos persistidos existentes.
- El reporte no modifica State/Memory.
- El reporte no llama providers.
- COST-FIRST y `advisorAuthority` permanecen intactos.
- Outcomes no ejecutados permanecen como `counterfactualOutcome = "unavailable"`.
- Las comparaciones sin evidencia ejecutada quedan como `comparisonStatus = "insufficient_data"`.

## Decision 035: V0.15 Abre Authority Runtime Safety Metrics Read API

Estado: aceptada.

Decision:

V0.15 se abre como fase documental para definir una Read API minima sobre Authority Runtime Safety Metrics.

Razon:

V0.14 ya calcula metricas de seguridad de autoridad como reporte read-only. El siguiente paso natural es exponer esas metricas de forma consultable y auditable sin duplicar el calculo, sin escribir estado y sin ampliar autoridad.

Superficie API definida:

- `getAuthorityRuntimeSafetyMetrics()`: devuelve el reporte completo producido por `AuthorityRuntimeSafetyMetricsV014`.
- `getAuthorityRuntimeSafetyMetricsForExecution(executionId)`: devuelve la vista aplicable a una ejecucion cuando exista evidencia persistida.

Semantica de respuesta:

- El reporte completo devuelve `status = "found"` con `report` y razon auditable.
- La consulta por `executionId` devuelve `status = "found"` cuando existen Authority Decision Audit entries para esa ejecucion.
- La consulta por `executionId` devuelve `status = "not_found"` cuando no hay evidencia de autoridad persistida para esa ejecucion.
- `not_found` debe incluir razon auditable y no debe inventar un reporte vacio para una ejecucion inexistente.

`not_found` solo aplica cuando no existe evidencia de autoridad para ese `executionId`.

`found` aplica cuando existe evidencia de autoridad, aunque el reporte resulte parcial o incluya `comparisonStatus = "insufficient_data"`.

`found` no significa datos completos. La completitud se expresa exclusivamente mediante `dataQuality`, `comparisonStatus` y `reason`.

El `reason` debe explicar si el resultado es `complete`, `partial` o `insufficient_data`.

Datos preservados:

- `dataQuality`.
- `comparisonStatus = "insufficient_data"` cuando aplique.
- `actualOutcome` solo para la `effectiveSelection` realmente ejecutada.
- `counterfactualOutcome = "unavailable"` para alternativas no ejecutadas.
- Razones auditables.

Arquitectura:

La implementacion futura debe reutilizar exclusivamente `AuthorityRuntimeSafetyMetricsV014` como fuente unica de calculo. La Read API solo debe filtrar o envolver la salida para responder consultas; no debe recalcular metricas con logica paralela.

Limites:

- No cambiar Router COST-FIRST.
- No cambiar `advisorAuthority`.
- No ampliar autoridad.
- No ejecutar provider calls.
- No hacer writes.
- No agregar dashboard.
- No introducir nueva base de datos.
- No agregar fallback.
- No agregar retries.
- No modificar ProviderAdapter.

Criterios de aceptacion:

- La API expone lectura del reporte completo de Authority Runtime Safety Metrics.
- La API permite consultar por `executionId` cuando aplique.
- La consulta por `executionId` devuelve `found` o `not_found` con razon auditable.
- `not_found` solo se usa cuando no existe evidencia de autoridad para ese `executionId`.
- `found` se usa cuando existe evidencia de autoridad, aunque el reporte sea parcial o contenga `insufficient_data`.
- La salida preserva `dataQuality`.
- La salida preserva `comparisonStatus = "insufficient_data"` cuando aplique.
- La salida preserva `counterfactualOutcome = "unavailable"` para alternativas no ejecutadas.
- El `reason` explica si el resultado es completo, parcial o insuficiente.
- La implementacion reutiliza exclusivamente `AuthorityRuntimeSafetyMetricsV014`.
- Las lecturas no modifican State/Memory.
- Router COST-FIRST permanece intacto y `advisorAuthority` no cambia.

## Decision 036: V0.15 Cierra Authority Runtime Safety Metrics Read API Con Dry-Run Verificable

Estado: aceptada.

Decision:

V0.15 queda cerrada despues de implementar y validar por dry-run la Read API minima para Authority Runtime Safety Metrics.

Razon:

La validacion demostro que Quantico AI OS puede exponer lectura auditable del reporte V0.14 completo y por `executionId` sin duplicar la logica de metricas, sin escribir estado, sin provider calls y sin modificar autoridad ni Router COST-FIRST.

Evidencia validada:

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

Consecuencia:

Authority Runtime Safety Metrics queda disponible mediante una superficie API minima read-only. Esta API no concede autoridad nueva, no recalcula routing, no escribe en persistencia y no introduce dashboard, fallback, retries ni nueva base de datos.

Criterios de aceptacion:

- La Read API envuelve o filtra el reporte de `AuthorityRuntimeSafetyMetricsV014`.
- `found` no implica datos completos.
- `not_found` solo significa ausencia de evidencia de autoridad para el `executionId`.
- `dataQuality`, `comparisonStatus`, `actualOutcome` y `counterfactualOutcome` se preservan.
- Lecturas repetidas no modifican State/Memory.
- Router COST-FIRST y `advisorAuthority` permanecen intactos.

## Decision 037: V0.16 Abre Execution Audit Timeline Read API

Estado: aceptada.

Decision:

V0.16 se abre como fase documental para definir una Read API minima de linea de tiempo auditable por ejecucion.

Razon:

V0.14 y V0.15 ya cubren metricas agregadas de seguridad de autoridad. El siguiente incremento minimo y no redundante de observabilidad es permitir inspeccionar una ejecucion concreta en orden cronologico para entender que ocurrio, que decisiones se tomaron, que seleccion efectiva se uso, que costo se registro y con que evaluacion termino.

Contrato definido:

- Operacion minima: `getExecutionAuditTimeline(executionId)`.
- Respuesta `found` si existe Execution persistida.
- Respuesta `not_found` solo cuando no exista Execution persistida.
- Timeline serializable con items de fuentes persistidas existentes.
- `dataQuality`: `complete`, `partial` o `inconsistent`.
- Razon auditable de lectura y calidad de datos.

Fuentes permitidas:

- Execution persistida.
- Execution events persistidos.
- Authority Decision Audit Log entries del `executionId`.
- Budget Ledger entries del `executionId`.
- Pending approval step persistido cuando exista.
- Evaluacion y metricas ya persistidas en Execution.

Contrato de item de timeline:

- `timestamp`.
- `source`: `execution`, `event`, `authority_audit`, `budget_ledger`, `approval` o `evaluation`.
- `type`.
- `summary`.
- `details`.

Cada timeline item debe provenir de evidencia realmente persistida.

No se deben fabricar eventos derivados como si fueran registros independientes.

Si evaluation, approval o selection solo existen como campos dentro de Execution, pueden representarse en timeline con `source = "execution"`.

Sources especificos como `authority_audit`, `budget_ledger`, `event`, `approval` o `evaluation` solo deben usarse cuando exista un registro persistido independiente que los respalde.

`details` debe incluir solo campos auditables necesarios, sin prompts completos ni secretos.

Si una fuente no tiene timestamp confiable, no se inventa. La limitacion debe reflejarse en `dataQuality` y `reason`.

Ordenamiento:

1. `timestamp` ascendente.
2. `source` en orden deterministico cuando haya empate.
3. `type` en orden lexicografico.

Data quality:

- `complete`: fuentes esperadas presentes y consistentes.
- `partial`: evidencia faltante pero no contradictoria.
- `inconsistent`: fuentes persistidas se contradicen.

`inconsistent` no debe intentar resolver automaticamente cual fuente es correcta.

Limites:

- No cambiar Router COST-FIRST.
- No cambiar `advisorAuthority`.
- No ampliar autoridad.
- No ejecutar provider calls.
- No hacer writes.
- No agregar dashboard.
- No introducir nueva base de datos.
- No agregar fallback.
- No agregar retries.
- No modificar ProviderAdapter.
- No duplicar metricas V0.14/V0.15.

Seguridad:

La timeline no debe exponer prompts completos, API keys, workspace IDs ni secretos. Solo debe incluir datos operacionales necesarios para auditoria.

Criterios de aceptacion:

- `getExecutionAuditTimeline(executionId)` devuelve `found` para Execution persistida.
- `getExecutionAuditTimeline(executionId)` devuelve `not_found` solo cuando no existe Execution persistida.
- Cada timeline item proviene de evidencia realmente persistida.
- La timeline combina fuentes persistidas existentes sin escribir estado ni fabricar eventos derivados.
- La timeline se ordena de forma deterministica.
- Incluye authority audit, ledger, approval y evaluation cuando existan.
- Usa sources especificos solo cuando existe registro persistido independiente.
- Representa campos embebidos en Execution con `source = "execution"`.
- Preserva `effectiveSelection`, `authorityDecision`, costos ledger y evaluation status cuando existan.
- `dataQuality` distingue `complete`, `partial` e `inconsistent` con razon auditable.
- `inconsistent` no resuelve automaticamente contradicciones.
- Fuentes sin timestamp confiable no reciben timestamps inventados.
- Router COST-FIRST y `advisorAuthority` permanecen intactos.

## Decision 038: V0.16 Cierra Execution Audit Timeline Read API Con Dry-Run Verificable

Estado: aceptada.

Decision:

V0.16 queda cerrada despues de implementar y validar por dry-run la Read API minima de Execution Audit Timeline.

Razon:

La validacion demostro que Quantico AI OS puede exponer una linea de tiempo auditable por ejecucion usando solo evidencia persistida, sin escribir estado, sin fabricar eventos derivados, sin provider calls y sin alterar Router COST-FIRST ni `advisorAuthority`.

Evidencia validada:

- `found` cuando existe Execution persistida.
- `not_found` solo cuando no existe Execution.
- Timeline basado unicamente en evidencia persistida.
- Evaluation embebida usa `source = "execution"`.
- Sources independientes solo aparecen con registros independientes.
- Orden deterministico por timestamp, source y type.
- `dataQuality` distingue `complete`, `partial` e `inconsistent`.
- `inconsistent` no resuelve contradicciones automaticamente.
- Timestamps faltantes no se inventan y degradan `dataQuality` / `reason`.
- `effectiveSelection`, `authorityDecision`, ledger, `evaluationStatus` y tokens se preservan cuando hay evidencia persistida.
- Secretos, prompts completos, API keys y workspace IDs se sanitizan.
- State/Memory sin cambios durante lectura.
- Router COST-FIRST intacto.
- `advisorAuthority` intacto.
- Provider calls reales: 0.
- Bug de `finalResultLength` corregido y cubierto por test.
- Tests: 164/164 pass.

Consecuencia:

Execution Audit Timeline queda disponible mediante una superficie API minima read-only. Esta API no concede autoridad nueva, no recalcula routing, no escribe en persistencia, no llama providers y no introduce dashboard, fallback, retries ni nueva base de datos.

Criterios de aceptacion:

- La timeline se construye desde Execution y registros persistidos existentes.
- `found` significa Execution persistida; `not_found` significa ausencia de Execution.
- Sources especificos requieren registros independientes.
- Campos embebidos se representan con `source = "execution"`.
- La salida mantiene datos auditables y sanitiza contenido sensible.
- Lecturas repetidas no modifican State/Memory.
- Router COST-FIRST y `advisorAuthority` permanecen intactos.

## Decision 039: V0.17 Abre Execution Audit Index Read API

Estado: aceptada.

Decision:

V0.17 se abre como fase documental para definir una Read API minima de indice auditable de ejecuciones.

Razon:

V0.16 permite consultar la timeline de una ejecucion concreta, pero requiere conocer el `executionId`. El siguiente incremento minimo de observabilidad operativa es listar ejecuciones persistidas con un resumen auditable para descubrir cuales existen, cuales requieren atencion y cuales tienen evidencia parcial o inconsistente, sin duplicar metricas ni ampliar autoridad.

Contrato definido:

- Operacion `listExecutionAuditSummaries(options?)`.
- Operacion `getExecutionAuditSummary(executionId)`.
- Summaries derivados de Execution persistida y V0.16 Execution Audit Timeline.
- `found` para summary individual si existe Execution persistida.
- `not_found` solo si no existe Execution persistida.
- Indice read-only con `dataQuality` agregada desde timelines incluidas.

Summary por ejecucion:

- `executionId`.
- `projectId` cuando exista.
- `executionStatus`.
- `createdAt`.
- `updatedAt`.
- `timelineDataQuality`.
- `timelineItemCount`.
- `sourcesPresent`.
- `hasAuthorityAudit`.
- `hasBudgetLedger`.
- `hasEvaluation`.
- `hasApproval`.
- `hasInconsistency`.
- `requiresAttention`.
- `attentionReasons`.

`requiresAttention` debe ser un boolean deterministico y auditable derivado unicamente de condiciones explicitas.

`requiresAttention = true` solo cuando:

- `timelineDataQuality = "partial"`.
- `timelineDataQuality = "inconsistent"`.
- `executionStatus = "failed"`.
- `executionStatus = "needs_human"`.
- `executionStatus = "awaiting_approval"`.

`requiresAttention = false` en cualquier otro caso.

No se agrega scoring, severidad ni heuristicas. No se usa evaluacion causal ni metricas V0.14/V0.15 para decidir `requiresAttention`.

Filtros permitidos:

- `executionStatus`.
- `projectId`.
- `dataQuality`.
- `requiresAttention`.
- `limit`.

Los filtros se aplican despues de construir summaries validos.

`limit` se aplica al final, despues de construir summaries, aplicar filtros y ordenar.

Ordenamiento:

1. `updatedAt` descendente.
2. `createdAt` descendente.
3. `executionId` ascendente.

Data quality del indice:

- `complete`: todas las summaries incluidas tienen timeline `complete`.
- `partial`: una o mas summaries tienen timeline `partial` y ninguna tiene `inconsistent`.
- `inconsistent`: una o mas summaries tienen timeline `inconsistent`.

La implementacion futura debe reutilizar V0.16 Execution Audit Timeline como fuente de composicion por ejecucion. `getExecutionAuditSummary(executionId)` reutiliza V0.16 y no reimplementa timeline. Si timeline V0.16 devuelve `found` pero `partial` o `inconsistent`, el summary sigue siendo `found` y preserva `timelineDataQuality`. No debe reimplementar sanitizacion, ordenamiento, dataQuality ni deteccion de inconsistencias.

Limites:

- No cambiar Router COST-FIRST.
- No cambiar `advisorAuthority`.
- No ampliar autoridad.
- No ejecutar provider calls.
- No hacer writes.
- No agregar dashboard.
- No introducir nueva base de datos.
- No agregar fallback.
- No agregar retries.
- No modificar ProviderAdapter.
- No duplicar metricas V0.14/V0.15.
- No reimplementar timeline V0.16.
- No agregar scoring, severidad ni heuristicas para `requiresAttention`.
- No usar evaluacion causal ni metricas V0.14/V0.15 para decidir `requiresAttention`.

Criterios de aceptacion:

- La API lista summaries de ejecuciones persistidas.
- La API consulta summary por `executionId`.
- `getExecutionAuditSummary` devuelve `found` si existe Execution y `not_found` solo si no existe.
- Cada summary deriva su evidencia de V0.16 Execution Audit Timeline.
- `sourcesPresent`, `timelineItemCount` y `timelineDataQuality` reflejan la timeline V0.16.
- `requiresAttention` y `attentionReasons` son deterministas y auditables.
- `requiresAttention` solo depende de `timelineDataQuality` y `executionStatus` segun condiciones explicitas.
- El listado permite filtros simples read-only.
- Los filtros se aplican despues de construir summaries validos.
- `limit` se aplica al final, despues de filtros y orden.
- El orden del listado es deterministico.
- `dataQuality` del indice propaga `complete`, `partial` o `inconsistent`.
- Lecturas repetidas no modifican State/Memory.
- Router COST-FIRST y `advisorAuthority` permanecen intactos.

## Decision 040: V0.17 Cierra Execution Audit Index Read API Con Dry-Run Verificable

Estado: aceptada.

Decision:

V0.17 queda cerrada despues de implementar y validar por dry-run la Read API minima de Execution Audit Index.

Razon:

La validacion demostro que Quantico AI OS puede descubrir ejecuciones persistidas y devolver summaries auditables derivados de V0.16 Execution Audit Timeline, sin reimplementar timeline, sin escribir estado, sin provider calls y sin alterar Router COST-FIRST ni `advisorAuthority`.

Evidencia validada:

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

Consecuencia:

Execution Audit Index queda disponible mediante una superficie API minima read-only. Esta API no concede autoridad nueva, no recalcula routing, no escribe en persistencia, no llama providers, no duplica metricas V0.14/V0.15 y no introduce dashboard, fallback, retries ni nueva base de datos.

Criterios de aceptacion:

- El indice descubre ejecuciones persistidas via StateMemory.
- Los summaries se derivan de V0.16 Execution Audit Timeline.
- `found` significa Execution persistida; `not_found` significa ausencia de Execution.
- `requiresAttention` permanece como booleano derivado solo de condiciones explicitas.
- Los filtros se aplican despues de construir summaries validos.
- `limit` se aplica al final.
- Lecturas repetidas no modifican State/Memory.
- Router COST-FIRST y `advisorAuthority` permanecen intactos.

## Decision 041: V0.18 Abre Controlled Operational Execution Profile

Estado: aceptada.

Decision:

V0.18 se abre como fase documental para definir un perfil operacional minimo de ejecucion controlada.

Razon:

V0.16 y V0.17 ya cubren inspeccion cronologica y descubrimiento de ejecuciones persistidas. El siguiente incremento minimo hacia operacion real no debe ser otra capa read-only; debe definir como lanzar una ejecucion real con presupuesto estricto, criterios deterministas y post-auditoria usando las capacidades existentes.

Capacidad nueva:

Un `ControlledOperationalExecutionProfile` empaqueta antes de ejecutar:

- Objetivo humano.
- `taskType` opcional.
- Restricciones.
- Presupuesto estricto.
- Criterios de evaluacion deterministas.
- Politica de aprobacion.
- Modo de ejecucion.
- Requisitos de auditoria post-ejecucion.

Superficie definida:

- `runControlledExecution(profile)`.

`runControlledExecution(profile)` no reimplementa Kernel, Router, Token Governor, Budget Enforcement, Human Approval Gate ni Evaluator.

Modos:

- `dry_run`: valida configuracion y calcula elegibilidad/costo estimado usando componentes existentes, sin llamar providers.
- `live`: delega una sola ejecucion al Kernel existente solo si el perfil es valido y los gates actuales lo permiten.

`dry_run` no debe simular un outcome ni marcar una ejecucion como `succeeded`; provider calls = 0.

`live` nunca puede saltarse Human Approval Gate.

Campos minimos del perfil:

- `profileId`.
- `goal`.
- `taskType` opcional.
- `projectId` opcional salvo cuando exista presupuesto de proyecto.
- `constraints`.
- `evaluationCriteria`.
- `approvalPolicy`.
- `budgets`.
- `auditRequirements`.
- `mode`.

Perfil invalido implica rechazo pre-provider y comportamiento fail-closed.

Budgets minimos:

- `maxCostUsd`.
- `maxOutputTokens`.
- `maxTotalTokens`.
- `expectedOutputTokens`.

Budgets opcionales:

- `maxExecutionCostUsd`.
- `maxProjectCostUsd`.

Si `maxProjectCostUsd` existe, `projectId` debe existir.

Semantica:

V0.18 no agrega gates nuevos dentro del Kernel. Token Governor y Budget Enforcement conservan autoridad final.

Presupuesto ausente o no verificable en `live` implica rechazo pre-provider.

Para `live`, el orden operacional futuro es:

1. Validar perfil.
2. Ejecutar Kernel existente.
3. Leer V0.16 Execution Audit Timeline.
4. Leer V0.17 Execution Audit Summary.
5. Devolver resultado operacional compuesto.

Toda ejecucion `live` debe incluir criterios deterministas verificables. Si faltan, se rechaza antes de llamar al provider.

V0.18 no crea una segunda autoridad operacional.

La post-auditoria reutiliza V0.16 Execution Audit Timeline y V0.17 Execution Audit Index. No duplica su logica.

Estados/resultados operacionales:

- `profile_validated`.
- `profile_rejected`.
- `dry_run_ready`.
- `execution_pending_approval`.
- `execution_completed`.
- `execution_failed`.

La salida operacional debe incluir:

- `executionId`.
- `status`.
- `provider`.
- `model`.
- `estimatedCostUsd`.
- `actualCostUsd` cuando exista.
- `evaluationStatus`.
- `auditSummary`.
- `timelineStatus`.
- `reason`.

Limites:

- No cambiar Router COST-FIRST.
- No cambiar `advisorAuthority`.
- No ampliar autoridad.
- No crear una segunda autoridad operacional.
- No agregar fallback.
- No agregar retries.
- No agregar dashboard.
- No introducir nueva base de datos.
- No modificar ProviderAdapter.
- No duplicar metricas V0.14/V0.15.
- No reimplementar timeline V0.16.
- No reimplementar index V0.17.
- No ejecutar provider calls durante la fase documental.
- No permitir live sin presupuesto estricto.
- No permitir live sin criterios deterministas verificables.
- No permitir que `live` salte Human Approval Gate.
- No simular outcome ni estado `succeeded` en `dry_run`.

Criterios de aceptacion:

- Existe contrato de `ControlledOperationalExecutionProfile`.
- `dry_run` valida configuracion sin provider calls.
- `dry_run` no simula outcome ni marca ejecucion como `succeeded`.
- `live` usa el Kernel existente sin modificar Router COST-FIRST ni `advisorAuthority`.
- `live` delega una sola ejecucion al Kernel existente.
- `live` nunca salta Human Approval Gate.
- Perfil invalido se rechaza pre-provider y fail-closed.
- Perfiles live sin presupuesto minimo se rechazan antes de provider.
- Perfiles live sin criterios deterministas verificables se rechazan antes de provider.
- `maxProjectCostUsd` sin `projectId` se rechaza antes de provider.
- Los resultados operacionales distinguen `profile_validated`, `profile_rejected`, `dry_run_ready`, `execution_pending_approval`, `execution_completed` y `execution_failed`.
- La salida operacional incluye resultado Kernel, timeline V0.16 y summary V0.17.
- La post-auditoria reutiliza V0.16/V0.17 y no duplica logica.
- Cada execution attempt hace maximo una provider call.
- No hay fallback automatico ni retries.

## Decision 042: V0.18 Cierra Controlled Operational Execution Profile

Estado: aceptada.

Decision:

V0.18 queda cerrada despues de implementar y validar por dry-run `runControlledExecution(profile)`.

Razon:

La validacion demostro que Quantico AI OS puede lanzar ejecuciones controladas mediante un perfil operacional minimo, sin reimplementar el Kernel ni duplicar Router, Token Governor, Budget Enforcement, Human Approval Gate, Evaluator, Timeline o Audit Summary.

Evidencia validada:

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

Consecuencia:

`runControlledExecution(profile)` queda como superficie operacional minima para ejecuciones controladas. `dry_run` valida elegibilidad y costo estimado sin provider calls; `live` delega al Kernel existente y devuelve resultado compuesto con post-auditoria. La funcion no concede autoridad nueva, no cambia Router COST-FIRST, no cambia ProviderAdapter, no agrega fallback/retries y no introduce dashboard ni nueva base de datos.

Criterios de aceptacion:

- `runControlledExecution(profile)` rechaza perfiles invalidos pre-provider.
- `dry_run` no llama providers, no simula outcome y no marca ejecuciones como `succeeded`.
- `live` valida presupuesto y criterios deterministas antes de delegar al Kernel.
- `live` no puede saltarse Human Approval Gate.
- Los estados operacionales distinguen validacion, rechazo, dry-run listo, aprobacion pendiente, completado y fallido.
- Post-auditoria reutiliza V0.16/V0.17.
- Router COST-FIRST, `advisorAuthority` y ProviderAdapter permanecen intactos.

## Decision 043: V0.19 Abre Controlled Execution Run Manifest

Estado: aceptada.

Decision:

V0.19 se abre como fase documental para definir un `ControlledExecutionRunManifest` persistible por invocacion operacional de `runControlledExecution(profile)`.

Razon:

V0.18 permite ejecutar perfiles controlados, pero un `dry_run` o `profile_rejected` puede terminar antes de que el Kernel cree una Execution. Sin un `runId` propio, esos intentos no tienen identidad operacional estable para idempotencia, auditoria y soporte. V0.19 agrega esa identidad sin crear una nueva capa de observabilidad y sin duplicar Timeline V0.16, Audit Index V0.17, Budget Ledger ni Authority Audit.

Capacidad operacional nueva:

`runId` permite correlacionar una invocacion de `runControlledExecution(profile)` aunque no exista `executionId`. Esto habilita auditoria de intentos pre-Kernel, idempotencia por invocacion, soporte de errores pre-provider y trazabilidad de `dry_run` sin crear executions ficticias.

Contrato definido:

- `runId` propio e independiente de `executionId`.
- `executionId` solo se enlaza cuando el Kernel realmente crea una Execution.
- `mode`: `dry_run` o `live`.
- `profileFingerprint` y snapshot sanitizado.
- `profileValidationStatus`.
- `runStatus`: `run_created`, `profile_rejected`, `dry_run_ready`, `live_pending_approval`, `live_completed` o `live_failed`.
- `controlledStatus` devuelto por V0.18.
- Timestamps de creacion y actualizacion.
- Referencias auditables a Timeline V0.16, Audit Summary V0.17, Budget Ledger y Authority Audit cuando existan.
- Provider/model, costos, evaluation status y dataQuality solo cuando existan como evidencia.
- `recordingStatus`: `manifest_recorded` o `manifest_record_failed`.

El manifest debe ser append-only e idempotente por `runId`. Reusar el mismo `runId` con el mismo `profileFingerprint` no debe crear registros contradictorios. Reusar el mismo `runId` con otro fingerprint debe fallar cerrado como conflicto de idempotencia.

El manifest debe sanitizar goal, constraints y errores. No debe persistir prompts completos, API keys, workspace IDs, credenciales, headers de autenticacion ni respuestas completas del provider.

Lifecycle operacional:

- `run_created`: la invocacion tiene `runId`.
- `profile_rejected`: perfil rechazado antes de provider.
- `dry_run_ready`: dry-run validado sin provider calls.
- `live_pending_approval`: Human Approval Gate pauso la ejecucion live.
- `live_completed`: ejecucion live completada.
- `live_failed`: ejecucion live fallida.

Persistence outcomes:

- `manifest_recorded`: manifest persistido correctamente.
- `manifest_record_failed`: fallo al persistir manifest.

Consecuencia:

V0.19 no cambia Execution del Kernel y no crea executions ficticias para `dry_run` o `profile_rejected`. No cambia Router COST-FIRST, `advisorAuthority`, Human Approval Gate ni ProviderAdapter. No agrega autoridad, routing, fallback, retries, provider behavior, dashboard ni nueva DB.

Criterios de aceptacion:

- Toda invocacion de `runControlledExecution(profile)` tiene `runId`.
- `dry_run`, `live` y `profile_rejected` producen manifest operacional.
- `executionId` se enlaza solo cuando el Kernel crea Execution real.
- `profile_rejected` y `dry_run_ready` quedan auditables sin crear Execution ficticia.
- El manifest referencia Timeline V0.16, Audit Index V0.17, Budget Ledger y Authority Audit cuando existan, sin duplicar sus datos ni logicas.
- El manifest es append-only e idempotente por `runId`.
- Conflicto de `runId` con fingerprint distinto falla cerrado.
- No se persisten prompts completos, secretos ni credenciales.
- Router COST-FIRST, `advisorAuthority`, Human Approval Gate, ProviderAdapter y provider behavior permanecen intactos.

## Decision 044: V0.20 Abre Controlled Run Status and Approval Resolution API

Estado: aceptada.

Decision:

V0.20 se abre como fase documental para definir una superficie operacional minima por `runId`: `getControlledRunStatus(runId)` y `resolveControlledRunApproval(runId, approvalDecision)`.

Razon:

V0.19 hizo persistible e idempotente la invocacion operacional mediante Manifest, pero el `runId` necesita una superficie de operacion para recuperar estado y resolver aprobaciones pendientes sin depender siempre de `executionId`. Esto aporta capacidad operacional real sin crear otra capa de metricas ni duplicar Timeline, Audit Index, Budget Ledger o Authority Audit.

El Kernel actual no expone una primitiva segura para continuar exactamente la misma Execution hasta provider despues de aprobar sin reejecutar Router, Authority Policy o presupuesto. Por eso V0.20 resuelve la aprobacion mediante Human Approval Gate, pero no promete continuar la ejecucion real hasta provider. Esa continuacion queda para una version futura.

Capacidad operacional nueva:

- Consultar estado de cualquier invocacion registrada por `runId`, incluyendo `dry_run` y `profile_rejected` que no tienen Execution.
- Determinar si un run esta pendiente de aprobacion y si su aprobacion puede resolverse.
- Resolver un `live_pending_approval` conservando el mismo `runId`, `executionId` y `effectiveSelection`.
- Evitar provider calls duplicadas al reutilizar el `runId` como identidad operacional.

Contrato definido:

- `getControlledRunStatus(runId)` es read-only.
- `getControlledRunStatus` devuelve `found` si existe manifest V0.19 y `not_found` solo si no existe.
- `resolveControlledRunApproval(runId, approvalDecision)` solo puede operar sobre `live_pending_approval` con pending approval persistida.
- `resolveControlledRunApproval` devuelve `approved`, `rejected`, `not_found`, `not_resolvable` o `approval_resolution_failed`.
- Resolucion de aprobacion no llama provider, no reroutea, no reevalua Authority Policy, no recalcula `effectiveSelection` y no crea una nueva invocacion logica.
- Status y resolucion referencian evidencias existentes, no duplican sus datos ni logica.

Consecuencia:

V0.20 convierte el manifest V0.19 en una pieza operable para soporte y resolucion segura de aprobaciones. No cambia Router COST-FIRST, `advisorAuthority`, Human Approval Gate, ProviderAdapter ni Kernel Execution. No agrega autoridad nueva, fallback, retries, dashboard, nueva DB ni provider behavior.

Criterios de aceptacion:

- `getControlledRunStatus(runId)` permite consultar estado operacional por manifest.
- `not_found` solo se usa cuando no existe manifest para `runId`.
- `approvalResolutionEligible` solo es `true` para `live_pending_approval` con pending approval persistida.
- Resolucion aprobada conserva `runId`, `executionId` y `effectiveSelection`.
- Resolucion rechazada no llama provider.
- Resolucion no reroutea ni reevalua Authority Policy.
- V0.20 no continua la ejecucion hasta provider despues de aprobar; esa primitiva queda para una version futura.
- Maximo una provider call por execution attempt se mantiene.
- V0.20 reutiliza Manifest V0.19, Timeline V0.16, Audit Index V0.17, Budget Ledger y Authority Audit sin duplicarlos.
- No se exponen prompts completos, API keys, workspace IDs ni secretos.
- Router COST-FIRST, `advisorAuthority`, Human Approval Gate y ProviderAdapter permanecen intactos.

## Decision 045: V0.21 Abre Approved Execution Continuation Primitive

Estado: aceptada.

Decision:

V0.21 se abre como fase documental para definir `continueApprovedExecution(runId)`, una primitiva operacional minima para continuar una Execution pausada por Human Approval Gate despues de que V0.20 resolvio la aprobacion.

Razon:

V0.20 resolvio correctamente la aprobacion por `runId`, pero no continuo hasta provider porque el Kernel no expone una primitiva segura para retomar exactamente la misma Execution sin reejecutar Router COST-FIRST, Authority Policy o presupuesto. V0.21 debe definir esa primitiva antes de tocar codigo.

Capacidad operacional nueva:

- Continuar una Execution aprobada usando el mismo `runId`, `executionId` y `effectiveSelection`.
- Ejecutar como maximo una provider call de continuacion.
- Registrar resultado, metricas, Budget Ledger y Manifest sin duplicados.
- Reutilizar Timeline V0.16 y Audit Index V0.17 para post-auditoria.

Contrato definido:

- `continueApprovedExecution(runId)` devuelve `continued`, `not_found`, `not_continuable` o `continuation_failed`.
- Exige Manifest V0.19 existente.
- Exige aprobacion resuelta como `approved` por V0.20.
- Exige Execution existente y estado recuperable post-aprobacion.
- Exige `effectiveSelection` recuperable desde evidencia persistida.
- Exige que no exista pending approval activa.
- Exige que no exista provider call previa para ese execution attempt.
- Ante cualquier evidencia faltante o ambigua, falla cerrado antes de provider.

Consecuencia:

V0.21 no concede autoridad nueva y no cambia Router COST-FIRST, Human Approval Gate, `advisorAuthority` ni ProviderAdapter. No agrega fallback, retries, dashboard, nueva DB ni nuevos providers. La fase actual es documental y no ejecuta provider calls.

Criterios de aceptacion:

- La continuacion conserva `runId`, `executionId` y `effectiveSelection`.
- No se crea nueva Execution.
- No se crea nuevo `runId`.
- No se llama Router COST-FIRST ni Authority Policy.
- No se ejecuta provider si faltan precondiciones.
- Maximo una provider call cuando procede.
- Ledger, Manifest, Timeline, Audit Index y Authority Audit se reutilizan o referencian sin duplicacion.
- Provider errors se normalizan y quedan trazables.
- Evaluator existente determina el estado final.
- No se exponen prompts completos, API keys, workspace IDs ni secretos.

## Decision 046: V0.22 Abre Controlled Approval Completion Command

Estado: aceptada.

Decision:

V0.22 se abre como fase documental para definir `completeControlledRunApproval(runId, approvalDecision)`, un comando operacional minimo que compone explicitamente V0.20 Approval Resolution y V0.21 Approved Execution Continuation en una sola operacion humana.

Razon:

V0.20 ya resuelve aprobaciones por `runId` y V0.21 ya continua una Execution aprobada sin rerouting ni nueva Authority Policy. El siguiente incremento minimo no debe crear otra API read-only ni duplicar observabilidad; debe reducir friccion operacional permitiendo que un operador complete el flujo pendiente con un solo comando auditable.

Capacidad operacional nueva:

- Recibir una decision humana explicita sobre un run `live_pending_approval`.
- Delegar resolucion de aprobacion a V0.20.
- Delegar continuacion aprobada a V0.21 solo cuando la decision sea `approved`.
- Terminar sin provider calls cuando la decision sea `rejected`.
- Conservar `runId`, `executionId` y `effectiveSelection`.

Contrato definido:

- `completeControlledRunApproval(runId, approvalDecision)` devuelve `completed`, `rejected`, `not_found`, `not_completable` o `completion_failed`.
- `not_found` aplica solo si no existe Manifest V0.19 para `runId`.
- `not_completable` aplica si el run existe pero no puede resolverse o continuarse con evidencia persistida suficiente.
- `completed` requiere que V0.20 resuelva aprobacion como `approved` y que V0.21 complete la continuacion.
- `rejected` requiere que V0.20 resuelva rechazo y mantiene provider calls = 0.
- La operacion es idempotente por evidencia persistida y no debe duplicar provider calls, Ledger ni Manifest.

Consecuencia:

V0.22 no concede autoridad nueva y no cambia Router COST-FIRST, Human Approval Gate, `advisorAuthority`, Kernel Execution ni ProviderAdapter. No agrega fallback, retries, dashboard, nueva DB ni nuevos providers. La implementacion futura debe reutilizar Manifest V0.19, Approval Resolution V0.20, Continuation V0.21, Timeline V0.16, Audit Index V0.17, Budget Ledger y Authority Audit sin duplicar su logica.

Criterios de aceptacion:

- El comando usa V0.20 para resolver aprobacion y V0.21 para continuar.
- El comando no reimplementa Kernel, Router, Authority Policy, Human Gate, Timeline, Audit Index, Ledger ni Manifest.
- `approved` puede finalizar solo si V0.20 y V0.21 pasan sus precondiciones.
- `rejected` conserva provider calls = 0.
- Se conservan `runId`, `executionId` y `effectiveSelection`.
- No se crea nueva Execution ni nuevo `runId`.
- No se llama Router COST-FIRST ni Authority Policy.
- Maximo una provider call por execution attempt.
- Repetir el mismo comando no duplica provider calls, Ledger ni Manifest.
- No se exponen prompts completos, API keys, workspace IDs ni secretos.

## Decision 047: V0.23 Abre Controlled Run Finalization Consistency Gate

Estado: aceptada.

Decision:

V0.23 se abre como fase documental para definir `finalizeControlledRun(runId)`, un gate operacional minimo que declara un Controlled Run finalizado solo cuando la evidencia persistida entre Run Manifest V0.19, Execution, Budget Ledger y Timeline V0.16 es terminal y coherente.

Razon:

V0.22 completa el flujo humano de aprobacion y continuacion en una sola operacion, pero no separa explicitamente el resultado terminal de la finalizacion auditada. El siguiente incremento minimo no debe crear otra API read-only ni duplicar observabilidad; debe cerrar el ciclo operacional validando que las fuentes persistidas no se contradicen antes de marcar el run como finalizado.

Capacidad operacional nueva:

- Verificar cierre coherente por `runId`.
- Distinguir lifecycle del Manifest y outcome de finalizacion.
- Detectar contradicciones entre Manifest, Execution, Ledger y Timeline.
- Registrar, cuando aplique, un marcador append-only de finalizacion compacto y referencial.
- Evitar que un run con evidencia ambigua o contradictoria sea tratado como cierre limpio.

Contrato definido:

- `finalizeControlledRun(runId)` devuelve `finalized`, `not_found`, `not_finalizable`, `finalization_inconsistent` o `finalization_failed`.
- `not_found` aplica solo si no existe Manifest V0.19 para `runId`.
- `not_finalizable` aplica si el run existe pero no tiene estado terminal finalizable.
- `finalized` exige evidencia persistida coherente entre Manifest, Execution, Ledger y Timeline cuando esas fuentes apliquen.
- `finalization_inconsistent` reporta contradicciones persistidas sin resolver automaticamente cual fuente es correcta.
- La finalizacion es un outcome separado del lifecycle del Manifest.

Consecuencia:

V0.23 no concede autoridad nueva y no cambia Router COST-FIRST, Human Approval Gate, `advisorAuthority`, Kernel Execution ni ProviderAdapter. No agrega fallback, retries, dashboard, nueva DB ni nuevos providers. La implementacion futura debe reutilizar Manifest V0.19, Timeline V0.16, Audit Index V0.17, Budget Ledger y Authority Audit sin duplicar datos ni logica.

Criterios de aceptacion:

- Existe contrato documental para `finalizeControlledRun(runId)`.
- El cierre se basa solo en evidencia persistida.
- No se crean executions ficticias.
- No se llama provider.
- No se reejecutan Router, Authority Policy, Token Governor, Budget Enforcement ni Evaluator.
- Contradicciones se reportan como `finalization_inconsistent`.
- Evidencia faltante o ambigua no se interpreta como exito.
- Cualquier marcador de finalizacion es append-only, compacto y referencial.
- No se exponen prompts completos, API keys, workspace IDs ni secretos.

## Decision 048: V0.23 Implementa Controlled Run Finalization Consistency Gate

Estado: aceptada.

Decision:

V0.23 implementa `finalizeControlledRun(runId)` sobre Controlled Operational Execution para cerrar un run solo cuando Manifest, Execution, Budget Ledger y Timeline V0.16 contienen evidencia terminal coherente.

Razon:

La implementacion mantiene el cierre operacional dentro del flujo controlado existente. No crea una nueva capa read-only, no duplica Timeline, Audit Index, Ledger, Authority Audit ni Manifest, y separa explicitamente el outcome de finalizacion del lifecycle del Manifest.

Resultado validado:

- `finalized` para run completado con evidencia coherente.
- `not_found` cuando no existe Manifest.
- `not_finalizable` cuando el run permanece pendiente de aprobacion.
- `finalization_inconsistent` cuando Manifest y Execution se contradicen.
- Marcador append-only compacto y referencial para finalizaciones exitosas.
- Repetir finalizacion no duplica marcador ni provider call.
- API expone `finalizeControlledRun`.
- Regresion V0.22 preservada.
- Tests: 211/211 pass.

Consecuencia:

Router COST-FIRST, Human Approval Gate, `advisorAuthority`, Kernel Execution y ProviderAdapter permanecen intactos. V0.23 no agrega autoridad, fallback, retries, dashboard, nueva DB ni provider calls.

## Decision 049: V0.24 Implementa Controlled Run Closure Command

Estado: aceptada.

Decision:

V0.24 implementa `closeControlledRun(runId, options?)` sobre Controlled Operational Execution para cerrar un run controlado mediante composicion estricta de V0.22 Controlled Approval Completion Command y V0.23 Controlled Run Finalization Consistency Gate.

Razon:

La implementacion reduce friccion operacional sin crear otra capa read-only ni duplicar logica. Un operador puede cerrar un run pendiente o terminal con un solo comando auditable, mientras V0.22 conserva la semantica de aprobacion/continuacion y V0.23 conserva la semantica de finalizacion por consistencia.

Resultado validado:

- `closed` para run aprobado/completado y finalizado por V0.23.
- `rejected` para rechazo humano con provider calls = 0.
- `not_found` cuando no existe Manifest.
- `not_closable` cuando falta `approvalDecision` o el run no puede cerrarse con la evidencia actual.
- `closure_inconsistent` cuando V0.23 reporta evidencia contradictoria.
- Runs terminales delegan directo a V0.23 sin repetir completion.
- API expone `closeControlledRun`.
- Regresion V0.23 preservada.
- Tests: 217/217 pass.

Consecuencia:

Router COST-FIRST, Human Approval Gate, `advisorAuthority`, Kernel Execution y ProviderAdapter permanecen intactos. V0.24 no agrega autoridad, fallback, retries, dashboard, nueva DB ni provider behavior. Completion V0.22, Finalization V0.23, Manifest, Timeline, Audit Index, Budget Ledger y Authority Audit se reutilizan sin duplicar su logica.

## Decision 050: V0.25 Expone La CLI Operacional

Estado: aceptada.

Decision:

V0.25 expone una CLI delgada sobre las APIs existentes para iniciar un run controlado, consultar su estado, resolver una aprobacion humana, cerrar un run y leer evidencia operativa. La CLI serializa respuestas JSON y delega toda semantica al Kernel y a las APIs ya validadas.

Razon:

La API permite integrar Quantico AI OS, pero el operador necesita una superficie local y auditable para recorrer el ciclo controlado sin construir una interfaz visual. El incremento reduce friccion operacional sin introducir otra capa de negocio ni convertir la CLI en un segundo orquestador.

Contrato:

- `controlled-run <profile.json>` lee un perfil JSON y delega a `runControlledExecution`.
- `controlled-status <runId>` lee el estado sanitizado del manifest.
- `approval <executionId> --approve|--reject` resuelve un pending step sin continuar automaticamente el provider.
- `close-run <runId> [--approve|--reject]` compone el cierre V0.24.
- `execution-timeline`, `execution-summary`, `execution-summaries`, `execution-result`, `provider-scorecards` y `authority-safety` son lecturas de las APIs auditables existentes.
- `--state-file <path>` selecciona el estado persistido de cada comando aplicable.
- La salida es JSON y los argumentos invalidos se rechazan antes de llamar a la API.

Limites:

- La CLI no reimplementa Kernel, Router, Authority Policy, Human Approval Gate, Timeline, Audit Index, Ledger ni Manifest.
- No agrega provider calls fuera de las que ya autorice el flujo `live` de V0.18.
- No revela prompts completos, API keys, workspace IDs ni secretos.
- No agrega dashboard, fallback, retries, nuevos providers, nueva base de datos ni autoridad nueva.

Resultado validado:

- Perfil controlado valido e invalido cubiertos antes de invocar API.
- Aprobacion y rechazo humanos cubiertos; flags contradictorios se bloquean localmente.
- Cierre, estado, timeline, summaries, resultado, scorecards y metricas de autoridad delegan a sus APIs existentes.
- Consultas `not_found` devuelven codigo no exitoso donde aplica.
- Tests: 250/250 pass.
