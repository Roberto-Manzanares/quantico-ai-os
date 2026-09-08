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
<title>Quantico AI OS</title><style>
:root{color-scheme:dark;font-family:ui-sans-serif,system-ui;background:#10131a;color:#edf1f7}body{max-width:1180px;margin:0 auto;padding:28px}h1{margin:0}header,p{color:#aab6c8}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.panel{background:#171c26;border:1px solid #2b3445;border-radius:10px;padding:16px;margin:16px 0}button{background:#67e8a7;color:#062814;border:0;border-radius:6px;padding:9px 12px;font-weight:700;cursor:pointer}button.secondary{background:#303b4e;color:#edf1f7}input,textarea{width:100%;box-sizing:border-box;background:#0d1118;color:#edf1f7;border:1px solid #3b475c;border-radius:6px;padding:9px;margin:6px 0}textarea{min-height:185px}pre{white-space:pre-wrap;word-break:break-word;background:#0d1118;padding:12px;border-radius:6px;max-height:410px;overflow:auto}.item{display:block;width:100%;text-align:left;margin:6px 0;background:#303b4e;color:#edf1f7}.muted{color:#aab6c8;font-size:.9rem}@media(max-width:760px){.grid{grid-template-columns:1fr}}</style></head>
<body><header><h1>Quantico AI OS</h1><p>Local operational console. COST-FIRST and Human Gate decisions remain in the kernel.</p></header>
<div class="grid"><section class="panel"><h2>Recent executions</h2><div id="executions" class="muted">Loading…</div></section><section class="panel"><h2>Run status</h2><input id="runId" placeholder="runId"><button class="secondary" onclick="loadRun()">Load run</button><pre id="run">Enter a runId.</pre></section></div>
<section class="panel"><h2>Execution detail</h2><input id="executionId" placeholder="executionId"><button class="secondary" onclick="loadExecution()">Load execution</button><pre id="execution">Select an execution.</pre></section>
<div class="grid"><section class="panel"><h2>Launch controlled run</h2><p class="muted">Paste an existing controlled-run profile. Live profiles retain the Human Approval Gate.</p><textarea id="profile" placeholder='{"mode":"dry_run", ...}'></textarea><button onclick="launchRun()">Launch controlled run</button></section><section class="panel"><h2>Human approval & finalization</h2><input id="actionRunId" placeholder="runId"><input id="reason" placeholder="Reason (optional)"><p><button onclick="approve('approved')">Approve</button> <button class="secondary" onclick="approve('rejected')">Reject</button> <button class="secondary" onclick="postAction('continue')">Continue approved execution</button></p><p><button class="secondary" onclick="postAction('finalize')">Finalize</button> <button class="secondary" onclick="postAction('close')">Close run</button></p><pre id="action">No action submitted.</pre></section></div>
<script>
const recentKey='quantico-recent-runs';
const show=(id,value)=>document.getElementById(id).textContent=JSON.stringify(value,null,2);
const remember=runId=>{if(!runId)return;const ids=[runId,...JSON.parse(localStorage.getItem(recentKey)||'[]').filter(id=>id!==runId)].slice(0,10);localStorage.setItem(recentKey,JSON.stringify(ids));document.getElementById('actionRunId').value=runId;document.getElementById('runId').value=runId};
async function request(path,options){const response=await fetch(path,options);const value=await response.json();if(!response.ok)throw new Error(value.error||'Request failed');return value}
async function loadExecutions(){try{const data=await request('/api/executions');const root=document.getElementById('executions');root.replaceChildren();if(!data.summaries.length){root.textContent='No persisted executions.';return}for(const item of data.summaries){const button=document.createElement('button');button.className='item';button.textContent=item.executionId+' · '+item.executionStatus+' · audit '+item.timelineDataQuality;button.onclick=()=>{document.getElementById('executionId').value=item.executionId;loadExecution()};root.append(button)}}catch(error){document.getElementById('executions').textContent=error.message}}
async function loadExecution(){try{show('execution',await request('/api/executions/'+encodeURIComponent(document.getElementById('executionId').value)))}catch(error){show('execution',{error:error.message})}}
async function loadRun(){try{const data=await request('/api/runs/'+encodeURIComponent(document.getElementById('runId').value));remember(data.runId);show('run',data)}catch(error){show('run',{error:error.message})}}
async function launchRun(){try{const data=await request('/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:document.getElementById('profile').value});remember(data.runId);show('action',data);await loadExecutions()}catch(error){show('action',{error:error.message})}}
async function approve(decision){try{const id=document.getElementById('actionRunId').value;const data=await request('/api/runs/'+encodeURIComponent(id)+'/approval',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({decision,reason:document.getElementById('reason').value||undefined})});show('action',data);await loadRun()}catch(error){show('action',{error:error.message})}}
async function postAction(action){try{const id=document.getElementById('actionRunId').value;const data=await request('/api/runs/'+encodeURIComponent(id)+'/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reason:document.getElementById('reason').value||undefined})});show('action',data);await loadRun();await loadExecutions()}catch(error){show('action',{error:error.message})}}
loadExecutions();
</script></body></html>`;
}

if (process.argv[1]?.endsWith("dashboard.js")) {
  const dashboard = await startDashboard();
  console.log(`Quantico dashboard available at ${dashboard.url}`);
}
