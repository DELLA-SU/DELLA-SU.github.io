/* Original-pixel detail repair for logos and prints distorted by the try-on model. */
(() => {
  const $ = id => document.getElementById(id);
  const editor = $('detail-editor');
  const sourceCanvas = $('source-canvas');
  const resultCanvas = $('result-canvas');
  const sourceCtx = sourceCanvas.getContext('2d');
  const scaleInput = $('detail-scale');
  const rotationInput = $('detail-rotation');
  let sourceImage = null;
  let resultImage = null;
  let crop = null;
  let target = null;
  let pointerStart = null;

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('사진을 읽지 못했어요.'));
      image.src = url;
    });
  }
  function point(event, canvas) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }
  function drawSource() {
    if (!sourceImage) return;
    const w = sourceCanvas.width, h = sourceCanvas.height;
    sourceCtx.drawImage(sourceImage, 0, 0, w, h);
    if (!crop) return;
    sourceCtx.fillStyle = 'rgba(22, 13, 19, .32)';
    sourceCtx.fillRect(0, 0, w, crop.y * h);
    sourceCtx.fillRect(0, (crop.y + crop.h) * h, w, (1 - crop.y - crop.h) * h);
    sourceCtx.fillRect(0, crop.y * h, crop.x * w, crop.h * h);
    sourceCtx.fillRect((crop.x + crop.w) * w, crop.y * h, (1 - crop.x - crop.w) * w, crop.h * h);
    sourceCtx.strokeStyle = '#fff';
    sourceCtx.lineWidth = Math.max(2, w / 300);
    sourceCtx.setLineDash([8, 5]);
    sourceCtx.strokeRect(crop.x * w, crop.y * h, crop.w * w, crop.h * h);
    sourceCtx.setLineDash([]);
  }
  function makePatch() {
    const x = Math.round(crop.x * sourceImage.naturalWidth);
    const y = Math.round(crop.y * sourceImage.naturalHeight);
    const rawWidth = Math.max(2, Math.round(crop.w * sourceImage.naturalWidth));
    const rawHeight = Math.max(2, Math.round(crop.h * sourceImage.naturalHeight));
    const shrink = Math.min(1, 1200 / Math.max(rawWidth, rawHeight));
    const w = Math.max(2, Math.round(rawWidth * shrink));
    const h = Math.max(2, Math.round(rawHeight * shrink));
    const patch = document.createElement('canvas');
    patch.width = w; patch.height = h;
    const ctx = patch.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(sourceImage, x, y, rawWidth, rawHeight, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h);
    const feather = Math.max(2, Math.min(16, Math.round(Math.min(w, h) * .13)));
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const distance = Math.min(px, py, w - 1 - px, h - 1 - py);
        pixels.data[(py * w + px) * 4 + 3] = Math.round(255 * Math.min(1, distance / feather));
      }
    }
    ctx.putImageData(pixels, 0, 0);
    return patch;
  }
  function render(canvas) {
    if (!sourceImage || !resultImage) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(resultImage, 0, 0, w, h);
    if (!crop || !target || crop.w < .01 || crop.h < .01) return;
    const patch = makePatch();
    const targetWidth = w * Number(scaleInput.value) / 100;
    const targetHeight = targetWidth * patch.height / patch.width;
    ctx.save();
    ctx.translate(target.x * w, target.y * h);
    ctx.rotate(Number(rotationInput.value) * Math.PI / 180);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(patch, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
    ctx.restore();
  }
  function redraw() {
    drawSource(); render(resultCanvas);
    $('detail-apply').disabled = !crop || !target || crop.w < .01 || crop.h < .01;
    $('detail-scale-value').textContent = `${scaleInput.value}%`;
    $('detail-rotation-value').textContent = `${rotationInput.value}°`;
  }
  async function openEditor() {
    const { source, result } = window.wardrobe.getDetailImages();
    if (!source || !result) return;
    try {
      [sourceImage, resultImage] = await Promise.all([loadImage(source), loadImage(result)]);
      crop = null;
      target = null;
      const sourceShrink = Math.min(1, 1200 / Math.max(sourceImage.naturalWidth, sourceImage.naturalHeight));
      sourceCanvas.width = Math.round(sourceImage.naturalWidth * sourceShrink);
      sourceCanvas.height = Math.round(sourceImage.naturalHeight * sourceShrink);
      resultCanvas.width = resultImage.naturalWidth;
      resultCanvas.height = resultImage.naturalHeight;
      editor.hidden = false;
      redraw();
      editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { alert(error.message); }
  }
  $('detail-button').addEventListener('click', openEditor);
  $('detail-close').addEventListener('click', () => { editor.hidden = true; });
  sourceCanvas.addEventListener('pointerdown', event => {
    pointerStart = point(event, sourceCanvas);
    sourceCanvas.setPointerCapture(event.pointerId);
  });
  sourceCanvas.addEventListener('pointermove', event => {
    if (!pointerStart) return;
    const current = point(event, sourceCanvas);
    crop = {
      x: Math.min(pointerStart.x, current.x),
      y: Math.min(pointerStart.y, current.y),
      w: Math.abs(current.x - pointerStart.x),
      h: Math.abs(current.y - pointerStart.y),
    };
    redraw();
  });
  sourceCanvas.addEventListener('pointerup', () => { pointerStart = null; });
  sourceCanvas.addEventListener('pointercancel', () => { pointerStart = null; });
  resultCanvas.addEventListener('pointerdown', event => { target = point(event, resultCanvas); redraw(); });
  [scaleInput, rotationInput].forEach(input => input.addEventListener('input', redraw));
  $('detail-reset').addEventListener('click', () => {
    crop = null;
    target = null;
    scaleInput.value = 38;
    rotationInput.value = 0;
    redraw();
  });
  $('detail-apply').addEventListener('click', () => {
    if (!sourceImage || !resultImage || crop.w < .01 || crop.h < .01) return;
    const canvas = document.createElement('canvas');
    canvas.width = resultImage.naturalWidth;
    canvas.height = resultImage.naturalHeight;
    render(canvas);
    window.wardrobe.setEditedResult(canvas.toDataURL('image/png'));
    editor.hidden = true;
    $('stage-image').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
})();
