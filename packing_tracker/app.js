const DB="PackingTrackerDB",V=1,STORE="app";let db,mode="packing",profileId="travel",editingId=null;
const state={profiles:[],items:[],checks:{}};
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,V);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:"key"})};r.onsuccess=()=>{db=r.result;res()};r.onerror=()=>rej(r.error)})}
function read(k){return new Promise((res,rej)=>{let r=db.transaction(STORE,"readonly").objectStore(STORE).get(k);r.onsuccess=()=>res(r.result?.value);r.onerror=()=>rej(r.error)})}
function write(k,v){return new Promise((res,rej)=>{let r=db.transaction(STORE,"readwrite").objectStore(STORE).put({key:k,value:v});r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function uid(){return crypto.randomUUID()}
async function save(){await write("profiles",state.profiles);await write("items",state.items);await write("checks",state.checks)}
function activeItems(){return state.items.filter(x=>x.profileId===profileId)}
function checkedKey(id){return `${profileId}:${mode}:${id}`}
function isChecked(id){return !!state.checks[checkedKey(id)]}
function render(){let items=activeItems(),groups=[...new Set(items.map(x=>x.category))];$("#profileName").textContent=state.profiles.find(p=>p.id===profileId)?.name||"Travel";
let total=items.length,done=items.filter(x=>isChecked(x.id)).length,pct=total?Math.round(done/total*100):0;
$("#progressText").textContent=`${done} / ${total} PACKED`;$("#progressBar").style.width=pct+"%";$("#completion").textContent=pct+"%";$("#remaining").textContent=`${total-done} ITEMS REMAINING`;$("#checked").textContent=`${done} VERIFIED`;
$("#categoryGrid").innerHTML=groups.length?groups.map(g=>group(g,items.filter(x=>x.category===g))).join(""):`<div class="empty">NO ITEMS IN THIS LOADOUT</div>`}
function group(name,items){let done=items.filter(x=>isChecked(x.id)).length;return `<section class="category"><div class="category-head"><span class="category-title">${name}</span><span class="category-count">${done}/${items.length}</span></div>${items.map(item).join("")}<button class="category-add" onclick="openItem(null,'${name}')">+ ADD TO ${name}</button></section>`}
function item(x){return `<div class="item ${isChecked(x.id)?"checked":""}"><button class="check" onclick="toggle('${x.id}')">${isChecked(x.id)?"✓":""}</button><span class="name">${esc(x.name)}</span><span class="qty">×${x.qty}</span><button class="edit" onclick="openItem('${x.id}')">⋮</button></div>`}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
async function toggle(id){const k=checkedKey(id);state.checks[k]=!state.checks[k];await save();render()}
async function setAll(value){activeItems().forEach(x=>state.checks[checkedKey(x.id)]=value);await save();render()}
function setMode(m){mode=m;$$(".mode").forEach(x=>x.classList.toggle("active",x.dataset.mode===m));$("#modeEyebrow").textContent=m==="packing"?"DEPARTURE CHECK":"RETURN CHECK";$("#modeTitle").textContent=m==="packing"?"Prepare Your Loadout":"Recover Your Belongings";render()}
$$(".mode").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));$("#checkAll").onclick=()=>setAll(true);$("#clearAll").onclick=()=>setAll(false);
function openItem(id=null,cat="ESSENTIALS"){editingId=id;let x=id?state.items.find(i=>i.id===id):null;$("#itemModalTitle").textContent=x?"Edit Item":"Add Item";$("#deleteItem").classList.toggle("hidden",!x);$("#itemId").value=x?.id||"";$("#itemName").value=x?.name||"";$("#itemCategory").value=x?.category||cat;$("#itemQty").value=x?.qty||1;$("#itemModal").classList.remove("hidden");$("#itemName").focus()}
function closeItem(){$("#itemModal").classList.add("hidden");editingId=null}
$$("[data-close-item]").forEach(b=>b.onclick=closeItem);
$("#itemModal").onclick=e=>{if(e.target===$("#itemModal"))closeItem()};
$("#itemForm").onsubmit=async e=>{e.preventDefault();let v={id:$("#itemId").value||uid(),profileId,name:$("#itemName").value.trim(),category:$("#itemCategory").value,qty:Number($("#itemQty").value)||1};let i=state.items.findIndex(x=>x.id===v.id);if(i>=0)state.items[i]=v;else state.items.push(v);await save();closeItem();render()}
$("#deleteItem").onclick=async()=>{if(!editingId)return;state.items=state.items.filter(x=>x.id!==editingId);delete state.checks[checkedKey(editingId)];await save();closeItem();render()}
function openProfiles(){renderProfiles();$("#listModal").classList.remove("hidden")}
function renderProfiles(){$("#profiles").innerHTML=state.profiles.map(p=>{let n=state.items.filter(x=>x.profileId===p.id).length;return `<div class="profile-row ${p.id===profileId?"active":""}"><div><div class="profile-name">${esc(p.name)}</div><div class="profile-meta">${n} ITEMS</div></div><button class="secondary" onclick="switchProfile('${p.id}')">SELECT</button>${p.id!=="travel"?`<button class="danger" onclick="removeProfile('${p.id}')">×</button>`:""}</div>`}).join("")}
async function switchProfile(id){profileId=id;$("#listModal").classList.add("hidden");render()}
async function removeProfile(id){if(!confirm("Delete this packing list and its items?"))return;state.profiles=state.profiles.filter(p=>p.id!==id);state.items=state.items.filter(x=>x.profileId!==id);if(profileId===id)profileId="travel";await save();renderProfiles();render()}
$("#manageBtn").onclick=openProfiles;$$("[data-close]").forEach(b=>b.onclick=()=>$("#listModal").classList.add("hidden"));
$("#addProfile").onclick=async()=>{let name=$("#profileInput").value.trim();if(!name)return;let p={id:uid(),name};state.profiles.push(p);profileId=p.id;$("#profileInput").value="";await save();$("#listModal").classList.add("hidden");render()}
$("#newTripBtn").onclick=()=>{profileId=state.profiles[0]?.id||"travel";mode="packing";setMode("packing");openItem()}
$("#finishBtn").onclick=()=>{let items=activeItems(),done=items.filter(x=>isChecked(x.id)).length;if(items.length&&done===items.length){alert(mode==="packing"?"PACKING COMPLETE — LOADOUT VERIFIED.":"RETURN CHECK COMPLETE — ALL BELONGINGS ACCOUNTED FOR.")}else alert(`${items.length-done} item${items.length-done===1?"":"s"} still unverified.`)}
async function init(){await openDB();state.profiles=await read("profiles")||[{id:"travel",name:"Travel"}];state.items=await read("items")||[];state.checks=await read("checks")||{};
if(!state.items.length){state.items=[{id:uid(),profileId:"travel",name:"Passport",category:"ESSENTIALS",qty:1},{id:uid(),profileId:"travel",name:"Wallet",category:"ESSENTIALS",qty:1},{id:uid(),profileId:"travel",name:"Phone",category:"ELECTRONICS",qty:1},{id:uid(),profileId:"travel",name:"Chargers",category:"ELECTRONICS",qty:1},{id:uid(),profileId:"travel",name:"T-Shirts",category:"CLOTHING",qty:4},{id:uid(),profileId:"travel",name:"Underwear",category:"CLOTHING",qty:4},{id:uid(),profileId:"travel",name:"Toothbrush",category:"TOILETRIES",qty:1},{id:uid(),profileId:"travel",name:"Deodorant",category:"TOILETRIES",qty:1},{id:uid(),profileId:"travel",name:"Keys",category:"MISC",qty:1}];await save()}render()}
init();
