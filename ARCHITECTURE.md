# Quantico AI OS - Arquitectura Inicial

## Vista General

Quantico AI OS V0.1 se organiza como una capa de orquestacion con componentes internos desacoplados y providers externos intercambiables.

```text
Human Goal
   |
   v
CLI / API
   |
   v
Orchestrator
   |------> State/Memory
   |------> Context Compiler
   |------> Token Governor
   |------> Model Router
   |------> Human Approval Gate
   |------> Provider Adapter: OpenAI
   |------> Provider Adapter: Anthropic
   |------> Evaluator
   |
   v
Final Result + Metrics + Trace
```

## Principios

- Un objetivo humano produce una ejecucion rastreable.
- Cada decision importante debe quedar registrada.
- Los providers se conectan por adaptadores con una interfaz comun.
- El sistema debe poder detenerse para aprobacion humana antes de acciones sensibles.
- La medicion de tokens, costo, latencia y resultado es parte del producto, no telemetria opcional.
- V0.1 prioriza claridad operacional sobre automatizacion avanzada.

## Flujo De Ejecucion

1. CLI/API recibe `goal`, `constraints`, `approval_policy` y `context_refs`.
2. Orchestrator crea un registro de ejecucion en State/Memory.
3. Orchestrator determina `task_type`.
4. Context Compiler resuelve y compacta contexto.
5. Model Router selecciona provider/modelo usando `task_type` y contexto compilado.
6. Token Governor valida presupuesto de tokens y costo estimado.
7. Orchestrator prepara el paso de ejecucion.
8. Human Approval Gate aplica politica de riesgo si el paso usa una accion.
9. Provider Adapter ejecuta la llamada al modelo.
10. Orchestrator registra respuesta, tokens, costo y latencia.
11. Evaluator verifica resultado contra objetivo y restricciones.
12. State/Memory registra estado final.
13. CLI/API devuelve resultado y metricas.

Flujo canonico de decision:

```text
Context Compiler -> Model Router -> Token Governor -> ejecucion
```

## Modulos

### CLI/API

Responsabilidad:

- Ser la entrada minima al sistema.
- Traducir comandos o requests HTTP a una ejecucion.
- Mostrar o devolver estado y resultado.

No debe contener logica de routing, evaluacion o compilacion de contexto.

### Orchestrator

Responsabilidad:

- Controlar el ciclo de vida de una ejecucion.
- Coordinar modulos.
- Determinar `task_type`.
- Mantener maquina de estados.
- Registrar eventos.

Valores permitidos de `task_type` en V0.1:

- `research`
- `analysis`
- `coding`
- `generation`
- `evaluation`
- `general`

Estados minimos:

- `created`
- `compiling_context`
- `routing_model`
- `awaiting_approval`
- `running`
- `evaluating`
- `succeeded`
- `failed`
- `needs_human`
- `cancelled`

### Context Compiler

Responsabilidad:

- Resolver referencias de contexto.
- Preparar prompt/contexto final.
- Reducir contexto cuando sea necesario.
- Etiquetar fuentes de contexto.

Salida esperada:

- `compiled_context_id`
- `messages` o estructura equivalente.
- `source_refs`
- `estimated_tokens`
- `omitted_context`

### Model Router

Responsabilidad:

- Elegir modelo.
- Explicar decision.
- Respetar restricciones.
- Utilizar el `task_type` determinado por el Orchestrator.

Salida esperada:

- `provider`
- `model`
- `task_type`
- `reason`
- `estimated_cost`
- `estimated_latency_class`

### Token Governor

Responsabilidad:

- Estimar tokens.
- Aplicar limites.
- Calcular costos.
- Registrar uso real.

Debe usar una tabla configurable de precios por proveedor/modelo.

### State/Memory

Responsabilidad:

- Persistir ejecuciones.
- Persistir eventos.
- Persistir metricas.
- Permitir consulta de estado.

Persistencia minima aceptable para V0.1:

- Archivo local estructurado o base local simple.

### Human Approval Gate

Responsabilidad:

- Determinar si un paso requiere aprobacion.
- Pausar ejecucion.
- Registrar aprobacion o rechazo.
- Reanudar o cancelar segun respuesta humana.

Politica de riesgo V0.1:

- `LOW`: ejecucion automatica.
- `MEDIUM`: decision configurable por `approval_policy`.
- `HIGH`: aprobacion humana obligatoria.

Cada accion debe registrar:

- `risk_level`.
- Decision aplicada.
- Razon de la decision.

### Evaluator

Responsabilidad:

- Comparar resultado contra objetivo.
- Validar restricciones declaradas.
- Marcar outcome.

### Provider Adapters

Responsabilidad:

- Normalizar diferencias entre OpenAI y Anthropic.
- Enviar request.
- Devolver respuesta.
- Devolver tokens, latencia y error normalizado.

## Contratos De Datos Conceptuales

### Execution

```text
id
goal
constraints
approval_policy
status
created_at
updated_at
final_result
metrics
```

### Execution Event

```text
id
execution_id
type
risk_level
decision_applied
payload
created_at
```

### Model Call

```text
id
execution_id
provider
model
input_tokens
output_tokens
estimated_cost
latency_ms
status
error
```

### Evaluation

```text
execution_id
status
reason
criteria
recommended_next_action
```

## Errores

Errores minimos normalizados:

- `invalid_goal`
- `context_not_found`
- `token_budget_exceeded`
- `provider_unavailable`
- `provider_error`
- `approval_required`
- `approval_rejected`
- `evaluation_failed`
- `unknown_error`

## Criterios De Aceptacion Verificables

- Cada ejecucion tiene un registro de estado consultable por CLI/API.
- Cada transicion de estado queda registrada como evento.
- El Orchestrator determina `task_type` usando solo valores permitidos de V0.1.
- El Model Router recibe y utiliza `task_type` para seleccionar provider/modelo.
- El orden de decision verificable es Context Compiler, Model Router, Token Governor y ejecucion.
- Cada llamada a provider usa la interfaz comun de adapter.
- El Orchestrator no depende de detalles internos de OpenAI o Anthropic.
- El Context Compiler reporta contexto omitido cuando recorta informacion.
- El Token Governor bloquea ejecuciones que superan limites configurados.
- Human Approval Gate aplica `LOW` automaticamente, `MEDIUM` segun `approval_policy` y `HIGH` con aprobacion humana obligatoria.
- Cada accion registra `risk_level` y decision aplicada.
- Human Approval Gate puede pausar y reanudar una ejecucion sin perder estado cuando una accion requiere aprobacion.
- Evaluator registra criterios evaluados y outcome.
- Una falla de provider se normaliza y queda registrada sin romper el formato de respuesta.
- La arquitectura no contiene componentes de dashboard, WhatsApp, voz, CRM o billing.
