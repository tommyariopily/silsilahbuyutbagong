/* =====================================================================
   Silsilah Keluarga Buyut Bagong — app.js
   Merender bagan silsilah dari data Google Sheet (via Google Apps Script)
   ===================================================================== */

const state = {
  people: [],          // semua anggota, mentah dari server
  byId: new Map(),      // id -> person
  adminKey: sessionStorage.getItem('sbb_admin_key') || null,
  editingId: null,      // id yang sedang diedit di form (null = tambah baru)
  linkBack: null,       // { personId, field } — untuk tombol "Tambah Ayah/Ibu"
  collapsed: new Set(), // id anggota yang cabang keturunannya sedang disembunyikan
  zoom: { scale: 1, x: 0, y: 0 },
};

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2.5;

const el = (sel, root=document) => root.querySelector(sel);
const elAll = (sel, root=document) => [...root.querySelectorAll(sel)];
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/* ---------------------------------------------------------------- INIT */
document.addEventListener('DOMContentLoaded', () => {
  el('#logo').src = CONFIG.LOGO_URL;
  el('#appTitle').textContent = CONFIG.APP_NAME;
  el('#appSubtitle').textContent = CONFIG.APP_SUBTITLE;
  document.title = CONFIG.APP_NAME;

  bindUI();
  bindZoomPan();
  bindBottomNav();
  loadData();
  handleEntryShortcuts();
});

/** Menangani tautan pintasan dari halaman lain (mis. kegiatan.html) yang minta buka pencarian/form tambah. */
function handleEntryShortcuts(){
  if(sessionStorage.getItem('sbb_open_search') === '1'){
    sessionStorage.removeItem('sbb_open_search');
    el('#topToolbar')?.classList.add('mobile-open');
    setTimeout(() => el('#searchInput')?.focus(), 300);
  }
  const params = new URLSearchParams(window.location.search);
  if(params.get('add') === '1'){
    setTimeout(() => openForm(null), 300);
    window.history.replaceState({}, '', window.location.pathname);
  }
}

function bindUI(){
  el('#searchInput').addEventListener('input', onSearch);
  el('#btnAdd').addEventListener('click', () => openForm(null));
  el('#btnRefresh').addEventListener('click', loadData);
  el('#formOverlay').addEventListener('click', e => { if(e.target.id==='formOverlay') closeForm(); });
  el('#detailOverlay').addEventListener('click', e => { if(e.target.id==='detailOverlay') closeDetail(); });
  el('#personForm').addEventListener('submit', onSubmitForm);
  el('#genderSelect').addEventListener('change', onGenderChange);
  el('#photoFile').addEventListener('change', onPhotoFileChange);
  el('#btnRemovePhoto').addEventListener('click', () => setPhotoPreview(''));
}

function bindBottomNav(){
  el('#navFit')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    fitToView();
  });
  el('#navSearch')?.addEventListener('click', () => {
    const toolbar = el('#topToolbar');
    const isOpen = toolbar.classList.toggle('mobile-open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if(isOpen){
      setTimeout(() => el('#searchInput')?.focus(), 200);
    }
  });
  el('#navAdd')?.addEventListener('click', () => openForm(null));
  el('#navRefresh')?.addEventListener('click', loadData);
}

/* ---------------------------------------------------------------- ZOOM & PAN */
function applyZoom(){
  el('#treeRoot').style.transform = `translate(${state.zoom.x}px, ${state.zoom.y}px) scale(${state.zoom.scale})`;
}

function zoomAtPoint(px, py, factor){
  const old = state.zoom.scale;
  const next = clamp(old * factor, ZOOM_MIN, ZOOM_MAX);
  const applied = next / old;
  state.zoom.x = px - (px - state.zoom.x) * applied;
  state.zoom.y = py - (py - state.zoom.y) * applied;
  state.zoom.scale = next;
  applyZoom();
}

function zoomByButton(factor){
  const wrap = el('#treeWrap');
  const rect = wrap.getBoundingClientRect();
  zoomAtPoint(rect.width / 2, rect.height / 2, factor);
}

/** Sesuaikan skala & posisi awal agar seluruh bagan pas di layar (terutama HP). */
function fitToView(){
  requestAnimationFrame(() => {
    const wrap = el('#treeWrap');
    const root = el('#treeRoot');
    if(!wrap || !root) return;
    root.style.transform = 'translate(0px,0px) scale(1)';
    const contentWidth = root.scrollWidth;
    const contentHeight = root.scrollHeight;
    const wrapWidth = wrap.clientWidth;
    const wrapHeight = wrap.clientHeight;
    let scale = 1;
    if(contentWidth > wrapWidth) scale = Math.max(ZOOM_MIN, (wrapWidth / contentWidth) * 0.94);
    if(contentHeight * scale > wrapHeight) scale = Math.max(ZOOM_MIN, Math.min(scale, (wrapHeight / contentHeight) * 0.96));
    const x = Math.max(10, (wrapWidth - contentWidth * scale) / 2);
    const y = 14;
    state.zoom = { scale, x, y };
    applyZoom();
  });
}

/** Geser tampilan agar sebuah kartu berada di tengah layar (dipakai oleh pencarian). */
function panToElement(cardEl){
  const wrap = el('#treeWrap');
  const wrapRect = wrap.getBoundingClientRect();
  const cardRect = cardEl.getBoundingClientRect();
  const dx = (wrapRect.left + wrapRect.width / 2) - (cardRect.left + cardRect.width / 2);
  const dy = (wrapRect.top + wrapRect.height / 2) - (cardRect.top + cardRect.height / 2);
  state.zoom.x += dx;
  state.zoom.y += dy;
  applyZoom();
}

function bindZoomPan(){
  const wrap = el('#treeWrap');
  const hint = el('#zoomHint');
  el('#btnZoomIn').addEventListener('click', () => zoomByButton(1.25));
  el('#btnZoomOut').addEventListener('click', () => zoomByButton(1/1.25));
  el('#btnZoomReset').addEventListener('click', fitToView);

  const pointers = new Map();
  let panStart = null;
  let pinchStart = null;

  const hideHint = () => hint?.classList.add('fade');

  wrap.addEventListener('pointerdown', (e) => {
    // jangan mulai geser/pinch kalau yang disentuh adalah tombol/kartu yang bisa diklik —
    // biarkan elemen itu menangani tap/klik-nya sendiri
    if(e.target.closest('.zoom-controls, .branch-toggle, .card, button')) return;
    wrap.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    hideHint();
    if(pointers.size === 1){
      const p = [...pointers.values()][0];
      panStart = { x: p.x, y: p.y, zx: state.zoom.x, zy: state.zoom.y };
      wrap.classList.add('grabbing');
    } else if(pointers.size === 2){
      panStart = null;
      const [a, b] = [...pointers.values()];
      const rect = wrap.getBoundingClientRect();
      pinchStart = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale: state.zoom.scale,
        midX: (a.x + b.x) / 2 - rect.left,
        midY: (a.y + b.y) / 2 - rect.top,
        zx: state.zoom.x, zy: state.zoom.y,
      };
    }
  });

  wrap.addEventListener('pointermove', (e) => {
    if(!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if(pointers.size === 1 && panStart){
      const p = [...pointers.values()][0];
      state.zoom.x = panStart.zx + (p.x - panStart.x);
      state.zoom.y = panStart.zy + (p.y - panStart.y);
      applyZoom();
    } else if(pointers.size === 2 && pinchStart){
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const next = clamp(pinchStart.scale * (dist / pinchStart.dist), ZOOM_MIN, ZOOM_MAX);
      const applied = next / pinchStart.scale;
      state.zoom.x = pinchStart.midX - (pinchStart.midX - pinchStart.zx) * applied;
      state.zoom.y = pinchStart.midY - (pinchStart.midY - pinchStart.zy) * applied;
      state.zoom.scale = next;
      applyZoom();
    }
  });

  function endPointer(e){
    pointers.delete(e.pointerId);
    if(pointers.size === 0){
      panStart = null; pinchStart = null;
      wrap.classList.remove('grabbing');
    } else if(pointers.size === 1){
      const p = [...pointers.values()][0];
      panStart = { x: p.x, y: p.y, zx: state.zoom.x, zy: state.zoom.y };
      pinchStart = null;
    }
  }
  wrap.addEventListener('pointerup', endPointer);
  wrap.addEventListener('pointercancel', endPointer);
  wrap.addEventListener('pointerleave', (e) => { if(pointers.has(e.pointerId)) endPointer(e); });

  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    hideHint();
    const rect = wrap.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.12 : 1/1.12;
    zoomAtPoint(e.clientX - rect.left, e.clientY - rect.top, factor);
  }, { passive: false });
}

/* ---------------------------------------------------------------- DATA */
async function loadData(){
  showLoader();
  if(!CONFIG.API_URL || CONFIG.API_URL.includes('PASTE_URL')){
    renderSetupNotice();
    return;
  }

  const MAX_ATTEMPTS = 3;
  let lastErr = null;

  for(let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++){
    try{
      const json = await fetchListOnce();
      if(!json.success) throw new Error(json.message || 'Gagal memuat data');
      state.people = json.data.map(normalizePerson);
      state.byId = new Map(state.people.map(p => [p.id, p]));
      renderTree();
      return; // berhasil
    }catch(err){
      lastErr = err;
      console.warn(`Percobaan ${attempt}/${MAX_ATTEMPTS} gagal:`, err.message);
      if(attempt < MAX_ATTEMPTS){
        showLoader(); // tetap tampilkan "memuat" selama masih mencoba ulang
        await sleep(700 * attempt); // jeda makin lama tiap percobaan
      }
    }
  }

  console.error(lastErr);
  renderError(
    lastErr?.message?.includes('JSON') || lastErr?.message?.includes('<')
      ? 'Server Google Apps Script belum siap merespons (biasa terjadi saat baru "bangun" dari idle). Coba klik "Muat Ulang".'
      : lastErr?.message || 'Terjadi kesalahan tak terduga'
  );
}

/** Satu kali percobaan ambil data; melempar error yang jelas kalau respons bukan JSON. */
async function fetchListOnce(){
  const res = await fetch(`${CONFIG.API_URL}?action=list`, { cache: 'no-store' });
  const text = await res.text();
  try{
    return JSON.parse(text);
  }catch{
    throw new Error(`Respons server bukan JSON (status ${res.status}). ${text.slice(0, 60)}`);
  }
}

function sleep(ms){ return new Promise((resolve) => setTimeout(resolve, ms)); }

function normalizePerson(row){
  return {
    id: String(row.ID ?? row.id ?? '').trim(),
    nama: row.Nama ?? row.nama ?? '(Tanpa nama)',
    gender: (row.JenisKelamin ?? row.gender ?? 'L').toUpperCase().startsWith('P') ? 'P' : 'L',
    foto: row.Foto ?? row.foto ?? '',
    tempatLahir: row.TempatLahir ?? row.tempatLahir ?? '',
    tglLahir: row.TanggalLahir ?? row.tglLahir ?? '',
    tglWafat: row.TanggalWafat ?? row.tglWafat ?? '',
    pekerjaan: row.Pekerjaan ?? row.pekerjaan ?? '',
    alamat: row.Alamat ?? row.alamat ?? '',
    catatan: row.Catatan ?? row.catatan ?? '',
    pasangan: String(row.Pasangan ?? row.pasangan ?? '').trim(),
    ayah: String(row.Ayah ?? row.ayah ?? '').trim(),
    ibu: String(row.Ibu ?? row.ibu ?? '').trim(),
    status: row.Status ?? row.status ?? '',
  };
}

/* ---------------------------------------------------------------- TREE BUILD */
function renderTree(){
  const root = el('#treeRoot');
  root.innerHTML = '';

  if(state.people.length === 0){
    root.innerHTML = `<div class="empty-state"><b>Silsilah masih kosong</b>Klik "Tambah Anggota" untuk menambahkan orang pertama.</div>`;
    fitToView();
    return;
  }

  const visited = new Set();
  const roots = state.people.filter(p => {
    const hasParent = (p.ayah && state.byId.has(p.ayah)) || (p.ibu && state.byId.has(p.ibu));
    return !hasParent;
  });

  const forest = document.createElement('div');
  forest.className = 'forest';
  forest.appendChild(document.createElement('div')); // spacer (replaced below)
  forest.innerHTML = '';

  roots.forEach(p => {
    if(visited.has(p.id)) return;
    forest.appendChild(buildCoupleBlock(p, visited, 1));
  });

  if(forest.children.length === 0){
    root.innerHTML = `<div class="empty-state"><b>Struktur belum lengkap</b>Periksa kolom Ayah/Ibu — mungkin ada referensi ID yang tidak ditemukan.</div>`;
    fitToView();
    return;
  }

  const badge = document.createElement('div');
  badge.className = 'gen-badge';
  badge.textContent = 'Generasi Awal';
  root.appendChild(badge);
  root.appendChild(forest);
  fitToView();
}

function buildCoupleBlock(person, visited, depth){
  visited.add(person.id);
  const spouse = person.pasangan && state.byId.get(person.pasangan) ? state.byId.get(person.pasangan) : null;
  if(spouse) visited.add(spouse.id);

  // Anggota jalur keturunan (person) selalu di kiri, pasangannya selalu di kanan —
  // konsisten baik dia laki-laki maupun perempuan, tidak tergantung gender.
  const left = person;
  const right = spouse;

  const block = document.createElement('div');
  block.className = 'couple-block';

  const row = document.createElement('div');
  row.className = 'couple-row';
  row.appendChild(buildCard(left));
  if(right) row.appendChild(buildKnot());
  if(right) row.appendChild(buildCard(right));
  block.appendChild(row);

  // find children of this couple
  const childIds = new Set();
  state.people.forEach(p => {
    const belongs = [left?.id, right?.id].filter(Boolean);
    if(belongs.includes(p.ayah) || belongs.includes(p.ibu)) childIds.add(p.id);
  });
  const children = [...childIds].map(id => state.byId.get(id)).filter(Boolean);

  if(children.length){
    const wrap = document.createElement('div');
    wrap.className = 'children-wrap';
    wrap.dataset.personId = person.id;
    const isCollapsed = state.collapsed.has(person.id);
    if(isCollapsed) wrap.classList.add('collapsed');

    const badge = document.createElement('div');
    badge.className = 'gen-badge';
    badge.style.marginBottom = '18px';
    badge.textContent = `Generasi ${depth + 1}`;
    wrap.appendChild(badge);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'branch-toggle' + (isCollapsed ? ' collapsed' : '');
    toggleBtn.title = isCollapsed ? `Tampilkan ${children.length} keturunan` : 'Sembunyikan cabang ini';
    toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg><span class="count">${children.length}</span>`;
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nowCollapsed = wrap.classList.toggle('collapsed');
      toggleBtn.classList.toggle('collapsed', nowCollapsed);
      toggleBtn.title = nowCollapsed ? `Tampilkan ${children.length} keturunan` : 'Sembunyikan cabang ini';
      if(nowCollapsed) state.collapsed.add(person.id); else state.collapsed.delete(person.id);
    });
    wrap.appendChild(toggleBtn);

    const childrenRow = document.createElement('div');
    childrenRow.className = 'children' + (children.length===1 ? ' single' : '');
    children.forEach(child => {
      if(visited.has(child.id)) return;
      const branch = document.createElement('div');
      branch.className = 'child-branch';
      branch.appendChild(buildCoupleBlock(child, visited, depth + 1));
      childrenRow.appendChild(branch);
    });
    wrap.appendChild(childrenRow);
    block.appendChild(wrap);
  }

  return block;
}

function buildKnot(){
  const knot = document.createElement('div');
  knot.className = 'knot';
  knot.innerHTML = `<svg viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="knotGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8e3a3"/><stop offset="100%" stop-color="#b8860b"/>
    </linearGradient></defs>
    <circle cx="12" cy="17" r="8" fill="none" stroke="url(#knotGrad)" stroke-width="2.4"/>
    <circle cx="22" cy="17" r="8" fill="none" stroke="url(#knotGrad)" stroke-width="2.4"/>
  </svg>`;
  return knot;
}

function buildCard(person){
  const card = document.createElement('div');
  card.className = `card ${person.gender === 'P' ? 'female' : 'male'}`;
  card.dataset.id = person.id;
  const photo = person.foto || CONFIG.DEFAULT_PHOTO;
  const years = formatYears(person);
  card.innerHTML = `
    <div class="frame"><img src="${escapeAttr(photo)}" alt="${escapeAttr(person.nama)}" loading="lazy" onerror="this.src='${CONFIG.DEFAULT_PHOTO}'"></div>
    <div class="name">${escapeHtml(person.nama)}</div>
    <div class="meta">${years}</div>
  `;
  card.addEventListener('click', () => openDetail(person.id));
  return card;
}

function formatYears(p){
  const lahir = p.tglLahir ? p.tglLahir.slice(0,4) : '?';
  if(p.tglWafat) return `${lahir} – ${p.tglWafat.slice(0,4)}`;
  return p.tglLahir ? `lahir ${lahir}` : '';
}

/* ---------------------------------------------------------------- SEARCH */
function onSearch(e){
  const q = e.target.value.trim().toLowerCase();
  let target = null;
  elAll('.card').forEach(card => {
    const id = card.dataset.id;
    const p = state.byId.get(id);
    const match = q.length > 1 && p && p.nama.toLowerCase().includes(q);
    card.classList.toggle('highlight', match);
    if(match && !target) target = card;
  });
  if(target){
    // buka kembali cabang yang tersembunyi agar kartu yang dicari terlihat
    let node = target.closest('.children-wrap.collapsed');
    while(node){
      node.classList.remove('collapsed');
      const btn = node.querySelector('.branch-toggle');
      if(btn) btn.classList.remove('collapsed');
      state.collapsed.delete(node.dataset.personId);
      node = target.closest('.children-wrap.collapsed');
    }
    requestAnimationFrame(() => panToElement(target));
  }
}

/* ---------------------------------------------------------------- DETAIL MODAL */
function openDetail(id){
  const p = state.byId.get(id);
  if(!p) return;
  const photo = p.foto || CONFIG.DEFAULT_PHOTO;
  const spouse = p.pasangan ? state.byId.get(p.pasangan) : null;
  const ayah = p.ayah ? state.byId.get(p.ayah) : null;
  const ibu = p.ibu ? state.byId.get(p.ibu) : null;

  el('#detailBody').innerHTML = `
    <div class="detail-head">
      <div class="frame"><img src="${escapeAttr(photo)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.src='${CONFIG.DEFAULT_PHOTO}'"></div>
      <div>
        <h2>${escapeHtml(p.nama)}</h2>
        <span class="tag">${p.gender==='P'?'Perempuan':'Laki-laki'}</span>
      </div>
    </div>
    <div class="detail-rows">
      ${row('Tempat Lahir', p.tempatLahir)}
      ${row('Tanggal Lahir', p.tglLahir)}
      ${row('Tanggal Wafat', p.tglWafat)}
      ${row('Pekerjaan', p.pekerjaan)}
      ${row('Alamat', p.alamat)}
      ${row('Pasangan', spouse ? spouse.nama : '')}
      ${row('Ayah', ayah ? ayah.nama : '')}
      ${row('Ibu', ibu ? ibu.nama : '')}
      ${row('Catatan', p.catatan)}
    </div>
    <div class="relation-actions">
      <button class="btn ghost small" id="btnAddChild">+ Tambah Anak</button>
      ${!p.pasangan ? `<button class="btn ghost small" id="btnAddSpouse">+ Tambah Pasangan</button>` : ''}
      ${!p.ayah ? `<button class="btn ghost small" id="btnAddFather">+ Tambah Ayah</button>` : ''}
      ${!p.ibu ? `<button class="btn ghost small" id="btnAddMother">+ Tambah Ibu</button>` : ''}
    </div>
    <div class="modal-actions">
      <button class="btn ghost small" id="btnEditPerson">Edit</button>
      <button class="btn danger small" id="btnDeletePerson">Hapus</button>
    </div>
  `;
  el('#btnEditPerson').addEventListener('click', () => { closeDetail(); openForm(p.id); });
  el('#btnDeletePerson').addEventListener('click', () => deletePerson(p.id));

  el('#btnAddChild')?.addEventListener('click', () => {
    closeDetail();
    const preset = { titleSuffix: `(Anak dari ${p.nama})` };
    if(p.gender === 'L') preset.ayah = p.id; else preset.ibu = p.id;
    if(spouse){ if(spouse.gender === 'L') preset.ayah = spouse.id; else preset.ibu = spouse.id; }
    openForm(null, preset);
  });
  el('#btnAddSpouse')?.addEventListener('click', () => {
    closeDetail();
    openForm(null, { titleSuffix: `(Pasangan dari ${p.nama})`, pasangan: p.id, gender: p.gender === 'L' ? 'P' : 'L' });
  });
  el('#btnAddFather')?.addEventListener('click', () => {
    closeDetail();
    openForm(null, {
      titleSuffix: `(Ayah dari ${p.nama})`, gender: 'L',
      pasangan: ibu ? ibu.id : '',
      linkBack: { personId: p.id, field: 'ayah' },
    });
  });
  el('#btnAddMother')?.addEventListener('click', () => {
    closeDetail();
    openForm(null, {
      titleSuffix: `(Ibu dari ${p.nama})`, gender: 'P',
      pasangan: ayah ? ayah.id : '',
      linkBack: { personId: p.id, field: 'ibu' },
    });
  });

  el('#detailOverlay').classList.add('open');
}
function row(label, value){
  if(!value) return '';
  return `<div class="detail-row"><span>${label}</span><span>${escapeHtml(value)}</span></div>`;
}
function closeDetail(){ el('#detailOverlay').classList.remove('open'); }

/* ---------------------------------------------------------------- FORM (ADD/EDIT) */
function openForm(id, preset){
  state.editingId = id;
  state.linkBack = preset?.linkBack || null;
  const p = id ? state.byId.get(id) : null;
  el('#formTitle').textContent = (p ? 'Edit Anggota' : 'Tambah Anggota') + (preset?.titleSuffix ? ' ' + preset.titleSuffix : '');
  const f = el('#personForm');
  f.reset();
  f.nama.value = p?.nama || '';
  f.gender.value = p?.gender || preset?.gender || 'L';
  setPhotoPreview(p?.foto || '');
  f.tempatLahir.value = p?.tempatLahir || '';
  f.tglLahir.value = p?.tglLahir || '';
  f.tglWafat.value = p?.tglWafat || '';
  f.pekerjaan.value = p?.pekerjaan || '';
  f.alamat.value = p?.alamat || '';
  f.catatan.value = p?.catatan || '';
  fillPersonSelect(f.pasangan, p?.pasangan ?? preset?.pasangan, id);
  fillPersonSelect(f.ayah, p?.ayah ?? preset?.ayah, id, 'L');
  fillPersonSelect(f.ibu, p?.ibu ?? preset?.ibu, id, 'P');
  el('#formOverlay').classList.add('open');
}
function closeForm(){ el('#formOverlay').classList.remove('open'); state.editingId = null; state.linkBack = null; }
function onGenderChange(){}

/* ---------------------------------------------------------------- PHOTO UPLOAD */
function setPhotoPreview(dataUrlOrEmpty){
  el('#fotoField').value = dataUrlOrEmpty || '';
  el('#photoPreviewImg').src = dataUrlOrEmpty || CONFIG.DEFAULT_PHOTO;
}

async function onPhotoFileChange(e){
  const file = e.target.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){ toast('File harus berupa gambar'); return; }
  try{
    const dataUrl = await compressImage(file, CONFIG.PHOTO_MAX_SIZE, CONFIG.PHOTO_QUALITY);
    setPhotoPreview(dataUrl);
  }catch(err){
    console.error(err);
    toast('Gagal memproses foto: ' + err.message);
  }finally{
    e.target.value = '';
  }
}

/** Resize foto jadi persegi (crop tengah) & kompres ke JPEG agar muat di sel Google Sheet. */
function compressImage(file, maxSize, quality){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Tidak bisa membaca file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak didukung'));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = maxSize; canvas.height = maxSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);

        let q = quality;
        let dataUrl = canvas.toDataURL('image/jpeg', q);
        // Turunkan kualitas/ukuran bertahap jika masih terlalu besar untuk sel Sheet (~50.000 karakter)
        let size = maxSize;
        while(dataUrl.length > 42000 && (q > 0.35 || size > 120)){
          if(q > 0.35) q -= 0.1; else { size -= 40; canvas.width = size; canvas.height = size; ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size); }
          dataUrl = canvas.toDataURL('image/jpeg', q);
        }
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function fillPersonSelect(select, currentVal, excludeId, filterGender){
  select.innerHTML = '<option value="">— Tidak diketahui —</option>' +
    state.people
      .filter(p => p.id !== excludeId && (!filterGender || p.gender === filterGender))
      .map(p => `<option value="${p.id}" ${p.id===currentVal?'selected':''}>${escapeHtml(p.nama)}</option>`)
      .join('');
}

async function onSubmitForm(e){
  e.preventDefault();
  const f = e.target;
  const data = {
    nama: f.nama.value.trim(),
    gender: f.gender.value,
    foto: f.foto.value.trim(),
    tempatLahir: f.tempatLahir.value.trim(),
    tglLahir: f.tglLahir.value,
    tglWafat: f.tglWafat.value,
    pekerjaan: f.pekerjaan.value.trim(),
    alamat: f.alamat.value.trim(),
    catatan: f.catatan.value.trim(),
    pasangan: f.pasangan.value,
    ayah: f.ayah.value,
    ibu: f.ibu.value,
  };
  if(!data.nama){ toast('Nama wajib diisi'); return; }

  const key = await ensureAdminKey();
  if(key === null) return;

  const action = state.editingId ? 'update' : 'add';
  if(state.editingId) data.id = state.editingId;
  const linkBack = state.linkBack;

  try{
    const result = await callApi(action, data);
    if(!result.success) throw new Error(result.message || 'Gagal menyimpan');
    toast(state.editingId ? 'Perubahan disimpan' : 'Anggota ditambahkan');
    closeForm();
    await loadData();
    // jika pasangan dipilih tapi pasangan tsb belum menunjuk balik, set otomatis
    if(data.pasangan){
      const spouse = state.byId.get(data.pasangan);
      if(spouse && spouse.pasangan !== result.id){
        await callApi('update', {id: spouse.id, pasangan: result.id});
        await loadData();
      }
    }
    // jika dibuat lewat "Tambah Ayah/Ibu", sambungkan balik ke anaknya
    if(linkBack){
      await callApi('update', {id: linkBack.personId, [linkBack.field]: result.id});
      await loadData();
    }
  }catch(err){
    console.error(err);
    toast('Gagal: ' + err.message);
  }
}

async function deletePerson(id){
  const p = state.byId.get(id);
  if(!confirm(`Hapus "${p?.nama}" dari silsilah? Tindakan ini tidak bisa dibatalkan.`)) return;
  const key = await ensureAdminKey();
  if(key === null) return;
  try{
    const result = await callApi('delete', {id});
    if(!result.success) throw new Error(result.message || 'Gagal menghapus');
    toast('Anggota dihapus');
    closeDetail();
    await loadData();
  }catch(err){
    toast('Gagal: ' + err.message);
  }
}

/* ---------------------------------------------------------------- API HELPERS */
async function callApi(action, data){
  const key = await ensureAdminKey();
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: {'Content-Type': 'text/plain;charset=utf-8'}, // hindari CORS preflight
    body: JSON.stringify({action, data, id: data.id, key}),
  });
  return res.json();
}

async function ensureAdminKey(){
  if(state.adminKey) return state.adminKey;
  const key = prompt('Masukkan kunci admin untuk mengubah data silsilah:');
  if(!key) return null;
  state.adminKey = key;
  sessionStorage.setItem('sbb_admin_key', key);
  return key;
}

/* ---------------------------------------------------------------- UI HELPERS */
function showLoader(){
  el('#treeRoot').innerHTML = `<div class="loader"><div class="spin"></div> Memuat silsilah…</div>`;
  fitToView();
}
function renderError(msg){
  el('#treeRoot').innerHTML = `<div class="empty-state"><b>Gagal memuat data</b>${escapeHtml(msg)}</div>`;
  fitToView();
}
function renderSetupNotice(){
  el('#treeRoot').innerHTML = `<div class="empty-state"><b>Belum terhubung ke backend</b>
    Buka <code>assets/config.js</code> dan isi <code>API_URL</code> dengan URL Web App Google Apps Script kamu.
    Lihat README.md bagian "Setup Backend".</div>`;
  fitToView();
}
let toastTimer;
function toast(msg){
  const t = el('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
function escapeHtml(str=''){
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(str=''){ return escapeHtml(str); }
