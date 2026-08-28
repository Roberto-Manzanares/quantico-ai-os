# Quantico AI OS - Especificacion Inicial

## Proposito

Quantico AI OS es una capa de orquestacion multimodelo que recibe un objetivo humano, compila el contexto necesario, decide que proveedor de IA y herramientas usar, ejecuta el flujo, verifica el resultado y registra costo, tokens, latencia y outcome.

Esta especificacion cubre unicamente el MVP V0.1.

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
