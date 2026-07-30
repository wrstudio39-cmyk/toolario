/* =========================================================
   SIGNAL — Image Compressor engine
   Reads images locally, redraws them onto an offscreen
   canvas at the chosen dimensions, and re-encodes them via
   canvas.toBlob(). No file is ever uploaded anywhere.
   ========================================================= */
(function(){
  "use strict";

  /* ---------------- Theme ---------------- */
  const root = document.documentElement;
  const themeToggle = document.getElementById('theme-toggle');
  function applyTheme(t){
    root.setAttribute('data-theme', t);
    themeToggle.setAttribute('aria-pressed', t === 'dark');
    themeToggle.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    try{ localStorage.setItem('signal-ic-theme', t); }catch(e){}
  }
  let savedTheme = 'light';
  try{ savedTheme = localStorage.getItem('signal-ic-theme') || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'); }catch(e){}
  applyTheme(savedTheme);
  themeToggle.addEventListener('click', () => applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------- Utilities ---------------- */
  function formatBytes(bytes){
    if (bytes === 0 || bytes == null) return '0 KB';
    const units = ['B','KB','MB','GB'];
    let i = Math.floor(Math.log(bytes) / Math.log(1024));
    i = Math.min(i, units.length - 1);
    const val = bytes / Math.pow(1024, i);
    return (i === 0 ? val.toFixed(0) : val.toFixed(val < 10 ? 2 : 1)) + ' ' + units[i];
  }
  function debounce(fn, ms){
    let t;
    return function(...args){ clearTimeout(t); t = setTimeout(() => fn.apply(this,args), ms); };
  }
  function extForMime(mime){
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    return 'jpg';
  }
  function baseName(filename){
    const dot = filename.lastIndexOf('.');
    return dot > 0 ? filename.slice(0, dot) : filename;
  }
  let toastTimer;
  function showToast(msg){
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------------- State ---------------- */
  const state = {
    images: [],            // array of image entries
    settings: {
      fromFormat: 'any',   // 'any' | 'jpeg' | 'png' | 'webp'
      format: 'original',  // 'original' | 'jpeg' | 'png' | 'webp'
      quality: 0.8,
      resizeMode: '100',   // '100' | '75' | '50' | 'custom'
      maxWidth: null,
      maxHeight: null,
      lockAspect: true
    }
  };
  let uidCounter = 0;

  /* ---------------- DOM refs ---------------- */
  const dropzoneSection = document.getElementById('dropzone-section');
  const dropzone = document.getElementById('dropzone');
  const browseBtn = document.getElementById('browse-btn');
  const fileInput = document.getElementById('file-input');
  const workspace = document.getElementById('workspace');
  const imageGrid = document.getElementById('image-grid');
  const gridSummary = document.getElementById('grid-summary');

  const statCount = document.getElementById('stat-count');
  const statOriginal = document.getElementById('stat-original');
  const statCompressed = document.getElementById('stat-compressed');
  const statSavings = document.getElementById('stat-savings');

  const formatSegmented = document.getElementById('format-segmented');
  const formatHint = document.getElementById('format-hint');
  const fromSegmented = document.getElementById('from-segmented');
  const fromHint = document.getElementById('from-hint');
  const qualityGroup = document.getElementById('quality-group');
  const qualitySlider = document.getElementById('quality-slider');
  const qualityVal = document.getElementById('quality-val');
  const resizeSegmented = document.getElementById('resize-segmented');
  const customDimsGroup = document.getElementById('custom-dims-group');
  const maxWidthInput = document.getElementById('max-width');
  const maxHeightInput = document.getElementById('max-height');
  const lockAspect = document.getElementById('lock-aspect');
  const compressAllBtn = document.getElementById('compress-all-btn');
  const addMoreBtn = document.getElementById('add-more-btn');
  const clearAllBtn = document.getElementById('clear-all-btn');
  const downloadZipBtn = document.getElementById('download-zip-btn');

  /* ---------------- Adding files ---------------- */
  function openFileDialog(){ fileInput.click(); }
  browseBtn.addEventListener('click', openFileDialog);
  addMoreBtn.addEventListener('click', openFileDialog);
  dropzone.addEventListener('click', openFileDialog);
  dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openFileDialog(); } });

  fileInput.addEventListener('change', (e) => { addFiles(e.target.files); fileInput.value = ''; });

  ['dragenter','dragover'].forEach(ev => dropzone.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation(); dropzone.classList.add('drag-over');
  }));
  ['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('drag-over');
  }));
  dropzone.addEventListener('drop', (e) => { if (e.dataTransfer.files) addFiles(e.dataTransfer.files); });

  // Also allow dropping anywhere on the workspace once active
  document.addEventListener('dragover', (e) => { if (workspace.classList.contains('active')) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    if (workspace.classList.contains('active') && e.target.closest('#workspace') && !e.target.closest('.compare-overlay')){
      e.preventDefault();
      if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
    }
  });

  const FROM_MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

  function addFiles(fileList){
    let files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;

    if (state.settings.fromFormat !== 'any'){
      const wanted = FROM_MIME[state.settings.fromFormat];
      const matched = files.filter(f => f.type === wanted);
      const skipped = files.length - matched.length;
      if (skipped > 0){
        showToast(skipped + (skipped === 1 ? ' file was' : ' files were') + ' skipped — not ' + state.settings.fromFormat.toUpperCase());
      }
      files = matched;
      if (!files.length) return;
    }

    files.forEach(file => {
      const id = 'img-' + (++uidCounter);
      const originalURL = URL.createObjectURL(file);
      const entry = {
        id, file, originalURL,
        originalSize: file.size,
        img: null, width: 0, height: 0,
        compressedBlob: null, compressedURL: null, compressedSize: null,
        status: 'loading'
      };
      state.images.push(entry);
      renderNewCard(entry);

      const im = new Image();
      im.onload = () => {
        entry.img = im;
        entry.width = im.naturalWidth;
        entry.height = im.naturalHeight;
        entry.status = 'pending';
        processImage(entry);
      };
      im.onerror = () => {
        entry.status = 'error';
        updateCard(entry);
        showToast('Could not read ' + file.name);
      };
      im.src = originalURL;
    });

    dropzoneSection.classList.add('hidden');
    workspace.classList.add('active');
    updateGridSummary();
  }

  /* ---------------- Compression engine ---------------- */
  function computeTargetDims(entry){
    const s = state.settings;
    let w = entry.width, h = entry.height;
    if (!w || !h) return { w, h };

    if (s.resizeMode === '75') { w = Math.round(w * 0.75); h = Math.round(h * 0.75); }
    else if (s.resizeMode === '50') { w = Math.round(w * 0.5); h = Math.round(h * 0.5); }
    else if (s.resizeMode === 'custom'){
      const mw = s.maxWidth, mh = s.maxHeight;
      if (mw || mh){
        if (s.lockAspect){
          const ratio = entry.width / entry.height;
          if (mw && mh){
            // fit within box
            let targetW = mw, targetH = Math.round(mw / ratio);
            if (targetH > mh){ targetH = mh; targetW = Math.round(mh * ratio); }
            w = targetW; h = targetH;
          } else if (mw){
            w = mw; h = Math.round(mw / ratio);
          } else if (mh){
            h = mh; w = Math.round(mh * ratio);
          }
        } else {
          w = mw || w; h = mh || h;
        }
      }
    }
    // never upscale
    w = Math.min(w, entry.width);
    h = Math.min(h, entry.height);
    return { w: Math.max(1,w), h: Math.max(1,h) };
  }

  function resolveMime(entry){
    const s = state.settings;
    if (s.format === 'jpeg') return 'image/jpeg';
    if (s.format === 'png') return 'image/png';
    if (s.format === 'webp') return 'image/webp';
    // "original" — map to a canvas-safe mime
    const t = entry.file.type;
    if (t === 'image/jpeg' || t === 'image/png' || t === 'image/webp') return t;
    return 'image/png'; // gif / others get flattened to PNG
  }

  function processImage(entry){
    if (!entry.img) return;
    entry.status = 'processing';
    updateCard(entry);

    // Let the UI paint the spinner before doing the (fast but blocking) canvas work
    requestAnimationFrame(() => {
      try{
        const { w, h } = computeTargetDims(entry);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        const mime = resolveMime(entry);

        if (mime === 'image/jpeg'){
          // JPEG has no alpha channel — flatten onto white first
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0,0,w,h);
        }
        ctx.drawImage(entry.img, 0, 0, w, h);

        const quality = (mime === 'image/jpeg' || mime === 'image/webp') ? state.settings.quality : undefined;

        canvas.toBlob((blob) => {
          if (!blob){ entry.status = 'error'; updateCard(entry); return; }
          if (entry.compressedURL) URL.revokeObjectURL(entry.compressedURL);
          entry.compressedBlob = blob;
          entry.compressedSize = blob.size;
          entry.compressedURL = URL.createObjectURL(blob);
          entry.outMime = mime;
          entry.outWidth = w; entry.outHeight = h;
          entry.status = 'done';
          updateCard(entry);
          updateStatsBar();
        }, mime, quality);
      } catch(err){
        entry.status = 'error';
        updateCard(entry);
      }
    });
  }

  const recompressAll = debounce(() => {
    state.images.forEach(entry => { if (entry.img) processImage(entry); });
  }, 260);

  /* ---------------- Rendering ---------------- */
  function renderNewCard(entry){
    const card = document.createElement('div');
    card.className = 'panel img-card processing';
    card.id = entry.id;
    card.innerHTML = `
      <div class="img-thumb-wrap">
        <img src="${entry.originalURL}" alt="${escapeHtml(entry.file.name)}">
        <span class="fmt-badge" data-role="badge">…</span>
        <button type="button" class="remove-btn" data-role="remove" aria-label="Remove image">✕</button>
        <div class="processing-overlay"><div class="spinner"></div></div>
      </div>
      <div class="img-name" title="${escapeHtml(entry.file.name)}">${escapeHtml(entry.file.name)}</div>
      <div class="img-size-row">
        <span data-role="orig-size">${formatBytes(entry.originalSize)}</span>
        <span class="arrow">→</span>
        <span class="new-size" data-role="new-size">…</span>
      </div>
      <div class="img-savings" data-role="savings">&nbsp;</div>
      <div class="img-card-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-role="compare">Compare</button>
        <button type="button" class="btn btn-dark btn-sm" data-role="download">Download</button>
      </div>
    `;
    card.querySelector('[data-role="remove"]').addEventListener('click', (e) => { e.stopPropagation(); removeImage(entry.id); });
    card.querySelector('[data-role="download"]').addEventListener('click', () => downloadImage(entry));
    card.querySelector('[data-role="compare"]').addEventListener('click', () => openCompare(entry));
    imageGrid.appendChild(card);
  }

  function updateCard(entry){
    const card = document.getElementById(entry.id);
    if (!card) return;
    card.classList.toggle('processing', entry.status === 'processing' || entry.status === 'loading');
    const badge = card.querySelector('[data-role="badge"]');
    const newSize = card.querySelector('[data-role="new-size"]');
    const savings = card.querySelector('[data-role="savings"]');
    const downloadBtn = card.querySelector('[data-role="download"]');

    if (entry.status === 'error'){
      badge.textContent = 'ERR';
      newSize.textContent = '—';
      savings.textContent = 'Could not process this file';
      downloadBtn.disabled = true;
      return;
    }
    if (entry.status === 'done' && entry.compressedBlob){
      badge.textContent = extForMime(entry.outMime).toUpperCase();
      newSize.textContent = formatBytes(entry.compressedSize);
      const diff = entry.originalSize - entry.compressedSize;
      const pct = entry.originalSize ? Math.round((diff / entry.originalSize) * 100) : 0;
      if (diff >= 0){
        savings.textContent = `-${pct}% (${formatBytes(diff)} saved) · ${entry.outWidth}×${entry.outHeight}`;
        savings.style.color = 'var(--green-500)';
      } else {
        savings.textContent = `+${Math.abs(pct)}% larger · ${entry.outWidth}×${entry.outHeight}`;
        savings.style.color = 'var(--amber-500)';
      }
      downloadBtn.disabled = false;
    } else {
      badge.textContent = '…';
      newSize.textContent = 'Processing…';
    }
  }

  function updateGridSummary(){
    gridSummary.textContent = state.images.length + (state.images.length === 1 ? ' image loaded' : ' images loaded');
  }

  function updateStatsBar(){
    const count = state.images.length;
    let orig = 0, comp = 0, doneCount = 0;
    state.images.forEach(e => {
      orig += e.originalSize || 0;
      if (e.status === 'done'){ comp += e.compressedSize || 0; doneCount++; }
    });
    statCount.textContent = count;
    statOriginal.textContent = formatBytes(orig);
    statCompressed.textContent = doneCount ? formatBytes(comp) : '—';
    if (orig && doneCount){
      // Only count saved bytes for images that finished, scaled proportionally isn't needed; use finished totals
      let finishedOrig = 0;
      state.images.forEach(e => { if (e.status === 'done') finishedOrig += e.originalSize || 0; });
      const saved = finishedOrig - comp;
      const savedPct = finishedOrig ? Math.round((saved / finishedOrig) * 100) : 0;
      statSavings.textContent = (saved >= 0 ? '-' : '+') + Math.abs(savedPct) + '%';
      statSavings.style.color = saved >= 0 ? 'var(--green-500)' : 'var(--amber-500)';
    } else {
      statSavings.textContent = '0%';
    }
    updateGridSummary();
  }

  function escapeHtml(str){
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  /* ---------------- Remove / Clear ---------------- */
  function removeImage(id){
    const idx = state.images.findIndex(e => e.id === id);
    if (idx === -1) return;
    const entry = state.images[idx];
    URL.revokeObjectURL(entry.originalURL);
    if (entry.compressedURL) URL.revokeObjectURL(entry.compressedURL);
    state.images.splice(idx, 1);
    const card = document.getElementById(id);
    if (card) card.remove();
    updateStatsBar();
    if (!state.images.length){
      dropzoneSection.classList.remove('hidden');
      workspace.classList.remove('active');
    }
  }

  clearAllBtn.addEventListener('click', () => {
    [...state.images].forEach(e => removeImage(e.id));
  });

  /* ---------------- Settings wiring ---------------- */
  const FROM_HINTS = {
    any: 'Accepts any image format',
    jpeg: 'Only JPG/JPEG files will be accepted',
    png: 'Only PNG files will be accepted',
    webp: 'Only WebP files will be accepted'
  };
  const FROM_ACCEPT = {
    any: 'image/*',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp'
  };

  fromSegmented.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-from]');
    if (!btn) return;
    [...fromSegmented.children].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.settings.fromFormat = btn.dataset.from;
    fromHint.textContent = FROM_HINTS[state.settings.fromFormat];
    fileInput.setAttribute('accept', FROM_ACCEPT[state.settings.fromFormat]);
  });

  const FORMAT_HINTS = {
    original: "Keeps each image's original format",
    jpeg: 'Smaller files, no transparency — best for photos',
    png: 'Lossless, supports transparency — larger files',
    webp: 'Best compression, supports transparency'
  };

  formatSegmented.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-format]');
    if (!btn) return;
    [...formatSegmented.children].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.settings.format = btn.dataset.format;
    formatHint.textContent = FORMAT_HINTS[state.settings.format];
    qualityGroup.style.opacity = state.settings.format === 'png' ? '.45' : '1';
    qualitySlider.disabled = state.settings.format === 'png';
    recompressAll();
  });

  qualitySlider.addEventListener('input', () => {
    state.settings.quality = Number(qualitySlider.value) / 100;
    qualityVal.textContent = qualitySlider.value + '%';
    recompressAll();
  });

  resizeSegmented.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-resize]');
    if (!btn) return;
    [...resizeSegmented.children].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.settings.resizeMode = btn.dataset.resize;
    customDimsGroup.style.display = state.settings.resizeMode === 'custom' ? 'flex' : 'none';
    customDimsGroup.style.flexDirection = 'column';
    recompressAll();
  });

  const onDimsChange = debounce(() => {
    state.settings.maxWidth = maxWidthInput.value ? Number(maxWidthInput.value) : null;
    state.settings.maxHeight = maxHeightInput.value ? Number(maxHeightInput.value) : null;
    recompressAll();
  }, 300);
  maxWidthInput.addEventListener('input', onDimsChange);
  maxHeightInput.addEventListener('input', onDimsChange);
  lockAspect.addEventListener('change', () => { state.settings.lockAspect = lockAspect.checked; recompressAll(); });

  compressAllBtn.addEventListener('click', () => { recompressAll(); showToast('Re-compressing all images…'); });

  /* ---------------- Download ---------------- */
  function downloadImage(entry){
    if (!entry.compressedBlob) return;
    const a = document.createElement('a');
    a.href = entry.compressedURL;
    a.download = baseName(entry.file.name) + '-compressed.' + extForMime(entry.outMime);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  downloadZipBtn.addEventListener('click', async () => {
    const ready = state.images.filter(e => e.status === 'done' && e.compressedBlob);
    if (!ready.length){ showToast('No compressed images yet'); return; }
    if (typeof JSZip === 'undefined'){ showToast('ZIP library still loading — try again in a second'); return; }
    downloadZipBtn.disabled = true;
    downloadZipBtn.textContent = 'Zipping…';
    try{
      const zip = new JSZip();
      const usedNames = new Set();
      ready.forEach(entry => {
        let name = baseName(entry.file.name) + '.' + extForMime(entry.outMime);
        let n = name, i = 1;
        while (usedNames.has(n)){ n = baseName(entry.file.name) + '-' + (i++) + '.' + extForMime(entry.outMime); }
        usedNames.add(n);
        zip.file(n, entry.compressedBlob);
      });
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = 'signal-compressed-images.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('ZIP downloaded');
    } catch(err){
      showToast('Could not build ZIP');
    } finally {
      downloadZipBtn.disabled = false;
      downloadZipBtn.textContent = 'Download all (.zip)';
    }
  });

  /* ---------------- Compare modal ---------------- */
  const compareOverlay = document.getElementById('compare-overlay');
  const compareTitle = document.getElementById('compare-title');
  const compareBeforeImg = document.getElementById('compare-before-img');
  const compareAfterImg = document.getElementById('compare-after-img');
  const compareAfter = document.getElementById('compare-after');
  const compareStage = document.getElementById('compare-stage');
  const compareSlider = document.getElementById('compare-slider');
  const compareClose = document.getElementById('compare-close');
  const compareOriginalSize = document.getElementById('compare-original-size');
  const compareNewSize = document.getElementById('compare-new-size');
  const compareSavings = document.getElementById('compare-savings');
  const compareDims = document.getElementById('compare-dims');

  function openCompare(entry){
    if (!entry.compressedURL){ showToast('Still processing — try again in a moment'); return; }
    compareTitle.textContent = entry.file.name;
    compareBeforeImg.src = entry.originalURL;
    compareAfterImg.src = entry.compressedURL;
    compareOriginalSize.textContent = formatBytes(entry.originalSize);
    compareNewSize.textContent = formatBytes(entry.compressedSize);
    const diff = entry.originalSize - entry.compressedSize;
    const pct = entry.originalSize ? Math.round((diff / entry.originalSize) * 100) : 0;
    compareSavings.textContent = (diff >= 0 ? '-' : '+') + Math.abs(pct) + '%';
    compareDims.textContent = entry.outWidth + '×' + entry.outHeight;
    compareSlider.value = 50;
    compareOverlay.classList.add('open');
    // Position after images once layout settles
    requestAnimationFrame(() => syncCompareSlider());
  }
  function syncCompareSlider(){
    const rect = compareStage.getBoundingClientRect();
    const pct = compareSlider.value / 100;
    compareAfter.style.width = (rect.width * pct) + 'px';
    compareAfterImg.style.width = rect.width + 'px';
  }
  compareSlider.addEventListener('input', syncCompareSlider);
  window.addEventListener('resize', () => { if (compareOverlay.classList.contains('open')) syncCompareSlider(); });
  compareClose.addEventListener('click', () => compareOverlay.classList.remove('open'));
  compareOverlay.addEventListener('click', (e) => { if (e.target === compareOverlay) compareOverlay.classList.remove('open'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') compareOverlay.classList.remove('open'); });

  /* ---------------- Preset (used by dedicated "X to Y" landing pages) ---------------- */
  function applyPreset(preset){
    if (!preset) return;
    if (preset.from && FROM_ACCEPT.hasOwnProperty(preset.from)){
      const btn = fromSegmented.querySelector(`button[data-from="${preset.from}"]`);
      if (btn){
        [...fromSegmented.children].forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.settings.fromFormat = preset.from;
        fromHint.textContent = FROM_HINTS[preset.from];
        fileInput.setAttribute('accept', FROM_ACCEPT[preset.from]);
      }
    }
    if (preset.to && ['original','jpeg','png','webp'].includes(preset.to)){
      const btn = formatSegmented.querySelector(`button[data-format="${preset.to}"]`);
      if (btn){
        [...formatSegmented.children].forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.settings.format = preset.to;
        formatHint.textContent = FORMAT_HINTS[preset.to];
        qualityGroup.style.opacity = preset.to === 'png' ? '.45' : '1';
        qualitySlider.disabled = preset.to === 'png';
      }
    }
  }
  if (typeof window.SIGNAL_PRESET !== 'undefined') applyPreset(window.SIGNAL_PRESET);

})();
