const $ = (selector) => document.querySelector(selector);
const categoryNames = { top: '상의', outer: '아우터', bottom: '하의', shoes: '신발', accessory: '소품' };
const aiCategories = { top: 'tops', outer: 'tops', bottom: 'bottoms' };
const state = { db: null, items: [], looks: [], currentItemId: null, result: null, busy: false, pendingDeleteId: null, filter: 'all' };
const localApi = 'http://127.0.0.1:4319';
const isLocalSite = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
const apiBase = isLocalSite ? location.origin : localApi;

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function dbOpen() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('my-closet-v1');
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
    const request = value === undefined ? tx.objectStore(store)[method]() : tx.objectStore(store)[method](value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function showMessage(message) { $('#canvas-message').textContent = message; }
async function checkServer() {
  const badge = $('#fit-status');
  try {
    const response = await fetch(`${apiBase}/api/status`, { cache: 'no-store', signal: AbortSignal.timeout(3500) });
    if (!response.ok) throw new Error('server');
    const status = await response.json();
    badge.textContent = status.available ? '이 Mac의 AI 피팅 연결됨' : 'AI 모델 파일 없음';
    badge.classList.toggle('offline', !status.available);
    return status.available;
  } catch (_) {
    badge.textContent = isLocalSite ? 'AI 피팅 서버 꺼짐' : '이 화면에서 AI 연결 불가';
    badge.classList.add('offline');
    return false;
  }
}
function itemById(id) { return state.items.find(item => item.id === id); }
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
async function persistCurrent() {
  if (!state.db) return;
  const store = state.db.objectStoreNames.contains('renders') ? 'renders' : 'looks';
  if (state.currentItemId && state.result) {
    await dbRequest(store, 'readwrite', 'put', { id: 'current', itemId: state.currentItemId, image: state.result });
  } else {
    await dbRequest(store, 'readwrite', 'delete', 'current');
  }
}
function renderResult() {
  const image = $('#tryon-result');
  image.hidden = !state.result;
  if (state.result) image.src = state.result;
  else image.removeAttribute('src');
  $('#figure').classList.toggle('busy', state.busy);
  $('#tool-save').disabled = !state.result || state.busy;
  $('#tool-fit').disabled = !state.result || state.busy;
}
function drawWardrobe() {
  const list = $('#wardrobe-list');
  list.replaceChildren();
  const items = state.items.filter(item => state.filter === 'all' || item.category === state.filter);
  if (!items.length) {
    const empty = document.createElement('div'); empty.className = 'empty-closet';
    const icon = document.createElement('span'); icon.className = 'empty-icon'; icon.textContent = '✿';
    const title = document.createElement('strong'); title.textContent = state.items.length ? '이 종류의 옷은 아직 없어' : '아직 텅 빈 옷장이야';
    const copy = document.createElement('p'); copy.textContent = state.items.length ? '다른 종류를 보거나 새 옷을 추가해줘.' : '첫 번째 옷 사진을 올리고 AI 피팅을 시작해봐.';
    empty.append(icon, title, copy); list.append(empty);
  }
  for (const item of items) {
    const supported = Boolean(aiCategories[item.category]);
    const card = document.createElement('button'); card.type = 'button'; card.className = 'item-card';
    card.classList.toggle('selected', state.currentItemId === item.id);
    card.disabled = state.busy;
    card.setAttribute('aria-label', `${item.name} ${supported ? 'AI로 입혀보기' : 'AI 피팅 준비 중'}`);
    const photo = document.createElement('span'); photo.className = 'item-photo';
    const image = document.createElement('img'); image.src = item.original; image.alt = item.name;
    photo.append(image);
    const footer = document.createElement('span'); footer.className = 'item-card-footer';
    const name = document.createElement('span'); name.textContent = item.name;
    const number = document.createElement('span'); number.textContent = supported ? (categoryNames[item.category] || '옷') : '준비 중';
    footer.append(name, number); card.append(photo, footer);
    card.addEventListener('click', () => tryOnItem(item));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'item-delete'; remove.textContent = '×'; remove.title = `${item.name} 삭제`;
    remove.addEventListener('click', event => { event.stopPropagation(); deleteItem(item.id); });
    const wrapper = document.createElement('div'); wrapper.style.position = 'relative'; wrapper.append(card, remove); list.append(wrapper);
  }
  $('#item-count').textContent = `${state.items.length} items`;
}
async function tryOnItem(item, retry = false) {
  if (!aiCategories[item.category]) { showMessage('신발과 소품 AI 피팅은 아직 지원하지 않아요.'); return; }
  if (state.busy) return;
  if (!await checkServer()) {
    showMessage(isLocalSite ? 'AI 피팅 서버가 꺼져 있어요. 이 Mac에서 start-tryon.command를 실행한 뒤 다시 눌러주세요.' : 'AI 피팅은 이 Mac에서 피팅 열기를 눌러 시험해 주세요. 서버도 켜져 있어야 해요.');
    return;
  }
  state.busy = true; renderResult(); drawWardrobe();
  const makeVariation = retry || (state.currentItemId === item.id && Boolean(state.result));
  const seed = makeVariation ? crypto.getRandomValues(new Uint32Array(1))[0] : 42;
  showMessage(`${item.name}을(를) AI로 입혀보는 중이에요. 이 Mac에서는 약 10~15분 걸릴 수 있어요.`);
  try {
    const response = await fetch(`${apiBase}/api/try-on`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garment: item.original, category: aiCategories[item.category], garment_photo_type: item.photoType || 'flat-lay', seed }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `AI 피팅 요청 실패 (${response.status})`);
    }
    const image = await readFileAsDataURL(await response.blob());
    state.currentItemId = item.id;
    state.result = image;
    await persistCurrent();
    showMessage(`${item.name} AI 착용 시험이 끝났어요. 원래 옷의 디테일이 달라졌는지 확인해줘.`);
  } catch (error) {
    showMessage(error instanceof TypeError ? 'AI 피팅 서버에 연결할 수 없어요. 이 Mac에서 start-tryon.command를 실행해 주세요.' : (error.message || 'AI 피팅에 실패했어요.'));
  } finally {
    state.busy = false; renderResult(); drawWardrobe();
  }
}
function openDialog(id) { document.getElementById(id).showModal(); }
function closeDialog(id) { document.getElementById(id).close(); }
function deleteItem(id) {
  const item = itemById(id); if (!item) return;
  state.pendingDeleteId = id;
  $('#delete-item-name').textContent = `'${item.name}'`;
  openDialog('delete-dialog');
}
async function confirmDelete() {
  const id = state.pendingDeleteId; if (!id) return;
  await dbRequest('items', 'readwrite', 'delete', id);
  state.items = state.items.filter(item => item.id !== id);
  if (state.currentItemId === id) { state.currentItemId = null; state.result = null; await persistCurrent(); }
  state.pendingDeleteId = null;
  closeDialog('delete-dialog'); renderResult(); drawWardrobe();
  showMessage('옷 사진을 옷장에서 삭제했어요. 이미 저장한 코디는 그대로예요.');
}
async function addGarment(event) {
  event.preventDefault();
  const file = $('#garment-file').files[0], error = $('#upload-error'), submit = $('#upload-submit');
  error.textContent = '';
  if (!file) { error.textContent = '사진을 골라줘.'; return; }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
    error.textContent = 'JPG, PNG, WEBP 사진을 12MB 이하로 올려줘.'; return;
  }
  submit.disabled = true; submit.textContent = '사진 저장 중…';
  try {
    const item = { id: uid(), name: $('#garment-name').value.trim() || file.name.replace(/\.[^.]+$/, ''), category: $('#garment-category').value, photoType: $('#garment-photo-type').value, original: await readFileAsDataURL(file), createdAt: Date.now() };
    await dbRequest('items', 'readwrite', 'put', item); state.items.unshift(item);
    closeDialog('upload-dialog'); $('#upload-form').reset(); $('#upload-preview').hidden = true;
    drawWardrobe();
    showMessage(`${item.name}을(를) 옷장에 저장했어요. 사진을 눌러 AI 피팅을 시작해줘.`);
  } catch (problem) { error.textContent = problem?.message || '사진을 저장하지 못했어요. 저장 공간을 확인해줘.'; }
  finally { submit.disabled = false; submit.textContent = '옷장에 넣기 ↗'; }
}
function saveLook() {
  if (!state.result) { showMessage('먼저 AI로 옷을 입혀줘.'); return; }
  $('#look-name').value = `오늘의 코디 ${state.looks.length + 1}`;
  openDialog('save-dialog');
}
async function confirmSaveLook(event) {
  event.preventDefault();
  const name = $('#look-name').value.trim(); if (!name) return;
  const look = { id: uid(), name, itemId: state.currentItemId, result: state.result, createdAt: Date.now() };
  try { await dbRequest('looks', 'readwrite', 'put', look); state.looks.unshift(look); drawLooks(); showMessage('착용 이미지를 저장했어요 ♡'); }
  catch (_) { showMessage('코디를 저장하지 못했어요. 저장 공간을 확인해줘.'); }
  closeDialog('save-dialog');
}
function drawLooks() {
  const list = $('#saved-list'); list.replaceChildren();
  if (!state.looks.length) { const empty = document.createElement('p'); empty.className = 'saved-empty'; empty.textContent = '아직 저장한 코디가 없어요. 옷을 입혀보고 ♡ 버튼을 눌러줘.'; list.append(empty); return; }
  for (const look of state.looks) {
    const card = document.createElement('div'); card.className = 'saved-card';
    const label = document.createElement('span'); label.textContent = look.name;
    const date = document.createElement('small'); date.textContent = new Date(look.createdAt).toLocaleDateString('ko-KR'); label.append(date);
    const load = document.createElement('button'); load.type = 'button'; load.textContent = look.result ? '불러오기' : '다시 입히기';
    load.addEventListener('click', async () => {
      closeDialog('saved-dialog');
      if (look.result) { state.currentItemId = look.itemId; state.result = look.result; await persistCurrent(); renderResult(); drawWardrobe(); showMessage(`${look.name} 코디를 불러왔어요.`); }
      else { const item = itemById(look.layers?.at(-1)?.id); if (item) await tryOnItem(item); else showMessage('이전 코디의 옷을 찾을 수 없어요.'); }
    });
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '삭제';
    remove.addEventListener('click', async () => { await dbRequest('looks', 'readwrite', 'delete', look.id); state.looks = state.looks.filter(entry => entry.id !== look.id); drawLooks(); });
    card.append(label, load, remove); list.append(card);
  }
}
async function clearCurrent() {
  state.currentItemId = null; state.result = null;
  await persistCurrent(); renderResult(); drawWardrobe();
  showMessage('기본 캐릭터로 돌아왔어요. 다른 옷을 골라줘.');
}
function downloadResult() {
  if (!state.result) return;
  const link = document.createElement('a'); link.href = state.result; link.download = 'my-closet-try-on.png'; link.click();
}
async function init() {
  $('#look-date').textContent = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  $('#local-link').hidden = isLocalSite;
  if (!isLocalSite) showMessage('이 화면은 미리보기예요. AI 피팅은 오른쪽 링크에서 열어주세요.');
  try {
    state.db = await dbOpen();
    state.items = (await dbRequest('items', 'readonly', 'getAll')).sort((a, b) => b.createdAt - a.createdAt);
    state.looks = (await dbRequest('looks', 'readonly', 'getAll')).filter(look => look.id !== 'current').sort((a, b) => b.createdAt - a.createdAt);
    const currentStore = state.db.objectStoreNames.contains('renders') ? 'renders' : 'looks';
    const current = await dbRequest(currentStore, 'readonly', 'get', 'current');
    if (current && itemById(current.itemId)) { state.currentItemId = current.itemId; state.result = current.image; }
  } catch (_) { showMessage('이 브라우저에서 저장소를 열 수 없어요.'); }
  renderResult(); drawWardrobe(); drawLooks(); checkServer();
  $('#add-clothes').addEventListener('click', () => openDialog('upload-dialog'));
  $('#tool-upload').addEventListener('click', () => openDialog('upload-dialog'));
  $('#open-closet').addEventListener('click', () => $('#closet-panel').scrollIntoView({ behavior: 'smooth' }));
  $('#tool-closet').addEventListener('click', () => $('#closet-panel').scrollIntoView({ behavior: 'smooth' }));
  $('#show-saved').addEventListener('click', () => openDialog('saved-dialog'));
  $('#show-help').addEventListener('click', () => openDialog('help-dialog'));
  $('#tool-save').addEventListener('click', saveLook);
  $('#tool-move').addEventListener('click', () => { const item = itemById(state.currentItemId); if (item) tryOnItem(item, true); else showMessage('옷장에서 입힐 옷을 골라줘.'); });
  $('#tool-fit').addEventListener('click', downloadResult);
  $('#new-look').addEventListener('click', () => { if (state.result) openDialog('new-dialog'); else showMessage('옷을 골라 새 코디를 시작해봐.'); });
  $('#confirm-new').addEventListener('click', async () => { await clearCurrent(); closeDialog('new-dialog'); });
  $('#tool-remove').addEventListener('click', clearCurrent);
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => { state.filter = tab.dataset.category; document.querySelectorAll('.tab').forEach(button => button.classList.toggle('active', button === tab)); drawWardrobe(); }));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog(button.dataset.close)));
  $('#confirm-delete').addEventListener('click', confirmDelete);
  $('#save-form').addEventListener('submit', confirmSaveLook);
  $('#garment-file').addEventListener('change', event => { const file = event.target.files[0]; if (!file) return; $('#upload-preview').hidden = false; $('#preview-image').src = URL.createObjectURL(file); $('#preview-filename').textContent = file.name; if (!$('#garment-name').value) $('#garment-name').value = file.name.replace(/\.[^.]+$/, ''); });
  $('#upload-form').addEventListener('submit', addGarment);
}
init();
