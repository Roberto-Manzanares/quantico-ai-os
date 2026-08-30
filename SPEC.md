# Quantico AI OS - Especificacion Inicial

## Proposito

Quantico AI OS es una capa de orquestacion multimodelo que recibe un objetivo humano, compila el contexto necesario, decide que proveedor de IA y herramientas usar, ejecuta el flujo, verifica el resultado y registra costo, tokens, latencia y outcome.

Esta especificacion cubre el MVP V0.1 cerrado, V0.2 cerrada, V0.3 cerrada, V0.4 cerrada, V0.5 cerrada y la apertura documental de V0.6.

## Alcance Del MVP V0.1

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

Fuera de alcance:

- Dashboard
- WhatsApp
- Voz
- CRM
- Billing
- Marketplace de herramientas
- Fine-tuning
- Entrenamiento de modelos
- Multiusuario avanzado
- Autenticacion empresarial
- Ejecucion autonoma sin aprobacion cuando exista riesgo definido

## Usuario Primario

Operador tecnico o fundador que quiere delegar un objetivo a una capa de IA que pueda:

- Entender la intencion.
- Reunir contexto relevante.
- Elegir el proveedor adecuado.
- Ejecutar usando herramientas permitidas.
- Pedir aprobacion humana cuando corresponda.
- Evaluar si el resultado cumple.
- Registrar evidencia operativa de costo, latencia y resultado.

## Entrada Principal

El sistema recibe un objetivo humano en lenguaje natural.

Ejemplo:

```text
Analiza este repositorio y genera un resumen tecnico de riesgos.
```

La entrada minima debe incluir:

- `goal`: objetivo humano.
- `constraints`: restricciones opcionales de costo, proveedor, herramientas o tiempo.
- `approval_policy`: reglas de aprobacion humana.
- `context_refs`: referencias opcionales a archivos, texto, memoria previa o estado.

## Salida Principal

El sistema devuelve:

- Resultado final.
- Resumen de pasos ejecutados.
- Modelo y proveedor usados.
- Herramientas usadas.
- Tokens de entrada y salida.
- Costo estimado.
- Latencia por paso y total.
- Resultado de evaluacion.
- Estado final: `succeeded`, `failed`, `needs_human`, o `cancelled`.

## Componentes Del MVP

### Orchestrator

Coordina el ciclo completo:

1. Recibe el objetivo.
2. Determina `task_type`.
3. Solicita contexto al Context Compiler.
4. Solicita decision de modelo al Model Router usando `task_type`.
5. Consulta limites al Token Governor.
6. Ejecuta pasos con proveedor y herramientas permitidas.
7. Invoca Human Approval Gate si aplica.
8. Invoca Evaluator.
9. Persiste trazas en State/Memory.
10. Devuelve resultado final.

El flujo canonico de decision para V0.1 es:

```text
Context Compiler -> Model Router -> Token Governor -> ejecucion
```

El Orchestrator debe determinar `task_type` antes de invocar el Model Router.

Valores permitidos de `task_type` en V0.1:

- `research`
- `analysis`
- `coding`
- `generation`
- `evaluation`
- `general`

### Context Compiler

Construye el paquete de contexto que sera enviado al modelo.

Debe:

- Seleccionar contexto relevante.
- Respetar presupuesto de tokens.
- Incluir objetivo, restricciones, memoria aplicable y referencias.
- Excluir informacion no autorizada o innecesaria.
- Entregar una version serializable del contexto compilado.

### Model Router

Elige proveedor y modelo entre OpenAI y Anthropic.

Debe considerar:

- `task_type` determinado por el Orchestrator.
- Tipo de tarea.
- Presupuesto de tokens.
- Costo estimado.
- Latencia esperada.
- Preferencia o bloqueo explicito de proveedor.
- Necesidad de herramientas.

### Token Governor

Controla presupuesto de tokens y costo estimado.

Debe:

- Estimar tokens antes de ejecutar.
- Rechazar o recortar contexto si excede limites configurados.
- Registrar tokens reales despues de cada llamada.
- Calcular costo estimado por proveedor/modelo usando una tabla configurable.

### State/Memory

Registra estado operativo y memoria minima.

Debe guardar:

- Objetivo recibido.
- Contexto compilado o referencia al contexto.
- Decisiones del router.
- Eventos de aprobacion.
- Llamadas a modelos.
- Uso de herramientas.
- Evaluaciones.
- Resultado final.

La memoria del MVP es operacional, no una base de conocimiento avanzada.

### Evaluator

Verifica si el resultado cumple el objetivo y restricciones.

Debe producir:

- `pass`, `fail`, o `needs_review`.
- Razon breve.
- Criterios evaluados.
- Recomendacion de siguiente accion cuando falle.

### Human Approval Gate

Aplica una politica de aprobacion basada en riesgo por accion.

Niveles de riesgo V0.1:

- `LOW`: ejecucion automatica.
- `MEDIUM`: decision configurable por `approval_policy`.
- `HIGH`: aprobacion humana obligatoria.

Cada accion debe registrar:

- `risk_level`.
- Decision aplicada: automatica, aprobada, rechazada o pendiente.
- Razon de la decision.

### Providers Iniciales

El MVP incluye adaptadores para:

- OpenAI
- Anthropic

Cada provider debe exponer una interfaz comun para:

- Enviar mensajes.
- Recibir respuesta.
- Reportar tokens.
- Reportar latencia.
- Reportar errores normalizados.

## CLI/API Minima

### CLI

Debe permitir:

- Ejecutar un objetivo.
- Definir proveedor preferido opcional.
- Definir presupuesto maximo opcional.
- Mostrar resultado y metricas.

Ejemplo conceptual:

```text
quantico run "Resume este documento" --provider openai --max-cost 0.50
```

### API

Debe permitir:

- Crear una ejecucion.
- Consultar estado.
- Aprobar o rechazar un paso pendiente.
- Obtener resultado y metricas.

No se requiere dashboard para V0.1.

## Criterios De Aceptacion Verificables

- Dado un objetivo valido, el Orchestrator crea una ejecucion con identificador unico y estado inicial.
- Dado un objetivo valido, el Orchestrator determina un `task_type` entre `research`, `analysis`, `coding`, `generation`, `evaluation` y `general`.
- Dado un objetivo con contexto, el Context Compiler produce un paquete serializable que incluye objetivo, restricciones y contexto seleccionado.
- Dado un contexto compilado y un `task_type`, el Model Router utiliza ambos para seleccionar proveedor/modelo.
- Dado un limite de tokens menor al contexto disponible, el Token Governor impide enviar un prompt que exceda el limite.
- Dado un proveedor preferido permitido, el Model Router selecciona ese proveedor o registra una razon verificable para no hacerlo.
- Dado un proveedor bloqueado, el Model Router no lo selecciona.
- Dado el flujo de una ejecucion, el orden de decision es Context Compiler, Model Router, Token Governor y ejecucion.
- Dada una accion `LOW`, Human Approval Gate permite ejecucion automatica y registra `risk_level` y decision aplicada.
- Dada una accion `MEDIUM`, Human Approval Gate aplica `approval_policy` y registra `risk_level` y decision aplicada.
- Dada una accion `HIGH`, Human Approval Gate deja la ejecucion en `needs_human` antes de ejecutar la accion.
- Dada una aprobacion humana, la ejecucion continua desde el paso pendiente.
- Dado un rechazo humano, la ejecucion termina como `cancelled` o replanifica sin ejecutar la accion rechazada.
- Despues de cada llamada a modelo, el sistema registra proveedor, modelo, tokens, costo estimado y latencia.
- Al finalizar, Evaluator produce `pass`, `fail`, o `needs_review` con razon breve.
- La CLI puede ejecutar un objetivo simple y mostrar resultado, estado final, tokens, costo estimado y latencia total.
- La API puede crear una ejecucion, consultar estado y devolver resultado final.
- No existe funcionalidad de dashboard, WhatsApp, voz, CRM o billing en V0.1.

## Apertura V0.2

Estado de V0.1: cerrada y congelada.

Commit de cierre V0.1: `36739d1dc9112e629c0e15283ab9697a4f427a37`.

V0.2 comienza como fase separada.

### Objetivo V0.2

Validar Anthropic real y confirmar paridad multi-provider del Kernel.

### Alcance V0.2

Incluido:

- Ejecutar el Kernel contra Anthropic real.
- Mantener el mismo contrato `ProviderAdapter`.
- Validar input tokens, output tokens, costo, latencia, errores normalizados, evaluacion y persistencia.
- Confirmar que Model Router y Token Governor sigan siendo provider-agnostic.
- Agregar posteriormente runner manual `npm run smoke:anthropic`.
- Aplicar COST-FIRST POLICY como restriccion de diseno V0.2.

Fuera de alcance:

- Fallback inteligente entre providers.
- Provider Scorecards.
- Retries automaticos.
- Dashboard.
- Nuevos providers.

### Criterio De Cierre V0.2

Una ejecucion real exitosa contra Anthropic debe recorrer el mismo Kernel end-to-end y terminar con evaluacion verificable, metricas y persistencia, sin introducir logica especifica de Anthropic fuera de su adapter.

### COST-FIRST POLICY

Quantico AI OS debe priorizar por defecto el modelo de menor costo que cumpla las capacidades necesarias para la tarea.

Reglas:

- Tareas simples deben usar modelos economicos.
- Modelos premium solo deben usarse cuando la tarea o capacidad lo justifique explicitamente.
- Token Governor debe imponer presupuesto maximo antes de cada llamada.
- Ninguna ejecucion puede exceder `maxCostUsd`.
- No hay retries automaticos.
- No hay escalamiento automatico a un modelo mas caro.
- Cualquier escalamiento de costo requiere una decision explicita del sistema y, posteriormente, politica configurable.
- El sistema debe registrar costo estimado y costo real disponible por ejecucion.

Para el smoke Anthropic:

- Usar el modelo Anthropic mas economico compatible disponible en la configuracion.
- Solicitar la salida minima necesaria.
- Ejecutar una sola llamada.
- Usar presupuesto maximo muy pequeno.
- Si no puede demostrarse el costo antes de ejecutar, no ejecutar.

Defaults economicos para tareas simples:

- OpenAI: `gpt-5-nano`, input $0.05 / 1M tokens, output $0.40 / 1M tokens.
- Anthropic: `claude-haiku-4-5-20251001`, alias `claude-haiku-4-5`, input $1.00 / 1M tokens, output $5.00 / 1M tokens.

Modelos removidos como defaults economicos:

- `gpt-4.1-mini`.
- `claude-3-5-haiku-latest`.

Claude Haiku 3.5 no debe usarse como default aunque sea ligeramente mas barato porque esta retirado de Claude API normal.

Cuando varios providers puedan cumplir una tarea simple, el sistema debe priorizar el menor costo estimado compatible con las capacidades requeridas.

Presupuestos smoke:

- OpenAI: `maxCostUsd` 0.001.
- Anthropic: `maxCostUsd` 0.001.

### Criterios De Aceptacion V0.2

- Dado un objetivo simple y criterios de evaluacion verificables, el Kernel ejecuta contra Anthropic real.
- La ejecucion recorre Context Compiler, Model Router, Token Governor, Human Approval Gate, Anthropic Adapter, Evaluator y State/Memory.
- La ejecucion registra provider Anthropic, modelo usado, input tokens, output tokens, costo estimado y latencia.
- Dada una tarea simple, el Model Router selecciona el modelo de menor costo que cumpla capacidades necesarias cuando exista pricing conocido.
- Dado `maxCostUsd`, Token Governor bloquea cualquier ejecucion que no pueda demostrar costo estimado antes de llamar al provider.
- El resultado termina en `succeeded` solo si Evaluator devuelve `pass` con criterios verificables.
- Los errores de Anthropic se normalizan sin filtrar detalles especificos al Orchestrator.
- Model Router y Token Governor siguen operando sin logica especifica de Anthropic.
- El contrato `ProviderAdapter` no cambia.
- El runner manual `npm run smoke:anthropic` queda separado de los tests unitarios.
- No se agregan fallback inteligente, scorecards, retries automaticos, dashboard ni nuevos providers.

## Apertura V0.3

Estado de V0.1: cerrada y congelada.

Estado de V0.2: cerrada y congelada.

Commit de cierre V0.2: `5906331bbe82f08911a8670c30e5cdc941230172`.

V0.3 comienza como fase separada.

### Objetivo V0.3

Implementar COST-FIRST Router real.

### Alcance V0.3

Incluido:

- Model Router selecciona el modelo de menor costo estimado entre modelos compatibles.
- Los precios usados por el Router deben venir de configuracion verificable, nunca de valores inventados.
- El Router considera capacidades requeridas y `task_type` antes del costo.
- `preferredProvider` y `preferredModel` siguen siendo overrides explicitos.
- `blockedProviders` y `blockedModels` siguen teniendo prioridad sobre cualquier preferencia.
- Si no existe pricing verificable para un candidato, no se trata como costo cero.
- El desempate del Router debe ser determinista.
- Defaults economicos actualizados:
  - OpenAI: `gpt-5-nano`.
  - Anthropic: `claude-haiku-4-5-20251001`.
- Token Governor conserva limites de presupuesto antes de cada llamada.

Fuera de alcance:

- Fallback automatico.
- Retries.
- Provider Scorecard.
- Routing basado en calidad historica.
- Nuevos providers.
- Dashboard.
- Cambios de `ProviderAdapter`.

### Algoritmo COST-FIRST Propuesto

1. Recibir `task_type`, capacidades requeridas, contexto compilado, tokens estimados, restricciones y tabla de precios.
2. Filtrar modelos que no soporten el `task_type`.
3. Filtrar modelos que no soporten capacidades requeridas.
4. Aplicar `blockedProviders` y `blockedModels`.
5. Si existe `preferredProvider` o `preferredModel` y el candidato preferido sigue siendo valido, seleccionarlo como override explicito.
6. Excluir candidatos sin pricing verificable para el calculo COST-FIRST.
7. Calcular costo estimado por candidato usando input tokens estimados y output tokens esperados.
8. Seleccionar el candidato de menor costo estimado.
9. Resolver empates de forma determinista por prioridad configurada y luego por clave estable `provider:model`.
10. Registrar razon auditable con filtros aplicados, costo estimado y criterio de desempate cuando aplique.

### Orden De Precedencia Del Router V0.3

1. Compatibilidad con `task_type`.
2. Compatibilidad con capacidades requeridas.
3. Bloqueos explicitos: `blockedProviders` y `blockedModels`.
4. Overrides explicitos: `preferredProvider` y `preferredModel`, solo si el candidato sigue siendo compatible y no bloqueado.
5. Pricing verificable.
6. Menor costo estimado.
7. Desempate determinista por `priority`.
8. Desempate final por `provider:model`.

### Casos Limite V0.3

- Si todos los candidatos compatibles estan bloqueados, el Router debe fallar con razon verificable.
- Si el proveedor preferido esta bloqueado, el bloqueo gana.
- Si el modelo preferido esta bloqueado, el bloqueo gana.
- Si el proveedor/modelo preferido no soporta el `task_type`, no se selecciona.
- Si el proveedor/modelo preferido no soporta capacidades requeridas, no se selecciona.
- Si un candidato no tiene pricing verificable, no participa como opcion COST-FIRST.
- Si ningun candidato compatible tiene pricing verificable, no se debe seleccionar un modelo como si costo fuera cero.
- Si dos candidatos tienen el mismo costo estimado, gana el de menor `priority`.
- Si dos candidatos empatan en costo y prioridad, gana el orden lexicografico estable `provider:model`.
- Si `expectedOutputTokens` no esta definido, el Router debe usar un valor estimable definido por configuracion o por constraints existentes, no inventar costo cero.
- Token Governor sigue siendo la autoridad final para bloquear por `maxCostUsd`.

### Criterios De Aceptacion V0.3

- Dado un conjunto de modelos compatibles con pricing conocido, el Router selecciona el menor costo estimado.
- Dado un candidato mas barato pero incompatible con `task_type`, el Router no lo selecciona.
- Dado un candidato mas barato pero sin capacidad requerida, el Router no lo selecciona.
- Dado un provider o modelo bloqueado, el Router nunca lo selecciona.
- Dado un `preferredProvider` valido, compatible, con pricing y no bloqueado, el Router lo selecciona como override explicito.
- Dado un `preferredModel` valido, compatible, con pricing y no bloqueado, el Router lo selecciona como override explicito.
- Dado un candidato sin pricing, el Router no lo trata como costo cero.
- Dado que ningun candidato compatible tiene pricing, el Router falla antes de ejecutar.
- Dado empate de costo, el resultado es determinista por `priority` y `provider:model`.
- Los defaults economicos configurados para tareas simples son `gpt-5-nano` y `claude-haiku-4-5-20251001`.
- Token Governor conserva validacion de `maxCostUsd` antes de cada llamada.
- No se modifican `ProviderAdapter`, Provider Adapters, Evaluator, Human Approval Gate ni State/Memory para cumplir V0.3.
- No se agregan fallback automatico, retries, scorecards, routing historico, dashboard ni nuevos providers.

## Apertura V0.4

Titulo: V0.4 - Actual Cost Accounting + Budget Ledger.

Estado de V0.3: cerrada y congelada.

Commit de cierre V0.3: `976a9031cb08120b5a04791f05d9eda5abd35627`.

V0.4 comienza como fase separada.

### Objetivo V0.4

Cerrar el ciclo economico del Kernel comparando costo estimado pre-ejecucion contra costo real post-ejecucion y persistiendo un ledger auditable.

### Alcance V0.4

Incluido:

- Mantener `estimatedCostUsd` como estimacion pre-ejecucion.
- Calcular `actualCostUsd` despues de la respuesta usando usage real normalizado del provider.
- Persistir un registro de ledger por llamada de modelo dentro de una ejecucion.
- Registrar acumulados simples por ejecucion, provider y modelo.
- Definir `costDeltaUsd = actualCostUsd - estimatedCostUsd`.
- Usar pricing proveniente siempre de configuracion verificable.
- No inventar costo real ni asumir cero cuando falte pricing post-ejecucion.
- Mantener Token Governor como autoridad pre-ejecucion.
- Mantener el ledger persistible y auditable mediante State/Memory actual.

Fuera de alcance:

- Billing a clientes.
- Facturacion.
- Dashboard.
- Cuotas por usuario u organizacion.
- Fallback.
- Retries.
- Scorecards.
- Optimizacion historica.
- Nuevos providers.
- Cobro o markup.
- Alertas automaticas.

### Contrato Del Ledger

Cada entrada de ledger debe representar una llamada de modelo ya intentada y debe incluir:

- `executionId`.
- `provider`.
- `model`.
- `estimatedInputTokens`.
- `expectedOutputTokens`.
- `actualInputTokens`.
- `actualOutputTokens`.
- `inputPricePerMillion`.
- `outputPricePerMillion`.
- `estimatedCostUsd`.
- `actualCostUsd`.
- `costDeltaUsd`.
- `latencyMs`.
- `timestamp`.
- Estado de calculo de costo real.
- Razon verificable cuando `actualCostUsd` no pueda calcularse.

`inputPricePerMillion` y `outputPricePerMillion` son el snapshot del pricing utilizado para calcular `actualCostUsd` en esa ejecucion. Una entrada historica del ledger nunca debe depender de consultar la tabla de precios vigente posteriormente para explicar su costo.

Los acumulados simples deben poder consultarse por:

- Ejecucion.
- Provider.
- Modelo.

### Semantica Estimated Vs Actual

`estimatedCostUsd` es el costo pre-ejecucion usado por Model Router y Token Governor para seleccionar modelo y validar presupuesto antes de llamar al provider.

`actualCostUsd` es el costo post-ejecucion calculado usando usage real reportado por el provider y el pricing aplicable registrado en el ledger.

`actualCostUsd` no significa necesariamente importe final facturado por el provider. Billing e invoice reconciliation siguen fuera de alcance.

`costDeltaUsd` es la diferencia entre ambos:

```text
costDeltaUsd = actualCostUsd - estimatedCostUsd
```

Si `actualCostUsd` no puede calcularse, `costDeltaUsd` tampoco debe calcularse.

### Estados De Costo Real

El calculo de costo real debe producir un estado explicito:

- `calculated`: existe usage real y pricing verificable para provider/model.
- `missing_usage`: el provider no devolvio tokens reales suficientes para calcular costo.
- `missing_pricing`: no existe pricing verificable para provider/model despues de ejecutar.
- `not_applicable`: la ejecucion no realizo llamada de modelo.

Cuando el estado no sea `calculated`, `actualCostUsd` y `costDeltaUsd` deben quedar como `null` o ausentes, nunca como cero inventado.

### Algoritmo De Actual Cost

1. Recibir resultado normalizado del Provider Adapter despues de la llamada.
2. Leer `input_tokens` y `output_tokens` reales del usage normalizado.
3. Buscar pricing configurado para `provider/model`.
4. Si falta usage, registrar estado `missing_usage` y razon verificable.
5. Si falta pricing, registrar estado `missing_pricing` y razon verificable.
6. Si usage y pricing existen, copiar `inputPricePerMillion` y `outputPricePerMillion` a la entrada de ledger como snapshot historico.
7. Calcular:

```text
actualCostUsd =
  (actualInputTokens / 1_000_000 * inputPricePerMillion) +
  (actualOutputTokens / 1_000_000 * outputPricePerMillion)
```

8. Calcular `costDeltaUsd = actualCostUsd - estimatedCostUsd`.
9. Persistir entrada de ledger y actualizar acumulados simples.

### Estrategia Minima De Persistencia

V0.4 debe reutilizar State/Memory actual con archivo local estructurado. El ledger debe guardarse como datos operacionales reemplazables, sin introducir base de datos, servicios externos ni dependencias nuevas salvo necesidad justificada.

### Casos Limite V0.4

- Si una ejecucion es bloqueada por Token Governor antes del provider, no debe existir costo real; el ledger puede registrar `not_applicable`.
- Si el provider falla antes de devolver usage, `actualCostUsd` queda sin calcular con estado `missing_usage`.
- Si el provider devuelve usage parcial, no se debe calcular costo real incompleto.
- Si falta pricing post-ejecucion, no se debe asumir costo cero.
- Si `estimatedCostUsd` existe pero `actualCostUsd` no, `costDeltaUsd` debe quedar sin calcular.
- Si `actualCostUsd` excede `estimatedCostUsd`, la diferencia se registra como delta positivo.
- Si `actualCostUsd` queda por debajo de `estimatedCostUsd`, la diferencia se registra como delta negativo.
- Si varias llamadas ocurren en una ejecucion futura, los acumulados por ejecucion deben sumar entradas individuales sin mezclar providers/modelos.
- El ledger no debe persistir prompts completos ni secretos como requisito de costo.

### Criterios De Aceptacion V0.4

- Dada una llamada exitosa con usage real y pricing configurado, el sistema calcula `actualCostUsd`.
- Dada una llamada exitosa, el sistema persiste una entrada de ledger con los campos definidos.
- Dada una entrada historica de ledger, el costo puede explicarse usando `inputPricePerMillion` y `outputPricePerMillion` persistidos sin consultar la tabla de precios vigente.
- Dado `estimatedCostUsd` y `actualCostUsd`, el sistema calcula `costDeltaUsd` correctamente.
- Dada una ausencia de pricing post-ejecucion, el sistema no registra costo real como cero.
- Dada una ausencia de usage real, el sistema registra estado `missing_usage`.
- Dada una ejecucion sin llamada a provider, el sistema no inventa costo real.
- Los acumulados por ejecucion, provider y modelo se calculan desde entradas de ledger persistidas.
- Token Governor sigue usando `estimatedCostUsd` para presupuesto pre-ejecucion.
- ProviderAdapter no cambia salvo ajustes de tipos estrictamente necesarios para usar usage ya normalizado.
- No se agregan billing, facturacion, dashboard, cuotas, fallback, retries, scorecards, optimizacion historica, nuevos providers, cobro, markup ni alertas automaticas.

## Apertura V0.5

Titulo: V0.5 - Budget Enforcement.

Estado de V0.4: cerrada y congelada.

Commit de cierre V0.4: `2b8df9eb7d5fb8962d95bd90ebafee95295cf301`.

V0.5 comienza como fase separada.

### Objetivo V0.5

Usar el Budget Ledger como fuente de verdad operativa para impedir nuevas llamadas cuando el gasto acumulado mas el costo estimado de la siguiente llamada exceda un limite configurado.

### Alcance V0.5

Incluido:

- Presupuesto acumulado por ejecucion mediante `maxExecutionCostUsd` opcional.
- Presupuesto acumulado por proyecto/configuracion local mediante `maxProjectCostUsd` opcional.
- Asociacion minima de ledger con `projectId` o equivalente compatible con la arquitectura actual.
- Uso de `actualCostUsd` calculado del ledger para gasto ya realizado.
- Uso de `estimatedCostUsd` solo para la llamada futura aun no ejecutada.
- Bloqueo antes de llamar al provider cuando el costo proyectado exceda el presupuesto aplicable.
- Resultado auditable del gate de presupuesto.
- Comportamiento fail-closed cuando no pueda demostrarse gasto acumulado de forma segura.
- Integracion del gate despues de Token Governor y antes de Human Approval Gate.

Fuera de alcance:

- Billing.
- Facturacion.
- Cuotas por usuario u organizacion.
- Dashboard.
- Alertas automaticas.
- Retries.
- Fallback.
- Scorecards.
- Optimizacion historica.
- Nuevos providers.
- Cobro o markup.

### Contrato Del Budget Enforcement

El gate debe recibir como minimo:

- `executionId`.
- `projectId`, si aplica.
- `estimatedNextCallCostUsd`.
- `maxExecutionCostUsd`, si aplica.
- `maxProjectCostUsd`, si aplica.
- Entradas de Budget Ledger persistidas.

El gate debe devolver:

- `decision`: `allowed`, `blocked_execution_budget`, `blocked_project_budget`, o `budget_unknown`.
- `executionId`.
- `projectId`, si aplica.
- `accumulatedActualCostUsd`.
- `estimatedNextCallCostUsd`.
- `applicableBudgetUsd`.
- `projectedCostUsd`.
- `reason`.

Las decisiones deben quedar registradas como eventos auditables.

### Semantica De Presupuesto

Para presupuesto por ejecucion:

```text
accumulatedActualCostUsd(execution) + estimatedNextCallCostUsd <= maxExecutionCostUsd
```

Para presupuesto por proyecto:

```text
accumulatedActualCostUsd(project) + estimatedNextCallCostUsd <= maxProjectCostUsd
```

`accumulatedActualCostUsd` se calcula solo con entradas de ledger cuyo `actualCostUsd` sea calculable y cuyo `calculationStatus` sea `calculated`.

`estimatedNextCallCostUsd` viene de Token Governor para la llamada individual futura, antes de llamar al provider.

Budget Enforcement no reemplaza Token Governor. Token Governor valida el costo de la llamada individual; Budget Enforcement valida acumulados historicos mas la siguiente llamada estimada.

### Precedencia De Gates V0.5

El orden esperado del Kernel para V0.5 es:

```text
Context Compiler
-> Model Router
-> Token Governor
-> Budget Enforcement
-> Human Approval Gate
-> Provider
```

Precedencia:

1. Context Compiler construye contexto y estimacion de input tokens.
2. Model Router selecciona provider/model con COST-FIRST.
3. Token Governor valida limites de la llamada individual.
4. Budget Enforcement valida acumulados por ejecucion/proyecto mas la llamada estimada.
5. Human Approval Gate evalua riesgo y aprobacion humana.
6. Provider se llama solo si todos los gates previos permiten continuar.

### Semantica Fail-Closed

El sistema debe bloquear con `budget_unknown` cuando no pueda demostrar de forma segura el gasto acumulado o el costo estimado de la siguiente llamada.

Casos fail-closed:

- `estimatedNextCallCostUsd` es `null` o desconocido.
- El ledger contiene entradas aplicables con `missing_usage` o `missing_pricing` y no existe politica explicita para excluirlas.
- No se puede leer el ledger persistido.
- No se puede asociar una entrada al scope requerido de ejecucion o proyecto.

`missing_usage` y `missing_pricing` nunca deben tratarse como costo cero silenciosamente.

### Estrategia Minima Para ProjectId

V0.5 debe asociar ejecuciones y entradas de ledger con un `projectId` explicito solo cuando se active presupuesto de proyecto.

Si `maxProjectCostUsd` existe, `projectId` debe existir. Si falta `projectId` con presupuesto de proyecto activo, Budget Enforcement debe devolver `budget_unknown`.

Si no existe `maxProjectCostUsd`, `projectId` puede seguir siendo opcional.

Las entradas del ledger usadas para acumulado por proyecto deben conservar `projectId` explicito. El sistema no debe mezclar ejecuciones sin `projectId` dentro de un proyecto artificial.

La asociacion debe persistirse en State/Memory y no requiere base de datos nueva.

### Casos Limite V0.5

- Si no se define `maxExecutionCostUsd`, no se aplica presupuesto por ejecucion.
- Si no se define `maxProjectCostUsd`, no se aplica presupuesto por proyecto.
- Si se define `maxProjectCostUsd` pero falta `projectId`, el gate devuelve `budget_unknown`.
- Si ambos presupuestos existen, cualquier bloqueo debe detener la llamada.
- Si el presupuesto por ejecucion permite pero el de proyecto bloquea, gana `blocked_project_budget`.
- Si el presupuesto por proyecto permite pero el de ejecucion bloquea, gana `blocked_execution_budget`.
- Si falta `estimatedNextCallCostUsd`, el gate devuelve `budget_unknown`.
- Si hay entradas de ledger con costo real desconocido en el scope aplicable, el gate devuelve `budget_unknown`.
- Si el acumulado real mas la siguiente llamada estimada iguala exactamente el presupuesto, la llamada puede continuar.
- Si el acumulado real mas la siguiente llamada estimada excede el presupuesto por cualquier monto, la llamada se bloquea.
- Si una ejecucion esta en `approval pending`, no debe crear ledger prematuro ni alterar acumulados.
- El gate no debe llamar providers ni modificar ProviderAdapter.

### Criterios De Aceptacion V0.5

- Dado `maxExecutionCostUsd`, el gate bloquea antes del provider si acumulado real de ejecucion mas siguiente costo estimado excede el limite.
- Dado `maxProjectCostUsd`, el gate bloquea antes del provider si acumulado real de proyecto mas siguiente costo estimado excede el limite.
- Dado `maxProjectCostUsd` sin `projectId`, el gate devuelve `budget_unknown`.
- Dado que no existe `maxProjectCostUsd`, `projectId` puede omitirse si el resto de limites permite continuar.
- Dado un costo proyectado igual al presupuesto, el gate permite continuar.
- Dado `estimatedNextCallCostUsd` desconocido, el gate devuelve `budget_unknown`.
- Dadas entradas aplicables con `missing_usage` o `missing_pricing`, el gate no las trata como cero silenciosamente.
- Dado un bloqueo de Budget Enforcement, el Provider no es llamado.
- Cada decision registra executionId, projectId si aplica, acumulado, costo estimado siguiente, presupuesto aplicable, costo proyectado, decision y razon.
- Budget Enforcement usa Budget Ledger como fuente de verdad para gasto acumulado.
- Token Governor conserva autoridad sobre limites de llamada individual.
- No se agregan billing, facturacion, cuotas por usuario u organizacion, dashboard, alertas automaticas, retries, fallback, scorecards, optimizacion historica, nuevos providers, cobro ni markup.

## Apertura V0.6

Titulo: V0.6 - Provider Scorecard minimo.

Estado de V0.5: cerrada y congelada.

Commit de cierre V0.5: `3c07c85634c27dc9c72311d5a973e3d17a01f5f2`.

V0.6 comienza como fase separada.

### Objetivo V0.6

Crear un Provider Scorecard minimo que observe y resuma desempeno por provider/model usando solo datos operacionales ya existentes.

### Alcance V0.6

Incluido:

- Scorecard por provider/model.
- Uso exclusivo de datos ya existentes:
  - `actualCostUsd`.
  - `latencyMs`.
  - Estado final de ejecucion.
  - `evaluationStatus`.
- Metricas simples, explicitas y auditables.
- Agregados por provider/model.
- Persistencia o derivacion compatible con State/Memory actual.
- Scorecard como observador y resumen, no como decisor.

Fuera de alcance:

- Aprendizaje automatico.
- Ranking opaco.
- Cambios al Router COST-FIRST.
- Llamadas adicionales a providers.
- Fallback.
- Retries.
- Dashboard.
- Scorecards que modifiquen decisiones de routing.
- Optimizacion historica automatica.
- Nuevos providers.

### Contrato Del Provider Scorecard

El Scorecard debe recibir o derivar registros operacionales con:

- `provider`.
- `model`.
- `actualCostUsd`.
- `latencyMs`.
- Estado final de ejecucion.
- `evaluationStatus`.
- `executionId`.
- `timestamp`, si esta disponible.

El Scorecard debe devolver agregados por `provider/model`:

- `provider`.
- `model`.
- `executionCount`.
- `successCount`.
- `failureCount`.
- `needsHumanCount`.
- `evaluationPassCount`.
- `evaluationFailCount`.
- `evaluationNeedsReviewCount`.
- `totalActualCostUsd`.
- `averageActualCostUsd`.
- `averageLatencyMs`.
- `lastUpdatedAt`, si existe informacion temporal.
- `dataQuality`: `complete` o `partial`.
- `reason`, cuando el scorecard sea parcial.

### Agregados V0.6

Los agregados deben calcularse de forma deterministica:

- `executionCount`: numero de ejecuciones o llamadas observables para provider/model.
- `successCount`: ejecuciones con estado final `succeeded`.
- `failureCount`: ejecuciones con estado final `failed` o `cancelled`.
- `needsHumanCount`: ejecuciones con estado final `needs_human` o `awaiting_approval`.
- `evaluationPassCount`: evaluaciones `pass`.
- `evaluationFailCount`: evaluaciones `fail`.
- `evaluationNeedsReviewCount`: evaluaciones `needs_review`.
- `totalActualCostUsd`: suma de `actualCostUsd` calculable.
- `averageActualCostUsd`: promedio sobre entradas con costo real calculable.
- `averageLatencyMs`: promedio sobre entradas con latencia disponible.

### Semantica

El Provider Scorecard solo observa y resume. No decide proveedor, no cambia el orden de routing, no altera COST-FIRST y no puede generar llamadas adicionales.

Las metricas deben ser explicables desde entradas persistidas. Si falta informacion suficiente para una metrica, el scorecard debe marcar `dataQuality` como `partial` y registrar razon verificable.

### Casos Limite V0.6

- Si no hay datos para un provider/model, no se debe inventar score.
- Si falta `actualCostUsd`, esa entrada no participa en promedios o totales de costo.
- Si falta `latencyMs`, esa entrada no participa en promedio de latencia.
- Si falta `evaluationStatus`, los contadores de evaluacion deben marcarse como parciales.
- Si el estado final no es terminal, el scorecard puede contar `needsHumanCount` cuando aplique, pero debe indicar que el dato operativo puede seguir cambiando.
- Si dos providers tienen metricas similares, V0.6 no resuelve empates ni cambia routing.
- Si una metrica se basa en pocos datos, V0.6 no debe extrapolar calidad futura.

### Criterios De Aceptacion V0.6

- Dadas ejecuciones persistidas con provider/model, el Scorecard produce agregados por provider/model.
- El Scorecard calcula conteos de estado final de forma deterministica.
- El Scorecard calcula conteos de evaluacion de forma deterministica.
- El Scorecard calcula costo total y promedio usando solo `actualCostUsd` disponible.
- El Scorecard calcula latencia promedio usando solo `latencyMs` disponible.
- El Scorecard marca `partial` cuando faltan datos necesarios.
- El Scorecard no ejecuta providers ni genera llamadas adicionales.
- El Scorecard no modifica Model Router, Token Governor, Budget Enforcement ni ProviderAdapter.
- El Router COST-FIRST sigue siendo la autoridad de seleccion automatica.
- No se agregan aprendizaje automatico, ranking opaco, fallback, retries, dashboard, optimizacion historica automatica ni nuevos providers.

## Apertura V0.7

Titulo: V0.7 - Provider Scorecard Read API.

Estado de V0.6: cerrada y congelada.

Commit de cierre V0.6: `9120bc008b106b0963a9659ce4d55e4c20cfb412`.

V0.7 comienza como fase separada.

### Objetivo V0.7

Exponer el Provider Scorecard minimo mediante una API y/o CLI read-only para consultar metricas auditables por provider/model sin afectar decisiones de routing.

### Alcance V0.7

Incluido:

- Consulta read-only de scorecard por `provider/model`.
- Listado read-only de scorecards agregados.
- Salida auditable con las metricas V0.6:
  - `executionCount`.
  - `successCount`.
  - `failureCount`.
  - `needsHumanCount`.
  - `evaluationPassCount`.
  - `evaluationFailCount`.
  - `evaluationNeedsReviewCount`.
  - `totalActualCostUsd`.
  - `averageActualCostUsd`.
  - `averageLatencyMs`.
  - `lastUpdatedAt`.
  - `dataQuality`.
  - `reason`, cuando aplique.
- API minima y/o CLI minima para inspeccion operacional.
- Reutilizacion del Provider Scorecard V0.6 como fuente de datos.

Fuera de alcance:

- Dashboard.
- Ranking automatico.
- Cambios al Router COST-FIRST.
- Cambios a decisiones de routing.
- Fallback.
- Retries.
- Llamadas adicionales a providers.
- Aprendizaje automatico.
- Provider Scorecard como decisor.
- Nuevos providers.

### Contrato Read API V0.7

La API y/o CLI read-only debe permitir:

- Listar todos los agregados disponibles.
- Consultar un agregado especifico por `provider` y `model`.
- Devolver `not_found` o resultado vacio verificable cuando no exista scorecard para el provider/model solicitado.

Entrada minima para consulta especifica:

- `provider`.
- `model`.

Salida minima para listado:

- Coleccion de agregados por `provider:model`.

Salida minima para consulta especifica:

- Un agregado Provider Scorecard V0.6 completo cuando exista.
- Estado `not_found` o equivalente auditable cuando no exista.

### Semantica V0.7

La Read API solo expone datos ya resumidos o derivables desde State/Memory y Budget Ledger. No debe crear ejecuciones, llamar providers, recalcular decisiones de routing ni escribir cambios operacionales.

La respuesta debe preservar `dataQuality` y `reason` para que un consumidor pueda distinguir datos completos de parciales.

### Casos Limite V0.7

- Si no existen entradas de scorecard, el listado devuelve coleccion vacia.
- Si se consulta un `provider/model` sin datos, la consulta devuelve `not_found` o equivalente auditable.
- Si un scorecard tiene `dataQuality` `partial`, la API/CLI debe devolver tambien la razon.
- Si State/Memory no puede leerse, la API/CLI debe fallar limpiamente sin inventar metricas.
- La consulta no debe producir llamadas a OpenAI, Anthropic ni otros providers.
- La consulta no debe cambiar Router COST-FIRST ni Budget Enforcement.
- La consulta no debe ordenar resultados como ranking de calidad o recomendacion automatica.

### Criterios De Aceptacion V0.7

- La API y/o CLI lista scorecards agregados de forma read-only.
- La API y/o CLI permite consultar por `provider/model`.
- La salida incluye todas las metricas V0.6 aplicables.
- La salida conserva `dataQuality` y `reason` cuando aplique.
- Un `provider/model` inexistente devuelve `not_found` o resultado vacio verificable.
- No se ejecutan llamadas adicionales a providers.
- No se modifica Router COST-FIRST.
- No se agregan fallback, retries, dashboard, ranking automatico, aprendizaje automatico ni nuevos providers.
