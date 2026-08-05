/* =====================================================================
   Silsilah Keluarga Buyut Bagong — app.js
   Merender bagan silsilah dari data Google Sheet (via Google Apps Script)
   ===================================================================== */

const state = {
  people: [],          // semua anggota, mentah dari server
  byId: new Map(),      // id -> person
  adminKey: sessionStorage.getItem('sbb_admin_key') || null,
  editingId: null,      // id yang sedang diedit di form (null = tambah baru)
};

const el = (sel, root=document) => root.querySelector(sel);
const elAll = (sel, root=document) => [...root.querySelectorAll(sel)];

/* ---------------------------------------------------------------- INIT */
document.addEventListener('DOMContentLoaded', () => {
  el('#logo').src = CONFIG.LOGO_URL;
  el('#appTitle').textContent = CONFIG.APP_NAME;
  el('#appSubtitle').textContent = CONFIG.APP_SUBTITLE;
  document.title = CONFIG.APP_NAME;

  bindUI();
  loadData();
});

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

/* ---------------------------------------------------------------- DATA */
async function loadData(){
  showLoader();
  try{
    if(!CONFIG.API_URL || CONFIG.API_URL.includes('PASTE_URL')){
      renderSetupNotice();
      return;
    }
    const res = await fetch(`${CONFIG.API_URL}?action=list`);
    const json = await res.json();
    if(!json.success) throw new Error(json.message || 'Gagal memuat data');
    state.people = json.data.map(normalizePerson);
    state.byId = new Map(state.people.map(p => [p.id, p]));
    renderTree();
  }catch(err){
    console.error(err);
    renderError(err.message);
  }
}

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
    return;
  }

  const badge = document.createElement('div');
  badge.className = 'gen-badge';
  badge.textContent = 'Generasi Awal';
  root.appendChild(badge);
  root.appendChild(forest);
}

function buildCoupleBlock(person, visited, depth){
  visited.add(person.id);
  const spouse = person.pasangan && state.byId.get(person.pasangan) ? state.byId.get(person.pasangan) : null;
  if(spouse) visited.add(spouse.id);

  let husband = person.gender === 'L' ? person : spouse;
  let wife = person.gender === 'P' ? person : spouse;
  if(!husband && !wife){ husband = person; }

  const block = document.createElement('div');
  block.className = 'couple-block';

  const row = document.createElement('div');
  row.className = 'couple-row';
  if(husband) row.appendChild(buildCard(husband));
  if(husband && wife) row.appendChild(buildKnot());
  if(wife) row.appendChild(buildCard(wife));
  block.appendChild(row);

  // find children of this couple
  const childIds = new Set();
  state.people.forEach(p => {
    const belongs = [husband?.id, wife?.id].filter(Boolean);
    if(belongs.includes(p.ayah) || belongs.includes(p.ibu)) childIds.add(p.id);
  });
  const children = [...childIds].map(id => state.byId.get(id)).filter(Boolean);

  if(children.length){
    const wrap = document.createElement('div');
    wrap.className = 'children-wrap';
    const badge = document.createElement('div');
    badge.className = 'gen-badge';
    badge.style.marginBottom = '18px';
    badge.textContent = `Generasi ${depth + 1}`;
    wrap.appendChild(badge);

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
  elAll('.card').forEach(card => {
    const id = card.dataset.id;
    const p = state.byId.get(id);
    const match = q.length > 1 && p && p.nama.toLowerCase().includes(q);
    card.classList.toggle('highlight', match);
    if(match) card.scrollIntoView({behavior:'smooth', block:'center', inline:'center'});
  });
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
}
function renderError(msg){
  el('#treeRoot').innerHTML = `<div class="empty-state"><b>Gagal memuat data</b>${escapeHtml(msg)}</div>`;
}
function renderSetupNotice(){
  el('#treeRoot').innerHTML = `<div class="empty-state"><b>Belum terhubung ke backend</b>
    Buka <code>assets/config.js</code> dan isi <code>API_URL</code> dengan URL Web App Google Apps Script kamu.
    Lihat README.md bagian "Setup Backend".</div>`;
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
