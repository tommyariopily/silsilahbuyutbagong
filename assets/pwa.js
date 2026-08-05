/* =====================================================================
   Silsilah Keluarga Buyut Bagong — pwa.js
   - Mendaftarkan service worker (agar bisa diinstal & dibuka offline)
   - Menampilkan banner "Instal Aplikasi" saat link dibuka
   ===================================================================== */

const PWA_DISMISS_KEY = 'sbb_install_dismissed_until';
let deferredPrompt = null;

/* ---------------------------------------------------------------- SERVICE WORKER */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => {
      console.warn('Service worker gagal didaftarkan:', err);
    });
  });
}

/* ---------------------------------------------------------------- DETEKSI STATE */
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}
function isDismissedForNow() {
  const until = Number(localStorage.getItem(PWA_DISMISS_KEY) || 0);
  return Date.now() < until;
}
function dismissFor(days) {
  localStorage.setItem(PWA_DISMISS_KEY, String(Date.now() + days * 86400000));
}

/* ---------------------------------------------------------------- BANNER UI */
function buildBanner({ title, message, showInstallBtn, showIosSteps }) {
  const existing = document.getElementById('pwaInstallBanner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'pwaInstallBanner';
  banner.className = 'pwa-banner';
  banner.innerHTML = `
    <img src="assets/icons/icon-96.png" alt="" class="pwa-banner-icon">
    <div class="pwa-banner-text">
      <strong>${title}</strong>
      <span>${message}</span>
      ${showIosSteps ? `
        <div class="pwa-ios-steps">
          Ketuk <span class="pwa-key">Bagikan ⬆️</span> di Safari, lalu pilih
          <span class="pwa-key">Tambah ke Layar Utama</span>
        </div>` : ''}
    </div>
    <div class="pwa-banner-actions">
      ${showInstallBtn ? '<button class="btn small" id="pwaInstallBtn">Instal</button>' : ''}
      <button class="pwa-close" id="pwaCloseBtn" aria-label="Tutup">&times;</button>
    </div>
  `;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('show'));

  el_('#pwaCloseBtn', banner).addEventListener('click', () => {
    banner.classList.remove('show');
    dismissFor(7);
    setTimeout(() => banner.remove(), 300);
  });

  const installBtn = el_('#pwaInstallBtn', banner);
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        banner.classList.remove('show');
        setTimeout(() => banner.remove(), 300);
      }
      deferredPrompt = null;
    });
  }
  return banner;
}
function el_(sel, root) { return root.querySelector(sel); }

/* ---------------------------------------------------------------- LOGIKA UTAMA */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (isStandalone() || isDismissedForNow()) return;
  buildBanner({
    title: 'Instal Silsilah Buyut Bagong',
    message: 'Pasang aplikasi ini di layar utama agar lebih cepat dibuka & bisa diakses tanpa internet.',
    showInstallBtn: true,
  });
});

window.addEventListener('appinstalled', () => {
  const b = document.getElementById('pwaInstallBanner');
  if (b) b.remove();
  localStorage.removeItem(PWA_DISMISS_KEY);
});

document.addEventListener('DOMContentLoaded', () => {
  if (isStandalone() || isDismissedForNow()) return;
  // Safari iOS tidak mendukung beforeinstallprompt — tampilkan instruksi manual
  if (isIos()) {
    setTimeout(() => {
      if (isStandalone() || isDismissedForNow()) return;
      buildBanner({
        title: 'Instal Silsilah Buyut Bagong',
        message: 'Tambahkan aplikasi ini ke Layar Utama agar lebih cepat dibuka.',
        showInstallBtn: false,
        showIosSteps: true,
      });
    }, 1200);
  }
});
