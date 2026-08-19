const DB="diet-tracker-db", VER=1, STORE="app";
let db, selectedDate=key(new Date()), activeMeal=null, editingFood=null, addingToMeal=null;
let targets={calories:2400,protein:160,carbs:300,fat:70,water:2.5};
let foods=[
 {id:"egg",name:"Egg",serving:50,calories:72,protein:6.3,carbs:.4,fat:4.8,fiber:0,sugar:.2,sodium:71,calcium:28,iron:.9,potassium:69},
 {id:"chicken",name:"Chicken breast",serving:100,calories:165,protein:31,carbs:0,fat:3.6,fiber:0,sugar:0,sodium:74,calcium:15,iron:1,potassium:256},
 {id:"rice",name:"Cooked white rice",serving:100,calories:130,protein:2.7,carbs:28,fat:.3,fiber:.4,sugar:.1,sodium:1,calcium:10,iron:.2,potassium:35},
 {id:"banana",name:"Banana",serving:100,calories:89,protein:1.1,carbs:22.8,fat:.3,fiber:2.6,sugar:12.2,sodium:1,calcium:5,iron:.3,potassium:358},
 {id:"apple",name:"Apple",serving:100,calories:52,protein:.3,carbs:13.8,fat:.2,fiber:2.4,sugar:10.4,sodium:1,calcium:6,iron:.1,potassium:107},
 {id:"bread",name:"Brown bread",serving:100,calories:247,protein:13,carbs:41,fat:4.2,fiber:6,sugar:5,sodium:450,calcium:150,iron:2.5,potassium:200}
];

const $=id=>document.getElementById(id);
function key(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function uid(){return crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random()}
function blankDay(){return {id:uid(),water:0,meals:[]}}
function getDaySync(){return window.currentDay||blankDay()}

function openDB(){return new Promise((res,rej)=>{let r=indexedDB.open(DB,VER);r.onupgradeneeded=()=>{let d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:"id"})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function get(id){return new Promise((res,rej)=>{let r=db.transaction(STORE,"readonly").objectStore(STORE).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function put(v){return new Promise((res,rej)=>{let r=db.transaction(STORE,"readwrite").objectStore(STORE).put(v);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function boot(){
 db=await openDB();
 const cfg=await get("config"); if(cfg){targets=cfg.targets||targets;foods=cfg.foods?.length?cfg.foods:foods}
 await loadDay(); render();
}
async function loadDay(){
 let d=await get("day:"+selectedDate);

 // Migrate days created by the earlier UTC-based date key.
 // In positive UTC offsets, those records were stored one calendar day early.
 if(!d){
   const legacyDate=dateObj();
   legacyDate.setDate(legacyDate.getDate()-1);
   const legacyKey=key(legacyDate);
   const legacy=await get("day:"+legacyKey);
   if(legacy){
     d={...legacy,id:"day:"+selectedDate};
     await put(d);
   }
 }

 if(!d){d=blankDay();d.id="day:"+selectedDate;await put(d)}
 window.currentDay=d;
}
async function save(){await put(window.currentDay);await put({id:"config",targets,foods})}

function dateObj(){let [y,m,d]=selectedDate.split("-").map(Number);return new Date(y,m-1,d)}
function renderDate(){
 let d=dateObj(), names=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
 $("dateLabel").textContent=d.toLocaleDateString("en-US",{month:"short",day:"numeric"}).toUpperCase();
 $("dayLabel").textContent=names[d.getDay()];
}
function totals(){
 let t={calories:0,protein:0,carbs:0,fat:0,fiber:0,sugar:0,sodium:0,calcium:0,iron:0,potassium:0};
 getDaySync().meals.forEach(m=>m.items.forEach(i=>Object.keys(t).forEach(k=>t[k]+=(i[k]||0))));
 return t;
}
function setBar(id,v,target){$(id).style.width=Math.min(100,target?100*v/target:0)+"%"}
function renderSummary(){
 let t=totals();
 [["calories","calorieValue","calorieBar","kcal"],["protein","proteinValue","proteinBar","g"],["carbs","carbValue","carbBar","g"],["fat","fatValue","fatBar","g"]].forEach(([k,val,bar,u])=>{$(val).textContent=`${round(t[k])} / ${targets[k]} ${u}`;setBar(bar,t[k],targets[k])});
 ["fiber","sugar","sodium","calcium","iron","potassium"].forEach(k=>$(k+"Value").textContent=round(t[k])+" "+(["sodium","calcium","potassium"].includes(k)?"mg":"g"));
 renderWater();
}
function renderWater(){
 let liters=getDaySync().water/1000;$("waterValue").textContent=`${round(liters)} / ${targets.water} L`;
 let n=Math.max(1,Math.ceil(targets.water*4));$("waterGlasses").innerHTML="";
 for(let i=0;i<n;i++){let x=document.createElement("i");x.className="glass"+(i<Math.round(getDaySync().water/250)?" filled":"");$("waterGlasses").appendChild(x)}
}
function renderMeals(){
 const wrap=$("meals");wrap.innerHTML="";
 if(!getDaySync().meals.length){wrap.innerHTML='<div class="meal"><div class="empty">No meals yet. Add your first meal for today.</div></div>';return}
 getDaySync().meals.forEach(m=>{
  let box=document.createElement("article");box.className="meal";
  let mt=m.items.reduce((a,x)=>a+(x.calories||0),0);
  box.innerHTML=`<div class="meal-head"><div><span class="meal-name">${esc(m.name)}</span>${m.time?`<span class="meal-time">${m.time}</span>`:""}</div><div class="meal-actions"><span class="meal-total">${round(mt)} kcal</span><button class="small-btn add-item">+ Food</button><button class="small-btn delete-meal">Delete</button></div></div>`;
  if(!m.items.length)box.insertAdjacentHTML("beforeend",'<div class="empty">Empty meal — add food.</div>');
  m.items.forEach((i,idx)=>{
   let row=document.createElement("div");row.className="food-row";
   row.innerHTML=`<div><b>${esc(i.name)}</b><div class="food-meta">${round(i.amount)} g</div></div><div class="food-kcal">${round(i.calories)} kcal</div><div class="food-macro">${round(i.protein)}g P</div><div class="food-macro">${round(i.carbs)}g C</div><button class="small-btn remove-item">Remove</button>`;
   row.querySelector(".remove-item").onclick=async()=>{m.items.splice(idx,1);await save();render()};
   box.appendChild(row);
  });
  box.querySelector(".add-item").onclick=()=>{addingToMeal=m.id;openAddFood()};
  box.querySelector(".delete-meal").onclick=async()=>{getDaySync().meals=getDaySync().meals.filter(x=>x.id!==m.id);await save();render()};
  wrap.appendChild(box);
 })
}
function render(){renderDate();renderSummary();renderMeals()}
function round(x){return Math.round(x*10)/10}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}

function modal(id,on=true){$(id).classList.toggle("hidden",!on)}
$("prevDay").onclick=async()=>{let d=dateObj();d.setDate(d.getDate()-1);selectedDate=key(d);await loadDay();render()}
$("nextDay").onclick=async()=>{let d=dateObj();d.setDate(d.getDate()+1);selectedDate=key(d);await loadDay();render()}
$("todayBtn").onclick=async()=>{selectedDate=key(new Date());await loadDay();render()}

$("addMealBtn").onclick=()=>{ $("mealName").value="";$("mealTime").value="";modal("mealModal") }
$("mealForm").onsubmit=async e=>{e.preventDefault();getDaySync().meals.push({id:uid(),name:$("mealName").value,time:$("mealTime").value,items:[]});await save();modal("mealModal",false);render()}

document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>modal(b.dataset.close,false))
$("detailsToggle").onclick=()=>{$("nutritionDetails").classList.toggle("open")}
document.querySelectorAll("[data-water]").forEach(b=>b.onclick=async()=>{getDaySync().water+=Number(b.dataset.water);await save();render()})
$("resetWater").onclick=async()=>{getDaySync().water=0;await save();render()}

function openAddFood(){
 $("addFoodSearch").value="";renderFoodPicker();modal("addFoodModal")
}
function renderFoodPicker(){
 let q=$("addFoodSearch").value.toLowerCase(),list=$("addFoodList");list.innerHTML="";
 foods.filter(f=>f.name.toLowerCase().includes(q)).forEach(f=>{
  let x=document.createElement("div");x.className="library-food";x.innerHTML=`<div><strong>${esc(f.name)}</strong><small>${f.calories} kcal · ${f.protein}g protein / ${f.serving}g</small></div><div class="library-food-actions"><button class="small-btn">Add</button></div>`;
  x.querySelector("button").onclick=()=>{activeFood=f;modal("addFoodModal",false);$("quantityTitle").textContent=f.name;$("quantityInput").value=f.serving;updateQuantityPreview();modal("quantityModal")};list.appendChild(x)
 })
}
$("addFoodSearch").oninput=renderFoodPicker
$("foodSearch").oninput=renderLibrary

let activeFood=null;
function updateQuantityPreview(){
 if(!activeFood)return;
 let q=Number($("quantityInput").value)||0,scale=q/activeFood.serving;
 $("quantityPreview").innerHTML=`${round(activeFood.calories*scale)} kcal · ${round(activeFood.protein*scale)}g protein · ${round(activeFood.carbs*scale)}g carbs · ${round(activeFood.fat*scale)}g fat`;
}
$("quantityInput").oninput=updateQuantityPreview
$("quantityForm").onsubmit=async e=>{
 e.preventDefault();if(!activeFood||!addingToMeal)return;
 let q=Number($("quantityInput").value),scale=q/activeFood.serving;
 let item={...activeFood,id:uid(),amount:q};
 ["calories","protein","carbs","fat","fiber","sugar","sodium","calcium","iron","potassium"].forEach(k=>item[k]=round((activeFood[k]||0)*scale));
 delete item.serving;
 let meal=getDaySync().meals.find(m=>m.id===addingToMeal);meal.items.push(item);
 await save();modal("quantityModal",false);activeFood=null;addingToMeal=null;render();
}

$("foodLibraryBtn").onclick=()=>{renderLibrary();modal("foodModal")}
function renderLibrary(){
 let q=$("foodSearch").value.toLowerCase(),list=$("foodList");list.innerHTML="";
 foods.filter(f=>f.name.toLowerCase().includes(q)).forEach(f=>{
  let x=document.createElement("div");x.className="library-food";x.innerHTML=`<div><strong>${esc(f.name)}</strong><small>${f.serving}g · ${f.calories} kcal · ${f.protein}g protein</small></div><div class="library-food-actions"><button class="small-btn edit">Edit</button><button class="small-btn del">Delete</button></div>`;
  x.querySelector(".edit").onclick=()=>editFood(f);x.querySelector(".del").onclick=async()=>{if(confirm("Delete this food?")){foods=foods.filter(x=>x.id!==f.id);await save();renderLibrary()}};list.appendChild(x)
 })
}
$("newFoodBtn").onclick=()=>editFood(null)
function editFood(f){
 editingFood=f;$("foodEditorTitle").textContent=f?"Edit Food":"Create Food";
 let vals={name:"",serving:100,calories:0,protein:0,carbs:0,fat:0,fiber:0,sugar:0,sodium:0,calcium:0,iron:0,potassium:0,...(f||{})};
 $("foodName").value=vals.name;$("foodServing").value=vals.serving;$("fCal").value=vals.calories;$("fProtein").value=vals.protein;$("fCarbs").value=vals.carbs;$("fFat").value=vals.fat;$("fFiber").value=vals.fiber;$("fSugar").value=vals.sugar;$("fSodium").value=vals.sodium;$("fCalcium").value=vals.calcium;$("fIron").value=vals.iron;$("fPotassium").value=vals.potassium;
 modal("foodEditorModal")
}
$("foodForm").onsubmit=async e=>{e.preventDefault();let f={id:editingFood?.id||uid(),name:$("foodName").value,serving:+$("foodServing").value,calories:+$("fCal").value,protein:+$("fProtein").value,carbs:+$("fCarbs").value,fat:+$("fFat").value,fiber:+$("fFiber").value,sugar:+$("fSugar").value,sodium:+$("fSodium").value,calcium:+$("fCalcium").value,iron:+$("fIron").value,potassium:+$("fPotassium").value};if(editingFood)foods=foods.map(x=>x.id===f.id?f:x);else foods.push(f);await save();modal("foodEditorModal",false);renderLibrary();modal("foodModal")}

$("settingsBtn").onclick=()=>{["calories","protein","carbs","fat","water"].forEach(k=>$("t"+k[0].toUpperCase()+k.slice(1)).value=targets[k]);modal("settingsModal")}
$("settingsForm").onsubmit=async e=>{e.preventDefault();targets={calories:+$("tCal").value,protein:+$("tProtein").value,carbs:+$("tCarbs").value,fat:+$("tFat").value,water:+$("tWater").value};await save();modal("settingsModal",false);render()}
$("copyDayBtn").onclick=async()=>{let d=dateObj();d.setDate(d.getDate()-1);let old=await get("day:"+key(d));if(!old)return alert("No previous day to copy.");let copy=JSON.parse(JSON.stringify(old));copy.id="day:"+selectedDate;copy.meals.forEach(m=>m.id=uid());await put(copy);await loadDay();render()}
$("clearDayBtn").onclick=async()=>{if(!confirm("Clear all food and water for this day?"))return;window.currentDay=blankDay();window.currentDay.id="day:"+selectedDate;await save();render()}

boot();
