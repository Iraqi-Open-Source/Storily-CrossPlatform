const EMOJIS = ['😀', '😍', '😂', '🥹', '👍', '❤️', '💛', '✨', '🌟', '🌷', '🌸', '🔥', '🎉', '🌈', '☀️', '🌙', '📸', '🎂'];
const FILTERS = [
  ['none', 'none', 'none'],
  ['mono', 'monochrome', 'mono'],
  ['noir', 'noir', 'noir'],
  ['sepia', 'sepia', 'sepia'],
  ['warm', 'warm', 'warm'],
  ['golden', 'golden', 'golden'],
  ['vintage', 'vintage', 'vintage'],
  ['film', 'film', 'film'],
  ['fade', 'fade', 'fade'],
  ['matte', 'matte', 'matte'],
  ['soft', 'soft', 'soft'],
  ['vibrance', 'vibrance', 'vibrance'],
  ['vivid', 'vivid', 'vivid'],
  ['dramatic', 'dramatic', 'dramatic'],
  ['cool', 'cool', 'cool'],
  ['arctic', 'arctic', 'arctic'],
  ['rose', 'rose', 'rose'],
  ['emerald', 'emerald', 'emerald'],
];
const RATIOS = [
  ['free', 'freeCrop'],
  ['1', 'square'],
  ['1.333333', 'ratio43'],
  ['0.75', 'ratio34'],
  ['1.777778', 'ratio169'],
  ['0.5625', 'ratio916'],
];
const RATIO_SWAP = { '1.333333': '0.75', '0.75': '1.333333', '1.777778': '0.5625', '0.5625': '1.777778' };
const HINTS = { crop: 'hintCrop', filter: 'hintFilter', adjust: 'hintAdjust', emoji: 'hintEmoji', rotate: 'hintRotate', upscale: 'hintUpscale' };
const MAX_EDGE = 6000;
const MAX_PIXELS = 24_000_000;

export function freshEdit() {
  return {
    tool: 'crop', mode: 'edit', filter: 'none', rotate: 0, flipX: false, flipY: false,
    brightness: 100, contrast: 100, saturate: 100, vignette: 0, upscale: 1, ratio: 'free',
    crop: null, stickers: [], selectedId: '', textColor: '#ffffff',
  };
}

let imageEl = null;
let mountToken = 0;
let view = null;
let drag = null;
let pagePreview = { key: '', source: null, canvas: null };
let comparing = false;
let gesture = false;
let panelSig = '';
let observer = null;
let activeEnv = null;
let listening = false;
let arrowGesture = false;
let arrowTimer = 0;

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const pxSize = img => ({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
export function orientedSize(img, edit) {
  const { w, h } = pxSize(img);
  return edit.rotate % 180 ? { w: h, h: w } : { w, h };
}

const COOL_HUE = hueMatrix(16);
let gradeCache = { key: '', source: null, canvas: null };

function needsGrade(edit) {
  return edit.filter !== 'none' || Number(edit.brightness) !== 100 || Number(edit.contrast) !== 100 || Number(edit.saturate) !== 100;
}
function luma(r, g, b) { return r * 0.2126 + g * 0.7152 + b * 0.0722; }
function hueMatrix(deg) {
  const a = deg * Math.PI / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [
    0.2126 + cos * 0.7874 - sin * 0.2126, 0.7152 - cos * 0.7152 - sin * 0.7152, 0.0722 - cos * 0.0722 + sin * 0.9278,
    0.2126 - cos * 0.2126 + sin * 0.143, 0.7152 + cos * 0.2848 + sin * 0.14, 0.0722 - cos * 0.0722 - sin * 0.283,
    0.2126 - cos * 0.2126 - sin * 0.7874, 0.7152 - cos * 0.7152 + sin * 0.7152, 0.0722 + cos * 0.9278 + sin * 0.0722,
  ];
}
function mixSepia(r, g, b, amount) {
  const nr = r * 0.393 + g * 0.769 + b * 0.189;
  const ng = r * 0.349 + g * 0.686 + b * 0.168;
  const nb = r * 0.272 + g * 0.534 + b * 0.131;
  return [r + (nr - r) * amount, g + (ng - g) * amount, b + (nb - b) * amount];
}
function mixTint(r, g, b, tr, tg, tb, amount) {
  return [r + (tr - r) * amount, g + (tg - g) * amount, b + (tb - b) * amount];
}
function withContrast(r, g, b, amount) {
  return [(r - 0.5) * amount + 0.5, (g - 0.5) * amount + 0.5, (b - 0.5) * amount + 0.5];
}
function withSaturation(r, g, b, amount) {
  const y = luma(r, g, b);
  return [y + (r - y) * amount, y + (g - y) * amount, y + (b - y) * amount];
}
function withHue(r, g, b, matrix) {
  return [r * matrix[0] + g * matrix[1] + b * matrix[2], r * matrix[3] + g * matrix[4] + b * matrix[5], r * matrix[6] + g * matrix[7] + b * matrix[8]];
}
function applyLook(r, g, b, filter) {
  if (filter === 'mono') { const y = luma(r, g, b); return [y, y, y]; }
  if (filter === 'noir') { const y = (luma(r, g, b) - 0.5) * 1.5 + 0.42; return [y, y, y]; }
  if (filter === 'sepia') return mixSepia(r, g, b, 0.95);
  if (filter === 'warm') return withSaturation(...mixSepia(r, g, b, 0.32), 1.28);
  if (filter === 'golden') return withSaturation(...mixTint(...mixSepia(r, g, b, 0.4), 1, 0.78, 0.35, 0.28), 1.15);
  if (filter === 'vintage') return withSaturation(...withContrast(...mixSepia(r * 1.06, g * 1.04, b * 0.96, 0.42), 0.86), 0.78);
  if (filter === 'film') return withSaturation(...withContrast(...mixSepia(r, g, b, 0.18), 1.16), 0.84);
  if (filter === 'fade') return withSaturation(...withContrast(r * 1.07, g * 1.07, b * 1.07, 0.9), 0.72);
  if (filter === 'matte') return withSaturation(...withContrast(r * 0.92 + 0.08, g * 0.92 + 0.08, b * 0.92 + 0.08, 0.84), 0.7);
  if (filter === 'soft') return withSaturation(...withContrast(r * 1.08, g * 1.08, b * 1.08, 0.8), 0.92);
  if (filter === 'vibrance') return withContrast(...withSaturation(r, g, b, 1.7), 1.06);
  if (filter === 'vivid') return withContrast(...withSaturation(r, g, b, 1.9), 1.14);
  if (filter === 'dramatic') return withSaturation(...withContrast(r * 0.96, g * 0.96, b * 0.96, 1.38), 0.82);
  if (filter === 'cool') return withContrast(...withHue(...withSaturation(r, g, b, 1.12), COOL_HUE), 1.04);
  if (filter === 'arctic') return withSaturation(...mixTint(r * 0.96, g * 1.02, b * 1.12, 0.55, 0.75, 1, 0.35), 0.9);
  if (filter === 'rose') return withSaturation(...mixTint(r * 1.06, g * 0.96, b * 1.02, 1, 0.45, 0.62, 0.28), 1.05);
  if (filter === 'emerald') return withSaturation(...mixTint(r * 0.94, g * 1.08, b * 0.96, 0.25, 0.72, 0.45, 0.32), 1.05);
  return [r, g, b];
}
function gradeChannels(r, g, b, edit) {
  [r, g, b] = applyLook(r, g, b, edit.filter);
  const bright = Number(edit.brightness) / 100;
  const contrast = Number(edit.contrast) / 100;
  const saturate = Number(edit.saturate) / 100;
  r *= bright; g *= bright; b *= bright;
  r = (r - 0.5) * contrast + 0.5; g = (g - 0.5) * contrast + 0.5; b = (b - 0.5) * contrast + 0.5;
  const gray = luma(r, g, b);
  return [gray + (r - gray) * saturate, gray + (g - gray) * saturate, gray + (b - gray) * saturate];
}
function gradedSource(img, edit, maxEdge) {
  if (!needsGrade(edit)) return img;
  const key = [edit.filter, edit.brightness, edit.contrast, edit.saturate, maxEdge].join('|');
  if (gradeCache.source === img && gradeCache.key === key) return gradeCache.canvas;
  const { w, h } = pxSize(img);
  const scale = maxEdge > 0 ? Math.min(1, maxEdge / Math.max(w, h, 1)) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const graded = gradeChannels(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, edit);
    data[i] = clamp(graded[0] * 255, 0, 255);
    data[i + 1] = clamp(graded[1] * 255, 0, 255);
    data[i + 2] = clamp(graded[2] * 255, 0, 255);
  }
  ctx.putImageData(image, 0, 0);
  gradeCache = { key, source: img, canvas };
  return canvas;
}

function vignetteAmount(edit) {
  return Math.min(0.82, (Number(edit.vignette) || 0) / 100);
}

export function clampedScale(cropW, cropH, requested) {
  const pixels = Math.max(1, cropW * cropH);
  if (pixels > MAX_PIXELS) return 1;
  const asked = Math.max(1, Number(requested) || 1);
  const edge = MAX_EDGE / Math.max(cropW, cropH, 1);
  const area = Math.sqrt(MAX_PIXELS / pixels);
  return Math.min(asked, edge, area);
}

function plannedSize(img, edit) {
  const bounds = orientedSize(img, edit);
  const crop = edit.crop || { x: 0, y: 0, w: bounds.w, h: bounds.h };
  const scale = clampedScale(crop.w, crop.h, edit.upscale);
  return { w: Math.max(1, Math.round(crop.w * scale)), h: Math.max(1, Math.round(crop.h * scale)), scale, crop };
}

function ensureCrop(img, edit) {
  const bounds = orientedSize(img, edit);
  if (!edit.crop || !(edit.crop.w > 0) || !(edit.crop.h > 0)) edit.crop = { x: 0, y: 0, w: bounds.w, h: bounds.h };
  clampCrop(edit.crop, bounds);
  return bounds;
}

function clampCrop(crop, bounds) {
  crop.w = clamp(crop.w, 1, bounds.w);
  crop.h = clamp(crop.h, 1, bounds.h);
  crop.x = clamp(crop.x, 0, Math.max(0, bounds.w - crop.w));
  crop.y = clamp(crop.y, 0, Math.max(0, bounds.h - crop.h));
}

function remember(state) {
  state.editPast.push(JSON.stringify(state.edit));
  if (state.editPast.length > 40) state.editPast.shift();
  state.editFuture = [];
}
function undo(state) {
  if (!state.editPast?.length) return;
  state.editFuture.push(JSON.stringify(state.edit));
  state.edit = JSON.parse(state.editPast.pop());
}
function redo(state) {
  if (!state.editFuture?.length) return;
  state.editPast.push(JSON.stringify(state.edit));
  state.edit = JSON.parse(state.editFuture.pop());
}

function sourceToOriented(x, y, srcW, srcH, edit) {
  let px = x - srcW / 2;
  let py = y - srcH / 2;
  const rad = (edit.rotate * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let rx = px * cos - py * sin;
  let ry = px * sin + py * cos;
  if (edit.flipX) rx = -rx;
  if (edit.flipY) ry = -ry;
  const out = edit.rotate % 180 ? { w: srcH, h: srcW } : { w: srcW, h: srcH };
  return { x: rx + out.w / 2, y: ry + out.h / 2 };
}

function composeView(edit, op, srcW, srcH) {
  const samples = [[0, 0], [srcW, 0], [0, srcH]];
  const current = samples.map(([x, y]) => sourceToOriented(x, y, srcW, srcH, edit));
  const size = edit.rotate % 180 ? { w: srcH, h: srcW } : { w: srcW, h: srcH };
  const target = current.map(point => op(point, size));
  let best = { rotate: edit.rotate, flipX: edit.flipX, flipY: edit.flipY };
  let bestErr = Infinity;
  for (const rotate of [0, 90, 180, 270]) {
    for (const flipX of [false, true]) {
      for (const flipY of [false, true]) {
        const candidate = { rotate, flipX, flipY };
        let err = 0;
        samples.forEach(([x, y], index) => {
          const point = sourceToOriented(x, y, srcW, srcH, candidate);
          err += Math.abs(point.x - target[index].x) + Math.abs(point.y - target[index].y);
        });
        if (err < bestErr) { bestErr = err; best = candidate; }
      }
    }
  }
  return best;
}

function boundsOf(crop, map) {
  const corners = [
    map({ x: crop.x, y: crop.y }),
    map({ x: crop.x + crop.w, y: crop.y }),
    map({ x: crop.x, y: crop.y + crop.h }),
    map({ x: crop.x + crop.w, y: crop.y + crop.h }),
  ];
  const xs = corners.map(point => point.x);
  const ys = corners.map(point => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function mapSelection(state, op, swapRatio) {
  if (!imageEl) return;
  const edit = state.edit;
  ensureCrop(imageEl, edit);
  const size = orientedSize(imageEl, edit);
  remember(state);
  const crop = edit.crop;
  const placed = edit.stickers.map(sticker => ({
    ...sticker,
    ax: crop.x + sticker.nx * crop.w,
    ay: crop.y + sticker.ny * crop.h,
  }));
  const src = pxSize(imageEl);
  const nextView = composeView(edit, op, src.w, src.h);
  edit.rotate = nextView.rotate;
  edit.flipX = nextView.flipX;
  edit.flipY = nextView.flipY;
  edit.crop = boundsOf(crop, point => op(point, size));
  const box = edit.crop;
  edit.stickers = placed.map(sticker => {
    const point = op({ x: sticker.ax, y: sticker.ay }, size);
    return {
      ...sticker,
      nx: clamp((point.x - box.x) / box.w, 0, 1),
      ny: clamp((point.y - box.y) / box.h, 0, 1),
    };
  });
  if (swapRatio && RATIO_SWAP[edit.ratio]) edit.ratio = RATIO_SWAP[edit.ratio];
  clampCrop(edit.crop, orientedSize(imageEl, edit));
}

const screenCW = (point, size) => ({ x: size.h - point.y, y: point.x });
const screenCCW = (point, size) => ({ x: point.y, y: size.w - point.x });
const screenFlipH = (point, size) => ({ x: size.w - point.x, y: point.y });
const screenFlipV = (point, size) => ({ x: point.x, y: size.h - point.y });

function cropToRatio(crop, ratio, bounds) {
  const next = { ...crop };
  if (ratio === 'free') return next;
  const aspect = Number(ratio);
  let w = next.w;
  let h = next.h;
  if (w / h > aspect) w = h * aspect;
  else h = w / aspect;
  if (w > bounds.w) { w = bounds.w; h = w / aspect; }
  if (h > bounds.h) { h = bounds.h; w = h * aspect; }
  let x = next.x + (next.w - w) / 2;
  let y = next.y + (next.h - h) / 2;
  x = clamp(x, 0, bounds.w - w);
  y = clamp(y, 0, bounds.h - h);
  return { x, y, w, h };
}

function fitBox(srcW, srcH, maxW, maxH) {
  const pad = 18;
  const scale = Math.min((maxW - pad * 2) / srcW, (maxH - pad * 2) / srcH);
  const dw = srcW * scale;
  const dh = srcH * scale;
  return { scale, dw, dh, ox: (maxW - dw) / 2, oy: (maxH - dh) / 2 };
}

function cropBox() {
  if (!view || !activeEnv?.state.edit.crop) return null;
  const edit = activeEnv.state.edit;
  if (view.preview) return { x: view.fit.ox, y: view.fit.oy, w: view.fit.dw, h: view.fit.dh };
  const scale = view.fit.dw / view.bounds.w;
  const crop = edit.crop;
  return { x: view.fit.ox + crop.x * scale, y: view.fit.oy + crop.y * scale, w: crop.w * scale, h: crop.h * scale };
}

function drawVignette(ctx, x, y, w, h, amount) {
  if (amount <= 0 || w < 1 || h < 1) return;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const radius = Math.hypot(w, h) / 2;
  const gradient = ctx.createRadialGradient(cx, cy, radius * 0.42, cx, cy, radius);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${amount})`);
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function drawSticker(ctx, sticker, box, selected) {
  const size = Math.max(14, sticker.size * Math.min(box.w, box.h));
  const x = box.x + sticker.nx * box.w;
  const y = box.y + sticker.ny * box.h;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(((Number(sticker.rotation) || 0) * Math.PI) / 180);
  ctx.font = `${size}px ${sticker.kind === 'text' ? 'sans-serif' : '"Apple Color Emoji","Segoe UI Emoji",sans-serif'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = sticker.color || '#ffffff';
  if (sticker.kind === 'text') {
    ctx.lineWidth = Math.max(2, size / 10);
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.strokeText(sticker.value, 0, 0);
  }
  ctx.fillText(sticker.value, 0, 0);
  if (selected) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-size / 2, -size * 0.65, size, size * 1.3);
  }
  ctx.restore();
}

function drawHandles(ctx, box) {
  const points = handles(box);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#2a2144';
  ctx.lineWidth = 1;
  Object.values(points).forEach(point => {
    ctx.fillRect(point.x - 5, point.y - 5, 10, 10);
    ctx.strokeRect(point.x - 5, point.y - 5, 10, 10);
  });
}

function handles(box) {
  const { x, y, w, h } = box;
  return {
    nw: { x, y }, n: { x: x + w / 2, y }, ne: { x: x + w, y },
    e: { x: x + w, y: y + h / 2 }, se: { x: x + w, y: y + h },
    s: { x: x + w / 2, y: y + h }, sw: { x, y: y + h }, w: { x, y: y + h / 2 },
  };
}

function draw(env) {
  const canvas = document.getElementById('studioCanvas');
  const stage = document.getElementById('studioStage');
  if (!canvas || !stage || !imageEl || !env) return;
  const cssW = stage.clientWidth;
  const cssH = stage.clientHeight;
  if (cssW < 2 || cssH < 2) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const edit = env.state.edit;
  const bounds = ensureCrop(imageEl, edit);
  const preview = edit.mode === 'preview' && !comparing;
  const target = preview ? edit.crop : bounds;
  const fit = fitBox(target.w, target.h, cssW, cssH);
  view = { fit, bounds, preview };

  if (comparing) {
    const src = pxSize(imageEl);
    const plain = fitBox(src.w, src.h, cssW, cssH);
    ctx.drawImage(imageEl, plain.ox, plain.oy, plain.dw, plain.dh);
    return;
  }

  if (preview && env.paintStudioPage) {
    const pageW = 1190;
    const pageH = 1684;
    const fit = fitBox(pageW, pageH, cssW, cssH);
    view = { fit, bounds, preview: true };
    const key = JSON.stringify(edit);
    if (pagePreview.key !== key || pagePreview.source !== imageEl) {
      const sheet = document.createElement('canvas');
      sheet.width = pageW;
      sheet.height = pageH;
      env.paintStudioPage(sheet.getContext('2d'), bakeEdit(imageEl, edit));
      pagePreview = { key, source: imageEl, canvas: sheet };
    }
    ctx.drawImage(pagePreview.canvas, fit.ox, fit.oy, fit.dw, fit.dh);
    return;
  }

  const scale = preview ? fit.dw / edit.crop.w : fit.dw / bounds.w;
  ctx.save();
  if (preview) {
    ctx.beginPath();
    ctx.rect(fit.ox, fit.oy, fit.dw, fit.dh);
    ctx.clip();
  }
  ctx.translate(fit.ox, fit.oy);
  ctx.scale(scale, scale);
  ctx.translate(preview ? -edit.crop.x : 0, preview ? -edit.crop.y : 0);
  ctx.translate(bounds.w / 2, bounds.h / 2);
  ctx.scale(edit.flipX ? -1 : 1, edit.flipY ? -1 : 1);
  ctx.rotate((edit.rotate * Math.PI) / 180);
  const src = pxSize(imageEl);
  ctx.drawImage(gradedSource(imageEl, edit, 1800), -src.w / 2, -src.h / 2, src.w, src.h);
  ctx.restore();

  const amount = vignetteAmount(edit);
  const box = cropBox();
  if (amount > 0 && box) drawVignette(ctx, box.x, box.y, box.w, box.h, amount);
  if (!preview && box) {
    ctx.save();
    ctx.fillStyle = 'rgba(8,6,16,.55)';
    ctx.beginPath();
    ctx.rect(fit.ox, fit.oy, fit.dw, fit.dh);
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, Math.max(0, box.w - 1), Math.max(0, box.h - 1));
    if (edit.tool === 'crop') {
      ctx.strokeStyle = 'rgba(255,255,255,.4)';
      ctx.beginPath();
      [1 / 3, 2 / 3].forEach(part => {
        ctx.moveTo(box.x + box.w * part, box.y);
        ctx.lineTo(box.x + box.w * part, box.y + box.h);
        ctx.moveTo(box.x, box.y + box.h * part);
        ctx.lineTo(box.x + box.w, box.y + box.h * part);
      });
      ctx.stroke();
      drawHandles(ctx, box);
    }
    ctx.restore();
  }
  if (box) {
    edit.stickers.forEach(sticker => {
      drawSticker(ctx, sticker, box, edit.mode === 'edit' && edit.tool === 'emoji' && sticker.id === edit.selectedId);
    });
  }
}

function paintChrome(env) {
  const edit = env.state.edit;
  document.querySelectorAll('[data-studio-tool]').forEach(button => {
    button.classList.toggle('on', button.dataset.studioTool === edit.tool);
    button.setAttribute('aria-pressed', button.classList.contains('on') ? 'true' : 'false');
  });
  document.querySelectorAll('[data-action="studioMode"]').forEach(button => {
    const on = button.dataset.mode === edit.mode;
    button.classList.toggle('selected', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const hint = document.getElementById('studioHint');
  if (hint) hint.textContent = edit.mode === 'preview' ? env.t('hintPreview') : env.t(HINTS[edit.tool] || 'hintCrop');
  const undoBtn = document.getElementById('studioUndo');
  const redoBtn = document.getElementById('studioRedo');
  if (undoBtn) undoBtn.disabled = !env.state.editPast.length;
  if (redoBtn) redoBtn.disabled = !env.state.editFuture.length;
  const meta = document.getElementById('studioMeta');
  if (!meta || !imageEl) return;
  meta.hidden = edit.mode === 'preview' && !comparing;
  if (meta.hidden) return;
  if (comparing) { meta.textContent = env.t('original'); return; }
  const size = plannedSize(imageEl, edit);
  const factor = size.scale > 1.02 ? ` · ${trimScale(size.scale)}×` : '';
  meta.textContent = `${size.w} × ${size.h}${factor}`;
}

function trimScale(scale) {
  const text = scale >= 10 ? scale.toFixed(0) : scale.toFixed(scale % 1 < 0.05 ? 0 : 1);
  return text.replace(/\.0$/, '');
}

function selectedSticker(edit) {
  return edit.stickers.find(sticker => sticker.id === edit.selectedId);
}

function panelSignature(edit) {
  const sticker = selectedSticker(edit);
  return [edit.tool, edit.mode, edit.filter, edit.ratio, edit.upscale, edit.rotate, edit.flipX, edit.flipY, edit.selectedId, edit.stickers.length, sticker?.kind || ''].join('|');
}

function paintPanel(env) {
  const root = document.getElementById('studioPanel');
  if (!root) return;
  const edit = env.state.edit;
  const { t, esc } = env;
  if (edit.tool === 'crop') {
    root.innerHTML = `<div class="ratio-row">${RATIOS.map(([value, key]) => `<button type="button" data-action="studioRatio" data-ratio="${value}" class="${edit.ratio === value ? 'on' : ''}">${esc(t(key))}</button>`).join('')}</div>`;
  } else if (edit.tool === 'filter') {
    root.innerHTML = `<div class="filter-grid">${FILTERS.map(([value, key, swatch]) => `<button type="button" data-action="studioFilter" data-filter="${value}" class="${edit.filter === value ? 'on' : ''}"><span class="filter-swatch swatch-${swatch}"></span>${esc(t(key))}</button>`).join('')}</div>`;
  } else if (edit.tool === 'adjust') {
    root.innerHTML = ['brightness', 'contrast', 'saturate', 'vignette'].map(key => slider(t, key, edit[key], key === 'vignette' ? 0 : 40, key === 'vignette' ? 80 : 160)).join('');
  } else if (edit.tool === 'emoji') {
    const sticker = selectedSticker(edit);
    root.innerHTML = `<div class="emoji-palette">${EMOJIS.map(emoji => `<button type="button" data-action="studioAddEmoji" data-emoji="${emoji}" aria-label="${emoji}">${emoji}</button>`).join('')}</div>
      <div class="studio-text-row"><input id="studioText" maxlength="40" placeholder="${esc(t('textPlaceholder'))}" /><button type="button" class="btn btn-outline" data-action="studioAddText">${esc(t('addText'))}</button></div>
      ${sticker ? `<div class="sticker-editor">${slider(t, 'stickerSize', Math.round(sticker.size * 100), 8, 46)}${slider(t, 'stickerRotate', Number(sticker.rotation) || 0, -180, 180)}${sticker.kind === 'text' ? `<label class="studio-color">${esc(t('stickerColor'))}<input data-edit="textColor" type="color" value="${esc(sticker.color || '#ffffff')}"/></label>` : ''}<button type="button" class="btn btn-outline" data-action="studioDelete">${esc(t('removeSticker'))}</button></div>` : ''}`;
  } else if (edit.tool === 'rotate') {
    root.innerHTML = `<div class="rotate-row">
      <button type="button" class="btn btn-outline" data-action="studioRotate" data-dir="ccw">${env.icon('rotate', 16)} ${esc(t('rotateLeft'))}</button>
      <button type="button" class="btn btn-outline" data-action="studioRotate" data-dir="cw">${env.icon('rotate', 16)} ${esc(t('rotateRight'))}</button>
      <button type="button" class="btn btn-outline" data-action="studioFlip" data-axis="x">${esc(t('flipHorizontal'))}</button>
      <button type="button" class="btn btn-outline" data-action="studioFlip" data-axis="y">${esc(t('flipVertical'))}</button>
    </div><p class="upscale-note">${edit.rotate}°${edit.flipX ? ' · ↔' : ''}${edit.flipY ? ' · ↕' : ''}</p>`;
  } else if (edit.tool === 'upscale') {
    root.innerHTML = `<div class="scale-row">${[1, 2, 3].map(scale => {
      const size = imageEl ? plannedSize(imageEl, { ...edit, upscale: scale }) : null;
      const label = size && Math.abs(size.scale - scale) > 0.05 ? `${scale}× → ${trimScale(size.scale)}×` : `${scale}×`;
      const detail = size ? `${size.w} × ${size.h}` : '';
      return `<button type="button" data-action="studioUpscale" data-scale="${scale}" class="${Number(edit.upscale) === scale ? 'on' : ''}"><b>${label}</b><small>${detail}</small></button>`;
    }).join('')}</div><p class="upscale-note">${esc(t('upscaleNote'))}</p>`;
  }
}

function slider(t, key, value, min, max) {
  const name = { saturate: 'saturation', stickerSize: 'stickerSize', stickerRotate: 'stickerRotate' }[key] || key;
  const shown = key === 'stickerRotate' ? `${value}°` : value;
  return `<label class="slider-line"><span>${t(name)}</span><input data-edit="${key}" type="range" min="${min}" max="${max}" value="${value}" /><output>${shown}</output></label>`;
}

function syncSliders(edit) {
  document.querySelectorAll('#studioPanel [data-edit]').forEach(el => {
    if (document.activeElement === el) return;
    if (el.dataset.edit === 'stickerSize') {
      const sticker = selectedSticker(edit);
      if (sticker) el.value = String(Math.round(sticker.size * 100));
    } else if (el.dataset.edit === 'stickerRotate') {
      const sticker = selectedSticker(edit);
      if (sticker) el.value = String(Number(sticker.rotation) || 0);
    } else if (el.dataset.edit === 'textColor') {
      const sticker = selectedSticker(edit);
      el.value = sticker?.kind === 'text' ? sticker.color : (edit.textColor || '#ffffff');
    } else if (edit[el.dataset.edit] != null) el.value = edit[el.dataset.edit];
    const out = el.parentElement?.querySelector('output');
    if (out) out.textContent = el.dataset.edit === 'stickerRotate' ? `${el.value}°` : el.value;
  });
}

function sync(env, rebuild) {
  activeEnv = env;
  paintChrome(env);
  const sig = panelSignature(env.state.edit);
  if (rebuild || sig !== panelSig) {
    panelSig = sig;
    paintPanel(env);
  }
  syncSliders(env.state.edit);
  draw(env);
}

function stagePoint(event) {
  const canvas = document.getElementById('studioCanvas');
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function displayToImage(point) {
  const scale = view.fit.dw / view.bounds.w;
  return { x: (point.x - view.fit.ox) / scale, y: (point.y - view.fit.oy) / scale };
}

function hitHandle(point, box) {
  const found = Object.entries(handles(box)).find(([, spot]) => Math.hypot(spot.x - point.x, spot.y - point.y) <= 14);
  return found?.[0] || '';
}

function hitSticker(point, edit) {
  const box = cropBox();
  if (!box) return null;
  for (let index = edit.stickers.length - 1; index >= 0; index -= 1) {
    const sticker = edit.stickers[index];
    const size = Math.max(14, sticker.size * Math.min(box.w, box.h));
    const x = box.x + sticker.nx * box.w;
    const y = box.y + sticker.ny * box.h;
    const rad = -((Number(sticker.rotation) || 0) * Math.PI) / 180;
    const dx = point.x - x;
    const dy = point.y - y;
    const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
    if (Math.abs(localX) <= size * 0.7 && Math.abs(localY) <= size * 0.75) return sticker;
  }
  return null;
}

function onStageDown(event) {
  if (!activeEnv || !imageEl || !view || event.button > 0) return;
  const edit = activeEnv.state.edit;
  if (edit.mode === 'preview') return;
  const point = stagePoint(event);
  if (edit.tool === 'emoji') {
    const sticker = hitSticker(point, edit);
    edit.selectedId = sticker?.id || '';
    if (sticker) {
      const box = cropBox();
      drag = {
        kind: 'sticker', id: sticker.id, pointerId: event.pointerId,
        ox: (point.x - box.x) / box.w - sticker.nx,
        oy: (point.y - box.y) / box.h - sticker.ny,
        moved: false,
      };
    }
    sync(activeEnv, true);
    return;
  }
  if (edit.tool !== 'crop') return;
  const box = cropBox();
  const handle = box ? hitHandle(point, box) : '';
  const inside = box && point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
  const imagePoint = displayToImage(point);
  drag = {
    kind: handle ? 'resize' : inside ? 'move' : 'new',
    handle, pointerId: event.pointerId, moved: false,
    start: { ...edit.crop }, ax: imagePoint.x, ay: imagePoint.y,
  };
}

function moveDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId || !activeEnv || !imageEl) return;
  const edit = activeEnv.state.edit;
  const point = stagePoint(event);
  if (drag.kind === 'sticker') {
    const sticker = edit.stickers.find(item => item.id === drag.id);
    const box = cropBox();
    if (!sticker || !box) return;
    if (!drag.moved) { remember(activeEnv.state); drag.moved = true; }
    sticker.nx = clamp((point.x - box.x) / box.w - drag.ox, 0, 1);
    sticker.ny = clamp((point.y - box.y) / box.h - drag.oy, 0, 1);
    draw(activeEnv);
    return;
  }
  const imagePoint = displayToImage(point);
  if (!drag.moved && Math.hypot(imagePoint.x - drag.ax, imagePoint.y - drag.ay) < 3) return;
  if (!drag.moved) { remember(activeEnv.state); drag.moved = true; }
  const bounds = orientedSize(imageEl, edit);
  if (drag.kind === 'move') {
    edit.crop.x = clamp(drag.start.x + (imagePoint.x - drag.ax), 0, bounds.w - drag.start.w);
    edit.crop.y = clamp(drag.start.y + (imagePoint.y - drag.ay), 0, bounds.h - drag.start.h);
  } else if (drag.kind === 'resize') {
    edit.crop = resizeCrop(drag.start, drag.handle, imagePoint, bounds, edit.ratio);
  } else {
    edit.crop = rectBetween({ x: drag.ax, y: drag.ay }, imagePoint, edit.ratio, bounds);
  }
  draw(activeEnv);
  paintChrome(activeEnv);
}

function resizeCrop(start, handle, point, bounds, ratio) {
  const min = 36;
  const ax = handle.includes('w') ? start.x + start.w : handle.includes('e') ? start.x : start.x + start.w / 2;
  const ay = handle.includes('n') ? start.y + start.h : handle.includes('s') ? start.y : start.y + start.h / 2;
  const px = clamp(point.x, 0, bounds.w);
  const py = clamp(point.y, 0, bounds.h);
  let w = Math.max(min, Math.abs(px - ax));
  let h = Math.max(min, Math.abs(py - ay));
  const vertical = handle === 'n' || handle === 's';
  const horizontal = handle === 'e' || handle === 'w';
  if (vertical) w = start.w;
  if (horizontal) h = start.h;
  if (ratio !== 'free') {
    const aspect = Number(ratio);
    if (vertical) w = h * aspect;
    else if (horizontal) h = w / aspect;
    else if (w / h > aspect) w = h * aspect;
    else h = w / aspect;
  }
  let x = vertical ? start.x : (px < ax ? ax - w : ax);
  let y = horizontal ? start.y : (py < ay ? ay - h : ay);
  if (vertical && ratio !== 'free') x = ax - w / 2;
  if (horizontal && ratio !== 'free') y = ay - h / 2;
  const crop = { x, y, w, h };
  clampCrop(crop, bounds);
  if (crop.w < min) crop.w = Math.min(min, bounds.w);
  if (crop.h < min) crop.h = Math.min(min, bounds.h);
  clampCrop(crop, bounds);
  return crop;
}

function rectBetween(a, b, ratio, bounds) {
  let x = Math.min(a.x, b.x);
  let y = Math.min(a.y, b.y);
  let w = Math.max(1, Math.abs(a.x - b.x));
  let h = Math.max(1, Math.abs(a.y - b.y));
  if (ratio !== 'free') {
    const aspect = Number(ratio);
    if (w / h > aspect) w = h * aspect;
    else h = w / aspect;
    x = b.x >= a.x ? a.x : a.x - w;
    y = b.y >= a.y ? a.y : a.y - h;
  }
  const crop = { x, y, w, h };
  clampCrop(crop, bounds);
  return crop;
}

function finishDrag() {
  if (!drag) return;
  const ended = drag;
  drag = null;
  if (!ended.moved || !activeEnv) return;
  const edit = activeEnv.state.edit;
  if (ended.kind === 'new' && imageEl && (edit.crop.w < 28 || edit.crop.h < 28)) {
    edit.crop = ended.start;
    activeEnv.state.editPast.pop();
  } else if (ended.kind === 'resize' && edit.ratio !== 'free' && imageEl) {
    edit.crop = cropToRatio(edit.crop, edit.ratio, orientedSize(imageEl, edit));
  }
  draw(activeEnv);
  paintChrome(activeEnv);
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('pointermove', moveDrag, { passive: false });
  window.addEventListener('pointerup', () => {
    finishDrag();
    const wasComparing = comparing;
    comparing = false;
    gesture = false;
    if (wasComparing && activeEnv) { paintChrome(activeEnv); draw(activeEnv); }
  });
  window.addEventListener('pointerdown', event => {
    if (!activeEnv) return;
    if (event.target.closest?.('[data-edit]') && !gesture) {
      remember(activeEnv.state);
      gesture = true;
    }
    if (event.target.closest?.('#studioCompare')) {
      event.preventDefault();
      comparing = true;
      paintChrome(activeEnv);
      draw(activeEnv);
    }
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read this image'));
    img.src = url;
  });
}

export function unbindStudio() {
  mountToken += 1;
  panelSig = '';
  drag = null;
  comparing = false;
  activeEnv = null;
  gradeCache = { key: '', source: null, canvas: null };
  pagePreview = { key: '', source: null, canvas: null };
  observer?.disconnect();
  observer = null;
}

export async function bindStudio(env) {
  activeEnv = env;
  const token = ++mountToken;
  listen();
  const stage = document.getElementById('studioStage');
  if (!stage) return;
  panelSig = '';
  stage.onpointerdown = onStageDown;
  observer?.disconnect();
  observer = new ResizeObserver(() => draw(activeEnv));
  observer.observe(stage);
  try {
    const url = await env.loadOriginal(env.state.photoId);
    if (token !== mountToken) return;
    imageEl = await loadImage(url);
    if (token !== mountToken) return;
    ensureCrop(imageEl, env.state.edit);
    sync(env, true);
  } catch (error) {
    env.report?.(error);
  }
}

function addSticker(edit, kind, value, color) {
  const count = edit.stickers.length;
  const id = `s${Date.now().toString(36)}${count}`;
  edit.stickers.push({
    id, kind, value, color,
    nx: count ? clamp(0.5 + ((count % 4) - 1.5) * 0.12, 0.12, 0.88) : 0.5,
    ny: count ? clamp(0.5 + (count % 3) * 0.12, 0.12, 0.88) : 0.5,
    size: kind === 'text' ? 0.14 : 0.22,
    rotation: 0,
  });
  edit.selectedId = id;
  edit.tool = 'emoji';
}

export function studioAction(env, action, el) {
  const { state } = env;
  const edit = state.edit;
  if (!action.startsWith('studio')) return false;
  activeEnv = env;
  if (action === 'studioTool') { edit.tool = el.dataset.tool; sync(env, true); return true; }
  if (action === 'studioMode') { edit.mode = el.dataset.mode === 'preview' ? 'preview' : 'edit'; sync(env, true); return true; }
  if (action === 'studioRatio') {
    if (!imageEl) return true;
    remember(state);
    edit.ratio = el.dataset.ratio;
    ensureCrop(imageEl, edit);
    edit.crop = cropToRatio(edit.crop, edit.ratio, orientedSize(imageEl, edit));
    sync(env, true);
    return true;
  }
  if (action === 'studioFilter') {
    remember(state);
    edit.filter = el.dataset.filter;
    sync(env, true);
    return true;
  }
  if (action === 'studioUpscale') { remember(state); edit.upscale = Number(el.dataset.scale); sync(env, true); return true; }
  if (action === 'studioRotate') { mapSelection(state, el.dataset.dir === 'ccw' ? screenCCW : screenCW, true); sync(env, true); return true; }
  if (action === 'studioFlip') { mapSelection(state, el.dataset.axis === 'y' ? screenFlipV : screenFlipH, false); sync(env, true); return true; }
  if (action === 'studioAddEmoji') { remember(state); addSticker(edit, 'emoji', el.dataset.emoji, '#ffffff'); sync(env, true); return true; }
  if (action === 'studioAddText') {
    const input = document.getElementById('studioText');
    const value = input?.value.trim();
    if (!value) return true;
    remember(state);
    addSticker(edit, 'text', value.slice(0, 40), edit.textColor || '#ffffff');
    input.value = '';
    sync(env, true);
    return true;
  }
  if (action === 'studioDelete') {
    if (!edit.selectedId) return true;
    remember(state);
    edit.stickers = edit.stickers.filter(sticker => sticker.id !== edit.selectedId);
    edit.selectedId = '';
    sync(env, true);
    return true;
  }
  if (action === 'studioUndo') { undo(state); if (imageEl) ensureCrop(imageEl, state.edit); sync(env, true); return true; }
  if (action === 'studioRedo') { redo(state); if (imageEl) ensureCrop(imageEl, state.edit); sync(env, true); return true; }
  if (action === 'studioReset') {
    remember(state);
    const mode = edit.mode;
    state.edit = freshEdit();
    state.edit.mode = mode;
    if (imageEl) ensureCrop(imageEl, state.edit);
    sync(env, true);
    return true;
  }
  return false;
}

export function studioInput(env, el) {
  const key = el.dataset.edit;
  if (!key) return false;
  const edit = env.state.edit;
  if (key === 'stickerSize') {
    const sticker = selectedSticker(edit);
    if (sticker) sticker.size = clamp(Number(el.value) / 100, 0.08, 0.46);
  } else if (key === 'stickerRotate') {
    const sticker = selectedSticker(edit);
    if (sticker) sticker.rotation = Number(el.value);
  } else if (key === 'textColor') {
    edit.textColor = el.value;
    const sticker = selectedSticker(edit);
    if (sticker?.kind === 'text') sticker.color = el.value;
  } else if (key === 'brightness' || key === 'contrast' || key === 'saturate' || key === 'vignette') {
    edit[key] = Number(el.value);
  } else return false;
  const out = el.parentElement?.querySelector('output');
  if (out) out.textContent = key === 'stickerRotate' ? `${el.value}°` : el.value;
  paintChrome(env);
  draw(env);
  return true;
}

export function studioKey(env, event) {
  if (env.state.modal !== 'photo' || env.state.editTab !== 'edit') return false;
  activeEnv = env;
  const edit = env.state.edit;
  const typing = event.target.matches?.('input, textarea, select');
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !typing) {
    event.preventDefault();
    if (event.shiftKey) redo(env.state); else undo(env.state);
    if (imageEl) ensureCrop(imageEl, env.state.edit);
    sync(env, true);
    return true;
  }
  if (event.key === 'Enter' && event.target.id === 'studioText') {
    event.preventDefault();
    studioAction(env, 'studioAddText', event.target);
    return true;
  }
  if (typing) return false;
  if ((event.key === 'Backspace' || event.key === 'Delete') && edit.selectedId) {
    event.preventDefault();
    studioAction(env, 'studioDelete', event.target);
    return true;
  }
  if (event.key === 'Escape' && edit.selectedId) {
    edit.selectedId = '';
    sync(env, true);
    return true;
  }
  if (!event.key.startsWith('Arrow') || edit.tool !== 'emoji' || edit.mode !== 'edit') return false;
  const sticker = selectedSticker(edit);
  if (!sticker) return false;
  event.preventDefault();
  if (!arrowGesture) { remember(env.state); arrowGesture = true; }
  clearTimeout(arrowTimer);
  arrowTimer = setTimeout(() => { arrowGesture = false; }, 450);
  const step = event.shiftKey ? 0.04 : 0.012;
  if (event.key === 'ArrowLeft') sticker.nx -= step;
  if (event.key === 'ArrowRight') sticker.nx += step;
  if (event.key === 'ArrowUp') sticker.ny -= step;
  if (event.key === 'ArrowDown') sticker.ny += step;
  sticker.nx = clamp(sticker.nx, 0, 1);
  sticker.ny = clamp(sticker.ny, 0, 1);
  draw(env);
  return true;
}

function stepwise(ctx, oriented, crop, outW, outH) {
  let frame = document.createElement('canvas');
  frame.width = Math.max(1, Math.round(crop.w));
  frame.height = Math.max(1, Math.round(crop.h));
  const first = frame.getContext('2d');
  first.imageSmoothingEnabled = true;
  first.imageSmoothingQuality = 'high';
  first.drawImage(oriented, crop.x, crop.y, crop.w, crop.h, 0, 0, frame.width, frame.height);
  while (frame.width < outW - 1 && frame.height < outH - 1) {
    const nextW = Math.min(outW, frame.width * 2);
    const nextH = Math.min(outH, frame.height * 2);
    if (nextW === frame.width && nextH === frame.height) break;
    const next = document.createElement('canvas');
    next.width = nextW;
    next.height = nextH;
    const nctx = next.getContext('2d');
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(frame, 0, 0, nextW, nextH);
    frame = next;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(frame, 0, 0, outW, outH);
}

function sharpen(ctx, width, height) {
  const src = ctx.getImageData(0, 0, width, height);
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round(width / 2));
  small.height = Math.max(1, Math.round(height / 2));
  small.getContext('2d').drawImage(ctx.canvas, 0, 0, small.width, small.height);
  const soft = document.createElement('canvas');
  soft.width = width;
  soft.height = height;
  const softCtx = soft.getContext('2d');
  softCtx.imageSmoothingQuality = 'high';
  softCtx.drawImage(small, 0, 0, width, height);
  const blur = softCtx.getImageData(0, 0, width, height);
  const pixels = src.data;
  const blurred = blur.data;
  const amount = 0.42;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = clamp(pixels[i] + amount * (pixels[i] - blurred[i]), 0, 255);
    pixels[i + 1] = clamp(pixels[i + 1] + amount * (pixels[i + 1] - blurred[i + 1]), 0, 255);
    pixels[i + 2] = clamp(pixels[i + 2] + amount * (pixels[i + 2] - blurred[i + 2]), 0, 255);
  }
  ctx.putImageData(src, 0, 0);
}

export function bakeEdit(img, edit) {
  const working = freshEdit();
  Object.assign(working, JSON.parse(JSON.stringify(edit)));
  const bounds = ensureCrop(img, working);
  const oriented = document.createElement('canvas');
  oriented.width = Math.max(1, Math.round(bounds.w));
  oriented.height = Math.max(1, Math.round(bounds.h));
  const octx = oriented.getContext('2d');
  octx.translate(oriented.width / 2, oriented.height / 2);
  octx.scale(working.flipX ? -1 : 1, working.flipY ? -1 : 1);
  octx.rotate((working.rotate * Math.PI) / 180);
  const src = pxSize(img);
  octx.drawImage(gradedSource(img, working, 0), -src.w / 2, -src.h / 2, src.w, src.h);
  const crop = working.crop;
  const scale = clampedScale(crop.w, crop.h, working.upscale);
  const outW = Math.max(1, Math.round(crop.w * scale));
  const outH = Math.max(1, Math.round(crop.h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  stepwise(ctx, oriented, crop, outW, outH);
  drawVignette(ctx, 0, 0, outW, outH, vignetteAmount(working));
  working.stickers.forEach(sticker => drawSticker(ctx, sticker, { x: 0, y: 0, w: outW, h: outH }, false));
  if (scale > 1.05 && outW * outH <= 8_000_000) sharpen(ctx, outW, outH);
  return canvas;
}

export function studioMarkup(t, icon, esc) {
  const tools = [
    ['crop', 'crop', t('crop')],
    ['filter', 'filter', t('filter')],
    ['adjust', 'sun', t('adjust')],
    ['emoji', 'emoji', t('emoji')],
    ['rotate', 'rotate', t('rotation')],
    ['upscale', 'expand', t('upscale')],
  ];
  return `<div class="studio-stage" id="studioStage"><canvas id="studioCanvas"></canvas><div class="preview-tag" id="studioMeta"></div></div>
    <div class="photo-controls studio-controls">
      <div class="studio-scroll">
        <div class="studio-tools">${tools.map(([id, name, label]) => `<button type="button" data-action="studioTool" data-tool="${id}" data-studio-tool="${id}">${icon(name, 18)}<span>${esc(label)}</span></button>`).join('')}</div>
        <p class="studio-hint" id="studioHint"></p>
        <div id="studioPanel" class="studio-panel"></div>
      </div>
      <div class="studio-footer">
        <div class="studio-footer-left">
          <button type="button" class="icon-btn" data-action="studioUndo" id="studioUndo" title="${esc(t('undo'))}" aria-label="${esc(t('undo'))}">${icon('undo', 18)}</button>
          <button type="button" class="icon-btn" data-action="studioRedo" id="studioRedo" title="${esc(t('redo'))}" aria-label="${esc(t('redo'))}">${icon('redo', 18)}</button>
          <button type="button" class="btn btn-outline" data-action="studioReset">${esc(t('resetEdits'))}</button>
          <button type="button" class="btn btn-outline" id="studioCompare" title="${esc(t('compareHold'))}">${esc(t('compare'))}</button>
        </div>
        <button type="button" class="btn btn-primary studio-apply" data-action="applyEdit">${icon('check', 17)} ${esc(t('applyEdit'))}</button>
      </div>
    </div>`;
}
