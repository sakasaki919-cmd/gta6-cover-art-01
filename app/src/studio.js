// VICE HEAT — studio wiring. Uploads, panel editing, drag-to-pan, live
// redraw, randomize, export, and the ?shot= screenshot scenes.
// No network: FileReader + canvas only; photos never leave the browser.
import {
  LAYOUTS, TREATMENTS, PALETTES, SIZES, TEXT_COLORS,
  blankPanel, createStudioState, panelCount,
  renderCover, renderPanel, exportPNG,
} from './engine.js';

const $ = (id) => document.getElementById(id);
const canvas = $('cover');
const ctx = canvas.getContext('2d');
const state = createStudioState();

let renderQueued = false;
function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    drawPreview();
  });
}

function previewSize() {
  const s = SIZES[state.size] || SIZES['1080x1080'];
  const max = 960;
  const k = Math.min(1, max / Math.max(s.w, s.h));
  return { w: Math.round(s.w * k), h: Math.round(s.h * k) };
}

function drawPreview() {
  const { w, h } = previewSize();
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  renderCover(ctx, w, h, state);
  drawSelection();
}

// Selection outline drawn on the preview only (never in exports).
function drawSelection() {
  if (document.body.classList.contains('shot-cover')) return;
  const { w: W, h: H } = previewSize();
  const l = LAYOUTS[state.layout];
  const margin = Math.round(Math.min(W, H) * 0.028);
  const gut = Math.round(Math.min(W, H) * 0.012);
  const innerW = W - margin * 2;
  const innerH = H - margin * 2;
  const pw = (innerW - gut * (l.cols - 1)) / l.cols;
  const ph = (innerH - gut * (l.rows - 1)) / l.rows;
  const i = state.selected;
  const r = Math.floor(i / l.cols);
  const c = i % l.cols;
  const x = margin + c * (pw + gut);
  const y = margin + r * (ph + gut);
  ctx.save();
  ctx.strokeStyle = '#ffd319';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 6]);
  ctx.strokeRect(x + 2, y + 2, pw - 4, ph - 4);
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffd319';
  ctx.font = '700 13px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`PANEL ${i + 1}`, x + 8, y + 8);
  ctx.restore();
}

function hitPanel(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const px = (clientX - r.left) * (canvas.width / r.width);
  const py = (clientY - r.top) * (canvas.height / r.height);
  const { w: W, h: H } = previewSize();
  const l = LAYOUTS[state.layout];
  const margin = Math.round(Math.min(W, H) * 0.028);
  const gut = Math.round(Math.min(W, H) * 0.012);
  const innerW = W - margin * 2;
  const innerH = H - margin * 2;
  const pw = (innerW - gut * (l.cols - 1)) / l.cols;
  const ph = (innerH - gut * (l.rows - 1)) / l.rows;
  for (let i = 0; i < panelCount(state); i++) {
    const rr = Math.floor(i / l.cols);
    const cc = i % l.cols;
    const x = margin + cc * (pw + gut);
    const y = margin + rr * (ph + gut);
    if (px >= x && px <= x + pw && py >= y && py <= y + ph) return { index: i, pw, ph };
  }
  return null;
}

// ---- photo loading ---------------------------------------------------------
function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImageUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function addPhotos(files) {
  const list = [...files].filter((f) => f.type && f.type.startsWith('image/'));
  if (!list.length) return;
  for (const file of list) {
    try {
      const img = await loadImageFile(file);
      state.photos.push({ img, name: file.name });
    } catch (e) { /* skip unreadable file */ }
  }
  // assign new photos to empty (procedural) panels first, then selected
  let p = 0;
  for (let i = 0; i < panelCount(state) && p < state.photos.length; i++) {
    if (!state.panels[i].photo) {
      state.panels[i].photo = state.photos[p].img;
      state.panels[i].photoName = state.photos[p].name;
      state.panels[i].scale = 1; state.panels[i].ox = 0; state.panels[i].oy = 0; state.panels[i].rot = 0;
      p++;
    }
  }
  renderTray();
  syncPanelControls();
  requestRender();
  setStatus(`${list.length} photo${list.length > 1 ? 's' : ''} loaded — drag inside a panel to reposition.`);
}

function renderTray() {
  const tray = $('tray');
  tray.innerHTML = '';
  state.photos.forEach((p, idx) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'thumb';
    b.title = p.name;
    const im = document.createElement('img');
    im.src = p.img.src;
    im.alt = p.name;
    b.appendChild(im);
    b.addEventListener('click', () => {
      const panel = state.panels[state.selected];
      panel.photo = p.img;
      panel.photoName = p.name;
      panel.scale = 1; panel.ox = 0; panel.oy = 0; panel.rot = 0;
      syncPanelControls();
      requestRender();
      setStatus(`Photo assigned to panel ${state.selected + 1}.`);
    });
    tray.appendChild(b);
  });
  $('tray-empty').style.display = state.photos.length ? 'none' : 'block';
}

// ---- controls ---------------------------------------------------------------
function setStatus(msg) {
  $('status').textContent = msg;
}

function syncPanelControls() {
  const p = state.panels[state.selected];
  $('scale').value = p.scale;
  $('scale-val').textContent = `${Math.round(p.scale * 100)}%`;
  $('rotate').value = p.rot;
  $('rotate-val').textContent = `${p.rot}°`;
  $('flip').setAttribute('aria-pressed', String(p.flip));
  $('flip').classList.toggle('on', p.flip);
  $('border').checked = p.border;
  document.querySelectorAll('#treatments button').forEach((b) => {
    b.classList.toggle('on', b.dataset.treatment === p.treatment);
  });
  $('panel-label').textContent = `Panel ${state.selected + 1}${p.photo ? ' — ' + p.photoName : ' — procedural art'}`;
}

function buildControlGroups() {
  const lg = $('layouts');
  for (const [key, l] of Object.entries(LAYOUTS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = l.label;
    b.dataset.layout = key;
    b.addEventListener('click', () => {
      state.layout = key;
      if (state.selected >= panelCount(state)) state.selected = 0;
      document.querySelectorAll('#layouts button').forEach((x) => x.classList.toggle('on', x === b));
      syncPanelControls();
      requestRender();
    });
    if (key === state.layout) b.classList.add('on');
    lg.appendChild(b);
  }
  const pg = $('palettes');
  for (const [key, p] of Object.entries(PALETTES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p.name;
    b.dataset.palette = key;
    b.addEventListener('click', () => {
      state.palette = key;
      document.querySelectorAll('#palettes button').forEach((x) => x.classList.toggle('on', x === b));
      requestRender();
    });
    if (key === state.palette) b.classList.add('on');
    pg.appendChild(b);
  }
  const tg = $('treatments');
  for (const [key, t] of Object.entries(TREATMENTS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t.label;
    b.dataset.treatment = key;
    b.addEventListener('click', () => {
      state.panels[state.selected].treatment = key;
      syncPanelControls();
      requestRender();
    });
    tg.appendChild(b);
  }
  const cg = $('textcolors');
  for (const [key] of Object.entries(TEXT_COLORS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = key[0].toUpperCase() + key.slice(1);
    b.dataset.color = key;
    b.addEventListener('click', () => {
      state.textColor = key;
      document.querySelectorAll('#textcolors button').forEach((x) => x.classList.toggle('on', x === b));
      requestRender();
    });
    if (key === state.textColor) b.classList.add('on');
    cg.appendChild(b);
  }
  const tp = $('textpos');
  for (const [key, label] of [['center', 'Center'], ['bottom', 'Bottom']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => {
      state.textPos = key;
      document.querySelectorAll('#textpos button').forEach((x) => x.classList.toggle('on', x === b));
      requestRender();
    });
    if (key === state.textPos) b.classList.add('on');
    tp.appendChild(b);
  }
  const sg = $('sizes');
  for (const [key, s] of Object.entries(SIZES)) {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = s.label;
    sg.appendChild(o);
  }
  sg.value = state.size;
}

function wireEvents() {
  $('photo').addEventListener('change', (e) => addPhotos(e.target.files));
  const dz = $('dropzone');
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => addPhotos(e.dataTransfer.files));
  canvas.addEventListener('dragover', (e) => e.preventDefault());
  canvas.addEventListener('drop', (e) => { e.preventDefault(); addPhotos(e.dataTransfer.files); });

  $('line1').addEventListener('input', (e) => { state.line1 = e.target.value; requestRender(); });
  $('line2').addEventListener('input', (e) => { state.line2 = e.target.value; requestRender(); });
  $('tagline').addEventListener('input', (e) => { state.tagline = e.target.value; requestRender(); });
  $('sizes').addEventListener('change', (e) => { state.size = e.target.value; requestRender(); });

  $('scale').addEventListener('input', (e) => {
    state.panels[state.selected].scale = Number(e.target.value);
    $('scale-val').textContent = `${Math.round(Number(e.target.value) * 100)}%`;
    requestRender();
  });
  $('rotate').addEventListener('input', (e) => {
    state.panels[state.selected].rot = Number(e.target.value);
    $('rotate-val').textContent = `${e.target.value}°`;
    requestRender();
  });
  $('flip').addEventListener('click', () => {
    const p = state.panels[state.selected];
    p.flip = !p.flip;
    syncPanelControls();
    requestRender();
  });
  $('border').addEventListener('change', (e) => {
    state.panels[state.selected].border = e.target.checked;
    requestRender();
  });
  $('procedural').addEventListener('click', () => {
    const p = state.panels[state.selected];
    p.photo = null; p.photoName = '';
    p.seed = Math.floor(Math.random() * 1e9);
    syncPanelControls();
    requestRender();
    setStatus(`Panel ${state.selected + 1} back to procedural art.`);
  });

  // canvas: click selects panel, drag pans its photo, wheel zooms it
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const hit = hitPanel(e.clientX, e.clientY);
    if (!hit) return;
    canvas.setPointerCapture(e.pointerId);
    if (hit.index !== state.selected) {
      state.selected = hit.index;
      syncPanelControls();
      requestRender();
    }
    drag = { x: e.clientX, y: e.clientY, ox: state.panels[hit.index].ox, oy: state.panels[hit.index].oy, pw: hit.pw };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = state.panels[state.selected];
    if (!p.photo) return;
    p.ox = drag.ox + (e.clientX - drag.x) / drag.pw;
    p.oy = drag.oy + (e.clientY - drag.y) / drag.pw;
    p.ox = Math.max(-1, Math.min(1, p.ox));
    p.oy = Math.max(-1, Math.min(1, p.oy));
    requestRender();
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const hit = hitPanel(e.clientX, e.clientY);
    const idx = hit ? hit.index : state.selected;
    const p = state.panels[idx];
    if (!p.photo) return;
    p.scale = Math.max(0.5, Math.min(4, p.scale * (e.deltaY < 0 ? 1.08 : 0.93)));
    if (idx === state.selected) syncPanelControls();
    requestRender();
  }, { passive: false });

  $('randomize').addEventListener('click', () => {
    const keys = Object.keys(TREATMENTS);
    const n = panelCount(state);
    for (let i = 0; i < n; i++) {
      state.panels[i].treatment = keys[Math.floor(Math.random() * keys.length)];
      state.panels[i].seed = Math.floor(Math.random() * 1e9);
    }
    const pals = Object.keys(PALETTES);
    state.palette = pals[Math.floor(Math.random() * pals.length)];
    document.querySelectorAll('#palettes button').forEach((x) => x.classList.toggle('on', x.dataset.palette === state.palette));
    const layouts = Object.keys(LAYOUTS);
    state.layout = layouts[Math.floor(Math.random() * layouts.length)];
    document.querySelectorAll('#layouts button').forEach((x) => x.classList.toggle('on', x.dataset.layout === state.layout));
    if (state.selected >= panelCount(state)) state.selected = 0;
    syncPanelControls();
    requestRender();
    setStatus('Style randomized — hit Export when it looks right.');
  });

  $('export').addEventListener('click', () => {
    setStatus('Rendering PNG…');
    exportPNG(state, (res) => {
      if (!res) { setStatus('Export failed — try again.'); return; }
      setStatus(`Saved ${res.name} (${res.w} × ${res.h}).`);
    });
  });
}

// ---- ?shot= scenes -----------------------------------------------------------
// ?shot=cover → cover alone, fullscreen. ?shot=editor → full editor with a
// sample photo loaded. ?photo=<name> picks samples/<name>.jpg,
// ?caption=<text> sets the two title lines. window.__shotReady fires once
// the scene has painted (double rAF).
function splitCaption(text) {
  const words = (text || 'Sunset Heist').trim().split(/\s+/);
  if (words.length === 1) return [words[0], ''];
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(' '), words.slice(half).join(' ')];
}

async function runShot() {
  const q = new URLSearchParams(location.search);
  const shot = q.get('shot');
  if (!shot) return false;
  if (shot === 'cover') document.body.classList.add('shot-cover');
  const photoName = q.get('photo') || 'pier';
  const [l1, l2] = splitCaption(q.get('caption') || 'Sunset Heist');
  state.line1 = l1;
  state.line2 = l2;
  if (q.get('layout') && LAYOUTS[q.get('layout')]) state.layout = q.get('layout');
  if (q.get('palette') && PALETTES[q.get('palette')]) state.palette = q.get('palette');
  $('line1').value = state.line1;
  $('line2').value = state.line2;
  try {
    const img = await loadImageUrl(`samples/${photoName}.jpg`);
    state.photos.push({ img, name: `${photoName}.jpg` });
    const treatments = ['color', 'duotone', 'noir', 'sunset'];
    for (let i = 0; i < panelCount(state); i++) {
      state.panels[i].photo = img;
      state.panels[i].photoName = `${photoName}.jpg`;
      state.panels[i].treatment = treatments[i % treatments.length];
      state.panels[i].scale = 1; state.panels[i].ox = 0; state.panels[i].oy = 0; state.panels[i].rot = 0;
    }
  } catch (e) { /* keep procedural art */ }
  renderTray();
  syncPanelControls();
  if (shot === 'cover') {
    // cover fills the viewport at screenshot size
    const fit = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      renderCover(ctx, canvas.width, canvas.height, state);
    };
    window.addEventListener('resize', fit);
    fit();
  } else {
    requestRender();
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
  return true;
}

// ---- boot ---------------------------------------------------------------------
buildControlGroups();
wireEvents();
syncPanelControls();
renderTray();
if (!await runShot()) {
  drawPreview();
}
