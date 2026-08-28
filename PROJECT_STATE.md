# Quantico AI OS - Estado Del Proyecto

## Estado Actual

Fase: especificacion inicial.

Version objetivo: MVP V0.1.

Codigo implementado: no.

Commit realizado: no.

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

## Supuestos Actuales

- V0.1 sera local-first o service-first minimo, sin requisitos de infraestructura empresarial.
- La persistencia inicial puede ser simple mientras sea estructurada y consultable.
- OpenAI y Anthropic se conectaran mediante adapters con contrato comun.
- La medicion de costo usara estimaciones basadas en tabla configurable de precios.
- La aprobacion humana sera parte del flujo de ejecucion, no una funcionalidad posterior.

## Pendiente Antes De Implementar

- Elegir lenguaje y runtime.
- Elegir formato de persistencia para State/Memory.
- Definir modelos iniciales por provider.
- Definir tabla inicial de precios.
- Definir formato exacto de API.
- Definir comandos concretos de CLI.
- Definir politica inicial de aprobacion.
- Definir pruebas minimas de aceptacion.

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
- No existe codigo de implementacion.
- No existe commit creado para esta especificacion.
- Los riesgos iniciales estan documentados.
- Los pendientes antes de implementar estan listados.

