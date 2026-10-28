from flask import Flask, render_template, request, jsonify
from collections import deque
from statistics import mean, median
import math

app = Flask(__name__)
EPS = 1e-9
PRESETS = {
    "Project workload (10 processes)": [(0,12),(0,28),(0,35),(0,50),(0,70),(0,15),(0,22),(0,40),(0,58),(0,90)],
    "Six processes": [(0,6),(0,14),(0,22),(0,40),(0,58),(0,90)],
    "Seven processes": [(0,5),(0,9),(0,14),(0,22),(0,31),(0,47),(0,66)],
    "Equal bursts": [(0,15),(0,15),(0,15),(0,15)],
    "With arrival times": [(0,24),(2,8),(4,40),(6,16),(10,60),(14,12)]
}
COLORS = ["#9DB8FF","#7FE3EA","#C9B6FF","#8BE8BF","#FFD28A","#FFA9C9",
          "#D9E38F","#FFB59A","#A5D8FF","#E2B8F5","#B4E7A3","#F7C6A0"]

def fmt(x):
    return f"{x:.2f}".rstrip("0").rstrip(".")

def color_of(pid):
    try: return COLORS[(int(pid[1:])-1) % len(COLORS)]
    except: return COLORS[0]

def simulate(procs, quantum, adaptive):
    key = (lambda p: (p["arrival"], p["burst"])) if adaptive else (lambda p: p["arrival"])
    pending = deque(sorted([p.copy() for p in procs], key=key))
    rem = {p["pid"]: float(p["burst"]) for p in procs}
    queue, t = deque(), 0.0
    done, first, steps = {}, {}, []
    def admit(now):
        got=[]
        while pending and pending[0]["arrival"] <= now + EPS:
            pid=pending.popleft()["pid"]; queue.append(pid); got.append(pid)
        return got
    def snap(): return [{"pid":q,"remaining":rem[q],"color":color_of(q)} for q in queue]
    admit(0.0)
    initial={"end":0.0,"queue":snap(),"rem":dict(rem),"done":{}}
    while queue or pending:
        if not queue:
            nxt=float(pending[0]["arrival"])
            got=admit(nxt)
            steps.append({"kind":"idle","pid":None,"start":t,"end":nxt,"run":nxt-t,
                          "rem_before":0,"rem_after":0,"queue_before":[],"queue_after":snap(),
                          "arrivals":got,"finished":False,"rem":dict(rem),"done":dict(done)})
            t=nxt
            continue
        before=snap()
        pid=queue.popleft()
        run=min(float(quantum),rem[pid]); start=t; t=round(t+run,6)
        rb=rem[pid]; rem[pid]=round(rem[pid]-run,6); first.setdefault(pid,start)
        arrivals=admit(t); finished=rem[pid] <= EPS
        if finished: rem[pid]=0.0; done[pid]=t
        else: queue.append(pid)
        steps.append({"kind":"run","pid":pid,"start":start,"end":t,"run":run,"rem_before":rb,
                      "rem_after":rem[pid],"queue_before":before,"queue_after":snap(),
                      "arrivals":arrivals,"finished":finished,"rem":dict(rem),"done":dict(done)})
    gantt=[{"pid":s["pid"],"start":s["start"],"end":s["end"],"color":color_of(s["pid"])}
           for s in steps if s["kind"]=="run"]
    return {"steps":steps,"initial":initial,"gantt":gantt,"done":done,"first":first,
            "quantum":quantum,"adaptive":adaptive}

def metrics(procs, sim):
    arr={p["pid"]:p["arrival"] for p in procs}; bur={p["pid"]:p["burst"] for p in procs}
    tat={k:sim["done"][k]-arr[k] for k in arr}
    wt={k:tat[k]-bur[k] for k in arr}
    rt={k:sim["first"][k]-arr[k] for k in arr}
    g=sim["gantt"]
    switches=sum(g[i]["pid"] != g[i-1]["pid"] for i in range(1,len(g)))
    return {"slices":len(g),"switches":switches,"avg_wt":mean(wt.values()),
            "avg_tat":mean(tat.values()),"avg_rt":mean(rt.values()),
            "makespan":g[-1]["end"] if g else 0,"wt":wt,"tat":tat,"rt":rt}

def choose_sts(procs, mode="auto"):
    bursts=[p["burst"] for p in procs]; mn,md=mean(bursts),median(bursts)
    same=abs(mn-md)<EPS
    candidates=[("Mean = Median",mn)] if same else [("Mean",mn),("Median",md)]
    rows=[]
    for name,q in candidates:
        sim=simulate(procs,q,True)
        rows.append({"name":name,"quantum":q,"sim":sim,"metrics":metrics(procs,sim)})
    pool=rows
    if mode=="mean": pool=[r for r in rows if r["name"].startswith("Mean")] or rows
    elif mode=="median": pool=[r for r in rows if r["name"]=="Median"] or rows
    best=min(pool,key=lambda r:(round(r["metrics"]["avg_wt"],6),r["metrics"]["switches"],round(r["metrics"]["avg_rt"],6)))
    return {"rows":rows,"best":best,"mean":mn,"median":md,"same":same}

def clean_processes(raw):
    if not isinstance(raw,list) or not raw: raise ValueError("Add at least one process.")
    procs=[]
    for i,item in enumerate(raw,1):
        try:
            arrival=float(item.get("arrival",0)); burst=float(item.get("burst",0))
        except (TypeError,ValueError): raise ValueError(f"Process P{i}: arrival and burst must be numbers.")
        if not math.isfinite(arrival) or arrival<0: raise ValueError(f"Process P{i}: arrival must be non-negative.")
        if not math.isfinite(burst) or burst<=0: raise ValueError(f"Process P{i}: burst must be greater than zero.")
        procs.append({"pid":f"P{i}","arrival":arrival,"burst":burst})
    return procs

def public_sim(sim):
    return {"steps":sim["steps"],"initial":sim["initial"],"gantt":sim["gantt"],
            "done":sim["done"],"first":sim["first"],"quantum":sim["quantum"],"adaptive":sim["adaptive"]}

def public_metrics(m):
    return {k:v for k,v in m.items()}

@app.route("/")
def index():
    return render_template("index.html", presets=list(PRESETS.keys()))

@app.get("/api/preset/<int:index>")
def preset(index):
    names=list(PRESETS)
    if index<0 or index>=len(names): return jsonify({"error":"Unknown preset"}),400
    return jsonify({"name":names[index],"processes":[{"arrival":a,"burst":b} for a,b in PRESETS[names[index]]]})

@app.post("/api/simulate")
def api_simulate():
    try:
        payload=request.get_json(force=True)
        procs=clean_processes(payload.get("processes",[]))
        q=float(payload.get("fixedQuantum",20))
        if not math.isfinite(q) or q<=0: raise ValueError("Traditional quantum must be greater than zero.")
        mode=payload.get("mode","auto")
        trad=simulate(procs,q,False); mt=metrics(procs,trad)
        sts=choose_sts(procs,mode); adapt=sts["best"]["sim"]; ma=sts["best"]["metrics"]
        details=[]
        for p in procs:
            pid=p["pid"]
            details.append({"pid":pid,"arrival":p["arrival"],"burst":p["burst"],
                "traditionalCompletion":trad["done"][pid],"adaptiveCompletion":adapt["done"][pid],
                "traditionalWaiting":mt["wt"][pid],"adaptiveWaiting":ma["wt"][pid],
                "traditionalResponse":mt["rt"][pid],"adaptiveResponse":ma["rt"][pid],
                "color":color_of(pid)})
        return jsonify({"processes":procs,"traditional":public_sim(trad),"adaptive":public_sim(adapt),
            "traditionalMetrics":public_metrics(mt),"adaptiveMetrics":public_metrics(ma),
            "sts":{"mean":sts["mean"],"median":sts["median"],"same":sts["same"],
                   "chosen":sts["best"]["name"],"quantum":sts["best"]["quantum"],
                   "candidates":[{"name":r["name"],"quantum":r["quantum"],
                       "avgWaiting":r["metrics"]["avg_wt"],"contextSwitches":r["metrics"]["switches"],
                       "avgResponse":r["metrics"]["avg_rt"],"chosen":r is sts["best"]} for r in sts["rows"]]},
            "details":details})
    except ValueError as e: return jsonify({"error":str(e)}),400
    except Exception as e: return jsonify({"error":f"Could not run simulation: {e}"}),500

if __name__=="__main__":
    app.run(debug=True, port=5000)
