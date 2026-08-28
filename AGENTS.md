# Quantico AI OS - Agentes Y Responsabilidades

## Definicion

En V0.1, "agente" significa un rol interno del sistema con una responsabilidad delimitada. No implica un enjambre autonomo, multiagente avanzado ni agentes persistentes independientes.

## Agentes Del MVP

### Orchestrator Agent

Responsabilidad:

- Convertir el objetivo humano en una ejecucion.
- Coordinar los demas agentes/componentes.
- Mantener estado.
- Decidir cuando detenerse, continuar, evaluar o pedir aprobacion.

Entradas:

- Objetivo humano.
- Restricciones.
- Politica de aprobacion.
- Contexto compilado.
- Resultados intermedios.

Salidas:

- Plan operativo minimo.
- Solicitudes a otros componentes.
- Resultado final.
- Trazas de decision.

Criterios de aceptacion:

- Crea una ejecucion por objetivo recibido.
- Registra cada decision relevante.
- No ejecuta acciones sensibles sin pasar por Human Approval Gate.
- Termina con estado final verificable.

### Context Compiler Agent

Responsabilidad:

- Seleccionar y empaquetar contexto util para el objetivo.
- Mantener trazabilidad de fuentes.
- Respetar limites de token.

Entradas:

- Objetivo.
- Referencias de contexto.
- Memoria disponible.
- Presupuesto de tokens.

Salidas:

- Contexto compilado.
- Fuentes incluidas.
- Fuentes omitidas.
- Estimacion de tokens.

Criterios de aceptacion:

- Devuelve contexto serializable.
- Incluye referencias a fuentes utilizadas.
- Reporta cualquier omision por presupuesto o permisos.
- No supera el limite de tokens aprobado por Token Governor.

### Model Router Agent

Responsabilidad:

- Elegir proveedor y modelo entre OpenAI y Anthropic.
- Justificar la seleccion.
- Respetar restricciones del usuario.

Entradas:

- Objetivo.
- Tipo de tarea inferido.
- Presupuesto de costo/tokens.
- Proveedores permitidos o bloqueados.
- Requisitos de herramientas.

Salidas:

- Provider seleccionado.
- Modelo seleccionado.
- Razon de seleccion.
- Estimacion de costo y latencia.

Criterios de aceptacion:

- Nunca selecciona un proveedor bloqueado.
- Respeta proveedor preferido cuando sea compatible con restricciones.
- Registra razon cuando no usa el proveedor preferido.
- Devuelve una decision auditable.

### Token Governor Agent

Responsabilidad:

- Controlar consumo de tokens y costo.
- Estimar antes de ejecutar.
- Registrar uso real despues de ejecutar.

Entradas:

- Contexto compilado.
- Modelo candidato.
- Presupuesto configurado.
- Tabla de precios.

Salidas:

- Decision `allow`, `trim_required` o `deny`.
- Estimacion de tokens.
- Estimacion de costo.
- Uso real registrado.

Criterios de aceptacion:

- Bloquea llamadas que exceden limites.
- Registra tokens de entrada y salida por llamada.
- Calcula costo estimado por llamada.
- Acumula costo total por ejecucion.

### Evaluator Agent

Responsabilidad:

- Determinar si el resultado satisface el objetivo.
- Identificar fallas o necesidad de revision humana.

Entradas:

- Objetivo original.
- Restricciones.
- Resultado producido.
- Trazas relevantes.

Salidas:

- `pass`, `fail`, o `needs_review`.
- Razon breve.
- Criterios evaluados.
- Siguiente accion recomendada.

Criterios de aceptacion:

- Produce un outcome estructurado.
- Incluye razon verificable.
- Marca `needs_review` cuando no puede verificar cumplimiento.
- Registra evaluacion en State/Memory.

### Human Approval Agent

Responsabilidad:

- Gestionar aprobaciones humanas.
- Evitar acciones sensibles no aprobadas.

Entradas:

- Paso propuesto.
- Riesgo detectado.
- Politica de aprobacion.
- Costo estimado.

Salidas:

- Solicitud de aprobacion.
- Decision humana registrada.
- Estado actualizado.

Criterios de aceptacion:

- Pausa ejecucion antes de accion sensible.
- Explica que se aprobara en terminos concretos.
- Registra aprobacion o rechazo.
- No ejecuta un paso rechazado.

## Herramientas

V0.1 solo define la capacidad de usar herramientas permitidas por configuracion. No define integraciones especificas fuera de providers OpenAI y Anthropic.

Las herramientas deben representarse como acciones declaradas con:

- Nombre.
- Descripcion.
- Riesgo.
- Requiere aprobacion: si/no.
- Entrada esperada.
- Salida esperada.

## Criterios Globales De Aceptacion

- Cada agente tiene una responsabilidad unica y verificable.
- Las decisiones entre agentes quedan registradas en eventos.
- Ningun agente introduce funcionalidad fuera del MVP.
- Los agentes operan como roles internos, no como procesos autonomos obligatorios.
- El sistema puede ejecutar un objetivo simple con los agentes definidos y producir resultado, metricas y evaluacion.

