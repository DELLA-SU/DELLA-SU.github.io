const $ = id => document.getElementById(id);
const personInput = $('person-input'), garmentInput = $('garment-input');
const stageImage = $('stage-image'), tryButton = $('try-on-button');
const originalButton = $('show-original'), resultButton = $('show-result'), downloadLink = $('download-result');
let personURL = '', resultURL = '', demoMode = false, apiAvailable = false;

function status(message, kind = '') { $('status').textContent = message; $('status').className = `status ${kind}`; }
function showImage(url, alt) { stageImage.src = url; stageImage.alt = alt; }
function updateControls() {
  originalButton.disabled = resultButton.disabled = !resultURL;
  downloadLink.hidden = !resultURL || demoMode;
  if (resultURL && !demoMode) downloadLink.href = resultURL;
}
function setPhoto(input, previewId, nameId, isPerson) {
  const file = input.files?.[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
    status('PNG, JPG, WEBP 사진을 12MB 이하로 선택해 주세요.', 'error'); input.value = ''; return;
  }
  const url = URL.createObjectURL(file);
  if (isPerson) {
    if (personURL.startsWith('blob:')) URL.revokeObjectURL(personURL);
    personURL = url; showImage(url, '내가 선택한 전신 사진');
  }
  const preview = $(previewId); preview.src = url; preview.hidden = false;
  $(nameId).textContent = file.name;
  resultURL = ''; demoMode = false; updateControls();
  status(apiAvailable ? '사진이 준비됐어요. 입어보기를 눌러 주세요.' : '사진이 준비됐어요. AI 생성은 로컬 실험실에서 이용할 수 있어요.');
}
personInput.addEventListener('change', () => setPhoto(personInput, 'person-preview', 'person-name', true));
garmentInput.addEventListener('change', () => setPhoto(garmentInput, 'garment-preview', 'garment-name', false));
originalButton.addEventListener('click', () => showImage(personURL || 'demo-person.webp', '착용 전 전신 사진'));
resultButton.addEventListener('click', () => showImage(resultURL, 'AI 가상 착용 결과'));

$('demo-button').addEventListener('click', async () => {
  try {
    const check = await fetch('demo-result.png', { method: 'HEAD' });
    if (!check.ok) throw new Error('missing demo');
    personURL = 'demo-person.webp'; resultURL = 'demo-result.png'; demoMode = true;
    $('person-preview').src = personURL; $('person-preview').hidden = false;
    $('garment-preview').src = 'demo-garment.webp'; $('garment-preview').hidden = false;
    $('person-name').textContent = '예시 인물'; $('garment-name').textContent = '예시 옷';
    showImage(resultURL, 'FASHN VTON 오픈소스로 생성한 가상 착용 예시'); updateControls();
    status('실제 AI 모델로 생성한 예시예요. 원본 보기로 비교해 보세요.', 'success');
  } catch { status('예시 결과를 준비하고 있어요. 잠시 후 다시 시도해 주세요.', 'error'); }
});
function toDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('사진을 읽지 못했어요.'));
    reader.readAsDataURL(file);
  });
}
tryButton.addEventListener('click', async () => {
  if (!personInput.files?.[0] || !garmentInput.files?.[0]) { status('내 전신 사진과 옷 사진을 모두 선택해 주세요.', 'error'); return; }
  if (!apiAvailable) { status('공개 페이지에서는 예시 결과를 볼 수 있어요. 내 사진 생성은 로컬 실험실에서 실행해요.', 'error'); return; }
  tryButton.disabled = true; tryButton.textContent = '옷을 입혀보고 있어요 ✦';
  status('AI가 옷 모양을 분석하고 있어요. 맥에서는 몇 분 걸릴 수 있어요.');
  try {
    const body = {
      person_image: await toDataURL(personInput.files[0]),
      garment_image: await toDataURL(garmentInput.files[0]),
      category: document.querySelector('input[name="category"]:checked').value,
      garment_photo_type: document.querySelector('input[name="photo-type"]:checked').value,
    };
    const response = await fetch('/api/tryon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '이미지를 만들지 못했어요.');
    resultURL = data.image; demoMode = false;
    if (personURL.startsWith('blob:')) URL.revokeObjectURL(personURL);
    personURL = URL.createObjectURL(personInput.files[0]);
    $('person-preview').src = personURL;
    $('person-name').textContent = personInput.files[0].name;
    $('garment-preview').src = URL.createObjectURL(garmentInput.files[0]);
    $('garment-name').textContent = garmentInput.files[0].name;
    showImage(resultURL, '내 사진에 옷을 가상으로 입힌 결과'); updateControls();
    status('완성됐어요! 원본과 비교해 보고 결과를 저장할 수 있어요.', 'success');
  } catch (error) { status(error.message || '오류가 생겼어요. 다시 시도해 주세요.', 'error'); }
  finally { tryButton.disabled = false; tryButton.textContent = '이 옷 입어보기 ✦'; }
});
async function checkApi() {
  try { const response = await fetch('/api/health', { cache: 'no-store' }); if (response.ok) apiAvailable = (await response.json()).ready === true; }
  catch { apiAvailable = false; }
  status(apiAvailable ? '로컬 AI 실험실이 연결됐어요. 사진을 선택해 주세요.' : '공개 페이지에서는 AI 예시를 볼 수 있어요. 내 사진 생성은 로컬 실험실에서 이용해요.');
}
checkApi();
