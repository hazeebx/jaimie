const DB="SupplyInventoryDB",VERSION=1,STORE="data";let db;let filter="all";let editing=null;
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const state={items:[],shopping:[]};
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,VERSION);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:"key"})};r.onsuccess=()=>{db=r.result;resolve()};r.onerror=()=>reject(r.error)})}
function read(key){return new Promise((res,rej)=>{const r=db.transaction(STORE,"readonly").objectStore(STORE).get(key);r.onsuccess=()=>res(r.result?.value);r.onerror=()=>rej(r.error)})}
function write(key,value){return new Promise((res,rej)=>{const r=db.transaction(STORE,"readwrite").objectStore(STORE).put({key,value});r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function id(){return crypto.randomUUID()}
function icon(cat){return cat==="groceries"?"✦":"◇"}
async function saveState(){await write("items",state.items);await write("shopping",state.shopping)}
async function load(){state.items=await read("items")||[];state.shopping=await read("shopping")||[];render()}
function render(){
  const visible=state.items.filter(x=>filter==="all"||x.category===filter);
  $("#inventoryGrid").innerHTML=visible.length?visible.map(card).join(""):`<div class="empty">NO SUPPLIES LOGGED — ADD YOUR FIRST ITEM</div>`;
  $("#shoppingList").innerHTML=state.shopping.length?state.shopping.map(shopRow).join(""):`<div class="shop-empty">SHOPPING QUEUE CLEAR</div>`;
  const low=state.items.filter(x=>Number(x.qty)<=Number(x.min)).length;
  $("#totalItems").textContent=state.items.length;$("#groceryCount").textContent=state.items.filter(x=>x.category==="groceries").length;
  $("#toiletryCount").textContent=state.items.filter(x=>x.category==="toiletries").length;$("#lowCount").textContent=low;
  $("#shoppingCount").textContent=state.shopping.filter(x=>!x.done).length;$("#shoppingBadge").textContent=state.shopping.filter(x=>!x.done).length;
}
function card(x){const low=Number(x.qty)<=Number(x.min), pct=x.min>0?Math.min(100,Number(x.qty)/Number(x.min)*100):100;
return `<article class="item-card ${low?"low":""}">
<div class="item-top"><div><div class="item-icon">${icon(x.category)}</div><div class="item-name">${esc(x.name)}</div><div class="category">${x.category}</div></div></div>
<div class="qty">${fmt(x.qty)} <span>${x.unit}</span></div>
<div class="stockbar"><i style="width:${pct}%"></i></div>
<div class="item-bottom"><span class="min">MIN ${fmt(x.min)} ${x.unit}</span><div class="item-actions">
<button class="mini" onclick="changeQty('${x.id}',-1)">−</button><button class="mini" onclick="changeQty('${x.id}',1)">+</button>
<button class="mini" onclick="editItem('${x.id}')">EDIT</button>${low?`<button class="mini" onclick="addLow('${x.id}')">SHOP</button>`:""}</div></div></article>`}
function shopRow(x){return `<div class="shop-row ${x.done?"done":""}"><button class="check-btn" onclick="toggleShop('${x.id}')">${x.done?"✓":""}</button><div class="shop-name">${esc(x.name)}</div><div class="shop-qty">${fmt(x.qty)} ${x.unit}</div><div class="shop-actions"><button class="mini" onclick="buyShop('${x.id}')">ADD TO INV</button><button class="mini danger" onclick="removeShop('${x.id}')">×</button></div></div>`}
function fmt(n){return Number.isInteger(Number(n))?Number(n):Number(n).toFixed(2).replace(/0+$/,"").replace(/\.$/,"")}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function openItem(item=null){editing=item;$("#modal").classList.remove("hidden");$("#modalTitle").textContent=item?"Edit Item":"Add Item";$("#deleteBtn").classList.toggle("hidden",!item);
$("#editId").value=item?.id||"";$("#itemName").value=item?.name||"";$("#itemCategory").value=item?.category||"groceries";$("#itemUnit").value=item?.unit||"pcs";$("#itemQty").value=item?.qty??1;$("#itemMin").value=item?.min??0;$("#itemNotes").value=item?.notes||"";$("#itemName").focus()}
function closeItem(){$("#modal").classList.add("hidden");editing=null}
$("#addBtn").onclick=()=>openItem();$("#closeModal").onclick=closeItem;$("#cancelBtn").onclick=closeItem;
$("#modal").onclick=e=>{if(e.target===$("#modal"))closeItem()};
$("#itemForm").onsubmit=async e=>{e.preventDefault();const v={id:$("#editId").value||id(),name:$("#itemName").value.trim(),category:$("#itemCategory").value,unit:$("#itemUnit").value,qty:Number($("#itemQty").value),min:Number($("#itemMin").value),notes:$("#itemNotes").value.trim()};
const i=state.items.findIndex(x=>x.id===v.id);if(i>=0)state.items[i]=v;else state.items.push(v);await saveState();closeItem();render()};
$("#deleteBtn").onclick=async()=>{if(editing&&confirm(`Delete ${editing.name}?`)){state.items=state.items.filter(x=>x.id!==editing.id);await saveState();closeItem();render()}};
async function changeQty(id,delta){const x=state.items.find(x=>x.id===id);if(!x)return;x.qty=Math.max(0,Number(x.qty)+delta);await saveState();render()}
function editItem(id){openItem(state.items.find(x=>x.id===id))}
async function addLow(id){const x=state.items.find(x=>x.id===id);if(!x)return;if(!state.shopping.some(s=>s.name.toLowerCase()===x.name.toLowerCase()&&!s.done)){state.shopping.push({id:id(),name:x.name,qty:Math.max(1,Number(x.min)-Number(x.qty)),unit:x.unit,done:false});await saveState();render();showShopping()}}
function showShopping(){$(".tab.active").classList.remove("active");document.querySelector('[data-view="shopping"]').classList.add("active");$("#inventoryView").classList.add("hidden");$("#shoppingView").classList.remove("hidden")}
function showInventory(){$(".tab.active").classList.remove("active");document.querySelector('[data-view="inventory"]').classList.add("active");$("#shoppingView").classList.add("hidden");$("#inventoryView").classList.remove("hidden")}
$$(".tab").forEach(b=>b.onclick=()=>b.dataset.view==="shopping"?showShopping():showInventory());
$$(".filter").forEach(b=>b.onclick=()=>{$$(".filter").forEach(x=>x.classList.remove("active"));b.classList.add("active");filter=b.dataset.category;render()});
$("#addShoppingBtn").onclick=()=>{$("#shoppingModal").classList.remove("hidden");$("#shopName").focus()};
$$("[data-close-shopping]").forEach(b=>b.onclick=()=>$("#shoppingModal").classList.add("hidden"));
$("#shoppingModal").onclick=e=>{if(e.target===$("#shoppingModal"))$("#shoppingModal").classList.add("hidden")};
$("#shoppingForm").onsubmit=async e=>{e.preventDefault();state.shopping.push({id:id(),name:$("#shopName").value.trim(),qty:Number($("#shopQty").value)||1,unit:$("#shopUnit").value,done:false});await saveState();e.target.reset();$("#shoppingModal").classList.add("hidden");render()};
async function toggleShop(id){const x=state.shopping.find(x=>x.id===id);if(x)x.done=!x.done;await saveState();render()}
async function removeShop(id){state.shopping=state.shopping.filter(x=>x.id!==id);await saveState();render()}
async function buyShop(id){const x=state.shopping.find(x=>x.id===id);if(!x)return;let existing=state.items.find(i=>i.name.toLowerCase()===x.name.toLowerCase());if(existing)existing.qty=Number(existing.qty)+Number(x.qty);else state.items.push({id:id(),name:x.name,category:"groceries",unit:x.unit,qty:x.qty,min:0,notes:""});state.shopping=state.shopping.filter(s=>s.id!==id);await saveState();render()}
openDB().then(load);
