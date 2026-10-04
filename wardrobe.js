/* Online wardrobe: photo based local prototype. */
const DB_NAME = 'tomorrows-wardrobe-v1';
const DB_VERSION = 1;
const STORES = ['profile', 'items', 'looks', 'plans'];
const CATS = [
  {id:'tops', label:'상의', emoji:'👕'},
  {id:'bottoms', label:'하의', emoji:'👖'},
  {id:'dresses', label:'원피스', emoji:'👗'},
  {id:'shoes', label:'신발', emoji:'👟'},
  {id:'accessories', label:'소품', emoji:'🧢'}
];
const SKINS = ['#f3c8ab','#dca885','#b97757','#8e5a45','#f7d8c1'];
const HAIRS = ['#32232c','#5a342d','#9a623e','#c6955e','#dec691'];
const EMPTY_SLOTS = {tops:null,bottoms:null,dresses:null,shoes:null,accessories:null};
const $ = (selector, root=document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayKey = (d=new Date()) => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const tomorrowKey = () => { const d=new Date(); d.setDate(d.getDate()+1); return todayKey(d); };
const cat = id => CATS.find(c => c.id===id);
const uid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random().toString(36).slice(2);
const app = $('#app');
const toastEl = $('#toast');
let db;
let toastTimer;
let state = {profile:null,items:[],looks:[],plans:[],tab:'studio',filter:'all',search:'',view:'front',tryonResult:null,calendarMonth:new Date(new Date().getFullYear(),new Date().getMonth(),1),chosenDate:tomorrowKey()};

function openDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      for(const name of STORES) if(!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name,{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
function getAll(store){
  return new Promise((resolve,reject)=>{
    const req=db.transaction(store,'readonly').objectStore(store).getAll();
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
function put(store,value){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
function remove(store,id){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
async function refresh(){
  const [profiles,items,looks,plans]=await Promise.all(STORES.map(getAll));
  state.profile=profiles.find(p=>p.id==='me')||null;
  state.items=items.sort((a,b)=>b.createdAt-a.createdAt);
  state.looks=looks.sort((a,b)=>b.createdAt-a.createdAt);
  state.plans=plans;
  render();
}
function toast(message){
  toastEl.textContent=message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toastEl.classList.remove('show'),3200);
}
function shell(inner,onboarding=false){
  return '<div class="window-bar"><div class="lights"><i class="light"></i><i class="light"></i><i class="light"></i></div><div class="brand">내일의 옷장</div><div class="window-title">WARDROBE.EXE</div><div class="bar-spacer"></div><div class="bar-note">'+(onboarding?'STEP 01 / 전신 사진 등록':'내일 입을 옷, 오늘 밤에 골라요')+'</div></div>'+inner;
}
function nav(){
  const tabs=[['studio','코디하기'],['wardrobe','내 옷장'],['looks','코디 앨범'],['calendar','캘린더'],['settings','설정']];
  return '<nav class="topnav" aria-label="주 메뉴">'+tabs.map(([id,label])=>'<button class="nav-btn '+(state.tab===id?'active':'')+'" type="button" data-tab="'+id+'">'+label+'</button>').join('')+'<button class="primary nav-action" type="button" data-action="open-upload">＋ 옷 추가</button></nav>';
}
function slotItem(slots,key){ return state.items.find(item=>item.id===slots?.[key])||null; }
function selection(){ return {...EMPTY_SLOTS,...(state.profile?.selection||{})}; }
function figureMarkup(profile=state.profile,slots=selection(),prefix='figure',view=state.view,realisticImage=null){
  const photo=realisticImage||profile?.bodyImages?.[view];
  if(photo)return '<div class="real-photo"><img src="'+photo+'" alt="'+(realisticImage?'AI로 옷을 입힌 실사 이미지':'업로드한 '+({front:'정면',side:'측면',back:'뒷면'}[view]||'전신')+' 사진')+'"></div>';
  return '<div class="real-photo sample-photo"><img src="./sample-fashion-model.png" alt="사진 업로드 전 보여주는 예시 패션 모델"><span class="sample-label">예시 모델 · 전신 사진을 넣으면 내 사진으로 바뀌어요</span></div>';
}
function viewButtons(){
  if(!state.profile?.bodyImages?.front)return '';
  return '<div class="view-toggle">'+[['front','정면'],['side','측면'],['back','뒷면']].map(([id,label])=>'<button class="tiny-btn '+(state.view===id?'active':'')+'" type="button" data-action="set-view" data-view="'+id+'" '+(!state.profile.bodyImages[id]?'disabled':'')+'>'+label+'</button>').join('')+'</div>';
}

function onboarding(){
  const draft={height:165,weight:55,skin:SKINS[0],hair:HAIRS[0],bodyImages:{}};
  app.innerHTML=shell('<section class="onboard"><div class="onboard-copy"><div class="eyebrow">STEP 01 / START HERE</div><h1>먼저, 내<br>전신 사진을 등록해요</h1><p>키와 몸무게, 정면 전신 사진을 등록해요. 내 옷 사진을 올리면 전신 사진에 자연스럽게 입혀 볼 수 있어요.</p><form id="onboard-form" class="card onboard-form form-stack"><div class="field-row"><div class="field"><label for="height">키 · cm</label><input id="height" name="height" type="number" inputmode="decimal" min="100" max="220" step="0.1" value="165" required></div><div class="field"><label for="weight">몸무게 · kg</label><input id="weight" name="weight" type="number" inputmode="decimal" min="25" max="250" step="0.1" value="55" required></div></div><div class="field"><label for="closet-name">내 옷장 이름</label><input id="closet-name" name="closetName" maxlength="30" value="내일의 옷장" required></div><div class="field"><label for="body-front">정면 전신 사진 · 필수</label><input id="body-front" type="file" accept="image/*" required><small>머리부터 발끝까지 보이는 사진을 사용해 주세요. SNS 캡처의 검은 상·하단은 자동으로 제외해요.</small></div><div class="field-row"><div class="field"><label for="body-side">측면 전신 · 선택</label><input id="body-side" type="file" accept="image/*"></div><div class="field"><label for="body-back">뒷면 전신 · 선택</label><input id="body-back" type="file" accept="image/*"></div></div><div class="create-row"><button class="primary" type="submit">사진 저장하고 시작하기 →</button><span class="hint">입력값은 이 브라우저에 저장돼요.</span></div></form></div><div class="onboard-preview" id="onboard-preview">'+figureMarkup(draft,EMPTY_SLOTS,'onboard','front')+'<div class="sticker">MY<br>LOOK ♡</div></div></section>',true);
  const update=()=>{
    draft.height=Number($('#height').value)||165;
    draft.weight=Number($('#weight').value)||55;
    $('#onboard-preview').innerHTML=figureMarkup(draft,EMPTY_SLOTS,'onboard','front')+'<div class="sticker">MY<br>LOOK ♡</div>';
  };
  $('#onboard-form').addEventListener('input',update);
  for(const [view,id] of [['front','body-front'],['side','body-side'],['back','body-back']]){
    $('#'+id).addEventListener('change',async event=>{
      const file=event.target.files?.[0];
      if(!file)return;
      try{
        draft.bodyImages[view]=await compressImage(file,1800,.88,true);
        update();
        toast(({front:'정면',side:'측면',back:'뒷면'}[view])+' 사진을 등록했어요.');
      }catch(error){console.error(error);toast('전신 사진을 읽지 못했어요.');}
    });
  }
  $('#onboard-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!event.target.reportValidity())return;
    const height=Number($('#height').value),weight=Number($('#weight').value);
    if(height<100||height>220||weight<25||weight>250){toast('키와 몸무게를 확인해 주세요.');return;}
    if(!draft.bodyImages.front&&$('#body-front').files?.[0])draft.bodyImages.front=await compressImage($('#body-front').files[0],1800,.88,true);
    if(!draft.bodyImages.front){toast('정면 전신 사진을 먼저 넣어주세요.');return;}
    state.profile={id:'me',height,weight,skin:draft.skin,hair:draft.hair,bodyImages:draft.bodyImages,closetName:$('#closet-name').value.trim()||'내일의 옷장',selection:{...EMPTY_SLOTS},createdAt:Date.now()};
    await put('profile',state.profile);
    state.tab='studio';
    render();
    toast('사진을 저장했어요. 이제 옷 사진을 추가해 주세요.');
    openUpload();
  });
}

function studio(){
  const slots=selection();
  const filtered=state.items.filter(item=>state.filter==='all'||item.category===state.filter).slice(0,12);
  const itemCards=filtered.length?filtered.map(item=>miniItem(item,slots[item.category]===item.id)).join(''):'<div class="empty-mini">아직 여기에 옷이 없어요.<br>옷 사진을 넣으면 전신 사진에 합성할 수 있어요.</div>';
  const slotRows=CATS.map(c=>{
    const item=slotItem(slots,c.id);
    return '<div class="slot"><span class="dot">'+c.emoji+'</span><span>'+c.label+'</span><strong>'+(item?esc(item.name):'선택 전')+'</strong></div>';
  }).join('');
  const controls=[
    ['accessories','소품'],['tops','상의'],['bottoms','하의'],['shoes','신발']
  ].map(([key,label])=>'<div class="cycle left '+key+'"><button type="button" data-action="cycle" data-category="'+key+'" data-dir="-1" aria-label="'+label+' 이전">‹</button><span>'+label+'</span></div><div class="cycle right '+key+'"><span>'+label+'</span><button type="button" data-action="cycle" data-category="'+key+'" data-dir="1" aria-label="'+label+' 다음">›</button></div>').join('');
  return '<div class="page studio"><aside class="card side-panel"><div class="eyebrow">01 / MY CLOSET</div><h2>내 옷장</h2><p class="subhead">옷을 고른 뒤 실사 입혀보기를 누르면 내 사진에 합성돼요. PC에서는 끌어서 선택할 수도 있어요.</p><div class="filter-row">'+filterButtons()+'</div><div class="item-list">'+itemCards+'</div><div class="side-actions"><button class="primary" type="button" data-action="open-upload">＋ 옷 추가</button><button class="pill" type="button" data-tab="wardrobe">전체 보기</button></div></aside><section class="stage-panel" id="stage"><div class="stage-head"><div><div class="eyebrow">02 / DRESSING ROOM</div><h2>'+esc(state.profile.closetName)+'</h2></div>'+(state.profile.bodyImages?.front?viewButtons():'<span class="mono">EXAMPLE MODEL</span>')+'</div><div class="stage-area"><div class="stage-doll"><div class="floor"></div>'+figureMarkup(state.profile,slots,'main',state.view,state.view==='front'?state.tryonResult?.image:null)+'</div></div>'+controls+'<div class="stage-foot">' +(state.profile.bodyImages?.front?'<small>옷을 고른 뒤 실사 입혀보기를 눌러 합성해요.</small>':'<small>전신 사진을 올리면 내 사진으로 코디할 수 있어요.</small>')+ '<div class="stage-buttons"><button class="secondary" type="button" data-action="reset-look">다시 입히기</button>'+(state.profile.bodyImages?.front?'<button class="secondary" type="button" data-action="run-tryon">실사 입혀보기 ✦</button>':'')+'<button class="primary" type="button" data-action="save-look">이 코디 저장 ♡</button></div></div></section><aside class="info-panel"><div class="card"><div class="eyebrow">TODAYS LOOK</div><h3>'+((state.profile.bodyImages?.front&&!state.tryonResult)?'합성할 옷':'지금 입은 옷')+'</h3><div class="slot-list">'+slotRows+'</div></div><div class="card"><div class="eyebrow">NEXT STEP</div><h3>내일 입어볼까요?</h3><p>마음에 든 코디를 저장하고 달력에서 날짜를 골라두세요.</p><button class="secondary" type="button" data-tab="calendar">캘린더 보기 →</button></div><button class="feature-link" type="button" data-tab="settings">✦ 내 전신 사진과 기본 정보 수정하기 →</button></aside></div>';
}
function miniItem(item,selected=false){
  return '<div class="item-card '+(selected?'selected':'')+'" draggable="true" data-drag-id="'+item.id+'"><button class="item-remove" type="button" data-action="delete-item" data-id="'+item.id+'" aria-label="'+esc(item.name)+' 삭제">×</button><div class="item-thumb" data-action="wear" data-id="'+item.id+'"><img src="'+item.image+'" alt=""></div><div class="item-meta" data-action="wear" data-id="'+item.id+'"><span class="item-name">'+esc(item.name)+'</span><span class="item-kind">'+cat(item.category).label+'</span></div></div>';
}
function filterButtons(){
  return [['all','전체'],...CATS.map(c=>[c.id,c.label])].map(([id,label])=>'<button class="chip '+(state.filter===id?'active':'')+'" type="button" data-filter="'+id+'">'+label+'</button>').join('');
}
function wardrobe(){
  const needle=state.search.trim().toLocaleLowerCase();
  const items=state.items.filter(item=>(state.filter==='all'||state.filter===item.category)&&item.name.toLocaleLowerCase().includes(needle));
  return '<div class="page"><div class="page-head"><div><div class="eyebrow">MY WARDROBE / '+state.items.length+' PIECES</div><h1 class="heading">내 옷장</h1><p>내 옷 사진을 모아두고 전신 사진에 합성해 봐요.</p></div><button class="primary" type="button" data-action="open-upload">＋ 옷 사진 올리기</button></div><div class="gallery-tools"><input class="search-input" id="search-items" type="search" placeholder="옷 이름 검색" value="'+esc(state.search)+'" aria-label="옷 이름 검색"><div class="filter-row">'+filterButtons()+'</div></div>'+(items.length?'<div class="gallery-grid">'+items.map(item=>'<article class="gallery-card"><div class="item-thumb"><img src="'+item.image+'" alt="'+esc(item.name)+'"></div><div class="gallery-card-body"><h3>'+esc(item.name)+'</h3><p>'+cat(item.category).label+'</p><div class="gallery-card-actions"><button class="tiny-btn" type="button" data-action="wear" data-id="'+item.id+'">선택하기</button><button class="tiny-btn danger" type="button" data-action="delete-item" data-id="'+item.id+'">삭제</button></div></div></article>').join('')+'</div>':emptyPage('🧺','옷장이 아직 비어 있어요','내 옷 사진을 올리면 코디 화면에서 바로 입혀볼 수 있어요.','옷 사진 올리기','open-upload'))+'</div>';
}
function emptyPage(icon,title,copy,button,action){
  return '<div class="empty-page"><div class="big">'+icon+'</div><h2>'+title+'</h2><p>'+copy+'</p><button class="primary" type="button" data-action="'+action+'">'+button+'</button></div>';
}
function lookVisual(look,prefix){
  if(look.realisticImage)return '<img class="look-photo" src="'+look.realisticImage+'" alt="실사 코디 결과">';
  const src=state.profile?.bodyImages?.front||'./sample-fashion-model.png';
  const pieces=CATS.map(c=>slotItem(look.slots,c.id)).filter(Boolean);
  return '<div class="look-composite"><img class="look-photo" src="'+src+'" alt="실사 합성 전 전신 사진"><div class="look-pieces">'+pieces.slice(0,3).map(item=>'<img src="'+item.image+'" alt="'+esc(item.name)+'">').join('')+'</div><span class="look-unrendered">합성 전 코디</span></div>';
}
function looks(){
  return '<div class="page"><div class="page-head"><div><div class="eyebrow">LOOK BOOK / '+state.looks.length+' SAVED</div><h1 class="heading">코디 앨범</h1><p>마음에 든 조합을 모아두고 다시 입혀보세요.</p></div><button class="primary" type="button" data-tab="studio">새 코디 만들기</button></div>'+(state.looks.length?'<div class="look-grid">'+state.looks.map(look=>'<article class="look-card"><div class="look-visual">'+lookVisual(look,'look-'+look.id)+'</div><div class="look-card-body"><h3>'+esc(look.name)+'</h3><p>'+esc(look.album||'내 코디')+' · '+new Date(look.createdAt).toLocaleDateString('ko-KR')+'</p><div class="look-actions"><button class="tiny-btn" type="button" data-action="apply-look" data-id="'+look.id+'">코디 불러오기</button><button class="tiny-btn" type="button" data-action="plan-look" data-id="'+look.id+'">달력에 넣기</button><button class="tiny-btn" type="button" data-action="share-look" data-id="'+look.id+'">공유</button><button class="tiny-btn danger" type="button" data-action="delete-look" data-id="'+look.id+'">삭제</button></div></div></article>').join('')+'</div>':emptyPage('💌','아직 저장한 코디가 없어요','옷을 선택한 다음 “이 코디 저장”을 눌러보세요.','코디하러 가기','go-studio'))+'</div>';
}
function calendar(){
  const year=state.calendarMonth.getFullYear(),month=state.calendarMonth.getMonth();
  const first=new Date(year,month,1),offset=first.getDay(),count=new Date(year,month+1,0).getDate();
  const days=['일','월','화','수','목','금','토'];
  const cells=[];
  for(let i=0;i<42;i++){
    const date=new Date(year,month,i-offset+1),key=todayKey(date),outside=date.getMonth()!==month;
    const plan=state.plans.find(p=>p.id===key),look=state.looks.find(l=>l.id===plan?.lookId);
    cells.push('<button class="day '+(outside?'muted-day ':'')+(key===todayKey()?'today ':'')+(key===state.chosenDate?'chosen':'')+'" type="button" data-action="choose-date" data-date="'+key+'" aria-label="'+key+(look?' '+esc(look.name):'')+'"><span class="day-num">'+date.getDate()+'</span>'+(look?'<span class="mini-look">'+lookVisual(look,'cal-'+i)+'</span><span class="mini-name">'+esc(look.name)+'</span>':'')+'</button>');
  }
  const dateLabel=new Date(state.chosenDate+'T12:00:00').toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'});
  const current=state.plans.find(p=>p.id===state.chosenDate);
  return '<div class="page"><div class="page-head"><div><div class="eyebrow">PLAN AHEAD</div><h1 class="heading">캘린더</h1><p>내일 입을 옷을 오늘 골라두세요.</p></div><button class="pill" type="button" data-action="choose-tomorrow">내일로 이동</button></div><div class="calendar-wrap"><section class="card calendar-main"><div class="calendar-toolbar"><button class="tiny-btn" type="button" data-action="month" data-dir="-1">‹ 이전 달</button><h2>'+year+'년 '+(month+1)+'월</h2><button class="tiny-btn" type="button" data-action="month" data-dir="1">다음 달 ›</button></div><div class="weekdays">'+days.map(d=>'<div>'+d+'</div>').join('')+'</div><div class="days">'+cells.join('')+'</div></section><aside class="card calendar-side"><div class="eyebrow">DAY PLAN</div><h3>'+dateLabel+'</h3><p class="hint">이 날짜에 입을 코디를 선택해 주세요.</p><select id="plan-select" aria-label="이 날짜의 코디"><option value="">코디를 선택하세요</option>'+state.looks.map(look=>'<option value="'+look.id+'" '+(current?.lookId===look.id?'selected':'')+'>'+esc(look.name)+'</option>').join('')+'</select><button class="primary" type="button" data-action="save-plan">계획 저장</button> '+(current?'<button class="plain" type="button" data-action="remove-plan">지우기</button>':'')+(state.looks.length?'':'<p class="hint">먼저 코디를 저장하면 여기에서 날짜에 넣을 수 있어요.</p>')+'</aside></div></div>';
}
function settings(){
  const p=state.profile;
  return '<div class="page"><div class="page-head"><div><div class="eyebrow">MY PHOTO / SETTINGS</div><h1 class="heading">내 사진 설정</h1><p>옷장 이름과 사진을 언제든 바꿀 수 있어요. 키와 몸무게는 기록용입니다.</p></div></div><div class="settings-grid"><section class="card settings-card"><h2>기본 정보</h2><form id="settings-form" class="form-stack"><div class="field"><label for="settings-name">옷장 이름</label><input id="settings-name" name="closetName" maxlength="30" value="'+esc(p.closetName)+'" required></div><div class="field-row"><div class="field"><label for="settings-height">키 · cm</label><input id="settings-height" name="height" type="number" min="100" max="220" step="0.1" value="'+p.height+'" required></div><div class="field"><label for="settings-weight">몸무게 · kg</label><input id="settings-weight" name="weight" type="number" min="25" max="250" step="0.1" value="'+p.weight+'" required></div></div><div class="field"><label for="settings-body-front">정면 전신 사진 · 실사 화면</label><input id="settings-body-front" type="file" accept="image/*"></div><div class="field-row"><div class="field"><label for="settings-body-side">측면 전신</label><input id="settings-body-side" type="file" accept="image/*"></div><div class="field"><label for="settings-body-back">뒷면 전신</label><input id="settings-body-back" type="file" accept="image/*"></div></div><button class="primary" type="submit">사진 정보 저장</button></form></section><section class="card settings-card"><h2>내 데이터</h2><p class="hint">현재 옷 사진과 코디는 이 브라우저에 저장됩니다. 다른 기기로 옮길 때는 백업 파일을 내보낸 뒤 다른 기기에서 가져오세요.</p><div class="setting-actions"><button class="secondary" type="button" data-action="export-data">백업 내보내기</button><button class="pill" type="button" data-action="import-data">백업 가져오기</button></div><p class="hint">자동으로 여러 기기에 동기화하려면 계정과 저장 서버 연결이 필요합니다.</p><hr style="border:0;border-top:1px solid #f0c6d6;margin:24px 0"><h2>실제 사진으로 입혀보기</h2><p class="hint">옷 사진과 전신 사진으로 실사 합성을 시험할 수 있어요. 로컬 오픈소스 AI 또는 별도로 연결한 FASHN AI를 선택할 수 있습니다.</p><button class="pill" type="button" data-action="open-tryon">실사 입혀보기 실험</button></section></div></div>';
}
function render(){
  if(!state.profile){onboarding();return;}
  const view={studio,wardrobe,looks,calendar,settings}[state.tab]||studio;
  app.innerHTML=shell(nav()+view());
  bindMain();
}

function modal(html){
  document.querySelector('.modal-backdrop')?.remove();
  const root=document.createElement('div');
  root.className='modal-backdrop';
  root.innerHTML='<div class="modal" role="dialog" aria-modal="true">'+html+'</div>';
  root.addEventListener('click',event=>{if(event.target===root||event.target.closest('[data-close-modal]'))root.remove();});
  document.body.append(root);
  root.querySelector('input,button,select')?.focus();
  return root;
}
function openUpload(){
  const root=modal('<div class="eyebrow">ADD TO WARDROBE</div><h2>내 옷 사진 넣기</h2><p>옷 한 벌이 잘 보이는 사진을 선택해 주세요. 여러 장도 한 번에 넣을 수 있어요.</p><form id="upload-form" class="form-stack"><div class="upload-box"><div class="big">📸</div><strong>옷 사진 선택</strong><br><input id="upload-files" type="file" accept="image/*" multiple required></div><div class="field"><label for="upload-category">옷 종류</label><select id="upload-category">'+CATS.map(c=>'<option value="'+c.id+'">'+c.emoji+' '+c.label+'</option>').join('')+'</select></div><div class="field"><label for="upload-name">옷 이름 · 선택</label><input id="upload-name" maxlength="45" placeholder="비워두면 사진 파일 이름 사용"></div><div class="progress" hidden><span></span></div><div class="modal-actions"><button class="pill" type="button" data-close-modal>취소</button><button class="primary" type="submit">옷장에 넣기</button></div></form>');
  $('#upload-form',root).addEventListener('submit',async event=>{
    event.preventDefault();
    const files=[...$('#upload-files',root).files];
    if(!files.length)return;
    const category=$('#upload-category',root).value;
    const custom=$('#upload-name',root).value.trim();
    const progress=$('.progress',root),bar=$('.progress span',root);
    progress.hidden=false;
    const submit=$('[type=submit]',root);submit.disabled=true;submit.textContent='사진 준비 중…';
    try{
      for(let i=0;i<files.length;i++){
        const image=await compressImage(files[i],1200,.86);
        const name=custom?(files.length>1?custom+' '+(i+1):custom):files[i].name.replace(/\.[^.]+$/,'').slice(0,45);
        await put('items',{id:uid(),name:name||cat(category).label,category,image,createdAt:Date.now()+i});
        bar.style.width=((i+1)/files.length*100)+'%';
      }
      root.remove();
      await refresh();
      toast(files.length+'개 옷을 옷장에 넣었어요.');
    }catch(error){
      submit.disabled=false;submit.textContent='옷장에 넣기';
      toast('사진을 저장하지 못했어요. 크기나 형식을 확인해 주세요.');
      console.error(error);
    }
  });
}
function screenshotCrop(bitmap){
  if(bitmap.height/bitmap.width<1.8)return null;
  const probe=document.createElement('canvas');
  probe.width=64;probe.height=Math.round(bitmap.height*64/bitmap.width);
  const context=probe.getContext('2d',{willReadFrequently:true});
  context.drawImage(bitmap,0,0,probe.width,probe.height);
  const pixels=context.getImageData(0,0,probe.width,probe.height).data;
  const darkRow=y=>{
    let dark=0;
    for(let x=0;x<probe.width;x++){
      const i=(y*probe.width+x)*4;
      if(Math.max(pixels[i],pixels[i+1],pixels[i+2])<50)dark++;
    }
    return dark/probe.width>.68;
  };
  let top=0,quiet=0;
  for(let y=0;y<Math.round(probe.height*.18);y++){
    if(darkRow(y)){top=y+1;quiet=0;}
    else if(++quiet>=3)break;
  }
  let bottom=probe.height;quiet=0;
  for(let y=probe.height-1;y>Math.round(probe.height*.65);y--){
    if(darkRow(y)){bottom=y;quiet=0;}
    else if(++quiet>=3)break;
  }
  if(top<probe.height*.025||probe.height-bottom<probe.height*.05||bottom-top<probe.height*.58)return null;
  const sourceTop=Math.round((top+1)*bitmap.height/probe.height);
  const sourceBottom=Math.round((bottom-1)*bitmap.height/probe.height);
  return {x:0,y:sourceTop,width:bitmap.width,height:sourceBottom-sourceTop};
}
async function compressImage(file,maxSide=1200,quality=.86,autoTrim=false){
  if(!file.type.startsWith('image/'))throw Error('Not an image');
  const bitmap=await createImageBitmap(file);
  const crop=autoTrim?screenshotCrop(bitmap):null;
  const source=crop||{x:0,y:0,width:bitmap.width,height:bitmap.height};
  const scale=Math.min(1,maxSide/Math.max(source.width,source.height));
  const width=Math.max(1,Math.round(source.width*scale)),height=Math.max(1,Math.round(source.height*scale));
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  canvas.getContext('2d').drawImage(bitmap,source.x,source.y,source.width,source.height,0,0,width,height);
  bitmap.close();
  return canvas.toDataURL('image/webp',quality);
}
async function saveSelection(slots){
  state.profile.selection=slots;
  state.tryonResult=null;
  await put('profile',state.profile);
  render();
}
async function wear(id){
  const item=state.items.find(i=>i.id===id);
  if(!item)return;
  const slots=selection();
  if(item.category==='dresses'){slots.tops=null;slots.bottoms=null;}
  if(item.category==='tops'||item.category==='bottoms')slots.dresses=null;
  slots[item.category]=item.id;
  await saveSelection(slots);
  toast(state.profile.bodyImages?.front?item.name+' 선택했어요. 실사 입혀보기로 합성해 보세요.':item.name+' 입혔어요.');
}
async function cycle(category,direction){
  const matches=state.items.filter(i=>i.category===category);
  if(!matches.length){toast(cat(category).label+' 사진을 먼저 올려주세요.');return;}
  const slots=selection();
  const index=matches.findIndex(i=>i.id===slots[category]);
  const next=index<0?(direction>0?0:matches.length-1):(index+direction+matches.length)%matches.length;
  await wear(matches[next].id);
}
function saveLook(){
  const slots=selection();
  if(!Object.values(slots).some(Boolean)){toast('먼저 옷을 선택해 주세요.');return;}
  const root=modal('<div class="eyebrow">SAVE THIS LOOK</div><h2>마음에 드는 코디예요 ♡</h2><p>이름을 붙여 앨범에 저장해두면 달력에도 넣을 수 있어요.</p><form id="look-form" class="form-stack"><div class="field"><label for="look-name">코디 이름</label><input id="look-name" maxlength="45" placeholder="예: 금요일 산책룩" required></div><div class="field"><label for="look-album">앨범 이름</label><input id="look-album" maxlength="30" value="내 코디"></div><div class="modal-actions"><button class="pill" type="button" data-close-modal>취소</button><button class="primary" type="submit">코디 저장</button></div></form>');
  $('#look-form',root).addEventListener('submit',async event=>{
    event.preventDefault();
    if(!event.target.reportValidity())return;
    await put('looks',{id:uid(),name:$('#look-name',root).value.trim(),album:$('#look-album',root).value.trim()||'내 코디',slots,realisticImage:state.tryonResult?.image||null,createdAt:Date.now()});
    root.remove();
    state.tab='looks';
    await refresh();
    toast('코디를 앨범에 저장했어요.');
  });
}
async function deleteItem(id){
  const item=state.items.find(i=>i.id===id);
  if(!item||!confirm('“'+item.name+'”을(를) 옷장에서 삭제할까요?'))return;
  await remove('items',id);
  const slots=selection();
  for(const key of Object.keys(slots))if(slots[key]===id)slots[key]=null;
  state.profile.selection=slots;
  await put('profile',state.profile);
  await refresh();
  toast('옷을 삭제했어요.');
}
async function deleteLook(id){
  const look=state.looks.find(l=>l.id===id);
  if(!look||!confirm('“'+look.name+'” 코디를 삭제할까요?'))return;
  await remove('looks',id);
  for(const plan of state.plans)if(plan.lookId===id)await remove('plans',plan.id);
  await refresh();
  toast('코디를 삭제했어요.');
}
async function shareLook(id){
  const look=state.looks.find(l=>l.id===id);
  if(!look)return;
  try{
    let blob;
    if(look.realisticImage)blob=await (await fetch(look.realisticImage)).blob();
    else{
      const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1450;
      const ctx=canvas.getContext('2d');
      ctx.fillStyle='#fff0f6';ctx.fillRect(0,0,900,1450);
      ctx.fillStyle='#663f70';ctx.font='bold 44px sans-serif';ctx.fillText(look.name,56,85,788);
      ctx.fillStyle='#ad688c';ctx.font='24px sans-serif';ctx.fillText('내일의 옷장 · 합성 전 코디',58,126);
      const photo=new Image();photo.src=state.profile?.bodyImages?.front||'./sample-fashion-model.png';await photo.decode();
      ctx.fillStyle='#fff';ctx.fillRect(55,155,790,1060);
      const scale=Math.min(760/photo.width,1020/photo.height);
      ctx.drawImage(photo,450-photo.width*scale/2,175,photo.width*scale,photo.height*scale);
      const pieces=CATS.map(c=>slotItem(look.slots,c.id)).filter(Boolean).slice(0,4);
      for(let i=0;i<pieces.length;i++){
        const item=pieces[i],image=new Image();image.src=item.image;await image.decode();
        const x=57+i*204,y=1240;
        ctx.fillStyle='#fff';ctx.fillRect(x,y,178,170);
        const fit=Math.min(150/image.width,125/image.height);
        ctx.drawImage(image,x+89-image.width*fit/2,y+6,image.width*fit,image.height*fit);
        ctx.fillStyle='#6a4b66';ctx.font='18px sans-serif';ctx.fillText(item.name,x+10,y+156,158);
      }
      blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    }
    if(!blob)throw Error('No image');
    const file=new File([blob],look.name+'.png',{type:'image/png'});
    if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:look.name});
    else{
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=look.name+'.png';a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),1000);
      toast('코디 이미지가 다운로드됐어요.');
    }
  }catch(error){
    if(error.name==='AbortError')return;
    const text=look.name+' · '+location.href;
    await navigator.clipboard?.writeText(text).catch(()=>{});
    toast('이미지 공유가 안 되어 코디 이름과 링크를 복사했어요.');
  }
}
function planLook(id){
  state.chosenDate=tomorrowKey();
  state.tab='calendar';
  render();
  $('#plan-select').value=id;
  toast('날짜를 골라 코디를 저장해 주세요.');
}
function savePlan(){
  const lookId=$('#plan-select')?.value;
  if(!lookId){toast('저장할 코디를 선택해 주세요.');return;}
  put('plans',{id:state.chosenDate,lookId}).then(refresh).then(()=>toast('달력에 코디를 저장했어요.'));
}
async function exportData(){
  const data={version:1,exportedAt:new Date().toISOString(),profile:state.profile,items:state.items,looks:state.looks,plans:state.plans};
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='내일의-옷장-백업.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  toast('백업 파일을 다운로드했어요.');
}
function importData(){
  const root=modal('<div class="eyebrow">RESTORE WARDROBE</div><h2>백업 가져오기</h2><p>백업 파일에 저장된 사진, 옷, 코디, 달력 계획으로 현재 데이터를 바꿉니다.</p><form id="import-form" class="form-stack"><div class="field"><label for="import-file">옷장 백업 JSON</label><input id="import-file" type="file" accept=".json,application/json" required></div><div class="modal-actions"><button class="pill" type="button" data-close-modal>취소</button><button class="primary" type="submit">가져오기</button></div></form>');
  $('#import-form',root).addEventListener('submit',async event=>{
    event.preventDefault();
    try{
      const file=$('#import-file',root).files[0];
      const data=JSON.parse(await file.text());
      if(data.version!==1||!data.profile||!Array.isArray(data.items)||!Array.isArray(data.looks)||!Array.isArray(data.plans))throw Error('Invalid backup');
      if(!Number.isFinite(Number(data.profile.height))||!Number.isFinite(Number(data.profile.weight)))throw Error('Invalid profile');
      if(data.items.some(item=>!item.id||!cat(item.category)||typeof item.image!=='string'||!item.image.startsWith('data:image/')))throw Error('Invalid items');
      if(data.looks.some(look=>!look.id||!look.slots)||data.plans.some(plan=>!plan.id||!plan.lookId))throw Error('Invalid plans');
      if(!confirm('현재 옷장 데이터를 백업 내용으로 바꿀까요?'))return;
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORES,'readwrite');
        for(const store of STORES)tx.objectStore(store).clear();
        tx.objectStore('profile').put({...data.profile,id:'me'});
        for(const [store,records] of [['items',data.items],['looks',data.looks],['plans',data.plans]])for(const record of records)tx.objectStore(store).put(record);
        tx.oncomplete=resolve;
        tx.onerror=()=>reject(tx.error);
      });
      root.remove();state.tab='studio';await refresh();toast('백업을 가져왔어요.');
    }catch(error){console.error(error);toast('올바른 옷장 백업 파일인지 확인해 주세요.');}
  });
}
function openTryon(){
  if(!state.profile.bodyImages?.front){
    modal('<div class="eyebrow">PHOTO LOOKBOOK</div><h2>정면 전신 사진이 필요해요</h2><p>설정에서 머리부터 발끝까지 보이는 정면 사진을 넣으면 실사 화면을 사용할 수 있어요.</p><div class="modal-actions"><button class="primary" type="button" data-close-modal>확인</button></div>');
    return;
  }
  const selected=['tops','bottoms','dresses'].map(key=>slotItem(selection(),key)).filter(Boolean);
  if(!selected.length){toast('상의, 하의 또는 원피스를 먼저 골라주세요.');return;}
  const root=modal('<div class="eyebrow">PHOTO TRY-ON / EXPERIMENT</div><h2>내 사진에 옷 입혀보기</h2><p>선택한 옷 한 벌을 내 전신 사진에 합성합니다.</p><form id="tryon-form" class="form-stack"><div class="field"><label for="tryon-item">합성할 옷</label><select id="tryon-item">'+selected.map(item=>'<option value="'+item.id+'">'+esc(item.name)+'</option>').join('')+'</select></div><div class="field"><label for="tryon-engine">생성 방식</label><select id="tryon-engine"><option value="local">로컬 오픈소스 · 내 컴퓨터에서 처리</option><option value="cloud">FASHN AI · 유료 외부 서버에서 처리</option></select></div>'+(state.tryonResult?.image?'<label class="consent-row"><input id="tryon-continue" type="checkbox" checked><span>지금 보이는 합성 결과에 이어서 입히기 (상의 다음 하의 등). 여러 번 생성하면 얼굴·옷 디테일이 달라질 수 있어요.</span></label>':'')+'<div class="field" id="local-photo-type"><label for="tryon-photo-type">옷 사진 형태</label><select id="tryon-photo-type"><option value="flat-lay">옷만 찍은 사진</option><option value="model">사람이 입은 사진</option></select></div><div class="field" id="local-quality"><label for="tryon-steps">로컬 합성 단계</label><select id="tryon-steps"><option value="20">빠르게 · 20단계</option><option value="30">균형 · 30단계</option><option value="50">정밀 · 50단계 (오래 걸림)</option></select></div><label class="consent-row" id="cloud-consent-row" hidden><input id="tryon-consent" type="checkbox"><span>전신 사진과 옷 사진을 FASHN AI 서버로 보내는 데 동의합니다. 유료 API 크레딧이 사용됩니다.</span></label><div class="progress" hidden><span style="width:35%"></span></div><p id="tryon-status" class="hint">선택한 방식의 AI 서버가 연결되어 있어야 생성할 수 있어요.</p><div class="modal-actions"><button class="pill" type="button" data-close-modal>닫기</button><button class="primary" type="submit">실사 결과 만들기</button></div></form>');
  $('#tryon-engine',root).addEventListener('change',event=>{
    const cloud=event.target.value==='cloud';
    $('#local-photo-type',root).hidden=cloud;
    $('#local-quality',root).hidden=cloud;
    $('#cloud-consent-row',root).hidden=!cloud;
    $('#tryon-consent',root).required=cloud;
  });
  $('#tryon-form',root).addEventListener('submit',async event=>{
    event.preventDefault();
    if(!event.target.reportValidity())return;
    const item=state.items.find(i=>i.id===$('#tryon-item',root).value);
    if(!item)return;
    const cloud=$('#tryon-engine',root).value==='cloud';
    const button=$('[type=submit]',root),status=$('#tryon-status',root);
    button.disabled=true;
    status.textContent='AI 서버를 확인하고 있어요…';
    try{
      const health=await fetch('/api/health',{cache:'no-store'});
      const info=health.ok?await health.json():null;
      if(cloud&&!info?.cloud_ready)throw Error('FASHN_API_KEY가 설정된 로컬 AI 서버가 필요해요.');
      if(!cloud&&!info?.ready)throw Error('로컬 오픈소스 AI 서버가 필요해요. 공개 GitHub Pages에서는 직접 생성할 수 없습니다.');
      $('.progress',root).hidden=false;
      status.textContent=cloud?'FASHN AI가 실사 착용 이미지를 만들고 있어요…':'로컬 AI가 옷을 합성하고 있어요. 몇 분 걸릴 수 있어요.';
      const payload=cloud?{
        person_image:($('#tryon-continue',root)?.checked?state.tryonResult?.image:null)||state.profile.bodyImages.front,
        garment_image:item.image,
        external_photo_consent:true
      }:{
        person_image:($('#tryon-continue',root)?.checked?state.tryonResult?.image:null)||state.profile.bodyImages.front,
        garment_image:item.image,
        category:item.category==='dresses'?'one-pieces':item.category,
        garment_photo_type:$('#tryon-photo-type',root).value,
        num_timesteps:Number($('#tryon-steps',root).value)
      };
      const response=await fetch(cloud?'/api/cloud-tryon':'/api/tryon',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data=await response.json();
      if(!response.ok||!data.image)throw Error(data.error||'실사 결과를 만들지 못했어요.');
      state.tryonResult={image:data.image,itemId:item.id};
      state.view='front';
      root.remove();
      render();
      toast('실사 결과가 완성됐어요. 마음에 들면 코디 앨범에 저장하세요.');
    }catch(error){status.textContent=error.message||'오류가 생겼어요.';button.disabled=false;$('.progress',root).hidden=true;}
  });
}
function bindMain(){
  let identityPhotoChanged=false;
  app.onclick=async event=>{
    const tab=event.target.closest('[data-tab]');
    if(tab){state.tab=tab.dataset.tab;state.filter='all';state.search='';render();return;}
    const filter=event.target.closest('[data-filter]');
    if(filter){state.filter=filter.dataset.filter;render();return;}
    const actionEl=event.target.closest('[data-action]');
    if(!actionEl)return;
    const action=actionEl.dataset.action,id=actionEl.dataset.id;
    if(action==='open-upload')openUpload();
    else if(action==='wear')await wear(id);
    else if(action==='cycle')await cycle(actionEl.dataset.category,Number(actionEl.dataset.dir));
    else if(action==='delete-item')await deleteItem(id);
    else if(action==='reset-look')await saveSelection({...EMPTY_SLOTS});
    else if(action==='save-look')saveLook();
    else if(action==='apply-look'){
      const look=state.looks.find(l=>l.id===id);
      if(look){
        state.tab='studio';
        state.view='front';
        state.profile.selection={...EMPTY_SLOTS,...look.slots};
        state.tryonResult=look.realisticImage?{image:look.realisticImage,itemId:null}:null;
        await put('profile',state.profile);
        render();
        toast('저장한 코디를 다시 불러왔어요.');
      }
    }
    else if(action==='plan-look')planLook(id);
    else if(action==='set-view'){state.view=actionEl.dataset.view;render();}
    else if(action==='run-tryon')openTryon();
    else if(action==='share-look')await shareLook(id);
    else if(action==='delete-look')await deleteLook(id);
    else if(action==='month'){state.calendarMonth.setMonth(state.calendarMonth.getMonth()+Number(actionEl.dataset.dir));render();}
    else if(action==='choose-date'){state.chosenDate=actionEl.dataset.date;render();}
    else if(action==='choose-tomorrow'){state.chosenDate=tomorrowKey();state.calendarMonth=new Date(state.chosenDate+'T12:00:00');state.calendarMonth.setDate(1);render();}
    else if(action==='save-plan')savePlan();
    else if(action==='remove-plan'){await remove('plans',state.chosenDate);await refresh();toast('달력에서 지웠어요.');}
    else if(action==='go-studio'){state.tab='studio';render();}
    else if(action==='export-data')exportData();
    else if(action==='import-data')importData();
    else if(action==='open-tryon')openTryon();
  };
  $('#search-items')?.addEventListener('input',event=>{
    state.search=event.target.value;
    const start=event.target.selectionStart;
    render();
    $('#search-items')?.focus();
    $('#search-items')?.setSelectionRange(start,start);
  });
  for(const [view,id] of [['front','settings-body-front'],['side','settings-body-side'],['back','settings-body-back']]){
    $('#'+id)?.addEventListener('change',async event=>{
      const file=event.target.files?.[0];
      if(!file)return;
      try{
        state.profile.bodyImages={...(state.profile.bodyImages||{}),[view]:await compressImage(file,1800,.88,true)};
        if(view==='front')identityPhotoChanged=true;
        toast('전신 사진이 준비됐어요. 저장 버튼을 눌러주세요.');
      }catch(error){console.error(error);toast('전신 사진을 읽지 못했어요.');}
    });
  }
  $('#settings-form')?.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!event.target.reportValidity())return;
    state.profile.height=Number($('#settings-height').value);
    state.profile.weight=Number($('#settings-weight').value);
    state.profile.closetName=$('#settings-name').value.trim()||'내일의 옷장';
    state.view='front';state.tryonResult=null;
    await put('profile',state.profile);render();toast(identityPhotoChanged?'전신 사진을 저장했어요.':'옷장 정보를 저장했어요.');
  });
  const stage=$('#stage');
  if(stage){
    app.querySelectorAll('[data-drag-id]').forEach(card=>card.addEventListener('dragstart',event=>event.dataTransfer.setData('text/plain',card.dataset.dragId)));
    stage.addEventListener('dragover',event=>event.preventDefault());
    stage.addEventListener('drop',event=>{event.preventDefault();wear(event.dataTransfer.getData('text/plain'));});
  }
}
async function init(){
  try{db=await openDb();await refresh();}
  catch(error){
    console.error(error);
    app.innerHTML=shell('<div class="empty-page" style="margin:30px">'+
      '<h2>옷장을 열 수 없어요</h2><p>브라우저의 사이트 데이터 저장 권한을 확인한 뒤 새로고침해 주세요.</p></div>',true);
  }
}
init();
