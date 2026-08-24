/* =====================================================================
   Silsilah Keluarga Buyut Bagong — kegiatan.js
   Mengambil, menambah, dan menghapus data kegiatan dari sheet "Kegiatan"
   lewat backend Google Apps Script yang sama dengan bagan silsilah.
   ===================================================================== */

const kState = {
  items: [],
  byId: new Map(),
  adminKey: sessionStorage.getItem('sbb_admin_key') || null,
  editingId: null,
};

const kEl = (sel, root = document) => root.querySelector(sel);

document.addEventListener('DOMContentLoaded', () => {
  el_setLogo();
  bindKegiatanUI();
  loadKegiatan();
});

function el_setLogo(){
  const logo = kEl('#logo');
  if(logo) logo.src = CONFIG.LOGO_URL;
}

function bindKegiatanUI(){
  kEl('#btnAddKegiatan')?.addEventListener('click', () => openKegiatanForm(null));
  kEl('#kegiatanFormOverlay')?.addEventListener('click', (e) => { if(e.target.id === 'kegiatanFormOverlay') closeKegiatanForm(); });
  kEl('#kegiatanForm')?.addEventListener('submit', onSubmitKegiatan);
  kEl('#btnCancelKegiatan')?.addEventListener('click', closeKegiatanForm);
}

/* ---------------------------------------------------------------- DATA */
async function loadKegiatan(){
  showKegiatanLoader();
  if(!CONFIG.API_URL || CONFIG.API_URL.includes('PASTE_URL')){
    renderKegiatanNotice('Belum terhubung ke backend', `Isi <code>API_URL</code> di <code>assets/config.js</code> terlebih dahulu.`);
    return;
  }

  const MAX_ATTEMPTS = 3;
  for(let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++){
    try{
      const res = await fetch(`${CONFIG.API_URL}?action=list&entity=kegiatan`, { cache: 'no-store' });
      const text = await res.text();
      const json = JSON.parse(text);
      if(!json.success) throw new Error(json.message || 'Gagal memuat data');
      kState.items = json.data.map(normalizeKegiatan).sort((a, b) => (a.tanggal || '').localeCompare(b.tanggal || ''));
      kState.byId = new Map(kState.items.map((k) => [k.id, k]));
      renderKegiatan();
      return;
    }catch(err){
      console.warn(`Percobaan ${attempt}/${MAX_ATTEMPTS} gagal:`, err.message);
      if(attempt < MAX_ATTEMPTS){
        showKegiatanLoader();
        await new Promise((r) => setTimeout(r, 700 * attempt));
      }else{
        renderKegiatanNotice('Gagal memuat kegiatan', escapeHtmlK(err.message || 'Terjadi kesalahan tak terduga'));
      }
    }
  }
}

function normalizeKegiatan(row){
  return {
    id: String(row.ID ?? row.id ?? '').trim(),
    judul: row.Judul ?? row.judul ?? '(Tanpa judul)',
    tanggal: row.Tanggal ?? row.tanggal ?? '',
    waktu: row.Waktu ?? row.waktu ?? '',
    lokasi: row.Lokasi ?? row.lokasi ?? '',
    deskripsi: row.Deskripsi ?? row.deskripsi ?? '',
  };
}

/* ---------------------------------------------------------------- RENDER */
function renderKegiatan(){
  const list = kEl('#kegiatanList');
  if(!list) return;

  if(kState.items.length === 0){
    list.innerHTML = `<div class="empty-note"><b>Belum ada kegiatan</b>Klik "Tambah Kegiatan" untuk menambahkan agenda pertama.</div>`;
    return;
  }

  list.innerHTML = kState.items.map((k) => {
    const d = k.tanggal ? new Date(k.tanggal + 'T00:00:00') : null;
    const dNum = d && !isNaN(d) ? d.getDate() : '--';
    const dMonth = d && !isNaN(d) ? d.toLocaleDateString('id-ID', { month: 'short' }) : '';
    const metaParts = [];
    if(k.lokasi) metaParts.push(`📍 ${escapeHtmlK(k.lokasi)}`);
    if(k.waktu) metaParts.push(`${escapeHtmlK(k.waktu)} WIB`);
    return `
      <div class="event-card" data-id="${k.id}">
        <div class="event-date"><span class="d">${dNum}</span><span class="m">${dMonth}</span></div>
        <div class="event-body">
          <h3>${escapeHtmlK(k.judul)}</h3>
          ${k.deskripsi ? `<p>${escapeHtmlK(k.deskripsi)}</p>` : ''}
          ${metaParts.length ? `<div class="meta">${metaParts.join(' · ')}</div>` : ''}
          <div class="event-actions">
            <button type="button" class="btn ghost small" data-edit="${k.id}">Edit</button>
            <button type="button" class="btn danger small" data-delete="${k.id}">Hapus</button>
          </div>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openKegiatanForm(btn.dataset.edit));
  });
  list.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteKegiatan(btn.dataset.delete));
  });
}

function showKegiatanLoader(){
  const list = kEl('#kegiatanList');
  if(list) list.innerHTML = `<div class="loader"><div class="spin"></div> Memuat kegiatan…</div>`;
}
function renderKegiatanNotice(title, msg){
  const list = kEl('#kegiatanList');
  if(list) list.innerHTML = `<div class="empty-note"><b>${escapeHtmlK(title)}</b>${msg}</div>`;
}

/* ---------------------------------------------------------------- FORM (ADD/EDIT) */
function openKegiatanForm(id){
  kState.editingId = id;
  const k = id ? kState.byId.get(id) : null;
  kEl('#kegiatanFormTitle').textContent = k ? 'Edit Kegiatan' : 'Tambah Kegiatan';
  const f = kEl('#kegiatanForm');
  f.reset();
  f.judul.value = k?.judul || '';
  f.tanggal.value = k?.tanggal || '';
  f.waktu.value = k?.waktu || '';
  f.lokasi.value = k?.lokasi || '';
  f.deskripsi.value = k?.deskripsi || '';
  kEl('#kegiatanFormOverlay').classList.add('open');
}
function closeKegiatanForm(){
  kEl('#kegiatanFormOverlay').classList.remove('open');
  kState.editingId = null;
}

async function onSubmitKegiatan(e){
  e.preventDefault();
  const f = e.target;
  const data = {
    judul: f.judul.value.trim(),
    tanggal: f.tanggal.value,
    waktu: f.waktu.value,
    lokasi: f.lokasi.value.trim(),
    deskripsi: f.deskripsi.value.trim(),
  };
  if(!data.judul){ toastK('Judul kegiatan wajib diisi'); return; }

  const key = await ensureAdminKeyK();
  if(key === null) return;

  const action = kState.editingId ? 'update' : 'add';
  if(kState.editingId) data.id = kState.editingId;

  try{
    const result = await callKegiatanApi(action, data);
    if(!result.success) throw new Error(result.message || 'Gagal menyimpan');
    toastK(kState.editingId ? 'Kegiatan diperbarui' : 'Kegiatan ditambahkan');
    closeKegiatanForm();
    await loadKegiatan();
  }catch(err){
    toastK('Gagal: ' + err.message);
  }
}

async function deleteKegiatan(id){
  const k = kState.byId.get(id);
  if(!confirm(`Hapus kegiatan "${k?.judul}"?`)) return;
  const key = await ensureAdminKeyK();
  if(key === null) return;
  try{
    const result = await callKegiatanApi('delete', { id });
    if(!result.success) throw new Error(result.message || 'Gagal menghapus');
    toastK('Kegiatan dihapus');
    await loadKegiatan();
  }catch(err){
    toastK('Gagal: ' + err.message);
  }
}

/* ---------------------------------------------------------------- API HELPERS */
async function callKegiatanApi(action, data){
  const key = await ensureAdminKeyK();
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, entity: 'kegiatan', data, id: data.id, key }),
  });
  return res.json();
}

async function ensureAdminKeyK(){
  if(kState.adminKey) return kState.adminKey;
  const key = prompt('Masukkan kunci admin untuk mengubah data kegiatan:');
  if(!key) return null;
  kState.adminKey = key;
  sessionStorage.setItem('sbb_admin_key', key);
  return key;
}

/* ---------------------------------------------------------------- UI HELPERS */
let kToastTimer;
function toastK(msg){
  const t = kEl('#toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(kToastTimer);
  kToastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
function escapeHtmlK(str = ''){
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
