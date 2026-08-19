const DB_NAME="SoloDashboardSleep";const STORE="sleep";let db;let selectedDate=toKey(new Date());let range=7;
const $=id=>document.getElementById(id);
function toKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function parseKey(k){const [y,m,day]=k.split("-").map(Number);return new Date(y,m-1,day)}
function fmtDate(d){return d.toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"})}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:"date"});r.onsuccess=()=>{db=r.result;resolve()};r.onerror=()=>reject(r.error)})}
function get(key){return new Promise((res,rej)=>{const r=db.transaction(STORE,"readonly").objectStore(STORE).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function put(v){return new Promise((res,rej)=>{const r=db.transaction(STORE,"readwrite").objectStore(STORE).put(v);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function del(key){return new Promise((res,rej)=>{const r=db.transaction(STORE,"readwrite").objectStore(STORE).delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function duration(a,b){if(!a||!b)return null;let [ah,am]=a.split(":").map(Number),[bh,bm]=b.split(":").map(Number);let mins=(bh*60+bm)-(ah*60+am);if(mins<0)mins+=1440;return mins}
function human(mins){if(mins==null)return"—";return `${Math.floor(mins/60)}h ${mins%60}m`}
function renderDots(){let q=+$("quality").value;$("qualityValue").textContent=`${q}/10`;$("qualityDots").innerHTML=Array.from({length:5},(_,i)=>`<span class="dot ${i<Math.round(q/2)?"on":""}"></span>`).join("")}
function updateTotal(){ $("totalSleep").textContent=human(duration($("bedtime").value,$("wakeTime").value))}
async function loadEntry(){const v=await get(selectedDate);$("entryTitle").textContent=`SLEEP — ${fmtDate(parseKey(selectedDate)).toUpperCase()}`;$("savedState").textContent=v?"Saved":"Not saved";$("savedState").className=v?"saved ok":"saved";
$("bedtime").value=v?.bedtime||"";$("wakeTime").value=v?.wakeTime||"";$("quality").value=v?.quality||5;$("fellAsleep").value=v?.fellAsleep||"Easily";$("wakeups").value=v?.wakeups??0;$("rested").checked=!!v?.rested;renderDots();updateTotal()}
async function save(){const bedtime=$("bedtime").value,wakeTime=$("wakeTime").value;if(!bedtime||!wakeTime){alert("Enter both bedtime and wake-up time.");return}const v={date:selectedDate,bedtime,wakeTime,duration:duration(bedtime,wakeTime),quality:+$("quality").value,fellAsleep:$("fellAsleep").value,wakeups:+$("wakeups").value||0,rested:$("rested").checked};await put(v);await loadEntry();renderHistory()}
async function renderHistory(){let list=[];const center=parseKey(selectedDate);for(let i=range-1;i>=0;i--){const d=new Date(center);d.setDate(center.getDate()-i);const v=await get(toKey(d));list.push({d,v})}
const entries=list.filter(x=>x.v);if(!entries.length){$("historyList").innerHTML='<div class="empty">No sleep entries in this range.</div>'}else{$("historyList").innerHTML=list.map(({d,v})=>{const mins=v?.duration||0;const width=Math.min(100,mins/540*100);return `<div class="day ${v?"clickable":""}" data-date="${toKey(d)}"><div class="day-name">${d.toLocaleDateString(undefined,{weekday:"short"})}<br>${d.getDate()}</div><div class="bar-wrap"><div class="bar" style="width:${v?width:0}%"></div></div><div class="hours">${v?human(mins):"—"}</div><div class="q">${v?`${v.quality}/10`:""}</div></div>`}).join("")}
let total=entries.reduce((s,x)=>s+x.v.duration,0);let aq=entries.length?entries.reduce((s,x)=>s+x.v.quality,0)/entries.length:0;$("avgSleep").textContent=entries.length?human(Math.round(total/entries.length)):"—";$("avgQuality").textContent=entries.length?`${aq.toFixed(1)}/10`:"—";
document.querySelectorAll(".day.clickable").forEach(el=>el.onclick=()=>{selectedDate=el.dataset.date;loadEntry()})}
document.querySelectorAll("[data-range]").forEach(b=>b.onclick=()=>{range=+b.dataset.range;document.querySelectorAll("[data-range]").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderHistory()});
function shiftDay(amount){const d=parseKey(selectedDate);d.setDate(d.getDate()+amount);selectedDate=toKey(d);loadEntry();renderHistory()}
$("prevDay").onclick=()=>shiftDay(-1);
$("nextDay").onclick=()=>shiftDay(1);
$("todayBtn").onclick=()=>{selectedDate=toKey(new Date());loadEntry();renderHistory()};
$("saveBtn").onclick=save;$("quality").oninput=renderDots;$("bedtime").oninput=updateTotal;$("wakeTime").oninput=updateTotal;
openDB().then(()=>{loadEntry();renderHistory()});
