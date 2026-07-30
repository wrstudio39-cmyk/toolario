/* =========================================================
   SIGNAL — UUID / GUID Generator engine
   100% client-side. No network calls, no dependencies.
   ========================================================= */
(function(){
  "use strict";

  /* ---------------- Theme (shared pattern across Signal) ---------------- */
  const root = document.documentElement;
  const themeToggle = document.getElementById('theme-toggle');
  function applyTheme(t){
    root.setAttribute('data-theme', t);
    themeToggle.setAttribute('aria-pressed', t === 'light');
    themeToggle.setAttribute('aria-label', t === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    try{ localStorage.setItem('signal-theme', t); }catch(e){}
  }
  let savedTheme = 'dark';
  try{ savedTheme = localStorage.getItem('signal-theme') || (matchMedia('(prefers-color-scheme:light)').matches ? 'light' : 'dark'); }catch(e){}
  applyTheme(savedTheme);
  themeToggle.addEventListener('click', () => {
    applyTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
  });
  const footerYearEl = document.getElementById('footer-year');
  if (footerYearEl) footerYearEl.textContent = new Date().getFullYear();

  /* ---------------- Toast ---------------- */
  const toastRegion = document.getElementById('toast-region');
  function showToast(msg){
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    toastRegion.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 260);
    }, 2200);
  }

  /* ---------------- Clipboard helper (works even without secure context) ---------------- */
  function copyText(text){
    if (navigator.clipboard && window.isSecureContext){
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try{
        document.execCommand('copy');
        resolve();
      }catch(err){
        reject(err);
      }finally{
        ta.remove();
      }
    });
  }

  /* ---------------- UUID v4 (random) ---------------- */
  function uuidV4(){
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant RFC 4122
    return bytesToUuid(b);
  }

  /* ---------------- UUID v1 (time-based) ----------------
     Real v1 UUIDs embed a 60-bit timestamp (100ns ticks since
     1582-10-15), a clock sequence, and a 48-bit node id that is
     traditionally the machine's MAC address. Browsers can't read
     a MAC address, and modern implementations (RFC 9562) explicitly
     allow — and recommend for privacy — substituting a random node
     id with its multicast bit set instead of a real hardware
     address. That's what this generates: a spec-correct v1 layout
     with a real, monotonic timestamp and a random per-batch node id.
  ------------------------------------------------------------ */
  const GREGORIAN_OFFSET = 122192928000000000n; // ns ticks between 1582-10-15 and 1970-01-01
  let lastMs = 0, tick = 0;
  let sessionClockSeq = null;
  let sessionNode = null;

  function randomNode(){
    const n = crypto.getRandomValues(new Uint8Array(6));
    n[0] |= 0x01; // set multicast bit — signals "not a real MAC address"
    return n;
  }
  function ensureV1Session(){
    if (sessionNode === null) sessionNode = randomNode();
    if (sessionClockSeq === null){
      const c = crypto.getRandomValues(new Uint16Array(1))[0] & 0x3fff;
      sessionClockSeq = c | 0x8000; // variant bits 10
    }
  }
  function nextV1Timestamp(){
    const ms = Date.now();
    if (ms === lastMs){ tick = (tick + 1) % 10000; }
    else { tick = 0; lastMs = ms; }
    return BigInt(ms) * 10000n + BigInt(tick) + GREGORIAN_OFFSET;
  }
  function uuidV1(){
    ensureV1Session();
    const ts = nextV1Timestamp();
    const timeLow = Number(ts & 0xffffffffn);
    const timeMid = Number((ts >> 32n) & 0xffffn);
    const timeHi = Number(((ts >> 48n) & 0x0fffn) | 0x1000n); // version 1

    const b = new Uint8Array(16);
    b[0] = (timeLow >>> 24) & 0xff; b[1] = (timeLow >>> 16) & 0xff; b[2] = (timeLow >>> 8) & 0xff; b[3] = timeLow & 0xff;
    b[4] = (timeMid >>> 8) & 0xff; b[5] = timeMid & 0xff;
    b[6] = (timeHi >>> 8) & 0xff; b[7] = timeHi & 0xff;
    b[8] = (sessionClockSeq >>> 8) & 0xff; b[9] = sessionClockSeq & 0xff;
    b.set(sessionNode, 10);
    return bytesToUuid(b);
  }

  function bytesToUuid(b){
    const hex = Array.from(b, x => x.toString(16).padStart(2, '0'));
    return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
  }

  function formatUuid(uuid, opts){
    let s = uuid;
    if (opts.noHyphens) s = s.replace(/-/g, '');
    if (opts.uppercase) s = s.toUpperCase();
    if (opts.braces) s = `{${s}}`;
    return s;
  }

  /* ---------------- State ---------------- */
  let currentList = []; // [{raw, formatted, version}]
  let autoTimer = null;

  /* ---------------- DOM refs ---------------- */
  const outputBox = document.getElementById('output-box');
  const outputMeta = document.getElementById('output-meta');
  const genCount = document.getElementById('gen-count');
  const genTimestamp = document.getElementById('gen-timestamp');
  const searchInput = document.getElementById('search-filter');
  const generateBtn = document.getElementById('generate-btn');
  const copyAllBtn = document.getElementById('copy-all-btn');
  const downloadTxtBtn = document.getElementById('download-txt-btn');
  const downloadCsvBtn = document.getElementById('download-csv-btn');
  const clearBtn = document.getElementById('clear-btn');
  const autoToggle = document.getElementById('auto-toggle');

  function getOptions(){
    const version = document.querySelector('input[name="uuid-version"]:checked').value;
    const count = parseInt(document.querySelector('input[name="uuid-count"]:checked').value, 10);
    const uppercase = document.getElementById('opt-uppercase').checked;
    const noHyphens = document.getElementById('opt-no-hyphens').checked;
    const braces = document.getElementById('opt-braces').checked;
    return { version, count, uppercase, noHyphens, braces };
  }

  function generate(){
    const opts = getOptions();
    const list = [];
    for (let i = 0; i < opts.count; i++){
      const raw = opts.version === 'v1' ? uuidV1() : uuidV4();
      list.push({ raw, formatted: formatUuid(raw, opts), version: opts.version });
    }
    currentList = list;
    searchInput.value = '';
    render();
    const now = new Date();
    genTimestamp.textContent = now.toLocaleTimeString();
    showToast(`Generated ${list.length} UUID${list.length > 1 ? 's' : ''}`);
  }

  function render(){
    const filter = searchInput.value.trim().toLowerCase();
    outputBox.innerHTML = '';

    if (currentList.length === 0){
      outputBox.innerHTML = '<div class="empty-state">No UUIDs yet — choose your options and hit Generate.</div>';
      outputMeta.innerHTML = '';
      updateActionState();
      return;
    }

    const frag = document.createDocumentFragment();
    let visibleCount = 0;
    currentList.forEach((item, i) => {
      const matches = !filter || item.formatted.toLowerCase().includes(filter);
      if (matches) visibleCount++;
      const row = document.createElement('div');
      row.className = 'uuid-row' + (matches ? '' : ' hidden');
      row.innerHTML = `
        <span class="idx">${i + 1}</span>
        <span class="uuid-code">${item.formatted}</span>
        <span class="chip">${item.version === 'v1' ? 'Version 1' : 'Version 4'}</span>
        <button type="button" class="copy-btn" data-uuid="${item.formatted}" aria-label="Copy UUID ${item.formatted}">Copy</button>
      `;
      frag.appendChild(row);
    });
    outputBox.appendChild(frag);

    outputMeta.innerHTML = filter
      ? `<span>Showing <strong>${visibleCount}</strong> of <strong>${currentList.length}</strong></span><span>Generated at <strong id="gen-timestamp">${genTimestamp.textContent}</strong></span>`
      : `<span><strong>${currentList.length}</strong> UUID${currentList.length > 1 ? 's' : ''} generated</span><span>at <strong id="gen-timestamp">${genTimestamp.textContent}</strong></span>`;

    updateActionState();
  }

  function updateActionState(){
    const has = currentList.length > 0;
    copyAllBtn.disabled = !has;
    downloadTxtBtn.disabled = !has;
    downloadCsvBtn.disabled = !has;
    clearBtn.disabled = !has;
  }

  outputBox.addEventListener('click', (e) => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    const value = btn.getAttribute('data-uuid');
    copyText(value).then(() => {
      btn.textContent = 'Copied';
      btn.classList.add('copied');
      showToast('UUID copied to clipboard');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1400);
    }).catch(() => showToast('Copy failed — select and copy manually'));
  });

  searchInput.addEventListener('input', render);

  generateBtn.addEventListener('click', generate);

  copyAllBtn.addEventListener('click', () => {
    if (!currentList.length) return;
    const text = currentList.map(i => i.formatted).join('\n');
    copyText(text).then(() => showToast(`Copied ${currentList.length} UUIDs`))
      .catch(() => showToast('Copy failed — select and copy manually'));
  });

  function triggerDownload(content, filename, mime){
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  downloadTxtBtn.addEventListener('click', () => {
    if (!currentList.length) return;
    const content = currentList.map(i => i.formatted).join('\n') + '\n';
    triggerDownload(content, `uuid-list-${Date.now()}.txt`, 'text/plain');
    showToast('TXT file downloaded');
  });

  downloadCsvBtn.addEventListener('click', () => {
    if (!currentList.length) return;
    const rows = ['Index,UUID,Version'];
    currentList.forEach((item, i) => rows.push(`${i + 1},${item.formatted},${item.version === 'v1' ? 'Version 1 (time-based)' : 'Version 4 (random)'}`));
    triggerDownload(rows.join('\n') + '\n', `uuid-list-${Date.now()}.csv`, 'text/csv');
    showToast('CSV file downloaded');
  });

  clearBtn.addEventListener('click', () => {
    currentList = [];
    render();
    showToast('Cleared');
  });

  autoToggle.addEventListener('change', () => {
    if (autoToggle.checked){
      generate();
      autoTimer = setInterval(generate, 2500);
      showToast('Auto-regenerate on — every 2.5s');
    } else {
      clearInterval(autoTimer);
      autoTimer = null;
      showToast('Auto-regenerate off');
    }
  });

  /* Regenerate immediately when options change, for instant feedback,
     but only if a list already exists (don't surprise a first-time visitor). */
  document.querySelectorAll('input[name="uuid-version"], input[name="uuid-count"], #opt-uppercase, #opt-no-hyphens, #opt-braces')
    .forEach(el => el.addEventListener('change', () => { if (currentList.length) generate(); }));

  /* ---------------- Keyboard shortcuts ---------------- */
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
    if (e.key === '/' && !typing){
      e.preventDefault();
      searchInput.focus();
      return;
    }
    if (typing) return;
    if (e.key === 'g' || e.key === 'G'){ generate(); }
    else if (e.key === 'c' || e.key === 'C'){ copyAllBtn.click(); }
    else if (e.key === 'a' || e.key === 'A'){ autoToggle.checked = !autoToggle.checked; autoToggle.dispatchEvent(new Event('change')); }
  });

  /* ---------------- Validator ---------------- */
  const validatorInput = document.getElementById('validator-input');
  const resultCard = document.getElementById('result-card');

  function analyzeUuid(raw){
    const s = raw.trim().replace(/^\{|\}$/g, '');
    const re = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i;
    const m = s.match(re);
    if (!m) return { valid: false };

    const hexOnly = s.replace(/-/g, '');
    const isNil = /^0+$/.test(hexOnly);
    const versionChar = m[3][0].toLowerCase();
    const variantChar = m[4][0].toLowerCase();

    let version = 'Non-standard';
    if (isNil) version = 'Nil UUID (all zeros)';
    else if (/[1-8]/.test(versionChar)) version = 'Version ' + parseInt(versionChar, 16);

    let variant = 'Reserved / NCS backward-compat (variant 0)';
    if (/[89ab]/.test(variantChar)) variant = 'RFC 4122 / RFC 9562 (variant 1)';
    else if (/[cd]/.test(variantChar)) variant = 'Microsoft legacy GUID (variant 2)';
    else if (/[ef]/.test(variantChar)) variant = 'Reserved for future use (variant 3)';

    return { valid: true, version, variant, formatted: s.toLowerCase() };
  }

  function renderValidatorResult(){
    const raw = validatorInput.value;
    if (!raw.trim()){
      resultCard.innerHTML = `
        <div class="result-status"><span class="dot"></span><span>Paste a UUID to check it</span></div>
        <p class="field-hint">Works with or without braces, and is not case-sensitive.</p>
      `;
      return;
    }
    const r = analyzeUuid(raw);
    if (!r.valid){
      resultCard.innerHTML = `
        <div class="result-status bad"><span class="dot"></span><span>Invalid UUID</span></div>
        <p class="field-hint">Expected format: 8-4-4-4-12 hex characters, e.g. <code>123e4567-e89b-12d3-a456-426614174000</code>.</p>
      `;
      return;
    }
    resultCard.innerHTML = `
      <div class="result-status ok"><span class="dot"></span><span>Valid UUID</span></div>
      <dl class="result-details">
        <dt>Version</dt><dd>${r.version}</dd>
        <dt>Variant</dt><dd>${r.variant}</dd>
        <dt>Normalized</dt><dd>${r.formatted}</dd>
      </dl>
    `;
  }
  validatorInput.addEventListener('input', renderValidatorResult);
  renderValidatorResult();

  /* ---------------- Code example tabs ---------------- */
  document.querySelectorAll('.code-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.code-block').forEach(b => b.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('code-' + tab.dataset.lang).classList.add('active');
    });
  });

  /* ---------------- Initial generation ---------------- */
  generate();

})();
