// VICE HEAT — cover render engine. Vanilla 2D canvas, zero network.
// All visuals are procedural: panels, grades, lettering, grain, halftone.
// Public surface: createStudioState(), renderCover(), renderPanel(),
// renderTitle(), exportPNG(), PALETTES, LAYOUTS, TREATMENTS, SIZES.

export const LAYOUTS = {
  '2x2': { cols: 2, rows: 2, label: '2 × 2 · four panels' },
  '1x2': { cols: 1, rows: 2, label: '1 × 2 · stacked pair' },
  '1x3': { cols: 1, rows: 3, label: '1 × 3 · triple stack' },
  '2x3': { cols: 2, rows: 3, label: '2 × 3 · six panels' },
};

export const TREATMENTS = {
  color: { label: 'Full color' },
  duotone: { label: 'Duotone pink' },
  noir: { label: 'Noir contrast' },
  sunset: { label: 'Sunset wash' },
};

export const PALETTES = {
  sunset: {
    name: 'Vice sunset',
    sky: ['#ff2e88', '#ff7a18', '#7b2ff7', '#2b0a4a'],
    sun: ['#ffe259', '#ff7e5f'],
    sea: '#1c0533',
    ink: '#160420',
    title: ['#ff2e88', '#ffd319'],
    strip: '#12021f',
    accent: '#ffd319',
  },
  neon: {
    name: 'Neon night',
    sky: ['#0b1035', '#123a8f', '#ff2e88', '#05081f'],
    sun: ['#7df9ff', '#ff2e88'],
    sea: '#04081a',
    ink: '#05081f',
    title: ['#7df9ff', '#ff2e88'],
    strip: '#04081a',
    accent: '#7df9ff',
  },
};

export const SIZES = {
  '1200x675': { w: 1200, h: 675, label: '1200 × 675 · X / wide' },
  '1080x1080': { w: 1080, h: 1080, label: '1080 × 1080 · square' },
  '1080x1350': { w: 1080, h: 1350, label: '1080 × 1350 · portrait' },
  '1600x900': { w: 1600, h: 900, label: '1600 × 900 · desktop' },
};

export const TEXT_COLORS = {
  pink: ['#ff2e88', '#ffd319'],
  gold: ['#ffb347', '#fff3a0'],
  white: ['#ffffff', '#ffe9f5'],
};

// A panel slot. photo is an HTMLImageElement or null (procedural art).
export function blankPanel(treatment) {
  return {
    photo: null,
    photoName: '',
    treatment: treatment || 'color',
    scale: 1,
    ox: 0, // pan offset, in panel-width fractions
    oy: 0,
    rot: 0, // degrees
    flip: false,
    border: true,
    seed: Math.floor(Math.random() * 1e9),
  };
}

export function createStudioState() {
  return {
    layout: '2x2',
    palette: 'sunset',
    size: '1080x1080',
    line1: 'VICE',
    line2: 'HEAT',
    tagline: 'EVERY SUNSET HAS A PRICE',
    textColor: 'pink',
    textPos: 'center', // 'center' | 'bottom'
    photos: [], // {img, name} tray
    panels: [
      blankPanel('color'),
      blankPanel('duotone'),
      blankPanel('noir'),
      blankPanel('sunset'),
      blankPanel('color'),
      blankPanel('duotone'),
    ],
    selected: 0,
  };
}

export function panelCount(state) {
  const l = LAYOUTS[state.layout];
  return l.cols * l.rows;
}

// ---- layout geometry (all proportional to W/H) ---------------------------
function panelRects(W, H, state) {
  const l = LAYOUTS[state.layout];
  const margin = Math.round(Math.min(W, H) * 0.028);
  const gut = Math.round(Math.min(W, H) * 0.012);
  const innerW = W - margin * 2;
  const innerH = H - margin * 2;
  const pw = (innerW - gut * (l.cols - 1)) / l.cols;
  const ph = (innerH - gut * (l.rows - 1)) / l.rows;
  const rects = [];
  for (let r = 0; r < l.rows; r++) {
    for (let c = 0; c < l.cols; c++) {
      rects.push({
        x: margin + c * (pw + gut),
        y: margin + r * (ph + gut),
        w: pw,
        h: ph,
      });
    }
  }
  return rects;
}

// ---- small deterministic PRNG (seeded per panel, stable across redraws) --
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- procedural placeholder scene ---------------------------------------
// A Vice City dusk: striped sun, palm silhouettes, skyline, sea streaks.
function drawPalm(ctx, x, y, s, lean, ink) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);
  ctx.scale(s, s);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = 'round';
  // trunk
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(6, -52, -4, -96);
  ctx.stroke();
  // fronds: tapered arcs fanning from the crown
  const crownX = -4, crownY = -96;
  const spread = [-2.5, -1.9, -1.3, -0.65, 0, 0.65, 1.3, 1.9, 2.5];
  for (const a of spread) {
    const len = 52 + Math.abs(a) * -6 + 14;
    const dx = Math.sin(a) * len;
    const dy = -Math.cos(a) * len * 0.55 - 6;
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(crownX, crownY);
    ctx.quadraticCurveTo(crownX + dx * 0.45, crownY + dy * 0.7 - 14, crownX + dx, crownY + dy + 16);
    ctx.stroke();
  }
  // coconuts
  ctx.beginPath(); ctx.arc(crownX - 5, crownY + 4, 4, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(crownX + 4, crownY + 6, 3.5, 0, 7); ctx.fill();
  ctx.restore();
}

function drawScene(ctx, w, h, pal, seed) {
  const rnd = mulberry32(seed);
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.72);
  sky.addColorStop(0, pal.sky[0]);
  sky.addColorStop(0.45, pal.sky[1]);
  sky.addColorStop(0.8, pal.sky[2]);
  sky.addColorStop(1, pal.sky[3]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.72);
  // striped sun
  const sunR = Math.min(w, h) * (0.2 + rnd() * 0.08);
  const sunX = w * (0.3 + rnd() * 0.4);
  const sunY = h * 0.52;
  const sunGrad = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
  sunGrad.addColorStop(0, pal.sun[0]);
  sunGrad.addColorStop(1, pal.sun[1]);
  ctx.save();
  ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, 7); ctx.clip();
  ctx.fillStyle = sunGrad;
  ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);
  // cut stripes out of the lower half
  ctx.globalCompositeOperation = 'destination-out';
  let yy = sunY + sunR * 0.08;
  let gap = 2;
  while (yy < sunY + sunR) {
    ctx.fillRect(sunX - sunR, yy, sunR * 2, gap);
    yy += gap + sunR * 0.13;
    gap += 2.2;
  }
  ctx.restore();
  // birds
  ctx.strokeStyle = 'rgba(20,4,31,0.75)';
  ctx.lineWidth = Math.max(1.5, w * 0.004);
  for (let i = 0; i < 3; i++) {
    const bx = w * (0.12 + rnd() * 0.7);
    const by = h * (0.1 + rnd() * 0.18);
    const bs = w * 0.02;
    ctx.beginPath();
    ctx.moveTo(bx - bs, by);
    ctx.quadraticCurveTo(bx - bs * 0.4, by - bs * 0.7, bx, by);
    ctx.quadraticCurveTo(bx + bs * 0.4, by - bs * 0.7, bx + bs, by);
    ctx.stroke();
  }
  // skyline
  ctx.fillStyle = pal.ink;
  let sx = 0;
  while (sx < w) {
    const bw = w * (0.06 + rnd() * 0.1);
    const bh = h * (0.05 + rnd() * 0.12);
    ctx.fillRect(sx, h * 0.72 - bh, bw, bh);
    sx += bw + w * 0.015;
  }
  // sea
  const sea = ctx.createLinearGradient(0, h * 0.72, 0, h);
  sea.addColorStop(0, pal.sky[2]);
  sea.addColorStop(1, pal.sea);
  ctx.fillStyle = sea;
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  // sun reflection streaks
  for (let i = 0; i < 14; i++) {
    const ry = h * (0.74 + rnd() * 0.22);
    const rw = w * (0.04 + rnd() * 0.16) * (1 - (ry - h * 0.72) / (h * 0.28));
    const rx = sunX + (rnd() - 0.5) * w * 0.24;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(255,210,90,0.5)' : 'rgba(255,46,136,0.4)';
    ctx.fillRect(rx - rw / 2, ry, rw, Math.max(1.5, h * 0.006));
  }
  // palms
  const palms = 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < palms; i++) {
    const px = i === 0 ? w * (0.04 + rnd() * 0.1) : w * (0.82 + rnd() * 0.12);
    const py = h * (0.98 + rnd() * 0.02);
    const ps = (Math.min(w, h) / 340) * (0.8 + rnd() * 0.5);
    drawPalm(ctx, px, py, ps, (rnd() - 0.5) * 0.35, pal.ink);
  }
}

// ---- photo / scene treatment --------------------------------------------
function applyTreatment(ctx, w, h, treatment, pal) {
  if (treatment === 'color') return;
  if (treatment === 'sunset') {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,46,136,0.20)');
    g.addColorStop(0.55, 'rgba(255,122,24,0.38)');
    g.addColorStop(1, 'rgba(123,47,247,0.48)');
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(255,140,40,0.35)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  // duotone + noir need pixels
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  if (treatment === 'duotone') {
    // shadow #1b0533 -> mid #ff2e88 -> high #ffc46b
    for (let i = 0; i < d.length; i += 4) {
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      let r, g, b;
      if (lum < 0.5) {
        const t = lum / 0.5;
        r = 27 + (255 - 27) * t;
        g = 5 + (46 - 5) * t;
        b = 51 + (136 - 51) * t;
      } else {
        const t = (lum - 0.5) / 0.5;
        r = 255;
        g = 46 + (196 - 46) * t;
        b = 136 + (107 - 136) * t;
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
  } else if (treatment === 'noir') {
    for (let i = 0; i < d.length; i += 4) {
      let lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      lum = Math.max(0, Math.min(1, (lum - 0.5) * 1.7 + 0.5)); // contrast
      const v = lum * 255;
      d[i] = v * 0.96; d[i + 1] = v * 0.97; d[i + 2] = v * 1.06; // cool shadows
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Draw one panel (photo or procedural scene) into rect on ctx.
export function renderPanel(ctx, rect, panel, pal) {
  const { x, y, w, h } = rect;
  const iw = Math.max(2, Math.round(w));
  const ih = Math.max(2, Math.round(h));
  const off = document.createElement('canvas');
  off.width = iw; off.height = ih;
  const o = off.getContext('2d');
  o.fillStyle = pal.ink;
  o.fillRect(0, 0, iw, ih);
  if (panel.photo) {
    const img = panel.photo;
    const iw0 = img.naturalWidth || img.width;
    const ih0 = img.naturalHeight || img.height;
    const base = Math.max(iw / iw0, ih / ih0);
    const s = base * panel.scale;
    o.save();
    o.translate(iw / 2 + panel.ox * iw, ih / 2 + panel.oy * ih);
    o.rotate((panel.rot * Math.PI) / 180);
    if (panel.flip) o.scale(-1, 1);
    o.imageSmoothingQuality = 'high';
    o.drawImage(img, (-iw0 * s) / 2, (-ih0 * s) / 2, iw0 * s, ih0 * s);
    o.restore();
    // gentle saturation lift for the color treatment
    if (panel.treatment === 'color') {
      o.globalCompositeOperation = 'overlay';
      const g = o.createLinearGradient(0, 0, 0, ih);
      g.addColorStop(0, 'rgba(255,120,80,0.08)');
      g.addColorStop(1, 'rgba(120,40,200,0.10)');
      o.fillStyle = g;
      o.fillRect(0, 0, iw, ih);
      o.globalCompositeOperation = 'source-over';
    }
  } else {
    drawScene(o, iw, ih, pal, panel.seed);
  }
  applyTreatment(o, iw, ih, panel.treatment, pal);
  ctx.drawImage(off, x, y, w, h);
  if (panel.border) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.012);
    ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
    ctx.restore();
  }
}

// ---- grain + halftone (print look) ---------------------------------------
let grainTile = null;
let dotTile = null;

function makeGrainTile() {
  const t = document.createElement('canvas');
  t.width = 140; t.height = 140;
  const c = t.getContext('2d');
  const img = c.createImageData(140, 140);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 100 + Math.floor(Math.random() * 100);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return t;
}

function makeDotTile() {
  const t = document.createElement('canvas');
  t.width = 12; t.height = 12;
  const c = t.getContext('2d');
  c.fillStyle = '#000';
  c.beginPath(); c.arc(6, 6, 2.1, 0, 7); c.fill();
  return t;
}

function printFinish(ctx, W, H) {
  if (!grainTile) grainTile = makeGrainTile();
  if (!dotTile) dotTile = makeDotTile();
  ctx.save();
  ctx.globalAlpha = 0.055;
  ctx.globalCompositeOperation = 'overlay';
  const pat = ctx.createPattern(grainTile, 'repeat');
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.05;
  ctx.globalCompositeOperation = 'source-over';
  const dots = ctx.createPattern(dotTile, 'repeat');
  ctx.fillStyle = dots;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(10,0,25,0)');
  v.addColorStop(1, 'rgba(10,0,25,0.32)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

// ---- title + bottom strip -------------------------------------------------
function fitFont(ctx, text, maxW, startPx, family) {
  let size = startPx;
  ctx.font = `italic 900 ${size}px ${family}`;
  while (size > 14 && ctx.measureText(text).width > maxW) {
    size -= 4;
    ctx.font = `italic 900 ${size}px ${family}`;
  }
  return size;
}

export function renderTitle(ctx, W, H, state) {
  const pal = PALETTES[state.palette];
  const gradColors = TEXT_COLORS[state.textColor] || TEXT_COLORS.pink;
  const family = '"Arial Black", Impact, "Helvetica Neue", Arial, sans-serif';
  const lines = [state.line1, state.line2].map((s) => (s || '').trim().toUpperCase()).filter(Boolean);
  if (!lines.length) return;
  const maxW = W * 0.92;
  const cy = state.textPos === 'bottom' ? H * 0.74 : H * 0.5;
  // legibility scrim behind the title
  const scrim = ctx.createLinearGradient(0, cy - H * 0.2, 0, cy + H * 0.2);
  scrim.addColorStop(0, 'rgba(10,0,25,0)');
  scrim.addColorStop(0.5, 'rgba(10,0,25,0.38)');
  scrim.addColorStop(1, 'rgba(10,0,25,0)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, cy - H * 0.2, W, H * 0.4);
  let size = fitFont(ctx, lines.reduce((a, b) => (a.length > b.length ? a : b)), maxW, Math.min(W, H) * 0.17, family);
  const lineH = size * 0.98;
  const totalH = lines.length * lineH;
  let ty = cy - totalH / 2 + size * 0.82;
  try { ctx.letterSpacing = `${Math.max(1, size * 0.02)}px`; } catch (e) { /* older canvas */ }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const grad = ctx.createLinearGradient(0, ty - size, 0, ty + totalH - size * 0.4);
  grad.addColorStop(0, gradColors[0]);
  grad.addColorStop(1, gradColors[1]);
  for (const line of lines) {
    // hard drop shadow
    ctx.font = `italic 900 ${size}px ${family}`;
    ctx.fillStyle = 'rgba(12,1,24,0.9)';
    ctx.fillText(line, W / 2 + size * 0.055, ty + size * 0.07);
    // thick outline, then gradient fill
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#14041f';
    ctx.lineWidth = Math.max(3, size * 0.16);
    ctx.strokeText(line, W / 2, ty);
    ctx.fillStyle = grad;
    ctx.fillText(line, W / 2, ty);
    // thin hot rim on top edge
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, size * 0.02);
    ctx.strokeText(line, W / 2, ty);
    ty += lineH;
  }
  try { ctx.letterSpacing = '0px'; } catch (e) { /* noop */ }
}

function renderStrip(ctx, W, H, state) {
  const pal = PALETTES[state.palette];
  const stripH = Math.round(H * 0.075);
  const y = H - stripH;
  ctx.fillStyle = pal.strip;
  ctx.globalAlpha = 0.92;
  ctx.fillRect(0, y, W, stripH);
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal.accent;
  ctx.fillRect(0, y, W, Math.max(2, stripH * 0.06));
  const pad = W * 0.03;
  const tag = (state.tagline || '').trim().toUpperCase();
  ctx.textBaseline = 'middle';
  if (tag) {
    const size = Math.max(11, stripH * 0.3);
    ctx.font = `700 ${size}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'left';
    try { ctx.letterSpacing = `${Math.max(1, size * 0.14)}px`; } catch (e) { /* noop */ }
    ctx.fillText(tag, pad, y + stripH * 0.56);
    try { ctx.letterSpacing = '0px'; } catch (e) { /* noop */ }
  }
  ctx.font = `900 ${Math.max(13, stripH * 0.42)}px "Arial Black", Impact, sans-serif`;
  ctx.fillStyle = pal.accent;
  ctx.textAlign = 'right';
  ctx.fillText('2026', W - pad, y + stripH * 0.56);
  // tiny badge, top-right of the cover
  const br = Math.min(W, H) * 0.045;
  const bx = W - br - W * 0.02;
  const by = br + H * 0.02;
  ctx.save();
  ctx.beginPath(); ctx.arc(bx, by, br, 0, 7);
  ctx.fillStyle = 'rgba(18,2,31,0.85)';
  ctx.fill();
  ctx.lineWidth = Math.max(2, br * 0.08);
  ctx.strokeStyle = pal.accent;
  ctx.stroke();
  ctx.fillStyle = pal.accent;
  ctx.font = `900 ${Math.max(9, br * 0.42)}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('★ VI', bx, by + br * 0.14);
  ctx.restore();
}

// ---- full cover ------------------------------------------------------------
export function renderCover(ctx, W, H, state) {
  const pal = PALETTES[state.palette] || PALETTES.sunset;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = pal.ink;
  ctx.fillRect(0, 0, W, H);
  const rects = panelRects(W, H, state);
  const n = panelCount(state);
  for (let i = 0; i < n; i++) {
    renderPanel(ctx, rects[i], state.panels[i], pal);
  }
  // selected panel marker is an editor affordance, not part of the art:
  // never drawn here (the editor draws it on its own overlay pass).
  printFinish(ctx, W, H);
  renderTitle(ctx, W, H, state);
  renderStrip(ctx, W, H, state);
  ctx.restore();
}

// ---- export -----------------------------------------------------------------
export function exportPNG(state, onDone) {
  const size = SIZES[state.size] || SIZES['1080x1080'];
  const off = document.createElement('canvas');
  off.width = size.w;
  off.height = size.h;
  renderCover(off.getContext('2d'), size.w, size.h, state);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  off.toBlob((blob) => {
    if (!blob) { onDone && onDone(null); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cover-art-${stamp}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    onDone && onDone({ blob, name: a.download, w: size.w, h: size.h });
  }, 'image/png');
}
