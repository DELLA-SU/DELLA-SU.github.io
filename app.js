const CATEGORIES = [
  { id: 'top', label: '상의', icon: '👕' },
  { id: 'bottom', label: '하의', icon: '👖' },
  { id: 'outer', label: '아우터', icon: '🧥' },
  { id: 'dress', label: '원피스', icon: '👗' },
  { id: 'shoes', label: '신발', icon: '👟' },
  { id: 'bag', label: '가방', icon: '👜' },
  { id: 'accessory', label: '액세서리', icon: '✨' }
];

const $ = (selector) => document.querySelector(selector);
const state = { db: null, garments: [], looks: [], slots: {}, activeCategory: 'all', tomorrow: null, urls: new Map(), toastTimer: null, previewUrl: null };

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function id() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function category(idValue) { return CATEGORIES.find((item) => item.id === idValue); }
function garment(idValue) { return state.garments.find((item) => item.id === idValue); }
function imageUrl(item) {
  if (!state.urls.has(item.id)) state.urls.set(item.id, URL.createObjectURL(item.image));
  return state.urls.get(item.id);
}
function tomorrowDate() {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('cozy-closet', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('garments')) db.createObjectStore('garments', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('looks')) db.createObjectStore('looks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function databaseAction(storeName, mode, action) {
  if (!state.db) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
const getAll = (store) => databaseAction(store, 'readonly', (objectStore) => objectStore.getAll());
const getOne = (store, key) => databaseAction(store, 'readonly', (objectStore) => objectStore.get(key));
const putOne = (store, value) => databaseAction(store, 'readwrite', (objectStore) => objectStore.put(value));
const deleteOne = (store, key) => databaseAction(store, 'readwrite', (objectStore) => objectStore.delete(key));

function openWardrobe() {
  $('#wardrobe').classList.add('is-open');
  $('#drawer-scrim').hidden = false;
}
function closeWardrobe() {
  $('#wardrobe').classList.remove('is-open');
  $('#drawer-scrim').hidden = true;
}

function renderFilters() {
  const root = $('#category-filters');
  root.replaceChildren();
  [{ id: 'all', label: '전체' }, ...CATEGORIES].forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter${state.activeCategory === item.id ? ' is-active' : ''}`;
    button.textContent = item.label;
    button.setAttribute('aria-pressed', String(state.activeCategory === item.id));
    button.addEventListener('click', () => { state.activeCategory = item.id; renderFilters(); renderWardrobe(); });
    root.append(button);
  });
}

function renderWardrobe() {
  $('#garment-count').textContent = state.garments.length;
  const root = $('#garment-grid');
  root.replaceChildren();
  const filtered = state.garments.filter((item) => state.activeCategory === 'all' || item.category === state.activeCategory);
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-wardrobe';
    empty.innerHTML = '<span aria-hidden="true">✳</span><b>아직 옷이 없어요</b>첫 번째 옷 사진을 넣어볼까요?';
    root.append(empty);
    return;
  }
  filtered.forEach((item) => {
    const card = document.createElement('div');
    card.className = `garment-card${state.slots[item.category] === item.id ? ' is-selected' : ''}`;
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'garment-select';
    select.setAttribute('aria-label', `${item.name}, ${category(item.category).label} 코디에 넣기`);
    const photo = document.createElement('img');
    photo.src = imageUrl(item);
    photo.alt = item.name;
    const name = document.createElement('span');
    name.className = 'garment-name';
    name.textContent = item.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'garment-delete';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `${item.name} 삭제`);
    remove.addEventListener('click', () => removeGarment(item));
    select.addEventListener('click', () => selectGarment(item));
    select.append(photo, name);
    card.append(select, remove);
    root.append(card);
  });
}

function selectGarment(item) {
  if (item.category === 'dress') { delete state.slots.top; delete state.slots.bottom; }
  if (item.category === 'top' || item.category === 'bottom') delete state.slots.dress;
  state.slots[item.category] = item.id;
  state.activeCategory = item.category;
  renderAll();
  if (matchMedia('(max-width: 1000px)').matches) closeWardrobe();
  showToast(`${item.name} 코디에 넣었어요`);
}

function renderWorn() {
  const root = $('#worn-items');
  root.replaceChildren();
  ['bottom', 'shoes', 'top', 'dress', 'outer', 'bag', 'accessory'].forEach((slot) => {
    const item = garment(state.slots[slot]);
    if (!item) return;
    const photo = document.createElement('img');
    photo.className = `worn-item worn-${slot}`;
    photo.src = imageUrl(item);
    photo.alt = '';
    root.append(photo);
  });
}

function renderSlots() {
  const root = $('#outfit-slots');
  root.replaceChildren();
  CATEGORIES.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `slot${state.activeCategory === item.id ? ' is-active' : ''}`;
    const selected = garment(state.slots[item.id]);
    if (selected) {
      const photo = document.createElement('img');
      photo.src = imageUrl(selected);
      photo.alt = '';
      button.append(photo);
    } else {
      const icon = document.createElement('span');
      icon.className = 'slot-icon';
      icon.textContent = item.icon;
      icon.setAttribute('aria-hidden', 'true');
      button.append(icon);
    }
    const label = document.createElement('span');
    label.textContent = item.label;
    button.append(label);
    button.setAttribute('aria-label', `${item.label} 고르기${selected ? `, 현재 ${selected.name}` : ''}`);
    button.addEventListener('click', () => { state.activeCategory = item.id; renderFilters(); renderWardrobe(); renderSlots(); openWardrobe(); });
    root.append(button);
  });
}

function renderSelected() {
  const root = $('#selected-list');
  root.replaceChildren();
  const items = CATEGORIES.map((slot) => garment(state.slots[slot.id])).filter(Boolean);
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'selected-empty';
    empty.textContent = '아직 고른 옷이 없어요.\n옷장을 열고 하나씩 입혀보세요.';
    empty.style.whiteSpace = 'pre-line';
    root.append(empty);
    return;
  }
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'selected-item';
    const photo = document.createElement('img');
    photo.src = imageUrl(item);
    photo.alt = '';
    const text = document.createElement('span');
    text.textContent = item.name;
    const detail = document.createElement('small');
    detail.textContent = category(item.category).label;
    text.append(detail);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `${item.name} 코디에서 빼기`);
    remove.addEventListener('click', () => { delete state.slots[item.category]; renderAll(); });
    row.append(photo, text, remove);
    root.append(row);
  });
}

function renderLooks() {
  $('#look-count').textContent = state.looks.length;
  const root = $('#saved-looks');
  root.replaceChildren();
  if (!state.looks.length) {
    const empty = document.createElement('p');
    empty.className = 'saved-empty';
    empty.textContent = '아직 저장한 코디가 없어요. 마음에 드는 조합을 남겨보세요.';
    root.append(empty);
  }
  state.looks.forEach((look) => {
    const card = document.createElement('article');
    card.className = 'saved-look';
    const top = document.createElement('div');
    top.className = 'saved-look-top';
    const thumbs = document.createElement('div');
    thumbs.className = 'look-thumbs';
    Object.values(look.slots).map(garment).filter(Boolean).slice(0, 3).forEach((item) => {
      const image = document.createElement('img');
      image.src = imageUrl(item);
      image.alt = '';
      thumbs.append(image);
    });
    const text = document.createElement('div');
    text.className = 'look-text';
    const name = document.createElement('strong');
    name.textContent = look.name;
    const detail = document.createElement('small');
    detail.textContent = state.tomorrow?.lookId === look.id ? '✦ 내일 입을 옷' : `${Object.values(look.slots).filter(Boolean).length}개 아이템`;
    text.append(name, detail);
    top.append(thumbs, text);
    const actions = document.createElement('div');
    actions.className = 'saved-look-actions';
    [['다시 입혀보기', () => { state.slots = { ...look.slots }; $('#look-name').value = look.name; renderAll(); window.scrollTo({ top: 0, behavior: 'smooth' }); }], ['내일 입기', () => chooseTomorrow(look.id)], ['삭제', () => removeLook(look)]].forEach(([label, handler]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', handler);
      actions.append(button);
    });
    card.append(top, actions);
    root.append(card);
  });
  const selected = state.looks.find((look) => look.id === state.tomorrow?.lookId);
  $('#tomorrow-choice').textContent = selected ? `${state.tomorrow.date} · ${selected.name}` : '오늘 밤에 골라두면 내일 아침엔 입기만 하면 돼요.';
}

function renderAll() { renderFilters(); renderWardrobe(); renderWorn(); renderSlots(); renderSelected(); renderLooks(); }

async function chooseTomorrow(lookId) {
  state.tomorrow = { key: 'tomorrow', lookId, date: tomorrowDate() };
  try { await putOne('settings', state.tomorrow); renderLooks(); showToast('내일 입을 옷으로 정했어요'); }
  catch { showToast('저장하지 못했어요. 다시 시도해 주세요.'); }
}

async function saveLook(forTomorrow) {
  const slots = Object.fromEntries(Object.entries(state.slots).filter(([, value]) => Boolean(garment(value))));
  if (!Object.keys(slots).length) { showToast('먼저 옷장에서 옷을 골라주세요'); return; }
  const look = { id: id(), name: $('#look-name').value.trim() || (forTomorrow ? '내일의 코디' : `나의 코디 ${state.looks.length + 1}`), slots, createdAt: Date.now() };
  try {
    await putOne('looks', look);
    state.looks.unshift(look);
    if (forTomorrow) await chooseTomorrow(look.id);
    renderLooks();
    showToast(forTomorrow ? '내일의 코디를 저장했어요' : '코디를 저장했어요');
  } catch { showToast('코디를 저장하지 못했어요. 다시 시도해 주세요.'); }
}

async function removeLook(look) {
  if (!confirm(`“${look.name}” 코디를 삭제할까요?`)) return;
  try {
    await deleteOne('looks', look.id);
    state.looks = state.looks.filter((item) => item.id !== look.id);
    if (state.tomorrow?.lookId === look.id) { state.tomorrow = null; await deleteOne('settings', 'tomorrow'); }
    renderLooks();
    showToast('코디를 삭제했어요');
  } catch { showToast('삭제하지 못했어요. 다시 시도해 주세요.'); }
}

async function removeGarment(item) {
  if (!confirm(`“${item.name}” 옷을 삭제할까요? 저장한 코디에서도 빠집니다.`)) return;
  try {
    await deleteOne('garments', item.id);
    state.garments = state.garments.filter((value) => value.id !== item.id);
    if (state.urls.has(item.id)) { URL.revokeObjectURL(state.urls.get(item.id)); state.urls.delete(item.id); }
    Object.keys(state.slots).forEach((key) => { if (state.slots[key] === item.id) delete state.slots[key]; });
    for (const look of state.looks) {
      const cleaned = Object.fromEntries(Object.entries(look.slots).filter(([, value]) => value !== item.id));
      if (Object.keys(cleaned).length !== Object.keys(look.slots).length) { look.slots = cleaned; await putOne('looks', look); }
    }
    renderAll();
    showToast('옷장에서 삭제했어요');
  } catch { showToast('삭제하지 못했어요. 다시 시도해 주세요.'); }
}

function compressImage(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const type = file.type === 'image/png' || file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
      canvas.toBlob((blob) => { URL.revokeObjectURL(url); resolve(blob || file); }, type, .82);
    };
    image.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    image.src = url;
  });
}

function resetUploadDialog() {
  $('#upload-form').reset();
  $('#photo-preview').hidden = true;
  $('#photo-preview').removeAttribute('src');
  if (state.previewUrl) { URL.revokeObjectURL(state.previewUrl); state.previewUrl = null; }
  $('#upload-submit').disabled = false;
  $('#upload-submit').textContent = '옷장에 넣기';
}

async function addGarment(event) {
  event.preventDefault();
  const file = $('#photo-input').files[0];
  if (!file) { showToast('옷 사진을 선택해 주세요'); return; }
  if (!file.type.startsWith('image/')) { showToast('이미지 파일을 선택해 주세요'); return; }
  const button = $('#upload-submit');
  button.disabled = true;
  button.textContent = '사진 저장 중…';
  const item = { id: id(), name: $('#name-input').value.trim() || file.name.replace(/\.[^.]+$/, '').slice(0, 40) || category($('#category-input').value).label, category: $('#category-input').value, image: await compressImage(file), createdAt: Date.now() };
  try {
    await putOne('garments', item);
    state.garments.unshift(item);
    state.activeCategory = item.category;
    $('#upload-dialog').close();
    resetUploadDialog();
    renderAll();
    showToast('새 옷을 옷장에 넣었어요');
  } catch { button.disabled = false; button.textContent = '옷장에 넣기'; showToast('사진을 저장하지 못했어요. 저장 공간을 확인해 주세요.'); }
}

function bindEvents() {
  $('#open-wardrobe').addEventListener('click', openWardrobe);
  $('#close-wardrobe').addEventListener('click', closeWardrobe);
  $('#drawer-scrim').addEventListener('click', closeWardrobe);
  $('#add-garment').addEventListener('click', () => $('#upload-dialog').showModal());
  $('#close-dialog').addEventListener('click', () => $('#upload-dialog').close());
  $('#upload-dialog').addEventListener('close', resetUploadDialog);
  $('#upload-form').addEventListener('submit', addGarment);
  $('#photo-input').addEventListener('change', () => {
    const file = $('#photo-input').files[0];
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    if (!file) { $('#photo-preview').hidden = true; return; }
    state.previewUrl = URL.createObjectURL(file);
    $('#photo-preview').src = state.previewUrl;
    $('#photo-preview').hidden = false;
  });
  $('#clear-outfit').addEventListener('click', () => { state.slots = {}; $('#look-name').value = ''; renderAll(); });
  $('#save-look').addEventListener('click', () => saveLook(false));
  $('#save-tomorrow').addEventListener('click', () => saveLook(true));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeWardrobe(); });
}

async function init() {
  bindEvents();
  try {
    state.db = await openDatabase();
    const [garments, looks, tomorrow] = await Promise.all([getAll('garments'), getAll('looks'), getOne('settings', 'tomorrow')]);
    state.garments = garments.sort((a, b) => b.createdAt - a.createdAt);
    state.looks = looks.sort((a, b) => b.createdAt - a.createdAt);
    state.tomorrow = tomorrow || null;
  } catch {
    $('#sync-status').textContent = '저장 기능을 사용할 수 없어요';
    showToast('이 브라우저에서 저장 기능을 사용할 수 없어요');
  }
  renderAll();
}

init();
