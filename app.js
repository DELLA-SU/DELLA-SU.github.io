const $ = (selector) => document.querySelector(selector);
const categoryNames = { top: '상의', outer: '아우터', bottom: '하의', shoes: '신발', accessory: '소품' };
const defaults = {
  top: { x: 30, y: 19, w: 40, h: 29 },
  outer: { x: 23, y: 17, w: 54, h: 43 },
  bottom: { x: 29, y: 42, w: 42, h: 37 },
  shoes: { x: 31, y: 84, w: 38, h: 14 },
  accessory: { x: 29, y: 12, w: 42, h: 22 }
};
const state = { db: null, items: [], looks: [], layers: [], selectedId: null, pendingDeleteId: null, filter: 'all' };

function uid() {
  return (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
}
function dbOpen() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('my-closet-v1', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('looks')) db.createObjectStore('looks', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function dbRequest(store, mode, method, value) {
  return new Promise((resolve, reject) => {
    const tx = state.db.transaction(store, mode);
    const request = tx.objectStore(store)[method](value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function showMessage(message) { $('#canvas-message').textContent = message; }
function persistCurrent() {
  try { localStorage.setItem('my-closet-current-v1', JSON.stringify(state.layers)); } catch (_) { /* Private browsing can disable storage. */ }
}
function loadCurrent() {
  try {
    const stored = JSON.parse(localStorage.getItem('my-closet-current-v1') || '[]');
    state.layers = Array.isArray(stored) ? stored.filter(layer => state.items.some(item => item.id === layer.id)) : [];
  } catch (_) { state.layers = []; }
}
function itemById(id) { return state.items.find(item => item.id === id); }
function layerById(id) { return state.layers.find(layer => layer.id === id); }
function drawWardrobe() {
  const list = $('#wardrobe-list');
  list.replaceChildren();
  const items = state.items.filter(item => state.filter === 'all' || item.category === state.filter);
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-closet';
    const icon = document.createElement('span'); icon.className = 'empty-icon'; icon.textContent = '✿';
    const title = document.createElement('strong'); title.textContent = state.items.length ? '이 종류의 옷은 아직 없어' : '아직 텅 빈 옷장이야';
    const copy = document.createElement('p'); copy.textContent = state.items.length ? '다른 종류를 보거나 새 옷을 추가해줘.' : '첫 번째 옷 사진을 올리고 코디를 시작해봐.';
    empty.append(icon, title, copy); list.append(empty);
  }
  for (const item of items) {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'item-card';
    card.classList.toggle('selected', !!layerById(item.id));
    card.setAttribute('aria-label', `${item.name} ${layerById(item.id) ? '벗기' : '입히기'}`);
    const photo = document.createElement('span'); photo.className = 'item-photo';
    const image = document.createElement('img'); image.src = item.cutout || item.original; image.alt = item.name;
    photo.append(image);
    const footer = document.createElement('span'); footer.className = 'item-card-footer';
    const name = document.createElement('span'); name.textContent = item.name;
    const number = document.createElement('span'); number.textContent = categoryNames[item.category] || '옷';
    footer.append(name, number); card.append(photo, footer);
    card.addEventListener('click', () => toggleItem(item.id));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'item-delete'; remove.textContent = '×'; remove.title = `${item.name} 삭제`;
    remove.addEventListener('click', async event => { event.stopPropagation(); await deleteItem(item.id); });
    const wrapper = document.createElement('div'); wrapper.style.position = 'relative'; wrapper.append(card, remove); list.append(wrapper);
  }
  $('#item-count').textContent = `${state.items.length} items`;
}
function toggleItem(id) {
  const existing = layerById(id);
  if (existing) {
    state.layers = state.layers.filter(layer => layer.id !== id);
    state.selectedId = state.layers.at(-1)?.id || null;
    showMessage('옷을 벗겼어요.');
  } else {
    const item = itemById(id); if (!item) return;
    if (item.category !== 'accessory') state.layers = state.layers.filter(layer => itemById(layer.id)?.category !== item.category);
    state.layers.push({ id, ...defaults[item.category], scale: 100 });
    state.selectedId = id;
    showMessage(`${item.name}을(를) 배치했어요. 드래그해서 위치를 조절해줘.`);
  }
  persistCurrent(); renderLayers(); drawWardrobe();
}
function renderLayers() {
  const host = $('#garment-layers'); host.replaceChildren();
  for (const layer of state.layers) {
    const item = itemById(layer.id); if (!item) continue;
    const image = document.createElement('img');
    image.src = item.cutout || item.original; image.alt = `${item.name} 착용 미리보기`;
    image.className = 'garment-layer'; image.classList.toggle('active', layer.id === state.selectedId);
    image.draggable = false; image.dataset.id = layer.id;
    const scale = Number(layer.scale) / 100;
    image.style.left = `${layer.x + layer.w * (1 - scale) / 2}%`;
    image.style.top = `${layer.y + layer.h * (1 - scale) / 2}%`;
    image.style.width = `${layer.w * scale}%`;
    image.style.height = `${layer.h * scale}%`;
    image.addEventListener('pointerdown', startDrag);
    host.append(image);
  }
  const selected = layerById(state.selectedId);
  $('#scale-range').disabled = !selected;
  $('#scale-range').value = selected?.scale || 100;
  $('#scale-output').textContent = `${selected?.scale || 100}%`;
}
function startDrag(event) {
  const id = event.currentTarget.dataset.id;
  const layer = layerById(id); if (!layer) return;
  state.selectedId = id;
  document.querySelectorAll('.garment-layer').forEach(node => node.classList.toggle('active', node.dataset.id === id));
  $('#scale-range').disabled = false;
  $('#scale-range').value = layer.scale;
  $('#scale-output').textContent = `${layer.scale}%`;
  const image = event.currentTarget;
  const start = { px: event.clientX, py: event.clientY, x: layer.x, y: layer.y };
  const figureRect = $('#figure').getBoundingClientRect();
  image.setPointerCapture(event.pointerId); image.classList.add('dragging');
  image.addEventListener('pointermove', function move(moveEvent) {
    if (!image.hasPointerCapture(moveEvent.pointerId)) return;
    layer.x = Math.max(-30, Math.min(100, start.x + (moveEvent.clientX - start.px) / figureRect.width * 100));
    layer.y = Math.max(-30, Math.min(100, start.y + (moveEvent.clientY - start.py) / figureRect.height * 100));
    const scale = Number(layer.scale) / 100;
    image.style.left = `${layer.x + layer.w * (1 - scale) / 2}%`;
    image.style.top = `${layer.y + layer.h * (1 - scale) / 2}%`;
  });
  image.addEventListener('pointerup', () => { image.classList.remove('dragging'); persistCurrent(); }, { once: true });
}
function deleteItem(id) {
  const item = itemById(id); if (!item) return;
  state.pendingDeleteId = id;
  $('#delete-item-name').textContent = `'${item.name}'`;
  openDialog('delete-dialog');
}
async function confirmDelete() {
  const id = state.pendingDeleteId; if (!id) return;
  await dbRequest('items', 'readwrite', 'delete', id);
  state.items = state.items.filter(entry => entry.id !== id);
  state.layers = state.layers.filter(layer => layer.id !== id);
  if (state.selectedId === id) state.selectedId = null;
  state.pendingDeleteId = null;
  closeDialog('delete-dialog');
  persistCurrent(); renderLayers(); drawWardrobe(); showMessage('옷 사진만 옷장에서 삭제했어요. 기본 캐릭터는 그대로예요.');
}
function openDialog(id) { document.getElementById(id).showModal(); }
function closeDialog(id) { document.getElementById(id).close(); }
function readFileAsDataURL(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
function loadImage(url) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url; }); }

async function makeCutout(original, removeBackground) {
  const image = await loadImage(original);
  const maxEdge = 1500, ratio = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(image.naturalWidth * ratio); canvas.height = Math.round(image.naturalHeight * ratio);
  const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (!removeBackground) return canvas.toDataURL('image/png');
  const w = canvas.width, h = canvas.height, data = context.getImageData(0, 0, w, h), pixels = data.data;
  const cornerPoints = [[2,2],[w-3,2],[2,h-3],[w-3,h-3]].map(([x,y]) => (y*w+x)*4);
  const corner = [0,1,2].map(channel => Math.round(cornerPoints.reduce((sum, index) => sum + pixels[index+channel], 0) / 4));
  const cornerVariation = Math.max(...cornerPoints.map(index => Math.hypot(pixels[index]-corner[0], pixels[index+1]-corner[1], pixels[index+2]-corner[2])));
  const alreadyTransparent = cornerPoints.some(index => pixels[index+3] < 20);
  if (alreadyTransparent) return canvas.toDataURL('image/png');
  if (cornerVariation > 48) throw new Error('배경이 복잡해서 자동으로 지우기 어려워요. 단색 배경 사진이나 투명 PNG를 사용해줘.');
  const threshold = 49, visited = new Uint8Array(w*h), queue = new Int32Array(w*h); let head = 0, tail = 0;
  function add(x,y) {
    const p = y*w+x; if (visited[p]) return; visited[p] = 1;
    const i = p*4, distance = Math.hypot(pixels[i]-corner[0], pixels[i+1]-corner[1], pixels[i+2]-corner[2]);
    if (distance <= threshold) queue[tail++] = p;
  }
  for (let x=0;x<w;x++){add(x,0);add(x,h-1);} for(let y=0;y<h;y++){add(0,y);add(w-1,y);}
  while(head<tail){const p=queue[head++], x=p%w, y=(p/w)|0; pixels[p*4+3]=0; if(x>0)add(x-1,y);if(x<w-1)add(x+1,y);if(y>0)add(x,y-1);if(y<h-1)add(x,y+1);}
  context.putImageData(data,0,0); return canvas.toDataURL('image/png');
}
async function addGarment(event) {
  event.preventDefault();
  const file = $('#garment-file').files[0], error = $('#upload-error'), submit = $('#upload-submit'); error.textContent = '';
  if (!file) { error.textContent = '사진을 골라줘.'; return; }
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 12*1024*1024) { error.textContent = 'JPG, PNG, WEBP 사진을 12MB 이하로 올려줘.'; return; }
  submit.disabled = true; submit.textContent = '사진 준비 중…';
  try {
    const original = await readFileAsDataURL(file);
    const cutout = await makeCutout(original, $('#remove-background').checked);
    const item = { id: uid(), name: $('#garment-name').value.trim() || file.name.replace(/\.[^.]+$/,''), category: $('#garment-category').value, original, cutout, createdAt: Date.now() };
    await dbRequest('items','readwrite','put',item); state.items.unshift(item);
    closeDialog('upload-dialog'); $('#upload-form').reset(); $('#upload-preview').hidden = true;
    drawWardrobe(); toggleItem(item.id); showMessage('새 옷을 추가했어요. 위치와 크기를 조절해줘.');
  } catch (problem) { error.textContent = problem?.message || '사진을 저장하지 못했어요. 저장 공간을 확인해줘.'; }
  finally { submit.disabled = false; submit.textContent = '옷장에 넣기 ↗'; }
}
function saveLook() {
  if (!state.layers.length) { showMessage('먼저 옷을 하나 이상 입혀줘.'); return; }
  $('#look-name').value = `오늘의 코디 ${state.looks.length+1}`;
  openDialog('save-dialog');
}
async function confirmSaveLook(event) {
  event.preventDefault();
  const name = $('#look-name').value.trim(); if (!name) return;
  const look = { id:uid(), name, layers: structuredClone(state.layers), createdAt:Date.now() };
  try { await dbRequest('looks','readwrite','put',look); state.looks.unshift(look); showMessage('코디를 저장했어요 ♡'); drawLooks(); }
  catch (_) { showMessage('코디를 저장하지 못했어요.'); }
  closeDialog('save-dialog');
}
function drawLooks() {
  const list = $('#saved-list'); list.replaceChildren();
  if (!state.looks.length) { const empty=document.createElement('p'); empty.className='saved-empty'; empty.textContent='아직 저장한 코디가 없어요. 옷을 입혀보고 ♡ 버튼을 눌러줘.'; list.append(empty); return; }
  for(const look of state.looks){
    const card=document.createElement('div');card.className='saved-card';
    const label=document.createElement('span');label.textContent=look.name;
    const date=document.createElement('small');date.textContent=new Date(look.createdAt).toLocaleDateString('ko-KR');label.append(date);
    const load=document.createElement('button');load.type='button';load.textContent='불러오기';load.addEventListener('click',()=>{state.layers=look.layers.filter(layer=>itemById(layer.id)).map(layer=>({...layer}));state.selectedId=state.layers.at(-1)?.id||null;persistCurrent();renderLayers();drawWardrobe();closeDialog('saved-dialog');showMessage(`${look.name} 코디를 불러왔어요.`);});
    const remove=document.createElement('button');remove.type='button';remove.textContent='삭제';remove.addEventListener('click',async()=>{await dbRequest('looks','readwrite','delete',look.id);state.looks=state.looks.filter(entry=>entry.id!==look.id);drawLooks();});
    card.append(label,load,remove);list.append(card);
  }
}
async function init() {
  $('#look-date').textContent = new Date().toLocaleDateString('ko-KR', { year:'numeric',month:'2-digit',day:'2-digit' });
  try { state.db=await dbOpen(); state.items=(await dbRequest('items','readonly','getAll')).sort((a,b)=>b.createdAt-a.createdAt); state.looks=(await dbRequest('looks','readonly','getAll')).sort((a,b)=>b.createdAt-a.createdAt); loadCurrent(); }
  catch (_) { showMessage('이 브라우저에서 저장소를 열 수 없어요.'); }
  renderLayers(); drawWardrobe(); drawLooks();
  $('#add-clothes').addEventListener('click',()=>openDialog('upload-dialog'));
  $('#tool-upload').addEventListener('click',()=>openDialog('upload-dialog'));
  $('#open-closet').addEventListener('click',()=>$('#closet-panel').scrollIntoView({behavior:'smooth'}));
  $('#tool-closet').addEventListener('click',()=>$('#closet-panel').scrollIntoView({behavior:'smooth'}));
  $('#show-saved').addEventListener('click',()=>openDialog('saved-dialog'));
  $('#show-help').addEventListener('click',()=>openDialog('help-dialog'));
  $('#tool-save').addEventListener('click',saveLook);
  $('#tool-move').addEventListener('click',()=>showMessage('옷을 드래그해서 원하는 위치로 옮겨줘.'));
  $('#new-look').addEventListener('click',()=>{if(state.layers.length)openDialog('new-dialog');else showMessage('옷을 골라 새 코디를 시작해봐.');});
  $('#confirm-new').addEventListener('click',()=>{state.layers=[];state.selectedId=null;persistCurrent();renderLayers();drawWardrobe();closeDialog('new-dialog');showMessage('새 코디를 시작해봐.');});
  $('#tool-remove').addEventListener('click',()=>{if(state.selectedId)toggleItem(state.selectedId);else showMessage('먼저 벗길 옷을 선택해줘.');});
  $('#tool-fit').addEventListener('click',()=>{const layer=layerById(state.selectedId);if(!layer){showMessage('먼저 옷을 선택해줘.');return;}Object.assign(layer,defaults[itemById(layer.id).category],{scale:100});persistCurrent();renderLayers();showMessage('옷의 위치와 크기를 초기화했어요.');});
  $('#scale-range').addEventListener('input',event=>{const layer=layerById(state.selectedId);if(!layer)return;layer.scale=Number(event.target.value);$('#scale-output').textContent=`${layer.scale}%`;renderLayers();persistCurrent();});
  document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{state.filter=tab.dataset.category;document.querySelectorAll('.tab').forEach(button=>button.classList.toggle('active',button===tab));drawWardrobe();}));
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>closeDialog(button.dataset.close)));
  $('#confirm-delete').addEventListener('click',confirmDelete);
  $('#save-form').addEventListener('submit',confirmSaveLook);
  $('#garment-file').addEventListener('change',event=>{const file=event.target.files[0];if(!file)return;$('#upload-preview').hidden=false;$('#preview-image').src=URL.createObjectURL(file);$('#preview-filename').textContent=file.name;if(!$('#garment-name').value)$('#garment-name').value=file.name.replace(/\.[^.]+$/,'');});
  $('#upload-form').addEventListener('submit',addGarment);
}
init();
