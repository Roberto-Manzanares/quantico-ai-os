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
