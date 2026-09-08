import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createQuanticoApi, type QuanticoApi } from "./api.js";
import type { ControlledExecutionProfile } from "./types.js";

export interface DashboardOptions {
  host?: string;
  port?: number;
  stateFilePath?: string;
  createApi?: (options?: { stateFilePath?: string }) => QuanticoApi;
}

export interface DashboardServer {
  url: string;
  close(): Promise<void>;
}

export async function startDashboard(options: DashboardOptions = {}): Promise<DashboardServer> {
  const api = (options.createApi ?? createQuanticoApi)({ stateFilePath: options.stateFilePath });
  const host = options.host ?? "127.0.0.1";
  const server = createServer((request, response) => void handleRequest(request, response, api));

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 4310, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Dashboard did not expose a TCP address.");
  }

  return {
    url: `http://${host}:${address.port}`,
    close: () => closeServer(server)
  };
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, api: QuanticoApi): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    if (request.method === "GET" && pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(page());
      return;
    }

    if (request.method === "GET" && pathname === "/dashboard.js") {
      response.writeHead(200, { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" });
      response.end(clientScript());
      return;
    }

    if (request.method === "GET" && pathname === "/api/executions") {
      writeJson(response, 200, await api.listExecutionAuditSummaries({ limit: 25 }));
      return;
    }

    const executionMatch = pathname.match(/^\/api\/executions\/([^/]+)$/);

    if (request.method === "GET" && executionMatch) {
      const executionId = decodeURIComponent(executionMatch[1]);
      const [summary, result, timeline, authority] = await Promise.all([
        api.getExecutionAuditSummary(executionId),
        api.getResultAndMetrics(executionId),
        api.getExecutionAuditTimeline(executionId),
        api.getAuthorityRuntimeSafetyMetricsForExecution(executionId)
      ]);
      writeJson(response, 200, { executionId, summary, result, timeline, authority });
      return;
    }

    if (request.method === "POST" && pathname === "/api/runs") {
      const profile = await readJson<ControlledExecutionProfile>(request);
      writeJson(response, 200, await api.runControlledExecution(profile));
      return;
    }

    const runMatch = pathname.match(/^\/api\/runs\/([^/]+)(?:\/(approval|continue|finalize|close))?$/);

    if (runMatch) {
      const runId = decodeURIComponent(runMatch[1]);
      const action = runMatch[2];

      if (request.method === "GET" && !action) {
        writeJson(response, 200, await api.getControlledRunStatus(runId));
        return;
      }

      if (request.method === "POST" && action === "approval") {
        const decision = await readJson<{ decision?: "approved" | "rejected"; reason?: string }>(request);
        const approvalDecision = decision.decision;

        if (approvalDecision !== "approved" && approvalDecision !== "rejected") {
          writeJson(response, 400, { error: "Approval decision must be approved or rejected." });
          return;
        }

        writeJson(response, 200, await api.resolveControlledRunApproval(runId, {
          decision: approvalDecision,
          reason: decision.reason
        }));
        return;
      }

      if (request.method === "POST" && action === "continue") {
        writeJson(response, 200, await api.continueApprovedExecution(runId));
        return;
      }

      if (request.method === "POST" && action === "finalize") {
        writeJson(response, 200, await api.finalizeControlledRun(runId));
        return;
      }

      if (request.method === "POST" && action === "close") {
        const options = await readJson<{ approvalDecision?: "approved" | "rejected"; reason?: string }>(request);
        writeJson(response, 200, await api.closeControlledRun(runId, options));
        return;
      }
    }

    writeJson(response, 404, { error: "Not found." });
  } catch (error) {
    writeJson(response, 400, { error: error instanceof Error ? error.message : "Invalid request." });
  }
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > 128_000) {
      throw new Error("Request body exceeds 128 KB.");
    }

    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8");

  if (!raw) {
    return {} as T;
  }

  return JSON.parse(raw) as T;
}

function writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function page(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quantico AI OS · Operations</title><style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#0b1020;color:#eef3ff;--ink:#eef3ff;--muted:#94a3b8;--line:#27334d;--panel:#111a2d;--panel-2:#17223a;--accent:#54e0ad;--accent-ink:#05281e;--warn:#f3b54a;--danger:#ff7385;--info:#71b7ff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% -10%,#1a3157 0,transparent 31rem),#0b1020;min-height:100vh}.shell{max-width:1240px;margin:0 auto;padding:24px}.topbar{display:flex;justify-content:space-between;gap:20px;align-items:center;border-bottom:1px solid var(--line);padding-bottom:20px}.brand{display:flex;gap:12px;align-items:center}.brand-mark{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#54e0ad,#71b7ff)}h1,h2,h3,p{margin:0}.eyebrow{color:var(--accent);font-size:.73rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.title{font-size:1.45rem;letter-spacing:-.03em}.nav{display:flex;gap:14px;flex-wrap:wrap}.nav a{color:var(--muted);text-decoration:none;font-size:.9rem}.nav a:hover{color:var(--ink)}.hero{display:flex;justify-content:space-between;gap:26px;padding:34px 0 22px;align-items:end}.hero h2{font-size:clamp(1.7rem,4vw,2.7rem);letter-spacing:-.05em;max-width:700px}.hero p{color:var(--muted);max-width:640px;line-height:1.5;margin-top:10px}.local{border:1px solid #316150;background:#102b24;color:#8cf4cb;padding:8px 10px;border-radius:999px;font-size:.78rem;font-weight:700;white-space:nowrap}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:10px 0 26px}.metric,.panel{border:1px solid var(--line);background:linear-gradient(180deg,rgba(23,34,58,.95),rgba(15,24,42,.95));box-shadow:0 12px 34px rgba(0,0,0,.16)}.metric{padding:15px;border-radius:12px}.metric-label{display:block;color:var(--muted);font-size:.76rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em}.metric strong{display:block;margin-top:8px;font-size:1.42rem;letter-spacing:-.04em}.metric small{color:var(--muted)}.layout{display:grid;grid-template-columns:1.05fr .95fr;gap:16px}.panel{border-radius:14px;padding:18px;margin-bottom:16px}.panel-head{display:flex;justify-content:space-between;align-items:start;gap:12px;margin-bottom:15px}.panel h3{font-size:1rem}.panel-subtitle{color:var(--muted);font-size:.85rem;line-height:1.4;margin-top:4px}.status{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 9px;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.status.success{background:#10372b;color:#91f0c8}.status.pending,.status.warning{background:#40321a;color:#ffd77e}.status.failed,.status.danger{background:#45212b;color:#ff9fab}.status.info{background:#172f50;color:#a7d2ff}.status.neutral{background:#27334d;color:#c6d2e6}.execution-list{display:grid;gap:9px}.execution-card{width:100%;display:grid;grid-template-columns:1fr auto;gap:10px;text-align:left;background:#0d1527;border:1px solid #263552;border-radius:10px;padding:13px;color:var(--ink);cursor:pointer}.execution-card:hover{border-color:#6084bb;background:#101c31}.execution-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.83rem}.execution-meta{color:var(--muted);font-size:.78rem;margin-top:6px}.empty{color:var(--muted);padding:18px 4px}.input-row{display:flex;gap:8px}.field-label{display:block;color:#cbd5e1;font-size:.78rem;font-weight:700;margin:12px 0 5px}input,textarea{width:100%;background:#0a1120;color:var(--ink);border:1px solid #33435f;border-radius:9px;padding:10px 11px;font:inherit}input:focus,textarea:focus{outline:2px solid #4e87ce;border-color:transparent}textarea{min-height:210px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.82rem;line-height:1.45}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}button{border:0;border-radius:8px;padding:9px 11px;background:var(--accent);color:var(--accent-ink);font-weight:800;cursor:pointer;font:inherit;font-size:.84rem}button:hover{filter:brightness(1.08)}button.secondary{background:#2a3854;color:var(--ink)}button.danger{background:#542735;color:#ffd5db}button.warn{background:#50401f;color:#ffe3a2}.helper{color:var(--muted);font-size:.78rem;line-height:1.45;margin-top:8px}.readout{background:#0a1120;border:1px solid #253551;border-radius:10px;padding:13px;min-height:72px}.readout-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.readout-label{color:var(--muted);font-size:.71rem;text-transform:uppercase;font-weight:800;letter-spacing:.06em}.readout-value{display:block;font-size:.9rem;margin-top:4px;word-break:break-word}.timeline{display:grid;gap:9px}.timeline-item{border-left:2px solid #405b82;padding:8px 10px;background:#0d1527;border-radius:0 8px 8px 0}.timeline-item strong{font-size:.83rem}.timeline-item p{color:#cbd5e1;font-size:.82rem;margin-top:4px}.timeline-item small{color:var(--muted);font-size:.72rem}.json{margin:10px 0 0;white-space:pre-wrap;word-break:break-word;color:#cbd5e1;font-size:.76rem}.divider{height:1px;background:var(--line);margin:18px 0}.confirmation{border:1px solid #705e32;background:#241e13;border-radius:9px;padding:10px;color:#f8d88f;font-size:.8rem;line-height:1.45;margin-top:10px}.hidden{display:none}@media(max-width:900px){.metrics{grid-template-columns:repeat(2,1fr)}.layout{grid-template-columns:1fr}.hero{align-items:start;flex-direction:column}}@media(max-width:560px){.shell{padding:16px}.topbar{align-items:flex-start;flex-direction:column}.metrics{grid-template-columns:1fr 1fr}.readout-grid{grid-template-columns:1fr 1fr}.input-row{flex-direction:column}.local{white-space:normal}}
</style></head><body><main class="shell"><header class="topbar"><div class="brand"><div class="brand-mark" aria-hidden="true"></div><div><p class="eyebrow">Local operations console</p><h1 class="title">Quantico AI OS</h1></div></div><nav class="nav" aria-label="Dashboard navigation"><a href="#executions-section">Executions</a><a href="#run-section">Runs</a><a href="#launch-section">Controlled run</a></nav></header>
<section class="hero"><div><p class="eyebrow">Operational visibility</p><h2>Clarity for every controlled execution.</h2><p>Inspect outcomes, costs and evidence. Submit only explicit run profiles; the kernel continues to enforce COST-FIRST and the Human Approval Gate.</p></div><span class="local">Local-only session</span></section>
<section class="metrics" aria-label="Operational overview"><div class="metric"><span class="metric-label">Executions</span><strong id="metricExecutions">—</strong><small>persisted records</small></div><div class="metric"><span class="metric-label">Needs attention</span><strong id="metricAttention">—</strong><small>explicit audit flags</small></div><div class="metric"><span class="metric-label">Audit quality</span><strong id="metricAudit">—</strong><small>timeline coverage</small></div><div class="metric"><span class="metric-label">Authority</span><strong>Kernel</strong><small>no dashboard override</small></div></section>
<div class="layout"><section id="executions-section" class="panel"><div class="panel-head"><div><h3>Recent executions</h3><p class="panel-subtitle">Open an execution to inspect outcome, spend and audit timeline.</p></div><button class="secondary" onclick="loadExecutions()">Refresh</button></div><div id="executions" class="execution-list" aria-live="polite"><p class="empty">Loading executions…</p></div></section><section id="run-section" class="panel"><div class="panel-head"><div><h3>Run workspace</h3><p class="panel-subtitle">Lookup a controlled run by its canonical runId.</p></div><span id="runState" class="status neutral">Idle</span></div><label class="field-label" for="runId">Run ID</label><div class="input-row"><input id="runId" placeholder="runId"><button class="secondary" onclick="loadRun()">Load run</button></div><div id="run" class="readout"><p class="empty">Enter a runId to view lifecycle, provider/model, cost and finalization status.</p></div></section></div>
<section class="panel"><div class="panel-head"><div><h3>Execution detail</h3><p class="panel-subtitle">Result, cost, selection evidence and an audit-friendly event sequence.</p></div><span id="executionState" class="status neutral">No selection</span></div><div class="input-row"><input id="executionId" placeholder="executionId"><button class="secondary" onclick="loadExecution()">Load execution</button></div><div id="execution" class="readout"><p class="empty">Choose a recent execution or paste its executionId.</p></div></section>
<div class="layout"><section id="launch-section" class="panel"><div class="panel-head"><div><h3>Launch controlled run</h3><p class="panel-subtitle">The supplied profile remains the source of truth. Start with a safe dry-run when validating a profile.</p></div><button class="secondary" onclick="loadDryRunTemplate()">Use dry-run template</button></div><label class="field-label" for="profile">Controlled execution profile (JSON)</label><textarea id="profile" spellcheck="false" placeholder='Paste a valid ControlledExecutionProfile JSON'></textarea><p class="helper">A live profile may reach the Human Approval Gate. This interface does not select providers, adjust budgets or bypass approvals.</p><div class="actions"><button onclick="launchRun()">Review and launch</button></div><div id="launchNotice" class="confirmation hidden"></div></section><section class="panel"><div class="panel-head"><div><h3>Approval & finalization</h3><p class="panel-subtitle">Every state-changing request requires a visible confirmation here.</p></div><span id="actionState" class="status neutral">No action</span></div><label class="field-label" for="actionRunId">Run ID</label><input id="actionRunId" placeholder="runId"><label class="field-label" for="reason">Decision reason <span class="helper">(optional)</span></label><input id="reason" placeholder="Why this action is appropriate"><div class="confirmation">Approve or reject only records the Human Gate decision. “Continue approved execution” is separate and may make the already-authorized provider call.</div><div class="actions"><button onclick="approve('approved')">Approve</button><button class="danger" onclick="approve('rejected')">Reject</button><button class="warn" onclick="postAction('continue')">Continue approved execution</button></div><div class="actions"><button class="secondary" onclick="postAction('finalize')">Finalize run</button><button class="secondary" onclick="postAction('close')">Close run</button></div><div id="action" class="readout"><p class="empty">No action submitted.</p></div></section></div>
</main><script id="dashboard-client" type="text/plain">
const el=id=>document.getElementById(id); const formatUsd=value=>typeof value==='number'?'$'+value.toFixed(6):'—'; const statusTone=value=>{const v=String(value||'').toLowerCase();if(v.includes('succeed')||v==='approved'||v==='finalized'||v.includes('completed'))return'success';if(v.includes('fail')||v.includes('reject')||v.includes('cancel')||v.includes('inconsistent'))return'failed';if(v.includes('pending')||v.includes('await')||v.includes('attention')||v.includes('not_'))return'pending';if(v.includes('running')||v.includes('created')||v.includes('valid'))return'info';return'neutral'}; const statusPill=value=>{const span=document.createElement('span');span.className='status '+statusTone(value);span.textContent=String(value||'unknown').replaceAll('_',' ');return span};
function setStatus(id,value){const node=el(id);node.className='status '+statusTone(value);node.textContent=String(value||'unknown').replaceAll('_',' ')} function clear(node){node.replaceChildren()} function addField(root,label,value){const cell=document.createElement('div');cell.innerHTML='<span class="readout-label"></span><span class="readout-value"></span>';cell.children[0].textContent=label;cell.children[1].textContent=value==null?'—':String(value);root.append(cell)} function renderJson(root,value){const pre=document.createElement('pre');pre.className='json';pre.textContent=JSON.stringify(value,null,2);root.append(pre)}
async function request(path,options){const response=await fetch(path,options);const value=await response.json();if(!response.ok)throw new Error(value.error||'Request failed');return value} function remember(runId){if(!runId)return;el('actionRunId').value=runId;el('runId').value=runId}
async function loadExecutions(){try{const data=await request('/api/executions');const root=el('executions');clear(root);el('metricExecutions').textContent=data.totalExecutions;const attention=data.summaries.filter(item=>item.requiresAttention).length;el('metricAttention').textContent=attention;el('metricAudit').textContent=data.dataQuality;if(!data.summaries.length){root.innerHTML='<p class="empty">No persisted executions yet.</p>';return}for(const item of data.summaries){const card=document.createElement('button');card.className='execution-card';const main=document.createElement('div');const id=document.createElement('div');id.className='execution-id';id.textContent=item.executionId;const meta=document.createElement('div');meta.className='execution-meta';meta.textContent='Audit '+item.timelineDataQuality+' · '+item.timelineItemCount+' events'+(item.requiresAttention?' · needs attention':'');main.append(id,meta);card.append(main,statusPill(item.executionStatus));card.onclick=()=>{el('executionId').value=item.executionId;loadExecution()};root.append(card)}}catch(error){el('executions').textContent=error.message}}
function selectionFromTimeline(timeline){for(const item of [...(timeline||[])].reverse()){const details=item.details||{};const selected=details.effectiveSelection||details.selection||details;if(selected.provider||details.provider)return{provider:selected.provider||details.provider,model:selected.model||details.model}}return{}}
async function loadExecution(){try{const data=await request('/api/executions/'+encodeURIComponent(el('executionId').value));const root=el('execution');clear(root);const metrics=data.result?.metrics||{};const selection=selectionFromTimeline(data.timeline?.timeline);setStatus('executionState',data.result?.status||data.summary?.summary?.executionStatus);const summary=document.createElement('div');summary.className='readout-grid';addField(summary,'Status',data.result?.status);addField(summary,'Provider',selection.provider);addField(summary,'Model',selection.model);addField(summary,'Estimated cost',formatUsd(metrics.estimatedCostUsd));addField(summary,'Actual cost',formatUsd(metrics.actualCostUsd));addField(summary,'Audit quality',data.timeline?.dataQuality);root.append(summary);if(data.result?.finalResult){const result=document.createElement('div');result.className='divider';root.append(result);const final=document.createElement('div');final.className='timeline-item';final.innerHTML='<strong>Final result</strong><p></p>';final.children[1].textContent=data.result.finalResult;root.append(final)}const divider=document.createElement('div');divider.className='divider';root.append(divider);const heading=document.createElement('p');heading.className='readout-label';heading.textContent='Audit timeline';root.append(heading);const timeline=document.createElement('div');timeline.className='timeline';for(const item of data.timeline?.timeline||[]){const row=document.createElement('article');row.className='timeline-item';const title=document.createElement('strong');title.textContent=item.source+' · '+item.type;const description=document.createElement('p');description.textContent=item.summary;const stamp=document.createElement('small');stamp.textContent=item.timestamp?new Date(item.timestamp).toLocaleString():'Timestamp unavailable';row.append(title,description,stamp);timeline.append(row)}if(!timeline.children.length)timeline.innerHTML='<p class="empty">No timeline evidence found.</p>';root.append(timeline)}catch(error){setStatus('executionState','failed');el('execution').textContent=error.message}}
function renderRun(data,target){clear(target);setStatus('runState',data.lifecycleStatus||data.status);const grid=document.createElement('div');grid.className='readout-grid';addField(grid,'Lifecycle',data.lifecycleStatus||data.status);addField(grid,'Provider',data.provider);addField(grid,'Model',data.model);addField(grid,'Estimated cost',formatUsd(data.estimatedCostUsd));addField(grid,'Actual cost',formatUsd(data.actualCostUsd));addField(grid,'Audit quality',data.dataQuality);addField(grid,'Human approval',data.requiresHumanApproval?'required':'not required');addField(grid,'Finalization',data.references?.timeline?.status||'—');target.append(grid);if(data.reason){const note=document.createElement('p');note.className='helper';note.textContent=data.reason;target.append(note)}}
async function loadRun(){try{const data=await request('/api/runs/'+encodeURIComponent(el('runId').value));remember(data.runId);renderRun(data,el('run'))}catch(error){setStatus('runState','failed');el('run').textContent=error.message}}
function loadDryRunTemplate(){el('profile').value=JSON.stringify({mode:'dry_run',goal:'Describe the requested outcome.',constraints:{},evaluationCriteria:[{type:'contains_text',value:'outcome'}],approvalPolicy:{},budgets:{maxCostUsd:0.00002,maxOutputTokens:32,maxTotalTokens:256},auditRequirements:{requireTimeline:true,requireAuditSummary:true}},null,2)}
function confirmAction(title,message){return window.confirm(title+'\\n\\n'+message)} async function launchRun(){try{const raw=el('profile').value;const profile=JSON.parse(raw);const mode=profile.mode||'unknown';const message=mode==='live'?'This live profile could proceed only through the kernel controls and may require Human Gate approval. Continue?':'This submits a dry-run profile and makes no provider call. Continue?';if(!confirmAction('Confirm controlled run',message))return;const data=await request('/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:raw});remember(data.runId);setStatus('actionState',data.status);clear(el('action'));renderJson(el('action'),data);el('launchNotice').className='confirmation';el('launchNotice').textContent='Run '+(data.runId||'request')+' recorded with status '+data.status+'.';await loadExecutions()}catch(error){setStatus('actionState','failed');el('action').textContent=error.message}}
async function approve(decision){try{const id=el('actionRunId').value;if(!confirmAction('Confirm '+decision,'This records the Human Gate decision for '+id+'. It does not continue execution.'))return;const data=await request('/api/runs/'+encodeURIComponent(id)+'/approval',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({decision,reason:el('reason').value||undefined})});setStatus('actionState',data.status);clear(el('action'));renderJson(el('action'),data);await loadRun()}catch(error){setStatus('actionState','failed');el('action').textContent=error.message}}
async function postAction(action){try{const id=el('actionRunId').value;const message=action==='continue'?'This may initiate the already-approved provider call. The kernel will still fail closed if the run is not eligible.':'This submits '+action+' for the selected controlled run.';if(!confirmAction('Confirm '+action,message))return;const data=await request('/api/runs/'+encodeURIComponent(id)+'/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reason:el('reason').value||undefined})});setStatus('actionState',data.status);clear(el('action'));renderJson(el('action'),data);await loadRun();await loadExecutions()}catch(error){setStatus('actionState','failed');el('action').textContent=error.message}}
loadExecutions();
</script><script src="/dashboard.js"></script></body></html>`;
}

function clientScript(): string {
  const match = page().match(/<script id="dashboard-client" type="text\/plain">\n([\s\S]*?)<\/script>/);

  if (!match) {
    throw new Error("Dashboard client script is unavailable.");
  }

  return match[1];
}

if (process.argv[1]?.endsWith("dashboard.js")) {
  const dashboard = await startDashboard();
  console.log(`Quantico dashboard available at ${dashboard.url}`);
}
