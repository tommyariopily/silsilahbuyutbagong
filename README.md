# Silsilah Keluarga Buyut Bagong

Aplikasi web silsilah keluarga dengan kartu **Suami** dan **Istri** terpisah (lengkap dengan foto & info), tersambung membentuk bagan pohon keluarga. Backend memakai **Google Sheets + Google Apps Script**, frontend statis (HTML/CSS/JS) siap di-hosting lewat **GitHub Pages**.

## Struktur Folder

```
silsilah-buyut-bagong/
├── index.html          # Halaman utama aplikasi
├── manifest.webmanifest # Konfigurasi PWA (nama, ikon, warna)
├── service-worker.js    # Cache offline untuk PWA
├── assets/
│   ├── style.css        # Tampilan (tema emas-maroon ala wayang)
│   ├── app.js            # Logika bagan, form, dan koneksi ke backend
│   ├── config.js         # ⚙️ isi API_URL di sini setelah deploy backend
│   ├── pwa.js            # Banner instal PWA + registrasi service worker
│   ├── kegiatan.js       # Logika tambah/edit/hapus kegiatan (kegiatan.html)
│   └── icons/            # Ikon aplikasi (berbagai ukuran)
├── backend/
│   └── Code.gs            # Script backend Google Apps Script
└── README.md
```

## 1. Setup Backend (Google Sheets + Apps Script)

1. Buka [sheets.google.com](https://sheets.google.com) → buat Spreadsheet baru, beri nama misalnya **"Data Silsilah Buyut Bagong"**.
2. Buka menu **Extensions → Apps Script**.
3. Hapus semua isi editor bawaan (`Code.gs`), lalu **copy-paste** seluruh isi file `backend/Code.gs` dari folder ini.
4. Simpan (Ctrl+S), beri nama proyek misalnya "Silsilah Backend".
5. Di dropdown fungsi (samping tombol ▶️ Run), pilih **`setup`** lalu klik **Run**.
   - Izinkan akses (Authorize) saat diminta — ini normal, karena script perlu mengakses Sheet-mu sendiri.
   - Fungsi ini otomatis membuat sheet **"Data"** dengan kolom yang benar + 4 contoh anggota keluarga.
5b. Pilih fungsi **`setupKegiatan`** lalu klik **Run**.
   - Membuat sheet **"Kegiatan"** (agenda/acara keluarga) + 2 contoh kegiatan. Ini dipakai oleh halaman `kegiatan.html`.
6. Pilih fungsi **`setAdminKey`** lalu klik **Run**. Masukkan kata sandi admin (bebas, contoh: `bagong2026`) — kata sandi ini dipakai saat menambah/mengedit/menghapus data lewat aplikasi (berlaku untuk anggota keluarga **maupun** kegiatan).
7. Klik **Deploy → New deployment**.
   - Klik ikon ⚙️ di samping "Select type" → pilih **Web app**.
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
   - Klik **Deploy**, izinkan akses lagi jika diminta.
8. Salin **Web app URL** yang muncul (formatnya `https://script.google.com/macros/s/AKfycb.../exec`).

> Setiap kali kamu mengubah `Code.gs`, kamu perlu membuat **New deployment** lagi (atau gunakan "Manage deployments → Edit → New version") agar perubahan aktif.

## 2. Hubungkan Frontend ke Backend

Buka `assets/config.js`, ganti nilai `API_URL`:

```js
API_URL: "https://script.google.com/macros/s/xxxxxxxxxxxxxxxx/exec",
```

Logo sudah otomatis terisi memakai logo Keluarga Besar Buyut Bagong yang kamu berikan. Kalau mau ganti, edit `LOGO_URL` di file yang sama.

## 3. Coba Lokal (opsional)

Buka `index.html` langsung di browser, atau jalankan server lokal sederhana:

```bash
npx serve .
# atau
python3 -m http.server 8000
```

## 4. Upload ke GitHub & Aktifkan GitHub Pages

1. Buat repository baru di GitHub, misalnya `silsilah-buyut-bagong`.
2. Upload seluruh isi folder ini (bisa lewat `git push` atau drag-and-drop di web GitHub).
3. Buka tab **Settings → Pages** di repo tersebut.
4. Pada **Source**, pilih branch `main` dan folder `/ (root)`, klik **Save**.
5. Tunggu 1–2 menit, aplikasi akan tersedia di:
   `https://<username-github>.github.io/silsilah-buyut-bagong/`

## Cara Pakai Aplikasi

- **Melihat bagan**: buka halaman, bagan otomatis tersusun per generasi. Suami & istri ditampilkan berdampingan dengan simbol cincin di tengah; anak-anak tersambung di bawah pasangan orang tuanya.
- **Cari anggota**: ketik nama di kotak pencarian, kartu yang cocok akan disorot.
- **Lihat detail**: klik kartu untuk melihat info lengkap (tempat/tanggal lahir, wafat, pekerjaan, alamat, pasangan, orang tua, catatan).
- **Tambah anggota**: klik **"+ Tambah Anggota"**, isi form, simpan. Kamu akan diminta kunci admin (yang diatur lewat `setAdminKey()`).
- **Edit/Hapus**: buka detail kartu → klik **Edit** atau **Hapus**.
- Semua perubahan langsung tersimpan ke Google Sheet backend — kamu juga bisa mengedit data langsung dari Google Sheets, lalu klik **"Muat Ulang"** di aplikasi.

## Struktur Kolom di Google Sheet ("Data")

| Kolom | Keterangan |
|---|---|
| ID | Nomor unik anggota (otomatis terisi) |
| Nama | Nama lengkap |
| JenisKelamin | `L` (Laki-laki) atau `P` (Perempuan) |
| Foto | URL foto (link publik, contoh: Google Drive/Photos) |
| TempatLahir | Kota/desa kelahiran |
| TanggalLahir | Format `YYYY-MM-DD` |
| TanggalWafat | Format `YYYY-MM-DD`, kosongkan jika masih hidup |
| Pekerjaan | Pekerjaan/profesi |
| Alamat | Alamat tempat tinggal |
| Catatan | Cerita/keterangan tambahan |
| Pasangan | ID suami/istri (harus saling menunjuk) |
| Ayah | ID ayah kandung |
| Ibu | ID ibu kandung |

**Tips foto**: Upload foto ke Google Drive → klik kanan → *Share* → set ke "Anyone with the link" → gunakan format link:
`https://lh3.googleusercontent.com/d/FILE_ID` (ganti `FILE_ID` dengan ID file Drive-mu, sama seperti pola logo yang kamu kirim).

## 5. Fitur PWA (Bisa Diinstal ke HP/Laptop)

Aplikasi ini sudah menjadi **Progressive Web App (PWA)**:

- Saat link dibuka (dan syarat teknis browser terpenuhi), akan muncul **banner "Instal Silsilah Buyut Bagong"** di bagian bawah layar dengan tombol **Instal**.
- Setelah diinstal, aplikasi muncul sebagai ikon tersendiri di layar utama/desktop, terbuka tanpa address bar seperti aplikasi native.
- Halaman utama (HTML/CSS/JS/ikon) di-cache otomatis lewat `service-worker.js`, jadi aplikasi tetap bisa dibuka meski koneksi terputus — namun data silsilah tetap butuh internet karena diambil langsung dari Google Sheet.
- **iPhone/Safari** tidak mendukung banner instal otomatis (batasan Apple), jadi ditampilkan instruksi manual: ketuk **Bagikan ⬆️ → Tambah ke Layar Utama**.
- Banner bisa ditutup (tombol ×) dan tidak akan muncul lagi selama 7 hari di perangkat yang sama.

**Penting — PWA butuh HTTPS**: GitHub Pages dan Vercel sudah otomatis HTTPS, jadi tidak perlu setelan tambahan. Kalau dites di `localhost` juga tetap berfungsi.

Kalau ingin mengganti ikon aplikasi nanti, ganti file-file di `assets/icons/` (ukuran mengikuti nama file, mis. `icon-512.png` = 512×512px) lalu commit ulang — tidak perlu ubah `manifest.webmanifest`.

## Troubleshooting

- **"Belum terhubung ke backend"** → `API_URL` di `config.js` belum diisi/salah.
- **Gagal memuat data / CORS error** → pastikan deployment Web App diatur **Who has access: Anyone**, dan URL diakhiri `/exec` (bukan `/dev`).
- **"Kunci admin salah"** → jalankan ulang `setAdminKey()` di Apps Script, cocokkan dengan yang kamu masukkan di aplikasi (kunci disimpan sementara di browser via sessionStorage, akan hilang saat tab ditutup).
- **Foto tidak muncul** → pastikan link foto bisa diakses tanpa login (bukan link privat Drive).
