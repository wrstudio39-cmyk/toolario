/* =========================================================
   SIGNAL — QR Generator engine
   Uses the qrcode-generator library (global `qrcode`) to
   compute the module matrix, then renders it ourselves so we
   can fully control dot style, eye style, color, and logos.
   ========================================================= */
(function(){
  "use strict";

  /* ---------------- Theme ---------------- */
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
  document.getElementById('footer-year').textContent = new Date().getFullYear();

  /* ---------------- Field configs per QR type ---------------- */
  const FIELD_CONFIGS = {
    url:       [{id:'url', label:'Website URL', type:'text', placeholder:'https://example.com'}],
    text:      [{id:'text', label:'Text', type:'textarea', placeholder:'Type anything you want to encode'}],
    email:     [{id:'to', label:'Email address', type:'text', placeholder:'name@example.com'},
                {id:'subject', label:'Subject (optional)', type:'text', placeholder:'Subject'},
                {id:'body', label:'Message (optional)', type:'textarea', placeholder:'Message'}],
    phone:     [{id:'phone', label:'Phone number', type:'text', placeholder:'+1 555 000 1234'}],
    sms:       [{id:'phone', label:'Phone number', type:'text', placeholder:'+1 555 000 1234'},
                {id:'message', label:'Message', type:'textarea', placeholder:'Pre-filled SMS text'}],
    whatsapp:  [{id:'phone', label:'WhatsApp number (with country code)', type:'text', placeholder:'15550001234'},
                {id:'message', label:'Pre-filled message (optional)', type:'textarea', placeholder:'Hi! I found you via QR code.'}],
    wifi:      [{id:'ssid', label:'Network name (SSID)', type:'text', placeholder:'MyWiFi'},
                {id:'password', label:'Password', type:'text', placeholder:'••••••••'},
                {id:'encryption', label:'Encryption', type:'select', options:[['WPA','WPA/WPA2'],['WEP','WEP'],['nopass','None']]}],
    vcard:     [{id:'name', label:'Full name', type:'text', placeholder:'Jordan Lee'},
                {id:'org', label:'Company (optional)', type:'text', placeholder:'Studio Name'},
                {id:'phone', label:'Phone', type:'text', placeholder:'+1 555 000 1234'},
                {id:'email', label:'Email', type:'text', placeholder:'name@example.com'}],
    pdf:       [{id:'url', label:'PDF link', type:'text', placeholder:'https://example.com/file.pdf'}],
    drive:     [{id:'url', label:'Google Drive link', type:'text', placeholder:'https://drive.google.com/...'}],
    dropbox:   [{id:'url', label:'Dropbox link', type:'text', placeholder:'https://dropbox.com/s/...'}],
    youtube:   [{id:'url', label:'YouTube link', type:'text', placeholder:'https://youtube.com/@channel'}],
    instagram: [{id:'url', label:'Instagram link', type:'text', placeholder:'https://instagram.com/username'}],
    facebook:  [{id:'url', label:'Facebook link', type:'text', placeholder:'https://facebook.com/page'}],
    tiktok:    [{id:'url', label:'TikTok link', type:'text', placeholder:'https://tiktok.com/@username'}],
    linkedin:  [{id:'url', label:'LinkedIn link', type:'text', placeholder:'https://linkedin.com/in/username'}],
    twitter:   [{id:'url', label:'X (Twitter) link', type:'text', placeholder:'https://x.com/username'}],
    appstore:  [{id:'url', label:'App Store link', type:'text', placeholder:'https://apps.apple.com/app/...'}],
    googleplay:[{id:'url', label:'Google Play link', type:'text', placeholder:'https://play.google.com/store/apps/...'}],
    event:     [{id:'title', label:'Event title', type:'text', placeholder:'Studio Open Day'},
                {id:'location', label:'Location', type:'text', placeholder:'123 Main St'},
                {id:'start', label:'Start', type:'text', placeholder:'2026-09-01T10:00'},
                {id:'end', label:'End', type:'text', placeholder:'2026-09-01T14:00'}],
    location:  [{id:'address', label:'Address or place name', type:'text', placeholder:'Eiffel Tower, Paris'}]
  };

  // Types that just encode a single public URL, grouped with a friendly
  // label + placeholder so the field still feels tailored to the use case.
  const LINK_TYPE_META = {
    pinterest:  {label:'Pinterest link', placeholder:'https://pinterest.com/username'},
    snapchat:   {label:'Snapchat link', placeholder:'https://snapchat.com/add/username'},
    telegram:   {label:'Telegram link', placeholder:'https://t.me/username'},
    discord:    {label:'Discord invite link', placeholder:'https://discord.gg/invite'},
    threads:    {label:'Threads link', placeholder:'https://threads.net/@username'},
    menu:       {label:'Menu link', placeholder:'https://example.com/menu'},
    product:    {label:'Product page link', placeholder:'https://example.com/product'},
    portfolio:  {label:'Portfolio link', placeholder:'https://example.com/portfolio'},
    resume:     {label:'Resume link (PDF or page)', placeholder:'https://example.com/resume.pdf'},
    eventreg:   {label:'Event registration link', placeholder:'https://example.com/register'},
    review:     {label:'Google Review link', placeholder:'https://g.page/r/your-place/review'},
    payment:    {label:'Payment link', placeholder:'https://pay.example.com/you'},
    appstore:   {label:'App Store link', placeholder:'https://apps.apple.com/app/...'},
    googleplay: {label:'Google Play link', placeholder:'https://play.google.com/store/apps/...'},
    spotify:    {label:'Spotify link', placeholder:'https://open.spotify.com/artist/...'},
    applemusic: {label:'Apple Music link', placeholder:'https://music.apple.com/...'},
    netflix:    {label:'Netflix link', placeholder:'https://netflix.com/title/...'},
    steam:      {label:'Steam store link', placeholder:'https://store.steampowered.com/app/...'},
    epicgames:  {label:'Epic Games link', placeholder:'https://store.epicgames.com/...'},
    course:     {label:'Course link', placeholder:'https://example.com/course'},
    classroom:  {label:'Classroom link', placeholder:'https://classroom.google.com/c/...'},
    notes:      {label:'Notes link', placeholder:'https://example.com/notes.pdf'},
    presentation:{label:'Presentation link', placeholder:'https://example.com/slides'},
    assignment: {label:'Assignment link', placeholder:'https://example.com/assignment'},
    word:       {label:'Word document link', placeholder:'https://example.com/file.docx'},
    excel:      {label:'Excel spreadsheet link', placeholder:'https://example.com/file.xlsx'},
    ppt:        {label:'PowerPoint link', placeholder:'https://example.com/file.pptx'},
    zip:        {label:'ZIP archive link', placeholder:'https://example.com/file.zip'},
    images:     {label:'Image gallery link', placeholder:'https://example.com/gallery'},
    mp3:        {label:'MP3 audio link', placeholder:'https://example.com/track.mp3'},
    mp4:        {label:'MP4 video link', placeholder:'https://example.com/video.mp4'},
    onedrive:   {label:'OneDrive link', placeholder:'https://onedrive.live.com/...'}
  };
  Object.keys(LINK_TYPE_META).forEach(key => {
    FIELD_CONFIGS[key] = [{id:'url', label: LINK_TYPE_META[key].label, type:'text', placeholder: LINK_TYPE_META[key].placeholder}];
  });
  // Every type in this set encodes to a plain URL in buildData() below.
  const LINK_TYPES = new Set(['pdf','drive','dropbox','onedrive','youtube','instagram','facebook','tiktok',
    'linkedin','twitter', ...Object.keys(LINK_TYPE_META)]);

  const dynamicFieldsEl = document.getElementById('dynamic-fields');
  const qrTypeSelect = document.getElementById('qr-type');

  function renderFields(type){
    const fields = FIELD_CONFIGS[type] || [];
    dynamicFieldsEl.innerHTML = fields.map(f => {
      if(f.type === 'textarea'){
        return `<label class="field-label" for="f-${f.id}">${f.label}</label><textarea id="f-${f.id}" data-field="${f.id}" placeholder="${f.placeholder||''}"></textarea>`;
      }
      if(f.type === 'select'){
        const opts = f.options.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('');
        return `<label class="field-label" for="f-${f.id}">${f.label}</label><select id="f-${f.id}" class="select" data-field="${f.id}">${opts}</select>`;
      }
      return `<label class="field-label" for="f-${f.id}">${f.label}</label><input type="text" id="f-${f.id}" data-field="${f.id}" placeholder="${f.placeholder||''}">`;
    }).join('');
    dynamicFieldsEl.querySelectorAll('[data-field]').forEach(el => el.addEventListener('input', scheduleGenerate));
  }

  function fieldVal(id){
    const el = document.getElementById('f-' + id);
    return el ? el.value.trim() : '';
  }

  /* ---------------- Data string builders ---------------- */
  function esc(str){ return String(str).replace(/([\\;,:])/g, '\\$1'); }

  function buildData(type){
    if(LINK_TYPES.has(type)){
      let u = fieldVal('url') || 'https://example.com';
      if(!/^https?:\/\//i.test(u)) u = 'https://' + u;
      return u;
    }
    switch(type){
      case 'url': {
        let u = fieldVal('url') || 'https://example.com';
        if(!/^https?:\/\//i.test(u)) u = 'https://' + u;
        return u;
      }
      case 'text':
        return fieldVal('text') || 'Hello from Signal';
      case 'email': {
        const to = fieldVal('to') || 'name@example.com';
        const params = [];
        if(fieldVal('subject')) params.push('subject=' + encodeURIComponent(fieldVal('subject')));
        if(fieldVal('body')) params.push('body=' + encodeURIComponent(fieldVal('body')));
        return `mailto:${to}${params.length ? '?' + params.join('&') : ''}`;
      }
      case 'phone':
        return 'tel:' + (fieldVal('phone') || '+10000000000').replace(/[^\d+]/g, '');
      case 'sms': {
        const phone = (fieldVal('phone') || '+10000000000').replace(/[^\d+]/g, '');
        const msg = fieldVal('message');
        return `sms:${phone}${msg ? '?body=' + encodeURIComponent(msg) : ''}`;
      }
      case 'whatsapp': {
        const phone = (fieldVal('phone') || '10000000000').replace(/[^\d]/g, '');
        const msg = fieldVal('message');
        return `https://wa.me/${phone}${msg ? '?text=' + encodeURIComponent(msg) : ''}`;
      }
      case 'wifi': {
        const ssid = esc(fieldVal('ssid') || 'MyWiFi');
        const pass = esc(fieldVal('password') || '');
        const enc = fieldVal('encryption') || 'WPA';
        return `WIFI:T:${enc};S:${ssid};${enc === 'nopass' ? '' : 'P:' + pass + ';'}H:false;;`;
      }
      case 'vcard': {
        const name = fieldVal('name') || 'Jordan Lee';
        return `BEGIN:VCARD\nVERSION:3.0\nN:${name}\nFN:${name}\nORG:${fieldVal('org')}\nTEL:${fieldVal('phone')}\nEMAIL:${fieldVal('email')}\nEND:VCARD`;
      }
      case 'event': {
        const fmt = s => (s || '').replace(/[-:]/g, '').replace(/(\.\d+)?$/, '') || '20260101T090000';
        return `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:${fieldVal('title') || 'Event'}\nLOCATION:${fieldVal('location')}\nDTSTART:${fmt(fieldVal('start'))}\nDTEND:${fmt(fieldVal('end'))}\nEND:VEVENT\nEND:VCALENDAR`;
      }
      case 'location': {
        const addr = fieldVal('address') || 'Eiffel Tower, Paris';
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
      }
      default:
        return 'https://example.com';
    }
  }

  /* ---------------- Style state ---------------- */
  const els = {
    fg: document.getElementById('fg-color'),
    bg: document.getElementById('bg-color'),
    transparent: document.getElementById('transparent-bg'),
    dotStyle: document.getElementById('dot-style'),
    eyeStyle: document.getElementById('eye-style'),
    cornerStyle: document.getElementById('corner-style'),
    ec: document.getElementById('ec-level'),
    size: document.getElementById('qr-size'),
    padding: document.getElementById('qr-padding'),
    logoUpload: document.getElementById('logo-upload'),
    logoSize: document.getElementById('logo-size'),
    logoControls: document.getElementById('logo-controls'),
    removeLogo: document.getElementById('remove-logo'),
  };

  let logoImage = null;
  let lastMatrix = null; // {count, isDark(r,c)}
  let lastConfig = null;

  [els.fg, els.bg, els.transparent, els.dotStyle, els.eyeStyle, els.cornerStyle, els.ec, els.size, els.padding, els.logoSize]
    .forEach(el => el.addEventListener('input', scheduleGenerate));
  qrTypeSelect.addEventListener('change', () => { renderFields(qrTypeSelect.value); scheduleGenerate(); });

  els.logoUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => { logoImage = img; els.logoControls.hidden = false; scheduleGenerate(); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
  els.removeLogo.addEventListener('click', () => {
    logoImage = null; els.logoUpload.value = ''; els.logoControls.hidden = true; scheduleGenerate();
  });

  let genTimer = null;
  function scheduleGenerate(){ clearTimeout(genTimer); genTimer = setTimeout(generate, 90); }

  /* ---------------- QR matrix generation ---------------- */
  function computeMatrix(dataString, ecLevel){
    const qr = qrcode(0, ecLevel);
    qr.addData(dataString);
    qr.make();
    const count = qr.getModuleCount();
    return { count, isDark: (r,c) => qr.isDark(r,c) };
  }

  const FINDER_SIZE = 7;
  function inFinderZone(r, c, count){
    return (r < FINDER_SIZE && c < FINDER_SIZE) ||
           (r < FINDER_SIZE && c >= count - FINDER_SIZE) ||
           (r >= count - FINDER_SIZE && c < FINDER_SIZE);
  }

  function drawModuleShape(ctx, x, y, size, style, fg){
    ctx.fillStyle = fg;
    if(style === 'square'){
      ctx.fillRect(x, y, size, size);
    } else if(style === 'rounded'){
      const r = size * 0.32;
      roundRectPath(ctx, x, y, size, size, r);
      ctx.fill();
    } else { // dots
      const r = size * 0.42;
      ctx.beginPath();
      ctx.arc(x + size/2, y + size/2, r, 0, Math.PI*2);
      ctx.fill();
    }
  }

  function roundRectPath(ctx, x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }

  function drawEye(ctx, x0, y0, moduleSize, style, fg, bgFill){
    const outer = moduleSize * 7;
    const ringInset = moduleSize;
    const innerSize = moduleSize * 3;
    const innerOffset = moduleSize * 2;
    ctx.fillStyle = fg;
    if(style === 'circle'){
      ctx.beginPath(); ctx.arc(x0+outer/2, y0+outer/2, outer/2, 0, Math.PI*2); ctx.fill();
      if(bgFill !== 'transparent'){ ctx.fillStyle = bgFill; }
      else { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; }
      ctx.beginPath(); ctx.arc(x0+outer/2, y0+outer/2, outer/2 - ringInset, 0, Math.PI*2); ctx.fill();
      if(bgFill === 'transparent') ctx.restore();
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(x0+outer/2, y0+outer/2, innerSize/2, 0, Math.PI*2); ctx.fill();
    } else if(style === 'rounded'){
      roundRectPath(ctx, x0, y0, outer, outer, moduleSize*1.6); ctx.fill();
      if(bgFill !== 'transparent'){ ctx.fillStyle = bgFill; }
      else { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; }
      roundRectPath(ctx, x0+ringInset, y0+ringInset, outer-ringInset*2, outer-ringInset*2, moduleSize*1.1); ctx.fill();
      if(bgFill === 'transparent') ctx.restore();
      ctx.fillStyle = fg;
      roundRectPath(ctx, x0+innerOffset, y0+innerOffset, innerSize, innerSize, moduleSize*0.8); ctx.fill();
    } else { // square
      ctx.fillRect(x0, y0, outer, outer);
      if(bgFill !== 'transparent'){ ctx.fillStyle = bgFill; }
      else { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; }
      ctx.fillRect(x0+ringInset, y0+ringInset, outer-ringInset*2, outer-ringInset*2);
      if(bgFill === 'transparent') ctx.restore();
      ctx.fillStyle = fg;
      ctx.fillRect(x0+innerOffset, y0+innerOffset, innerSize, innerSize);
    }
  }

  function renderCanvas(canvas, matrix, cfg){
    const { count } = matrix;
    const size = cfg.size;
    const moduleSize = size / (count + cfg.padding * 2);
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,size,size);

    if(!cfg.transparent){
      ctx.fillStyle = cfg.bg;
      ctx.fillRect(0,0,size,size);
    }

    const offset = cfg.padding * moduleSize;
    const bgFill = cfg.transparent ? 'transparent' : cfg.bg;

    // data modules (skip finder zones)
    for(let r = 0; r < count; r++){
      for(let c = 0; c < count; c++){
        if(inFinderZone(r, c, count)) continue;
        if(matrix.isDark(r,c)){
          drawModuleShape(ctx, offset + c*moduleSize, offset + r*moduleSize, moduleSize, cfg.dotStyle, cfg.fg);
        }
      }
    }
    // eyes
    const positions = [[0,0],[0,count-7],[count-7,0]];
    positions.forEach(([r,c]) => {
      drawEye(ctx, offset + c*moduleSize, offset + r*moduleSize, moduleSize, cfg.eyeStyle, cfg.fg, bgFill);
    });

    // logo
    if(logoImage){
      const logoBoxSize = size * (cfg.logoSizePct/100);
      const pad = logoBoxSize * 0.14;
      const cx = size/2, cy = size/2;
      if(!cfg.transparent){ ctx.fillStyle = cfg.bg; }
      else { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; }
      roundRectPath(ctx, cx - logoBoxSize/2 - pad, cy - logoBoxSize/2 - pad, logoBoxSize + pad*2, logoBoxSize + pad*2, logoBoxSize*0.18);
      ctx.fill();
      if(cfg.transparent) ctx.restore();
      ctx.drawImage(logoImage, cx - logoBoxSize/2, cy - logoBoxSize/2, logoBoxSize, logoBoxSize);
    }

    // soft corner-style frame treatment
    if(cfg.cornerStyle === 'soft'){
      canvas.style.borderRadius = '18px';
    } else {
      canvas.style.borderRadius = '6px';
    }
  }

  /* ---------------- SVG export ---------------- */
  function buildSVG(matrix, cfg){
    const { count } = matrix;
    const size = cfg.size;
    const moduleSize = size / (count + cfg.padding * 2);
    const offset = cfg.padding * moduleSize;
    let shapes = '';
    const bgFill = cfg.transparent ? 'none' : cfg.bg;

    function shapeFor(x, y, s, style){
      if(style === 'square') return `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${cfg.fg}"/>`;
      if(style === 'rounded') return `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s*0.32}" fill="${cfg.fg}"/>`;
      return `<circle cx="${x+s/2}" cy="${y+s/2}" r="${s*0.42}" fill="${cfg.fg}"/>`;
    }

    for(let r=0; r<count; r++){
      for(let c=0; c<count; c++){
        if(inFinderZone(r,c,count)) continue;
        if(matrix.isDark(r,c)) shapes += shapeFor(offset+c*moduleSize, offset+r*moduleSize, moduleSize, cfg.dotStyle);
      }
    }

    function eyeSVG(r,c){
      const x0 = offset + c*moduleSize, y0 = offset + r*moduleSize;
      const outer = moduleSize*7, ring = moduleSize, inner = moduleSize*3, innerOff = moduleSize*2;
      if(cfg.eyeStyle === 'circle'){
        return `<circle cx="${x0+outer/2}" cy="${y0+outer/2}" r="${outer/2}" fill="${cfg.fg}"/>
                 <circle cx="${x0+outer/2}" cy="${y0+outer/2}" r="${outer/2-ring}" fill="${bgFill === 'none' ? 'white' : bgFill}" opacity="${bgFill==='none'?0:1}"/>
                 ${bgFill==='none' ? `<circle cx="${x0+outer/2}" cy="${y0+outer/2}" r="${outer/2-ring}" fill="black" style="mix-blend-mode:destination-out"/>` : ''}
                 <circle cx="${x0+outer/2}" cy="${y0+outer/2}" r="${inner/2}" fill="${cfg.fg}"/>`;
      }
      const rx = cfg.eyeStyle === 'rounded' ? moduleSize*1.6 : 0;
      const rxInner = cfg.eyeStyle === 'rounded' ? moduleSize*0.8 : 0;
      return `<rect x="${x0}" y="${y0}" width="${outer}" height="${outer}" rx="${rx}" fill="${cfg.fg}"/>
              <rect x="${x0+ring}" y="${y0+ring}" width="${outer-ring*2}" height="${outer-ring*2}" rx="${rx}" fill="${bgFill==='none' ? 'white' : bgFill}" ${bgFill==='none' ? 'fill-opacity="0"' : ''}/>
              <rect x="${x0+innerOff}" y="${y0+innerOff}" width="${inner}" height="${inner}" rx="${rxInner}" fill="${cfg.fg}"/>`;
    }
    shapes += eyeSVG(0,0) + eyeSVG(0,count-7) + eyeSVG(count-7,0);

    const bgRect = cfg.transparent ? '' : `<rect width="${size}" height="${size}" fill="${cfg.bg}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code">${bgRect}${shapes}</svg>`;
  }

  /* ---------------- Quality scoring ---------------- */
  function luminance(hex){
    const c = hexToRgb(hex).map(v => {
      v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
    });
    return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2];
  }
  function hexToRgb(hex){
    const h = hex.replace('#','');
    const n = parseInt(h.length===3 ? h.split('').map(x=>x+x).join('') : h, 16);
    return [(n>>16)&255, (n>>8)&255, n&255];
  }
  function contrastRatio(fg,bg){
    const l1 = luminance(fg), l2 = luminance(bg);
    const light = Math.max(l1,l2), dark = Math.min(l1,l2);
    return (light+0.05)/(dark+0.05);
  }

  function computeQuality(cfg, matrix){
    const ratio = contrastRatio(cfg.fg, cfg.bg);
    const contrastScore = Math.max(0, Math.min(100, Math.round(100 * (1 - Math.exp(-ratio/3.2)))));
    const pxPerModule = cfg.size / (matrix.count + cfg.padding*2);
    const printScore = Math.max(0, Math.min(100, Math.round(((pxPerModule - 3) / 9) * 100)));
    const ecWeight = {L:40, M:65, Q:85, H:100}[cfg.ec] || 60;
    let readability = Math.round(contrastScore*0.5 + printScore*0.3 + ecWeight*0.2);
    if(logoImage){
      if(cfg.logoSizePct > 26) readability -= 12;
      if(cfg.ec === 'L' || cfg.ec === 'M') readability -= 10;
    }
    readability = Math.max(0, Math.min(100, readability));
    const distanceM = Math.max(0.2, +( (cfg.size * 0.000847) ).toFixed(2));
    return { ratio, contrastScore, printScore, readability, distanceM, ecWeight };
  }

  function labelFor(score){
    if(score >= 85) return 'Excellent';
    if(score >= 65) return 'Good';
    if(score >= 45) return 'Fair';
    return 'Poor';
  }

  function renderQuality(q){
    document.getElementById('meter-readability').style.width = q.readability + '%';
    document.getElementById('val-readability').textContent = `${q.readability}/100 · ${labelFor(q.readability)}`;
    document.getElementById('meter-contrast').style.width = q.contrastScore + '%';
    document.getElementById('val-contrast').textContent = `${q.ratio.toFixed(1)}:1 · ${labelFor(q.contrastScore)}`;
    document.getElementById('meter-print').style.width = q.printScore + '%';
    document.getElementById('val-print').textContent = `${labelFor(q.printScore)}`;
    document.getElementById('val-distance').textContent = `~${q.distanceM} m`;
  }

  /* ---------------- Design suggestions ---------------- */
  function renderSuggestions(cfg, q){
    const list = document.getElementById('suggestions-list');
    const items = [];
    if(q.ratio < 3){ items.push(['bad', 'Contrast is too low — this code may fail to scan. Increase the difference between the QR color and background.']); }
    else if(q.ratio < 4.5){ items.push(['warn', 'Contrast is borderline. A darker QR color or lighter background will scan more reliably.']); }
    else { items.push(['ok', 'Contrast between QR and background is strong.']); }

    if(luminance(cfg.fg) > luminance(cfg.bg)){
      items.push(['warn', 'Light QR modules on a dark background scan less reliably than dark-on-light — consider swapping colors for critical use cases.']);
    }
    if(logoImage){
      if(cfg.logoSizePct > 26){ items.push(['warn', 'Your logo covers a large portion of the code. Reduce its size or raise error correction to Quartile/High.']); }
      if(cfg.ec === 'L' || cfg.ec === 'M'){ items.push(['warn', 'A logo with Low or Medium error correction increases scan-failure risk — switch to Quartile (Q) or High (H).']); }
    }
    if(cfg.padding === 0){ items.push(['warn', 'There is no quiet zone around the code. Add at least 2 modules of padding so scanners can detect its edges.']); }
    if(cfg.size < 220){ items.push(['warn', 'This size is quite small — fine for digital use, but likely too small for reliable print scanning.']); }
    if(items.every(i => i[0] === 'ok')){ items.push(['ok', 'Great combination — this design should scan reliably in most conditions.']); }

    list.innerHTML = items.map(([lvl,msg]) => `<li class="${lvl}">${lvl==='ok'?'✓':lvl==='warn'?'!':'✕'} ${msg}</li>`).join('');
  }

  /* ---------------- Scan reliability estimate ---------------- */
  function renderScanSim(q){
    const conditions = [
      {name:'Modern smartphone', mult:1.0},
      {name:'Older / budget camera', mult:0.85},
      {name:'Low light', mult:0.72 + (q.contrastScore/100)*0.15},
      {name:'Long distance (2m+)', mult:0.6 + (q.printScore/100)*0.3},
    ];
    const grid = document.getElementById('scan-sim-grid');
    grid.innerHTML = conditions.map(c => {
      const score = Math.max(0, Math.min(100, Math.round(q.readability * c.mult)));
      const color = score >= 70 ? 'var(--text)' : score >= 45 ? 'var(--text-muted)' : 'color-mix(in srgb, var(--text-muted) 50%, transparent)';
      return `<div class="scan-sim-card"><h4>${c.name}</h4><div class="scan-sim-bar"><div class="scan-sim-fill" style="width:${score}%;background:${color}"></div></div><span class="quality-value">${score}/100 · ${labelFor(score)}</span></div>`;
    }).join('');
  }

  /* ---------------- Main generate ---------------- */
  const qrCanvas = document.getElementById('qr-canvas');

  function currentConfig(){
    return {
      fg: els.fg.value,
      bg: els.bg.value,
      transparent: els.transparent.checked,
      dotStyle: els.dotStyle.value,
      eyeStyle: els.eyeStyle.value,
      cornerStyle: els.cornerStyle.value,
      ec: els.ec.value,
      size: parseInt(els.size.value, 10),
      padding: parseInt(els.padding.value, 10),
      logoSizePct: parseInt(els.logoSize.value, 10),
      type: qrTypeSelect.value,
    };
  }

  function generate(){
    const cfg = currentConfig();
    const dataString = buildData(cfg.type);
    let matrix;
    try{
      matrix = computeMatrix(dataString, cfg.ec);
    }catch(err){
      console.error(err);
      return;
    }
    lastMatrix = matrix; lastConfig = cfg;
    renderCanvas(qrCanvas, matrix, cfg);
    const q = computeQuality(cfg, matrix);
    renderQuality(q);
    renderSuggestions(cfg, q);
    renderScanSim(q);
    renderMockup(currentMockupTab);
  }

  /* ---------------- Downloads ---------------- */
  function triggerDownload(href, filename){
    const a = document.createElement('a');
    a.href = href; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  document.getElementById('download-png').addEventListener('click', () => {
    triggerDownload(qrCanvas.toDataURL('image/png'), 'signal-qr-code.png');
  });
  document.getElementById('download-jpg').addEventListener('click', () => {
    const c = document.createElement('canvas');
    c.width = qrCanvas.width; c.height = qrCanvas.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,c.width,c.height);
    ctx.drawImage(qrCanvas, 0, 0);
    triggerDownload(c.toDataURL('image/jpeg', 0.92), 'signal-qr-code.jpg');
  });
  document.getElementById('download-svg').addEventListener('click', () => {
    if(!lastMatrix || !lastConfig) return;
    const svg = buildSVG(lastMatrix, lastConfig);
    const blob = new Blob([svg], {type:'image/svg+xml'});
    triggerDownload(URL.createObjectURL(blob), 'signal-qr-code.svg');
  });

  /* ---------------- Smart preview mockups ---------------- */
  let currentMockupTab = 'card';
  const mockupStage = document.getElementById('mockup-stage');
  document.querySelectorAll('.mockup-tab[data-mockup]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mockup-tab[data-mockup]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMockupTab = btn.dataset.mockup;
      renderMockup(currentMockupTab);
    });
  });

  function renderMockup(tab){
    const qrData = qrCanvas.toDataURL('image/png');
    const scenes = {
      card: `<div style="width:340px;height:200px;border-radius:16px;background:linear-gradient(135deg,#1C1C1F,#000000);padding:24px;display:flex;justify-content:space-between;align-items:flex-end;color:#F5F5F7;font-family:var(--font-display);box-shadow:0 20px 40px -14px rgba(0,0,0,.5)">
                <div><div style="font-size:1.1rem;font-weight:700">Jordan Lee</div><div style="opacity:.6;font-size:.8rem;margin-top:4px">Creative Director</div></div>
                <img src="${qrData}" style="width:64px;height:64px;background:#fff;border-radius:8px;padding:4px;filter:grayscale(1)">
              </div>`,
      poster: `<div style="width:220px;height:320px;border-radius:12px;background:linear-gradient(160deg,#F5F5F7,#8E8E93);padding:22px;display:flex;flex-direction:column;justify-content:space-between;color:#000;box-shadow:0 20px 40px -14px rgba(0,0,0,.5)">
                <div><div style="font-family:var(--font-display);font-weight:700;font-size:1.2rem;color:#000">Live at<br>The Yard</div></div>
                <div style="align-self:center;text-align:center"><img src="${qrData}" style="width:100px;height:100px;background:#fff;border-radius:8px;padding:6px;filter:grayscale(1)"><div style="font-size:.68rem;margin-top:8px;color:#000">Scan for tickets</div></div>
              </div>`,
      menu: `<div style="width:280px;background:#fff;color:#000;border-radius:12px;padding:22px;box-shadow:0 20px 40px -14px rgba(0,0,0,.5)">
              <div style="font-family:var(--font-display);font-weight:700;margin-bottom:10px">Café Menu</div>
              <div style="font-size:.82rem;opacity:.7;line-height:2">Espresso — 3.50<br>Flat White — 4.20<br>Almond Croissant — 3.80</div>
              <div style="display:flex;align-items:center;gap:10px;margin-top:14px;border-top:1px dashed #ccc;padding-top:14px">
                <img src="${qrData}" style="width:52px;height:52px;background:#fff;border:1px solid #eee;border-radius:6px;filter:grayscale(1)">
                <span style="font-size:.75rem;opacity:.65">Scan for full menu &amp; allergens</span>
              </div>
            </div>`,
      package: `<div style="width:200px;height:200px;background:#F5F5F7;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;box-shadow:0 20px 40px -14px rgba(0,0,0,.5);color:#000">
                <div style="font-family:var(--font-display);font-weight:700;font-size:.85rem">PRODUCT NAME</div>
                <img src="${qrData}" style="width:80px;height:80px;background:#fff;border-radius:6px;padding:4px;filter:grayscale(1)">
                <div style="font-size:.65rem;opacity:.55">Scan to learn more</div>
              </div>`,
      website: `<div style="width:340px;border-radius:14px;overflow:hidden;box-shadow:0 20px 40px -14px rgba(0,0,0,.5)">
                <div style="background:#1C1C1F;padding:8px 12px;display:flex;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:#6E6E73;display:inline-block"></span><span style="width:8px;height:8px;border-radius:50%;background:#AEAEB2;display:inline-block"></span></div>
                <div style="background:#fff;color:#000;padding:24px;display:flex;align-items:center;justify-content:space-between">
                  <div><div style="font-family:var(--font-display);font-weight:700">Contact us</div><div style="font-size:.78rem;opacity:.55;margin-top:6px">Scan to save our details</div></div>
                  <img src="${qrData}" style="width:64px;height:64px;background:#fff;border:1px solid #eee;border-radius:6px;filter:grayscale(1)">
                </div>
              </div>`,
      flyer: `<div style="width:320px;height:220px;border-radius:14px;background:linear-gradient(135deg,#2E2E32,#000000);padding:22px;display:flex;justify-content:space-between;align-items:center;color:#fff;box-shadow:0 20px 40px -14px rgba(0,0,0,.5)">
              <div style="max-width:140px"><div style="font-family:var(--font-display);font-weight:700;font-size:1.15rem">20% off this weekend</div><div style="font-size:.78rem;opacity:.7;margin-top:8px">Scan to redeem in-store</div></div>
              <img src="${qrData}" style="width:88px;height:88px;background:#fff;border-radius:8px;padding:6px;filter:grayscale(1)">
            </div>`
    };
    mockupStage.innerHTML = `<div class="mockup-scene">${scenes[tab] || scenes.card}</div>`;
  }

  /* ---------------- Templates ---------------- */
  const TEMPLATES = [
    {name:'Restaurant Menu', type:'menu', color:'#000000', bg:'#FFFFFF', dot:'rounded', eye:'rounded', desc:'Link to a digital menu with rounded, friendly styling.'},
    {name:'Wedding Invitation', type:'event', color:'#48484A', bg:'#F5F5F7', dot:'dots', eye:'circle', desc:'Guests scan to save the date and venue.'},
    {name:'Business Card', type:'vcard', color:'#000000', bg:'#FFFFFF', dot:'square', eye:'square', desc:'A sharp, professional contact card code.'},
    {name:'Portfolio', type:'portfolio', color:'#1C1C1F', bg:'#E5E5EA', dot:'rounded', eye:'rounded', desc:'Point straight to your portfolio site.'},
    {name:'Resume', type:'resume', color:'#000000', bg:'#FFFFFF', dot:'square', eye:'square', desc:'Link to a hosted PDF resume.'},
    {name:'Freelancer', type:'whatsapp', color:'#2E2E32', bg:'#FFFFFF', dot:'dots', eye:'circle', desc:'Clients message you directly on WhatsApp.'},
    {name:'Real Estate', type:'location', color:'#000000', bg:'#FFFFFF', dot:'square', eye:'square', desc:'Scan to open a listing\'s location in Maps.'},
    {name:'Café', type:'wifi', color:'#3A3A3D', bg:'#F5F5F7', dot:'rounded', eye:'rounded', desc:'Let guests join your WiFi instantly.'},
    {name:'Product Packaging', type:'product', color:'#000000', bg:'#FFFFFF', dot:'square', eye:'square', desc:'High-contrast code sized for small packaging.'},
    {name:'Event Ticket', type:'event', color:'#FFFFFF', bg:'#0A0A0B', dot:'dots', eye:'circle', desc:'Bold styling for tickets and passes — check contrast before printing.'},
    {name:'Google Review', type:'review', color:'#000000', bg:'#FFFFFF', dot:'rounded', eye:'circle', desc:'Ask happy customers to leave a review in one scan.'},
    {name:'Receipt Payment Link', type:'payment', color:'#000000', bg:'#FFFFFF', dot:'square', eye:'square', desc:'High-contrast code sized for small receipts.'},
  ];

  const templateGrid = document.getElementById('template-grid');
  templateGrid.innerHTML = TEMPLATES.map((t,i) => `
    <div class="template-card" data-idx="${i}" role="button" tabindex="0">
      <span class="swatch" style="background:${t.color}"></span>
      <h4>${t.name}</h4>
      <p>${t.desc}</p>
    </div>`).join('');

  function applyTemplate(t){
    qrTypeSelect.value = t.type;
    renderFields(t.type);
    els.fg.value = t.color;
    els.bg.value = t.bg;
    els.dotStyle.value = t.dot;
    els.eyeStyle.value = t.eye;
    document.getElementById('generator').scrollIntoView({behavior:'smooth'});
    scheduleGenerate();
  }
  templateGrid.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => applyTemplate(TEMPLATES[+card.dataset.idx]));
    card.addEventListener('keypress', e => { if(e.key === 'Enter') applyTemplate(TEMPLATES[+card.dataset.idx]); });
  });

  /* ---------------- History & Favorites ---------------- */
  const HISTORY_KEY = 'signal-qr-history';
  const FAV_KEY = 'signal-qr-favorites';
  let activeList = 'history';

  function readList(key){
    try{ return JSON.parse(localStorage.getItem(key) || '[]'); }catch(e){ return []; }
  }
  function writeList(key, arr){
    try{ localStorage.setItem(key, JSON.stringify(arr.slice(0, 24))); }catch(e){}
  }

  function saveTo(key){
    const arr = readList(key);
    arr.unshift({ id: Date.now(), img: qrCanvas.toDataURL('image/png'), type: currentConfig().type, ts: new Date().toISOString() });
    writeList(key, arr);
    renderHistory();
  }
  document.getElementById('save-history').addEventListener('click', () => saveTo(HISTORY_KEY));
  document.getElementById('save-favorite').addEventListener('click', () => saveTo(FAV_KEY));
  document.getElementById('clear-history').addEventListener('click', () => {
    writeList(activeList === 'history' ? HISTORY_KEY : FAV_KEY, []);
    renderHistory();
  });
  document.querySelectorAll('.history-tabs .mockup-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.history-tabs .mockup-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeList = btn.dataset.list;
      renderHistory();
    });
  });

  function renderHistory(){
    const key = activeList === 'history' ? HISTORY_KEY : FAV_KEY;
    const arr = readList(key);
    const grid = document.getElementById('history-grid');
    const empty = document.getElementById('history-empty');
    if(!arr.length){
      grid.innerHTML = '';
      grid.appendChild(empty);
      return;
    }
    grid.innerHTML = arr.map(item => `
      <div class="history-card">
        <img src="${item.img}" alt="Saved ${item.type} QR code">
        <span class="hc-type">${item.type}</span>
        <div class="hc-actions">
          <button data-id="${item.id}" class="hc-delete">Remove</button>
        </div>
      </div>`).join('');
    grid.querySelectorAll('.hc-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const remaining = readList(key).filter(x => String(x.id) !== btn.dataset.id);
        writeList(key, remaining);
        renderHistory();
      });
    });
  }

  /* ---------------- Hero decorative QR ---------------- */
  function renderHeroQR(){
    const canvas = document.getElementById('hero-qr-canvas');
    const matrix = computeMatrix('SIGNAL — free custom QR generator', 'H');
    const cfg = { fg: getComputedColor('--text','#FFFFFF'), bg: getComputedColor('--bg-elevated','#141416'), transparent:false, dotStyle:'dots', eyeStyle:'circle', cornerStyle:'soft', ec:'H', size:280, padding:2, logoSizePct:0 };
    renderCanvas(canvas, matrix, cfg);
  }
  function getComputedColor(varName, fallback){
    const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return v || fallback;
  }

  /* ---------------- Init ---------------- */
  function init(){
    renderFields(qrTypeSelect.value);
    generate();
    renderHistory();
    renderHeroQR();
  }

  if(typeof qrcode === 'undefined'){
    window.addEventListener('load', init);
  } else {
    init();
  }
})();
