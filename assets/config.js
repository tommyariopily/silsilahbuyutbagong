/**
 * =====================================================================
 *  KONFIGURASI APLIKASI — Silsilah Keluarga Buyut Bagong
 * =====================================================================
 *  Ubah dua nilai di bawah ini setelah kamu deploy Google Apps Script
 *  (lihat README.md bagian "Setup Backend").
 * ---------------------------------------------------------------------
 */
const CONFIG = {
  // URL Web App hasil deploy Google Apps Script (Code.gs)
  // Contoh: "https://script.google.com/macros/s/AKfycbx.../exec"
  API_URL: "https://script.google.com/macros/s/AKfycby8PcIMl-5CdIb-aeWMG05rIVxvP_c1crM8m9ExXLXeJ8JsC-n0u0riXBGEAO2KwlR1/exec",

  // Logo keluarga (sudah otomatis memakai logo yang kamu berikan)
  LOGO_URL: "https://lh3.googleusercontent.com/d/1KrTYDqI1-R5fGsd0PrzCZuMtID2FYDmt",

  // Nama aplikasi
  APP_NAME: "Silsilah Keluarga Buyut Bagong",
  APP_SUBTITLE: "Keluarga Besar Buyut Bagong",

  // Foto default jika anggota belum punya foto (silsilase abu-abu sederhana)
  DEFAULT_PHOTO: "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
    '<rect width="200" height="200" fill="#d9dbe0"/>' +
    '<circle cx="100" cy="80" r="36" fill="#8b909c"/>' +
    '<path d="M34 178c0-48 29.5-84 66-84s66 36 66 84" fill="#8b909c"/>' +
    '</svg>'
  ),

  // Ukuran foto tersimpan (upload otomatis di-resize ke persegi ini)
  PHOTO_MAX_SIZE: 260,
  PHOTO_QUALITY: 0.75,
};
