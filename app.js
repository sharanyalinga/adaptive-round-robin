const $ = (id) => document.getElementById(id);
const PRESET_NAMES = ["Project workload (10 processes)", "Six processes", "Seven processes", "Equal bursts", "With arrival times"];
const PALETTE = ["#9DB8FF","#7FE3EA","#C9B6FF","#8BE8BF","#FFD28A","#FFA9C9","#D9E38F","#FFB59A","#A5D8FF","#E2B8F5","#B4E7A3","#F7C6A0"];
let workload = [[0,12],[0,28],[0,35],[0,50],[0,70],[0,15],[0,22],[0,40],[0,58],[0,90]];
let result = null, scheduler = "adaptive", positions = {adaptive:0,traditional:0};
const fmt = n => Number(n).toFixed(2).replace(/\.?0+$/,"");
const esc = s => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const color = i => PALETTE[i % PALETTE.length];
function showTab(name){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));document.querySelectorAll(".tab-panel").forEach(p=>p.classList.toggle("active",p.id===`tab-${name}`));}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.goto)));
document.querySelectorAll(".sched-btn").forEach(b=>b.addEventListener("click",()=>{scheduler=b.dataset.scheduler;document.querySelectorAll(".sched-btn").forEach(x=>x.classList.toggle("active",x===b));renderPlayback();}));

PRESET_NAMES.forEach((n,i)=>{const o=document.createElement("option");o.value=i;o.textContent=n;$("preset").appendChild(o);});
$("preset").addEventListener("change",async()=>{const r=await fetch(`/api/preset/${$("preset").value}`);const d=await r.json();workload=d.processes.map(p=>[p.arrival,p.burst]);renderRows();clearResults();});
function renderRows(){
  $("processRows").innerHTML=workload.map((p,i)=>`<tr><td><span class="pid-tag"><i class="swatch" style="background:${color(i)}"></i>P${i+1}</span></td>
  <td><input class="row-input arrival-input" type="number" min="0" step="1" value="${esc(p[0])}" aria-label="P${i+1} arrival time" data-index="${i}"></td>
  <td><input class="row-input burst-input" type="number" min="1" step="1" value="${esc(p[1])}" aria-label="P${i+1} burst time" data-index="${i}"></td>
  <td><button class="remove-btn" data-remove="${i}" aria-label="Remove P${i+1}" ${workload.length===1?"disabled":""}>×</button></td></tr>`).join("");
  $("processCount").textContent=`${workload.length} process${workload.length===1?"":"es"}`;
  document.querySelectorAll(".arrival-input").forEach(el=>el.addEventListener("change",()=>{workload[+el.dataset.index][0]=el.value;clearResults();}));
  document.querySelectorAll(".burst-input").forEach(el=>el.addEventListener("change",()=>{workload[+el.dataset.index][1]=el.value;clearResults();}));
  document.querySelectorAll("[data-remove]").forEach(el=>el.addEventListener("click",()=>{workload.splice(+el.dataset.remove,1);renderRows();clearResults();}));
}
$("addProcess").addEventListener("click",()=>{if(workload.length>=40){showError("Maximum of 40 processes per simulation.");return;}workload.push([0,20]);renderRows();clearResults();});
$("resetWorkload").addEventListener("click",async()=>{$("preset").value=0;const r=await fetch("/api/preset/0");const d=await r.json();workload=d.processes.map(p=>[p.arrival,p.burst]);renderRows();clearResults();});
function showError(msg){$("error").textContent=msg;$("error").classList.remove("hidden");}
function clearError(){$("error").textContent="";$("error").classList.add("hidden");}
function clearResults(){result=null;positions={adaptive:0,traditional:0};$("simulationContent").classList.add("hidden");$("simulationEmpty").classList.remove("hidden");$("compareContent").classList.add("hidden");$("compareEmpty").classList.remove("hidden");$("meanValue").textContent="—";$("medianValue").textContent="—";$("selectedValue").textContent="—";$("selectionReason").textContent="Run the simulation to evaluate candidates.";}
$("runSimulation").addEventListener("click",runSimulation);
async function runSimulation(){
  clearError();
  const rows=[...document.querySelectorAll("#processRows tr")];
  const processes=rows.map((tr)=>({arrival:tr.querySelector(".arrival-input").value,burst:tr.querySelector(".burst-input").value}));
  const fixedQuantum=Number($("fixedQuantum").value);
  if(!processes.length){showError("Add at least one process.");return;}
  if(!Number.isFinite(fixedQuantum)||fixedQuantum<=0){showError("Traditional quantum must be greater than zero.");return;}
  $("runSimulation").disabled=true;$("runSimulation").textContent="Running…";
  try{
    const response=await fetch("/api/simulate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({processes,fixedQuantum,mode:$("mode").value})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||"Simulation failed.");
    result=data;positions={adaptive:0,traditional:0};
    $("meanValue").textContent=`${fmt(data.sts.mean)} ms`;$("medianValue").textContent=`${fmt(data.sts.median)} ms`;
    $("selectedValue").textContent=`${fmt(data.sts.quantum)} ms`;
    const candidates=data.sts.candidates;
    let reason=data.sts.same?"Mean and median are equal, so there is one candidate.":$("mode").value!=="auto"?`Mode set to ${data.sts.chosen.toLowerCase()} for this run.`:`${data.sts.chosen} wins on average waiting time; ties use context switches, then response time.`;
    if($("mode").value==="auto"&&!data.sts.same&&candidates.length>1){const win=candidates.find(c=>c.chosen),other=candidates.find(c=>!c.chosen);reason=`${win.name}: ${fmt(win.avgWaiting)} ms average waiting, compared with ${fmt(other.avgWaiting)} ms for ${other.name}.`;}
    $("selectionReason").textContent=reason;
    $("simulationEmpty").classList.add("hidden");$("simulationContent").classList.remove("hidden");$("compareEmpty").classList.add("hidden");$("compareContent").classList.remove("hidden");
    renderPlayback();renderComparison();showTab("simulation");
  }catch(e){showError(e.message);}finally{$("runSimulation").disabled=false;$("runSimulation").innerHTML='Run simulation <span>→</span>';}
}
function metricCard(label,value,sub=""){return `<div class="stat-card"><span>${esc(label)}</span><strong>${esc(value)}</strong>${sub?`<small>${esc(sub)}</small>`:""}</div>`;}
function chip(item,idx,head=false){const pid=typeof item==="string"?item:item.pid;const rem=typeof item==="string"?null:item.remaining;const i=Math.max(0,parseInt(pid.slice(1),10)-1);return `<span class="queue-chip ${head&&idx===0?"head":""}" style="background:${color(i)}"><b>${esc(pid)}</b>${rem===null?"":`<small>${fmt(rem)} ms left</small>`}</span>`;}
function renderQueue(id,items,empty){$(id).innerHTML=items.length?items.map((p,i)=>chip(p,i,true)).join(""):`<div class="empty-queue">${empty}</div>`;}
function renderPlayback(){
 if(!result)return;
 const sim=result[scheduler],m=result[scheduler==="adaptive"?"adaptiveMetrics":"traditionalMetrics"];
 const pos=positions[scheduler],N=sim.steps.length,cur=pos===0?null:sim.steps[pos-1],state=cur||sim.initial;
 $("playbackTitle").textContent=scheduler==="adaptive"?"Adaptive Round Robin":"Traditional Round Robin";
 $("playbackSubtitle").textContent=`Quantum = ${fmt(sim.quantum)} ms · ${scheduler==="adaptive"?"Shortest burst first":"Original process order"}`;
 $("prevStep").disabled=pos===0;$("resetStep").disabled=pos===0;$("nextStep").disabled=pos>=N;$("finishSteps").disabled=pos>=N;
 $("progressFill").style.width=`${N?pos/N*100:100}%`;$("stepCount").textContent=`Step ${pos} of ${N}`;
 const clock=cur?cur.end:0, pid=cur?.pid, fin=state.done||{};
 $("liveStats").innerHTML=[metricCard("Simulation clock",`${fmt(clock)} ms`),metricCard("Current CPU",cur?(cur.kind==="idle"?"Idle":pid):"Not started"),metricCard("Completed",`${Object.keys(fin).length} / ${result.processes.length}`),metricCard("Time quantum",`${fmt(sim.quantum)} ms`)].join("");
 renderQueue("queueBefore",cur?cur.queue_before:sim.initial.queue, "Ready queue is empty.");
 if(!cur){$("cpuProcess").textContent="—";$("cpuDuration").textContent="Press Next step to start";}
 else if(cur.kind==="idle"){$("cpuProcess").textContent="IDLE";$("cpuDuration").textContent=`${fmt(cur.run)} ms until next arrival`;}
 else{$("cpuProcess").textContent=cur.pid;$("cpuDuration").textContent=`Runs for ${fmt(cur.run)} ms · ${fmt(cur.start)} → ${fmt(cur.end)}`;}
 renderQueue("queueAfter",cur?cur.queue_after:[],cur?"Queue is empty — no process waiting.":"Press Next step to dispatch.");
 $("completedList").innerHTML=Object.entries(fin).length?Object.entries(fin).map(([p,t])=>`<span class="completed-item">${esc(p)} · ${fmt(t)} ms</span>`).join(""):`<span class="empty-queue">No completed processes yet.</span>`;
 $("notArrived").innerHTML=result.processes.filter(p=>p.arrival>clock+1e-9).map(p=>`<span class="not-arrived-item">${esc(p.pid)} · arrives @ ${fmt(p.arrival)}</span>`).join("")||`<span class="empty-queue">Everyone has arrived.</span>`;
 $("stepNarrative").innerHTML=narrative(sim,pos);
 const runSteps=sim.steps.slice(0,pos);
 renderGantt("stepGantt",runSteps,cur&&cur.kind==="run"?runSteps.filter(s=>s.kind==="run").length-1:-1);
 $("statusRows").innerHTML=result.processes.map((p,i)=>{const remaining=state.rem[p.pid],progress=(p.burst-remaining)/p.burst;let status;
 if(fin[p.pid]!==undefined)status="✓ Done";else if(p.arrival>clock+1e-9)status="Not arrived";else if(cur&&cur.kind==="run"&&cur.pid===p.pid)status=cur.finished?"✓ Done":"Preempted → queue";else status="Ready";
 return `<tr><td><span class="pid-tag"><i class="swatch" style="background:${color(i)}"></i>${p.pid}</span></td><td>${fmt(p.arrival)}</td><td>${fmt(p.burst)}</td><td><b>${fmt(remaining)} ms</b></td><td><div class="statusbar"><i style="width:${Math.max(0,Math.min(100,progress*100))}%"></i></div><small>${Math.round(progress*100)}%</small></td><td><span class="status-label">${status}</span></td><td>${fin[p.pid]===undefined?"—":`${fmt(fin[p.pid])} ms`}</td></tr>`;}).join("");
 if(pos===N)$("stepNarrative").innerHTML+=`<br><br><b>Simulation complete.</b> Average waiting: ${fmt(m.avg_wt)} ms · turnaround: ${fmt(m.avg_tat)} ms · response: ${fmt(m.avg_rt)} ms.`;
}
function narrative(sim,pos){
 if(pos===0){const q=sim.initial.queue.map(p=>`${p.pid} (${fmt(p.remaining)} ms)`).join(" → ")||"no process has arrived";return `<b>Start (t = 0).</b> Ready queue: ${q}. Quantum = <b>${fmt(sim.quantum)} ms</b>. Press Next step to dispatch the first process.`;}
 const s=sim.steps[pos-1];if(s.kind==="idle")return `<b>Step ${pos}: CPU idle.</b> Time advances from ${fmt(s.start)} to ${fmt(s.end)} ms because the queue is empty. ${s.arrivals.join(", ")} arrive and enter the queue.`;
 let text=`<b>Step ${pos}: ${s.pid} runs.</b> It is dispatched from the queue head and executes min(${fmt(sim.quantum)}, ${fmt(s.rem_before)}) = <b>${fmt(s.run)} ms</b>, from ${fmt(s.start)} to ${fmt(s.end)} ms.`;
 if(s.arrivals.length)text+=` <b>New arrivals:</b> ${s.arrivals.join(", ")} join the queue.`;
 if(s.finished)text+=` <b>${s.pid} finishes</b> at ${fmt(s.end)} ms.`;else text+=` Quantum is used up; ${s.pid} has ${fmt(s.rem_after)} ms left and returns to the back of the queue.`;
 return text;
}
function renderGantt(id,steps,current=-1){
 const runs=steps.filter(s=>s.kind==="run");if(!runs.length){$(id).innerHTML='<div class="empty-queue">No CPU slices yet — advance the simulation.</div>';return;}
 const total=Math.max(runs[runs.length-1].end,1),width=Math.max(100,Math.min(1100,total*1.8));
 let blocks=runs.map((s,i)=>{const pidx=parseInt(s.pid.slice(1),10)-1;return `<div class="gantt-block ${i===current?"current":""}" style="width:${(s.end-s.start)/total*100}%;background:${color(pidx)}" title="${s.pid}: ${fmt(s.start)}–${fmt(s.end)} ms">${(s.end-s.start)/total*100>3?s.pid:""}</div>`;}).join("");
 let times=[...new Set([0,...runs.map(s=>s.end)])];let ticks=times.map(t=>`<span style="left:${t/total*100}%">${fmt(t)}</span>`).join("");
 $(id).innerHTML=`<div class="gantt" style="min-width:${width}px"><div class="gantt-track">${blocks}</div><div class="gantt-times">${ticks}</div></div>`;
}
$("nextStep").addEventListener("click",()=>{if(result&&positions[scheduler]<result[scheduler].steps.length){positions[scheduler]++;renderPlayback();}});
$("prevStep").addEventListener("click",()=>{positions[scheduler]=Math.max(0,positions[scheduler]-1);renderPlayback();});
$("resetStep").addEventListener("click",()=>{positions[scheduler]=0;renderPlayback();});
$("finishSteps").addEventListener("click",()=>{positions[scheduler]=result[scheduler].steps.length;renderPlayback();});

function pct(a,b){return Math.abs(b)<1e-9?0:(a-b)/Math.abs(b)*100;}
function renderComparison(){
 const mt=result.traditionalMetrics,ma=result.adaptiveMetrics,chosen=result.sts;
 const specs=[["CPU slices","slices"],["Context switches","switches"],["Avg waiting (ms)","avg_wt"],["Avg turnaround (ms)","avg_tat"],["Avg response (ms)","avg_rt"]];
 $("comparisonMetrics").innerHTML=specs.map(([label,k])=>metricCard(label,["slices","switches"].includes(k)?ma[k]:`${ma[k].toFixed(1)} ms`,`${pct(ma[k],mt[k]).toFixed(1)}% vs traditional (${["slices","switches"].includes(k)?mt[k]:mt[k].toFixed(1)})`)).join("");
 $("comparisonRows").innerHTML=specs.map(([label,k])=>{const a=ma[k],b=mt[k],change=pct(a,b);return `<tr><td><b>${label}</b></td><td>${["slices","switches"].includes(k)?b:b.toFixed(1)}</td><td><b>${["slices","switches"].includes(k)?a:a.toFixed(1)}</b></td><td class="${change<0?"good":change>0?"bad":""}">${change>0?"+":""}${change.toFixed(1)}%</td></tr>`;}).join("");
 const dw=pct(ma.avg_wt,mt.avg_wt);$("comparisonInsight").className="insight"+(dw>0.05?" warn":"");$("comparisonInsight").textContent=dw<-.05?`Adaptive RR lowers average waiting time by ${Math.abs(dw).toFixed(1)}% on this workload.`:dw>.05?`Adaptive RR has ${dw.toFixed(1)}% higher average waiting time on this workload. Adaptive is not guaranteed to win for every workload.`:"Both schedulers have the same average waiting time on this workload.";
 $("tradGanttSub").textContent=`Q = ${fmt(result.traditional.quantum)} ms · ${mt.slices} slices · ${mt.switches} context switches`;
 $("adaptGanttSub").textContent=`STS = ${fmt(result.adaptive.quantum)} ms · ${ma.slices} slices · ${ma.switches} context switches`;
 renderGantt("tradGantt",result.traditional.steps);renderGantt("adaptGantt",result.adaptive.steps);
 $("waitingChart").innerHTML=`<div class="chart-legend"><span><i style="background:#ffb84d"></i>Traditional</span><span><i style="background:#4774f5"></i>Adaptive</span></div>`+result.details.map(d=>{const max=Math.max(1,...result.details.map(x=>Math.max(x.traditionalWaiting,x.adaptiveWaiting)));return `<div class="wait-row"><b>${d.pid}</b><div class="wait-bars"><span class="wait-trad" style="width:${d.traditionalWaiting/max*50}%"></span><span class="wait-adapt" style="width:${d.adaptiveWaiting/max*50}%"></span></div><span class="wait-value">${fmt(d.traditionalWaiting)} / ${fmt(d.adaptiveWaiting)}</span></div>`;}).join("");
 $("candidateRows").innerHTML=chosen.candidates.map(c=>`<tr><td>${esc(c.name)}</td><td>${fmt(c.quantum)} ms</td><td>${c.avgWaiting.toFixed(2)} ms</td><td>${c.contextSwitches}</td><td>${c.avgResponse.toFixed(2)} ms</td><td>${c.chosen?'<span class="completed-item">✓ Selected</span>':'—'}</td></tr>`).join("");
 $("detailRows").innerHTML=result.details.map(d=>`<tr><td><span class="pid-tag"><i class="swatch" style="background:${d.color}"></i>${d.pid}</span></td><td>${fmt(d.arrival)}</td><td>${fmt(d.burst)}</td><td>${fmt(d.traditionalCompletion)}</td><td>${fmt(d.adaptiveCompletion)}</td><td>${fmt(d.traditionalWaiting)}</td><td>${fmt(d.adaptiveWaiting)}</td><td>${fmt(d.traditionalResponse)}</td><td>${fmt(d.adaptiveResponse)}</td></tr>`).join("");
}
$("downloadCsv").addEventListener("click",()=>{if(!result)return;const cols=["pid","arrival","burst","traditionalCompletion","adaptiveCompletion","traditionalWaiting","adaptiveWaiting","traditionalResponse","adaptiveResponse"];const lines=[cols.join(","),...result.details.map(d=>cols.map(c=>d[c]).join(","))];const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="adaptive_rr_results.csv";a.click();URL.revokeObjectURL(url);});
renderRows();
