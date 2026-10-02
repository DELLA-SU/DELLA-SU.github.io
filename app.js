const $ = id => document.getElementById(id);
const personInput = $('person-input'), faceInput = $('face-input'), garmentInput = $('garment-input');
const stageImage = $('stage-image'), tryButton = $('try-on-button');
const stageModel = $('stage-model'), avatarButton = $('avatar-button');
const originalButton = $('show-original'), resultButton = $('show-result'), downloadLink = $('download-result');
let personURL = '', garmentURL = '', faceURL = '', resultURL = '', baseResultURL = '', demoMode = false, apiAvailable = false, avatarAvailable = false, generatedModelURL = '';

function status(message, kind = '') { $('status').textContent = message; $('status').className = `status ${kind}`; }
function showImage(url, alt) {
  stageImage.src = url; stageImage.alt = alt;
  stageImage.hidden = false; stageModel.hidden = true;
  $('show-photo').hidden = true; $('show-3d').hidden = false;
}
function showModel() {
  stageImage.hidden = true; stageModel.hidden = false;
  $('show-photo').hidden = false; $('show-3d').hidden = true;
}
function updateControls() {
  originalButton.disabled = resultButton.disabled = !resultURL;
  $('detail-button').hidden = !resultURL;
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
    if (generatedModelURL) URL.revokeObjectURL(generatedModelURL);
    generatedModelURL = ''; stageModel.src = 'sample-avatar.glb';
    stageModel.alt = '정면 전신 이미지에서 생성한 회전 가능한 3D 몸 형태 샘플';
  } else {
    if (garmentURL.startsWith('blob:')) URL.revokeObjectURL(garmentURL);
    garmentURL = url;
  }
  const preview = $(previewId); preview.src = url; preview.hidden = false;
  $(nameId).textContent = file.name;
  resultURL = ''; baseResultURL = ''; demoMode = false; updateControls();
  status(apiAvailable ? '사진이 준비됐어요. 입어보기를 눌러 주세요.' : '사진이 준비됐어요. AI 생성은 로컬 실험실에서 이용할 수 있어요.');
}
personInput.addEventListener('change', () => setPhoto(personInput, 'person-preview', 'person-name', true));
garmentInput.addEventListener('change', () => setPhoto(garmentInput, 'garment-preview', 'garment-name', false));
faceInput.addEventListener('change', () => {
  const file = faceInput.files?.[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
    $('avatar-status').textContent = 'PNG, JPG, WEBP 얼굴 사진을 12MB 이하로 선택해 주세요.';
    faceInput.value = '';
    return;
  }
  if (faceURL.startsWith('blob:')) URL.revokeObjectURL(faceURL);
  faceURL = URL.createObjectURL(file);
  $('face-preview').src = faceURL;
  $('face-preview').hidden = false;
  $('face-name').textContent = file.name;
  $('avatar-status').textContent = '얼굴 사진은 이 브라우저에만 미리 보여 줍니다. 3D 몸 형태 생성에는 전신 사진만 사용해요.';
});
originalButton.addEventListener('click', () => showImage(personURL || 'demo-person.webp', '착용 전 전신 사진'));
resultButton.addEventListener('click', () => showImage(resultURL, 'AI 가상 착용 결과'));
$('show-photo').addEventListener('click', () => showImage(stageImage.src, stageImage.alt));
$('show-3d').addEventListener('click', showModel);

avatarButton.addEventListener('click', async () => {
  if (!personInput.files?.[0]) { $('avatar-status').textContent = '정면 전신 사진을 먼저 선택해 주세요.'; return; }
  if (!avatarAvailable) { $('avatar-status').textContent = '내 사진으로 3D 몸 형태를 만드는 기능은 로컬 실험실에서 이용할 수 있어요. 위의 3D 샘플은 회전해서 볼 수 있어요.'; return; }
  avatarButton.disabled = true; avatarButton.textContent = '3D 몸 형태를 만드는 중…';
  $('avatar-status').textContent = '전신 사진을 로컬 3D 모델로 분석하고 있어요. 잠시 기다려 주세요.';
  try {
    const response = await fetch('/api/avatar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_image: await toDataURL(personInput.files[0]) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '3D 모델을 만들지 못했어요.');
    const blob = await (await fetch(data.model)).blob();
    const url = URL.createObjectURL(blob);
    if (generatedModelURL) URL.revokeObjectURL(generatedModelURL);
    generatedModelURL = url;
    stageModel.src = url;
    stageModel.alt = '내 전신 사진에서 생성한 회전 가능한 3D 몸 형태';
    showModel();
    $('avatar-status').textContent = '전신 사진에서 3D 몸 형태를 만들었어요. 손가락이나 마우스로 돌려 보세요. 얼굴·머리카락·옷 질감은 아직 재현되지 않아요.';
  } catch (error) { $('avatar-status').textContent = error.message || '3D 모델을 만들지 못했어요.'; }
  finally { avatarButton.disabled = false; avatarButton.textContent = '내 사진으로 3D 몸 형태 만들기 ↻'; }
});

$('demo-button').addEventListener('click', async () => {
  try {
    const check = await fetch('demo-result.png', { method: 'HEAD' });
    if (!check.ok) throw new Error('missing demo');
    personURL = 'demo-person.webp'; garmentURL = 'demo-garment.webp'; resultURL = baseResultURL = 'demo-result.png'; demoMode = true;
    if (generatedModelURL) URL.revokeObjectURL(generatedModelURL);
    generatedModelURL = ''; stageModel.src = 'sample-avatar.glb';
    stageModel.alt = '정면 전신 이미지에서 생성한 회전 가능한 3D 몸 형태 샘플';
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
      num_timesteps: Number(document.querySelector('input[name="quality"]:checked').value),
    };
    const response = await fetch('/api/tryon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '이미지를 만들지 못했어요.');
    resultURL = baseResultURL = data.image; demoMode = false;
    if (personURL.startsWith('blob:')) URL.revokeObjectURL(personURL);
    personURL = URL.createObjectURL(personInput.files[0]);
    $('person-preview').src = personURL;
    $('person-name').textContent = personInput.files[0].name;
    if (garmentURL.startsWith('blob:')) URL.revokeObjectURL(garmentURL);
    garmentURL = URL.createObjectURL(garmentInput.files[0]);
    $('garment-preview').src = garmentURL;
    $('garment-name').textContent = garmentInput.files[0].name;
    showImage(resultURL, '내 사진에 옷을 가상으로 입힌 결과'); updateControls();
    status('완성됐어요! 원본과 비교해 보고 결과를 저장할 수 있어요.', 'success');
  } catch (error) { status(error.message || '오류가 생겼어요. 다시 시도해 주세요.', 'error'); }
  finally { tryButton.disabled = false; tryButton.textContent = '이 옷 입어보기 ✦'; }
});
async function checkApi() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    if (response.ok) { const data = await response.json(); apiAvailable = data.ready === true; avatarAvailable = data.avatar_ready === true; }
  }
  catch { apiAvailable = false; avatarAvailable = false; }
  status(apiAvailable ? '로컬 AI 실험실이 연결됐어요. 사진을 선택해 주세요.' : '공개 페이지에서는 AI 예시를 볼 수 있어요. 내 사진 생성은 로컬 실험실에서 이용해요.');
  if (avatarAvailable) $('avatar-status').textContent = '로컬 3D 몸 모델이 연결됐어요. 전신 사진을 선택한 뒤 생성할 수 있어요. 얼굴 사진은 현재 분석하거나 전송하지 않아요.';
}
checkApi();

function updateFit() {
  const category = document.querySelector('input[name="category"]:checked').value;
  const bodyLabel = category === 'bottoms' ? '내 허리둘레' : '내 가슴둘레';
  const garmentLabel = category === 'bottoms' ? '옷 허리 단면' : '옷 가슴 단면';
  $('body-measure-label').textContent = bodyLabel;
  $('garment-measure-label').textContent = garmentLabel;
  const body = Number($('body-measure').value), garment = Number($('garment-measure').value);
  const output = $('fit-result');
  if (!body || !garment || body <= 0 || garment <= 0) { output.textContent = '두 치수를 넣으면 둘레 차이를 계산해요.'; return; }
  const delta = Math.round((garment * 2 - body) * 10) / 10;
  const sign = delta > 0 ? '+' : '';
  output.textContent = `옷 둘레 − 내 ${category === 'bottoms' ? '허리' : '가슴'}둘레 = ${sign}${delta}cm. 소재의 신축성과 옷 모양에 따라 실제 착용감은 달라져요.`;
}
document.querySelectorAll('input[name="category"]').forEach(input => input.addEventListener('change', updateFit));
$('body-measure').addEventListener('input', updateFit);
$('garment-measure').addEventListener('input', updateFit);

window.wardrobe = {
  getDetailImages: () => ({ source: garmentURL, result: baseResultURL }),
  setEditedResult: image => { resultURL = image; demoMode = false; showImage(image, '원본 로고와 무늬를 보정한 가상 착용 결과'); updateControls(); status('원본 무늬를 반영했어요. 위치와 크기가 맞는지 확인해 주세요.', 'success'); },
};
