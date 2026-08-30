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
