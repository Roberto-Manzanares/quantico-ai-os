# Quantico AI OS: guía de funcionamiento y demo

## Qué es Quantico AI OS

Quantico AI OS es un sistema local para ejecutar objetivos con un modelo de IA de forma controlada y auditable. Antes de una llamada a un provider, el sistema calcula el costo, aplica sus reglas de selección y, cuando corresponde, se detiene para pedir una aprobación humana.

La demo pública muestra la interfaz y el recorrido de una ejecución sin aceptar credenciales, sin realizar llamadas a modelos y sin modificar datos.

## Qué resuelve

- Convierte un objetivo en una ejecución con identificadores trazables.
- Selecciona provider y modelo mediante COST-FIRST: el candidato compatible de menor costo verificable.
- Valida presupuestos de costo y tokens antes de ejecutar.
- Registra estimación, uso real, costo, resultado, evaluación y eventos.
- Detiene acciones sensibles en el Human Approval Gate.
- Permite revisar el ciclo completo: `runId` → `executionId` → resultado → ledger → timeline → finalización.

## Cómo funciona una ejecución real

1. Se crea un perfil de `controlled-run` con objetivo, restricciones, criterios de evaluación, presupuestos y política de aprobación.
2. El sistema valida el perfil. Si faltan límites verificables o criterios requeridos, lo rechaza antes de contactar un provider.
3. El Model Router identifica modelos compatibles y elige la opción COST-FIRST. No cambia la autoridad de la decisión por sugerencias externas.
4. El Token Governor calcula tokens y costo estimados. Si excede el presupuesto, bloquea la ejecución.
5. El Human Approval Gate evalúa el riesgo. Una llamada a provider de riesgo alto queda en espera hasta que una persona apruebe o rechace explícitamente.
6. Tras una aprobación válida, la continuación usa la misma selección efectiva; no vuelve a enrutar ni crea una ejecución duplicada.
7. El provider responde y el adaptador normaliza el resultado y el uso de tokens.
8. El Evaluator verifica los criterios deterministas definidos en el perfil.
9. El Budget Ledger registra costo estimado, costo real, diferencia y snapshot de precios.
10. La timeline reúne evidencia de ejecución, eventos, aprobación, auditoría de autoridad, ledger y evaluación.
11. La finalización comprueba que las referencias auditables sean coherentes y cierra el run.

## Cómo usar el dashboard local

Desde el repositorio instalado:

```bash
npm ci
npm run dashboard -- --state-file .quantico/state.json
```

El comando imprime una dirección local. El dashboard usa el archivo de estado indicado para mostrar la información persistida.

### Pantallas y acciones

| Área | Para qué sirve | Qué muestra o hace |
| --- | --- | --- |
| Recent executions | Revisar actividad reciente | Estado, calidad de auditoría, eventos y atención requerida. |
| Execution detail | Entender una ejecución | Resultado, costo estimado/real, provider, modelo y timeline. |
| Run workspace | Consultar un run | Ciclo de vida, `runId`, `executionId`, aprobación, costo y calidad de evidencia. |
| Launch controlled run | Iniciar un flujo controlado | Envía un perfil JSON existente al API. Un `dry_run` no llama a providers. |
| Approval & finalization | Resolver pasos controlados | Registra aprobar/rechazar, continúa solo una aprobación registrada y permite finalizar o cerrar. |

Antes de una acción que cambia estado, la interfaz presenta una confirmación visual. La confirmación no elimina controles del kernel: solo envía la decisión explícita al API existente.

## Ejemplo seguro: dry run

Un dry run valida el perfil, estima la selección y el costo, pero no realiza una provider call.

```json
{
  "mode": "dry_run",
  "goal": "Describe the requested outcome.",
  "constraints": {},
  "evaluationCriteria": [{ "type": "contains_text", "value": "outcome" }],
  "approvalPolicy": {},
  "budgets": {
    "maxCostUsd": 0.00002,
    "maxOutputTokens": 32,
    "maxTotalTokens": 256
  },
  "auditRequirements": {
    "requireTimeline": true,
    "requireAuditSummary": true
  }
}
```

## La demo pública de Cloudflare

La demo está publicada en:

https://quantico-ai-os-demo.rmanzanar06.workers.dev

El Worker publica datos de demostración fijos con tres estados: ejecución exitosa, espera de aprobación y fallo. Sirve para enseñar la interfaz, los costos, provider/model y la evidencia de auditoría.

### Qué sí funciona en la demo

- Ver executions de ejemplo.
- Abrir un detalle con resultado, costo, provider/model y timeline.
- Identificar estados `succeeded`, `awaiting_approval` y `failed`.
- Ver que la autoridad sigue siendo del kernel y que el demo es de solo lectura.

### Qué no hace la demo

- No crea runs.
- No aprueba, rechaza, continúa, finaliza ni cierra runs.
- No persiste cambios de usuarios.
- No usa API keys ni secretos.
- No llama a OpenAI, Anthropic ni a ningún otro provider.
- No incluye billing, multiusuario ni nuevas reglas de routing.

Las rutas de mutación devuelven `403` con estado `demo_read_only` para dejar ese límite explícito.

## Seguridad y límites importantes

- Las credenciales deben vivir en variables de entorno o bindings de la plataforma, nunca en archivos versionados.
- `.env`, `.wrangler/` y artefactos locales están excluidos del repositorio.
- Una aprobación humana permite continuar un paso pendiente; no autoriza retries, fallback ni cambios de modelo.
- El dashboard no puede modificar COST-FIRST, Token Governor, ledger, auditoría ni autoridad.
- La demo pública no es un entorno para ejecutar objetivos reales.

## Cuándo usar cada entorno

| Necesidad | Entorno recomendado |
| --- | --- |
| Mostrar el producto y sus flujos | Demo pública de Cloudflare. |
| Revisar ejecuciones persistidas reales | Dashboard local con el state file correcto. |
| Validar perfil, costo y elegibilidad sin gasto | `dry_run`. |
| Ejecutar una llamada real | Controlled run local, con presupuesto definido y aprobación humana cuando aplique. |

## Resumen

La demo permite enseñar qué ve una persona operadora. El entorno local permite operar sobre estado real. El kernel conserva siempre las decisiones de costo, presupuesto, aprobación, auditoría y finalización.
