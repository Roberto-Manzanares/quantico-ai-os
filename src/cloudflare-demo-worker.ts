interface DemoExecution {
  executionId: string;
  executionStatus: "succeeded" | "failed" | "awaiting_approval";
  provider: "openai" | "anthropic";
  model: string;
  estimatedCostUsd: number;
  actualCostUsd: number | null;
  timelineDataQuality: "complete";
  timeline: Array<{ source: string; type: string; summary: string; timestamp: string }>;
  finalResult?: string;
  requiresAttention: boolean;
}

const executions: DemoExecution[] = [
  {
    executionId: "demo_exec_success",
    executionStatus: "succeeded",
    provider: "openai",
    model: "gpt-5-nano",
    estimatedCostUsd: 0.00003,
    actualCostUsd: 0.000015,
    timelineDataQuality: "complete",
    finalResult: "QUANTICO_DEMO_OK",
    requiresAttention: false,
    timeline: [
      { source: "execution", type: "created", summary: "Controlled execution recorded.", timestamp: "2026-09-07T00:00:00.000Z" },
      { source: "authority_audit", type: "cost_first", summary: "COST-FIRST selection retained.", timestamp: "2026-09-07T00:00:01.000Z" },
      { source: "budget_ledger", type: "calculated", summary: "Actual cost recorded from normalized usage.", timestamp: "2026-09-07T00:00:03.000Z" },
      { source: "evaluation", type: "pass", summary: "Deterministic evaluation passed.", timestamp: "2026-09-07T00:00:04.000Z" }
    ]
  },
  {
    executionId: "demo_exec_approval",
    executionStatus: "awaiting_approval",
    provider: "openai",
    model: "gpt-5-nano",
    estimatedCostUsd: 0.00003,
    actualCostUsd: null,
    timelineDataQuality: "complete",
    requiresAttention: true,
    timeline: [
      { source: "execution", type: "created", summary: "Live controlled execution recorded.", timestamp: "2026-09-07T00:05:00.000Z" },
      { source: "approval", type: "pending", summary: "Human Approval Gate paused the provider action.", timestamp: "2026-09-07T00:05:01.000Z" }
    ]
  },
  {
    executionId: "demo_exec_failed",
    executionStatus: "failed",
    provider: "anthropic",
    model: "claude-3-5-haiku-latest",
    estimatedCostUsd: 0.00004,
    actualCostUsd: null,
    timelineDataQuality: "complete",
    requiresAttention: true,
    timeline: [
      { source: "execution", type: "created", summary: "Controlled execution recorded.", timestamp: "2026-09-07T00:10:00.000Z" },
      { source: "evaluation", type: "fail", summary: "Execution failed before final result was accepted.", timestamp: "2026-09-07T00:10:02.000Z" }
    ]
  }
];

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/executions") {
      return json({
        status: "found",
        totalExecutions: executions.length,
        dataQuality: "complete",
        summaries: executions.map(({ timeline, provider, model, estimatedCostUsd, actualCostUsd, ...execution }) => ({
          ...execution,
          timelineItemCount: timeline.length,
          hasAuthorityAudit: timeline.some((item) => item.source === "authority_audit"),
          hasBudgetLedger: timeline.some((item) => item.source === "budget_ledger")
        }))
      });
    }

    const match = url.pathname.match(/^\/api\/executions\/([^/]+)$/);

    if (match) {
      const execution = executions.find((item) => item.executionId === decodeURIComponent(match[1]));
      return execution ? json(execution) : json({ status: "not_found" }, 404);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({
        status: "demo_read_only",
        reason: "This public demo never creates runs, resolves approvals, finalizes state, or calls providers."
      }, 403);
    }

    return html();
  }
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function html(): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quantico AI OS · Demo</title><style>
:root{font-family:Inter,system-ui,sans-serif;background:#0b1020;color:#eef3ff;--line:#27334d;--panel:#111a2d;--muted:#94a3b8;--accent:#54e0ad}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% -10%,#1a3157 0,transparent 31rem),#0b1020}.shell{max-width:1120px;margin:auto;padding:26px}.top{display:flex;justify-content:space-between;gap:16px;align-items:center;border-bottom:1px solid var(--line);padding-bottom:20px}.brand{display:flex;gap:12px;align-items:center}.mark{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#54e0ad,#71b7ff)}h1,h2,p{margin:0}.eyebrow{color:var(--accent);font-size:.72rem;font-weight:800;letter-spacing:.12em}.hero{padding:34px 0 22px}.hero h2{font-size:clamp(1.8rem,4vw,2.8rem);letter-spacing:-.05em;margin:8px 0}.muted{color:var(--muted);line-height:1.5}.notice{border:1px solid #705e32;background:#241e13;color:#f8d88f;border-radius:10px;padding:12px;margin:16px 0}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0}.metric,.panel{background:linear-gradient(180deg,#17223a,#0f182a);border:1px solid var(--line);border-radius:14px;padding:17px}.metric span{color:var(--muted);font-size:.75rem;font-weight:800}.metric strong{display:block;font-size:1.5rem;margin-top:8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.cards{display:grid;gap:9px}.card{background:#0d1527;border:1px solid #263552;border-radius:10px;padding:13px;cursor:pointer}.card:hover{border-color:#6084bb}.card-head{display:flex;justify-content:space-between;gap:10px}.id{font-family:ui-monospace,monospace;font-size:.83rem}.meta{color:var(--muted);font-size:.8rem;margin-top:7px}.badge{border-radius:999px;padding:5px 8px;font-size:.7rem;font-weight:800;text-transform:uppercase}.succeeded{background:#10372b;color:#91f0c8}.awaiting_approval{background:#40321a;color:#ffd77e}.failed{background:#45212b;color:#ff9fab}.details{min-height:260px}.detail-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.label{color:var(--muted);font-size:.72rem;font-weight:800}.value{display:block;margin-top:4px;word-break:break-word}.timeline{display:grid;gap:9px;margin-top:18px}.event{border-left:2px solid #405b82;padding:8px 10px;background:#0d1527}.event p{font-size:.84rem;margin-top:4px}.event small{color:var(--muted)}button{background:#2a3854;color:#eef3ff;border:0;border-radius:8px;padding:9px 11px;font-weight:800;cursor:pointer}.demo-action{margin-top:18px}.empty{color:var(--muted);padding:20px 0}@media(max-width:720px){.grid{grid-template-columns:1fr}.metrics{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}
</style></head><body><main class="shell"><header class="top"><div class="brand"><div class="mark"></div><div><p class="eyebrow">Public safe demo</p><h1>Quantico AI OS</h1></div></div><span class="muted">Cloudflare Workers</span></header><section class="hero"><p class="eyebrow">Operational visibility</p><h2>Clarity for every controlled execution.</h2><p class="muted">A read-only preview of status, result, cost, selection and audit evidence.</p></section><div class="notice">Demo mode: providers, credentials, state mutations and approval resolution are disabled.</div><section class="metrics"><div class="metric"><span>EXECUTIONS</span><strong id="count">—</strong></div><div class="metric"><span>NEEDS ATTENTION</span><strong id="attention">—</strong></div><div class="metric"><span>AUTHORITY</span><strong>Kernel</strong></div></section><div class="grid"><section class="panel"><h2>Recent executions</h2><p class="muted">Select an execution to inspect its evidence.</p><div id="list" class="cards"></div></section><section class="panel details"><h2>Execution detail</h2><div id="detail" class="empty">Select an execution.</div><button class="demo-action" onclick="showNotice()">Controlled actions disabled in demo</button></section></div></main><script>const usd=n=>typeof n==='number'?'$'+n.toFixed(6):'—';const esc=v=>String(v??'—');function showNotice(){alert('Demo mode is read-only. No run, approval, finalization or provider action is available.')}function renderDetail(item){const root=document.getElementById('detail');root.replaceChildren();const grid=document.createElement('div');grid.className='detail-grid';for(const [label,value] of [['Status',item.executionStatus],['Provider',item.provider],['Model',item.model],['Estimated cost',usd(item.estimatedCostUsd)],['Actual cost',usd(item.actualCostUsd)],['Audit quality',item.timelineDataQuality]]){const cell=document.createElement('div');cell.innerHTML='<span class="label"></span><span class="value"></span>';cell.children[0].textContent=label;cell.children[1].textContent=value;grid.append(cell)}root.append(grid);if(item.finalResult){const result=document.createElement('p');result.className='notice';result.textContent='Final result: '+item.finalResult;root.append(result)}const timeline=document.createElement('div');timeline.className='timeline';for(const event of item.timeline){const row=document.createElement('div');row.className='event';row.innerHTML='<strong></strong><p></p><small></small>';row.children[0].textContent=event.source+' · '+event.type;row.children[1].textContent=event.summary;row.children[2].textContent=new Date(event.timestamp).toLocaleString();timeline.append(row)}root.append(timeline)}fetch('/api/executions').then(r=>r.json()).then(data=>{document.getElementById('count').textContent=data.totalExecutions;document.getElementById('attention').textContent=data.summaries.filter(x=>x.requiresAttention).length;const list=document.getElementById('list');for(const item of data.summaries){const card=document.createElement('article');card.className='card';card.innerHTML='<div class="card-head"><strong class="id"></strong><span class="badge"></span></div><p class="meta"></p>';card.children[0].children[0].textContent=item.executionId;card.children[0].children[1].className='badge '+item.executionStatus;card.children[0].children[1].textContent=item.executionStatus.replaceAll('_',' ');card.children[1].textContent='Audit '+item.timelineDataQuality+' · '+item.timelineItemCount+' events';card.onclick=()=>fetch('/api/executions/'+encodeURIComponent(item.executionId)).then(r=>r.json()).then(renderDetail);list.append(card)}})</script></body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
}
