import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

const SAVE_DIR = join(process.cwd(), "public", "saved-dashboards");

export async function POST(req: NextRequest) {
  const { prompt, dashboard, html } = await req.json();
  if (!html && !dashboard) return NextResponse.json({ error: "Missing data" }, { status: 400 });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const slug = (prompt || "dashboard").slice(0, 30).replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  const filename = `${timestamp}_${slug}.html`;

  writeFileSync(join(SAVE_DIR, filename), html || generateHTML(prompt, dashboard));

  return NextResponse.json({ filename, url: `/saved-dashboards/${filename}` });
}

export async function GET() {
  try {
    const files = readdirSync(SAVE_DIR)
      .filter(f => f.endsWith(".html"))
      .sort()
      .reverse()
      .slice(0, 20);

    const dashboards = files.map(f => {
      const parts = f.replace(".html", "").split("_");
      const date = parts.slice(0, 3).join("-");
      const name = parts.slice(3).join(" ");
      return { filename: f, url: `/saved-dashboards/${f}`, date, name };
    });

    return NextResponse.json({ dashboards });
  } catch {
    return NextResponse.json({ dashboards: [] });
  }
}

function generateHTML(prompt: string, dashboard: any): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Marviz — ${prompt?.slice(0, 40) || "Dashboard"}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>:root{--bg:#0f1420;--p:#161c2e;--p2:#1d263b;--l:#2b3652;--t:#e7edf8;--m:#8d9ab8}*{box-sizing:border-box;margin:0}body{padding:24px;background:var(--bg);color:var(--t);font:13px -apple-system,sans-serif}.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:12px}.widget{background:var(--p);border:1px solid var(--l);border-radius:12px;padding:16px;position:relative;overflow:hidden}.widget .bar-top{position:absolute;top:0;left:0;right:0;height:3px}.widget h3{font-size:11px;color:var(--m);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px}.widget .chart-area{height:200px}.kpi-grid{display:grid;gap:8px}.kpi{text-align:center;padding:14px 8px;background:var(--p2);border-radius:9px;border:1px solid var(--l)}.kpi .kl{font-size:9px;color:var(--m);text-transform:uppercase}.kpi .kv{font-size:19px;font-weight:700;margin-top:4px}.kpi .kh{font-size:9px;color:var(--m);margin-top:2px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:8px 10px;border-bottom:1px solid var(--l);text-align:right}th{color:var(--m);font-size:9px;text-transform:uppercase}th:first-child,td:first-child{text-align:left}h2{font-size:16px;margin-bottom:8px}.meta{color:var(--m);font-size:11px;margin-bottom:16px}a{color:#6d9bff}</style></head><body>
<a href="/ai-dashboard.html" style="font-size:11px">← Back to AI Builder</a>
<h2>${dashboard?.title || "Generated Dashboard"}</h2>
<p class="meta">Prompt: "${prompt}" | Generated: ${new Date().toLocaleString()}</p>
<div class="grid" id="grid"></div>
<script>
const D=${JSON.stringify(dashboard)};
const grid=document.getElementById('grid');
const colors=['#6d9bff','#38d39f','#f5bd43','#fa7777','#8b5cf6','#06b6d4'];
D.components.forEach((comp,i)=>{
  const w=comp.w||6,id='w'+i;
  const div=document.createElement('div');div.className='widget';div.style.gridColumn='span '+w;
  div.innerHTML='<div class="bar-top" style="background:'+colors[i%6]+'"></div><h3>'+(comp.title||'')+'</h3><div id="'+id+'"></div>';
  grid.appendChild(div);
  setTimeout(()=>{
    const c=document.getElementById(id);if(!c)return;
    if(comp.type==='kpi'){const items=comp.data?.items||[];c.innerHTML='<div class="kpi-grid" style="grid-template-columns:repeat('+Math.min(items.length,5)+',1fr)">'+items.map(it=>'<div class="kpi"><div class="kl">'+(it.label||'')+'</div><div class="kv">'+(it.value||'')+'</div><div class="kh">'+(it.hint||'')+'</div></div>').join('')+'</div>'}
    else if(comp.type==='table'){c.innerHTML='<table><thead><tr>'+(comp.data?.headers||[]).map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+(comp.data?.rows||[]).map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}
    else{c.innerHTML='<div class="chart-area"><canvas id="c'+id+'"></canvas></div>';setTimeout(()=>{const el=document.getElementById('c'+id);if(!el)return;let cfg;if(comp.type==='pie'||comp.type==='doughnut'){cfg={type:comp.type,data:{labels:comp.data?.labels||[],datasets:[{data:comp.data?.data||[],backgroundColor:comp.data?.colors||colors}]}}}else{cfg={type:comp.type,data:{labels:comp.data?.labels||[],datasets:(comp.data?.datasets||[]).map(ds=>({label:ds.label,data:ds.data,backgroundColor:ds.color,borderColor:ds.color,tension:0.3}))}}}cfg.options={responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#8d9ab8',boxWidth:10}}},scales:(comp.type==='pie'||comp.type==='doughnut')?{}:{x:{ticks:{color:'#6b7085'},grid:{color:'rgba(255,255,255,.04)'}},y:{ticks:{color:'#6b7085'},grid:{color:'rgba(255,255,255,.04)'}}}};new Chart(el,cfg)},50)}
  },i*100);
});
</script></body></html>`;
}
