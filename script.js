// =====================
// Konstanta & elemen DOM
// =====================
const API_URL =
  "https://api.aladhan.com/v1/timingsByCity?city=Jakarta&country=Indonesia&method=20";

  // =====================
  // Arah Kiblat
  // =====================
  const KAABA = { lat: 21.4225241, lon: 39.8261818 };
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  let koordKiblat = { lat: -6.2088, lon: 106.8456, name: "Jakarta, Indonesia" };
  let bearingKiblat = 0;
  let kompasAktif = false;
  let headingSekarang = 0;
  let handlerOrientasi = null;
  let sudahVibrate = false;


// Daftar shalat: key dari API -> nama Indonesia
const PRAYERS = [
  { key: "Fajr", name: "Shubuh" },
  { key: "Dhuhr", name: "Dzuhur" },
  { key: "Asr", name: "Ashar" },
  { key: "Maghrib", name: "Maghrib" },
  { key: "Isha", name: "Isya" },
];

const el = {
  loading: document.getElementById("loading"),
  error: document.getElementById("error"),
  errorMessage: document.getElementById("errorMessage"),
  retryBtn: document.getElementById("retryBtn"),
  dates: document.getElementById("dates"),
  dateMasehi: document.getElementById("dateMasehi"),
  dateHijri: document.getElementById("dateHijri"),
  countdownSection: document.getElementById("countdownSection"),
  nextName: document.getElementById("nextName"),
  countdownTimer: document.getElementById("countdownTimer"),
  cityLabel: document.getElementById("cityLabel"),
  locBtn: document.getElementById("locBtn"),
  locStatus: document.getElementById("locStatus"),
  cards: document.getElementById("cards"),
  // Kiblat
  kiblatCity: document.getElementById("kiblatCity"),
  qiblatDeg: document.getElementById("qiblatDeg"),
  qiblatDir: document.getElementById("qiblatDir"),
  qiblatInfo: document.getElementById("qiblatInfo"),
  qiblatAligned: document.getElementById("qiblatAligned"),
  compassDial: document.getElementById("compassDial"),
  compassNeedle: document.getElementById("compassNeedle"),
  compassBtn: document.getElementById("compassBtn"),
};

let wakeLock = null;

/** Minta layar tetap menyala (jika didukung) */
async function mintaWakeLock() {
  if (!("wakeLock" in navigator)) return;
  if (wakeLock) return; // sudah aktif
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    // Lepas otomatis saat halaman hidden — reset referensi
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch (err) {
    // Sering terjadi: izin ditolak / bukan user gesture. Cukup abaikan.
    console.warn("Wake lock gagal:", err);
  }
}

/** Lepas wake lock (layar boleh tidur lagi) */
async function lepasWakeLock() {
  if (!wakeLock) return;
  try { await wakeLock.release(); } catch {}
  wakeLock = null;
}

const LOC_KEY = "shalat_loc";

function saveLocation(loc) {
  try { localStorage.setItem(LOC_KEY, JSON.stringify(loc)); } catch {}
}


function loadLocation() {
  try {
    const raw = localStorage.getItem(LOC_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearLocation() {
  try { localStorage.removeItem(LOC_KEY); } catch {}
}

// State global
let prayerTimes = []; // [{ key, name, time: "HH:MM" }]
let nextPrayerIndex = -1; // index di prayerTimes
let nextPrayerDate = null; // Date target waktu shalat berikutnya
let countdownInterval = null;

// =====================
// Fungsi utilitas
// =====================

/** Format jam "HH:MM" menjadi Date hari ini (atau besok) */
function toDate(hhmm, dayOffset = 0) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Format detik ke "HH:MM:SS" */
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

// =====================
// Render UI
// =====================

/** Tampilkan tanggal Masehi & Hijriah */
function renderDates(readable, hijri) {
  el.dateMasehi.textContent = readable || "—";
  if (hijri) {
    el.dateHijri.textContent = `${hijri.day} ${hijri.month?.en || ""} ${hijri.year} H`;
  } else {
    el.dateHijri.textContent = "";
  }
}

function renderCards() {
  el.cards.innerHTML = "";
  prayerTimes.forEach((p, i) => {
    const card = document.createElement("article");
    card.dataset.index = i;
    card.className =
      "card bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 " +
      "rounded-2xl p-4 flex items-center justify-between shadow-sm " +
      "transition-all duration-200 " +
      "md:flex-col md:justify-center md:text-center md:gap-1.5";

    const name = document.createElement("span");
    name.className = "card__name font-semibold text-sm sm:text-base";
    name.textContent = p.name;

    const time = document.createElement("span");
    time.className = "card__time text-xl sm:text-2xl font-bold tabular-nums";
    time.textContent = p.time;

    card.append(name, time);
    el.cards.appendChild(card);
  });
}

function highlightNextCard() {
  const cards = el.cards.querySelectorAll(".card");
  cards.forEach((c, i) => {
    const isNext = i === nextPrayerIndex;
    c.classList.toggle("border-indigo-600", isNext);
    c.classList.toggle("dark:border-indigo-400", isNext);
    c.classList.toggle("bg-indigo-50", isNext);
    c.classList.toggle("dark:bg-indigo-950/40", isNext);
    c.classList.toggle("shadow-lg", isNext);
    c.classList.toggle("shadow-indigo-500/25", isNext);
    c.classList.toggle("-translate-y-0.5", isNext);
    c.querySelector(".card__name").classList.toggle("text-indigo-600", isNext);
    c.querySelector(".card__name").classList.toggle("dark:text-indigo-400", isNext);
    c.querySelector(".card__time").classList.toggle("text-indigo-600", isNext);
    c.querySelector(".card__time").classList.toggle("dark:text-indigo-400", isNext);
  });
}

// =====================
// Logika shalat berikutnya
// =====================

/** Tentukan shalat berikutnya berdasarkan waktu sekarang */
function determineNextPrayer() {
  const now = new Date();

  for (let i = 0; i < prayerTimes.length; i++) {
    const t = toDate(prayerTimes[i].time, 0);
    if (t > now) {
      nextPrayerIndex = i;
      nextPrayerDate = t;
      return;
    }
  }

  // Semua sudah lewat -> Shubuh besok
  nextPrayerIndex = 0;
  nextPrayerDate = toDate(prayerTimes[0].time, 1);
}

/** Perbarui hitung mundur setiap detik */
function tickCountdown() {
  if (!nextPrayerDate) return;

  const diffSec = (nextPrayerDate - new Date()) / 1000;

  // Jika sudah lewat (misal tab lama), hitung ulang
  if (diffSec <= 0) {
    determineNextPrayer();
    highlightNextCard();
    el.nextName.textContent = prayerTimes[nextPrayerIndex].name;
  }

  el.countdownTimer.textContent = formatDuration(diffSec);
}

/** Mulai hitung mundur */
function startCountdown() {
  stopCountdown();
  el.nextName.textContent = prayerTimes[nextPrayerIndex].name;
  el.countdownSection.hidden = false;
  tickCountdown();
  countdownInterval = setInterval(tickCountdown, 1000);
}

function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

// =====================
// State helpers
// =====================

function showLoading() {
  el.loading.hidden = false;
  el.error.hidden = true;        // <-- tambahan
  el.cards.hidden = true;
  el.countdownSection.hidden = true;
  el.dates.hidden = true;
}

function showError(msg){
  stopCountdown();
  el.loading.hidden = true;   // wajib
  el.cards.hidden = true;
  el.countdownSection.hidden = true;
  el.error.hidden = false;
  el.errorMessage.textContent = msg;
}

function showContent() {
  el.loading.hidden = true;      // sudah ada, pastikan
  el.error.hidden = true;        // sudah ada
  el.cards.hidden = false;
  el.dates.hidden = false;
}

// =====================
// Fetch data
// =====================

async function fetchPrayerTimes(loc = { type: "city", city: "Jakarta", country: "Indonesia" }) {
  showLoading();
  try {
    let url;
    if (loc.type === "coords") {
      const d = new Date();
      const dateStr =
        String(d.getDate()).padStart(2, "0") + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        d.getFullYear();
      url = `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${loc.lat}&longitude=${loc.lon}&method=20`;
    } else {
      url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(loc.city)}&country=${encodeURIComponent(loc.country)}&method=20`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);

    const json = await res.json();
    const data = json?.data;
    const timings = data?.timings;
    if (!timings) throw new Error("timings kosong");

    const clean = (t) => (t || "").split(" ")[0];
    prayerTimes = PRAYERS.map((p) => ({
      key: p.key,
      name: p.name,
      time: clean(timings[p.key]) || "--:--",
    }));

    renderDates(data?.date?.readable || "", data?.date?.hijri || null);
    renderCards();
    determineNextPrayer();
    highlightNextCard();
    startCountdown();
    showContent();
  } catch (err) {
    console.error("Gagal fetch jadwal:", err);
    showError("Maaf, jadwal shalat gagal dimuat. Periksa koneksi lalu coba lagi.");
  }
}

// =====================
// Deteksi lokasi (tampilan saja)
// =====================
function initGeolocation() {
  if (!("geolocation" in navigator)) return;
  if (el.locBtn) el.locBtn.hidden = false;

  el.locBtn?.addEventListener("click", () => {
    el.locBtn.disabled = true;
    el.locStatus.textContent = "Mendeteksi lokasi…";

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        el.cityLabel.textContent = "Mendeteksi kota…";
        el.locStatus.textContent = "";
        el.locBtn.hidden = true;

        fetchPrayerTimes({ type: "coords", lat: latitude, lon: longitude });

        reverseGeocode(latitude, longitude).then((name) => {
          el.cityLabel.textContent = name;
          // Simpan lokasi + nama kota
          saveLocation({ lat: latitude, lon: longitude, name });
          perbaruiKiblat(latitude, longitude, name);

        });
        
      },
      (err) => {
        el.locBtn.disabled = false;
        if (err.code === 1) {
          el.locStatus.textContent = "Izin lokasi ditolak. Tetap pakai Jakarta.";
        } else if (err.code === 3) {
          el.locStatus.textContent = "Deteksi lokasi habis waktu. Coba lagi.";
        } else {
          el.locStatus.textContent = "Gagal mendeteksi lokasi.";
        }
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  });
}

function restoreLocation() {
  const loc = loadLocation();
  if (!loc || !loc.lat || !loc.lon) return false;

  el.cityLabel.textContent = loc.name || "Lokasi tersimpan";
  el.locBtn.hidden = true;
  fetchPrayerTimes({ type: "coords", lat: loc.lat, lon: loc.lon });
  perbaruiKiblat(loc.lat, loc.lon, loc.name);
  return true;
}


// =====================
// Reverse geocoding (koordinat -> nama kota)
// =====================
async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1&accept-language=id`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();
    const a = data?.address || {};

    // Urutan prioritas nama wilayah
    const name =
      a.city ||
      a.town ||
      a.municipality ||
      a.county ||
      a.village ||
      a.suburb ||
      a.state ||
      "Lokasi Anda";

    // Tambahkan provinsi kalau ada dan berbeda dari nama
    const state = a.state || a.province || "";
    return state && state !== name ? `${name}, ${state}` : name;
  } catch (err) {
    console.warn("Reverse geocode gagal:", err);
    return "Lokasi Anda"; // fallback
  }
}

// =====================
// Inisialisasi
// =====================

el.retryBtn.addEventListener("click", fetchPrayerTimes);

// Re-evaluasi saat tab kembali aktif (waktu bisa berubah)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && prayerTimes.length) {
    determineNextPrayer();
    highlightNextCard();
    el.nextName.textContent = prayerTimes[nextPrayerIndex].name;
  }
});

initGeolocation();

// Jika ada lokasi tersimpan, pakai itu. Jika tidak, default Jakarta.
if (!restoreLocation()) {
  fetchPrayerTimes();
}

renderKiblat(); // default Jakarta

// Daftarkan Service Worker (hanya jika browser mendukung)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => console.log("SW terdaftar:", reg.scope))
      .catch((err) => console.error("SW gagal:", err));
  });
}

// =====================
// Push Notification: Subscribe
// =====================

// Ganti dengan Public Key VAPID Anda (dari Step 1)
const VAPID_PUBLIC_KEY = "BLs9LK-aoISs6Wxkb3MlvhLjd89pdgU1xlu9VDE8y4OLCTavYdvI47jyBbo9TVUOv6Ua4IGMCRlv_Nl-HDNNJak";

// Konversi base64 VAPID key ke Uint8Array (wajib untuk subscribe)
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const notifBtn = document.getElementById("notifBtn");
const notifStatus = document.getElementById("notifStatus");

function setNotifState(state) {
  const labels = {
    default: "Aktifkan notifikasi",
    on: "Notifikasi aktif",
    off: "Notifikasi diblokir di pengaturan browser",
  };
  notifBtn.dataset.state = state;
  notifBtn.title = labels[state];
  notifBtn.setAttribute("aria-label", labels[state]);
  notifBtn.disabled = state !== "default";
}

// Deteksi dukungan push
const pushSupported =
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

if (!pushSupported) {
  if (notifStatus) notifStatus.textContent = "Browser ini tidak mendukung notifikasi push.";
} else {
  notifBtn.hidden = false;

  // Cek status izin saat ini
  if (Notification.permission === "granted") {
    setNotifState("on")
  } else if (Notification.permission === "denied") {
    setNotifState("off")
    notifStatus.textContent = "Notifikasi diblokir. Ubah di pengaturan browser.";
    notifBtn.hidden = true;
  }
}

// Klik tombol -> minta izin -> subscribe -> kirim ke backend
notifBtn?.addEventListener("click", async () => {
  try {
    notifBtn.disabled = true;
    notifStatus.textContent = "Meminta izin…";

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      notifStatus.textContent = "Izin notifikasi ditolak.";
      notifBtn.disabled = false;
      return;
    }

    notifStatus.textContent = "Mendaftarkan perangkat…";

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const savedLoc = loadLocation();

    // Kirim subscription ke backend (endpoint dibuat di step berikutnya)
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
      ...sub,                              // endpoint, keys, dll
      lat: savedLoc?.lat ?? null,
      lon: savedLoc?.lon ?? null,
      city: savedLoc?.name ?? "Jakarta",
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta",
    }),
    });

    if (!res.ok) throw new Error("Server menolak subscription");

    notifStatus.textContent = "Notifikasi berhasil diaktifkan ✅";
    notifBtn.hidden = true;
  } catch (err) {
    console.error("Gagal subscribe:", err);
    notifStatus.textContent = "Gagal mengaktifkan notifikasi. Coba lagi.";
    notifBtn.disabled = false;
  }
});

// BANNER IOS

const iosBanner = document.getElementById("iosBanner");
const iosBannerClose = document.getElementById("iosBannerClose");

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.navigator.standalone === true;

// Tampil selalu selama dibuka via Safari (bukan dari layar utama)
if (isIOS && !isStandalone) {
  iosBanner.hidden = false;
}

// Tutup hanya untuk sesi ini
iosBannerClose.addEventListener("click", () => {
  iosBanner.hidden = true;
});


/** Hitung bearing (derajat dari utara, searah jam) ke Ka'bah */
function hitungKiblat(lat, lon) {
  const φ1 = toRad(lat);
  const φ2 = toRad(KAABA.lat);
  const Δλ = toRad(KAABA.lon - lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Hitung jarak haversine (km) */
function hitungJarak(lat, lon) {
  const R = 6371;
  const dLat = toRad(KAABA.lat - lat);
  const dLon = toRad(KAABA.lon - lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat)) * Math.cos(toRad(KAABA.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Nama mata angin bahasa Indonesia */
function mataAngin(deg) {
  const dirs = ["Utara", "Timur Laut", "Timur", "Tenggara", "Selatan", "Barat Daya", "Barat", "Barat Laut"];
  return dirs[Math.round(deg / 45) % 8];
}

/** Render tampilan statis kiblat (angka, jarak, jarum tanpa heading) */
function renderKiblat() {
  bearingKiblat = hitungKiblat(koordKiblat.lat, koordKiblat.lon);
  const jarak = hitungJarak(koordKiblat.lat, koordKiblat.lon);

  if (el.kiblatCity) el.kiblatCity.textContent = koordKiblat.name;
  if (el.qiblatDeg) el.qiblatDeg.textContent = Math.round(bearingKiblat) + "°";
  if (el.qiblatDir) el.qiblatDir.textContent = mataAngin(bearingKiblat);
  if (el.qiblatInfo) {
    el.qiblatInfo.textContent =
      `Jarak ke Ka'bah: ${jarak.toLocaleString("id-ID", { maximumFractionDigits: 0 })} km`;
  }
  if (el.compassNeedle && !kompasAktif) {
    el.compassNeedle.style.transform = `rotate(${bearingKiblat}deg)`;
  }
}

/** Haluskan heading dengan low-pass filter + cegah lompatan 359->0 */
function halusHeading(prev, next) {
  let diff = next - prev;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return prev + diff * 0.15;
}

/** Handler deviceorientation, dipakai Android & iOS */
function buatHandlerOrientasi(isIOS) {
  return (e) => {
    let heading = null;
    if (isIOS && typeof e.webkitCompassHeading === "number") {
  heading = e.webkitCompassHeading;
    } else if (typeof e.alpha === "number") {
      heading = 360 - e.alpha;
    }
    if (heading == null) return;

    headingSekarang = halusHeading(headingSekarang, heading);
    if (el.compassDial) {
      el.compassDial.style.transform = `rotate(${-headingSekarang}deg)`;
    }
    if (el.compassNeedle) {
      el.compassNeedle.style.transform = `rotate(${bearingKiblat - headingSekarang}deg)`;
    }

    // Cek apakah menghadap kiblat (selisih ≤ 3°)
    let selisih = Math.abs(((bearingKiblat - headingSekarang + 540) % 360) - 180);
    selisih = 180 - selisih;
    selisih = Math.abs(180 - selisih);
    const aligned = selisih <= 3;
    el.compassNeedle?.classList.toggle("is-aligned", aligned);
    if (el.qiblatAligned) {
      el.qiblatAligned.textContent = aligned ? "Anda menghadap kiblat" : "";
    }
    if (aligned && !sudahVibrate) {
      if (navigator.vibrate) navigator.vibrate(50);
      sudahVibrate = true;
    }
    if (!aligned) sudahVibrate = false;
  };
}

/** Aktifkan kompas (minta izin iOS dulu) */
async function mulaiKompas() {
  if (kompasAktif) { hentikanKompas(); return; }
  if (!("DeviceOrientationEvent" in window)) {
    if (el.qiblatAligned) el.qiblatAligned.textContent =
      "Sensor kompas tidak tersedia. Gunakan kompas fisik dan hadap ke " +
      Math.round(bearingKiblat) + "° dari utara.";
    return;
  }

  try {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const izin = await DeviceOrientationEvent.requestPermission();
      if (izin !== "granted") {
        if (el.qiblatAligned) el.qiblatAligned.textContent =
          "Izin kompas ditolak. Hadap ke " + Math.round(bearingKiblat) + "° dari utara.";
        return;
      }
    }

    const isIOS = typeof DeviceOrientationEvent.requestPermission === "function";

    // Watchdog: pastikan event benar-benar datang
    let eventMasuk = false;
    const wrappedHandler = (e) => {
      eventMasuk = true;
      buatHandlerOrientasi(isIOS)(e);
    };

    handlerOrientasi = wrappedHandler;

    if (isIOS) {
      window.addEventListener("deviceorientation", wrappedHandler, true);
    } else {
      window.addEventListener("deviceorientationabsolute", wrappedHandler, true);
      window.addEventListener("deviceorientation", wrappedHandler, true);
    }

    kompasAktif = true;
    mintaWakeLock();
    if (el.compassBtn) el.compassBtn.textContent = "Matikan Kompas";
    if (el.qiblatAligned) el.qiblatAligned.textContent = "";

    // Cek setelah 1.5 detik: jika tidak ada event, matikan lagi
    setTimeout(() => {
      if (!eventMasuk && kompasAktif) {
        hentikanKompas();
        if (el.qiblatAligned) el.qiblatAligned.textContent =
          "Sensor kompas tidak merespons. Coba aktifkan ulang.";
      } else if (eventMasuk) {
        try { localStorage.setItem("kompas_pernah", "1"); } catch {}
      }
    }, 1500);

  } catch (err) {
    console.error("Kompas gagal:", err);
    kompasAktif = false;
    if (el.compassBtn) el.compassBtn.textContent = "Aktifkan Kompas";
    if (el.qiblatAligned) el.qiblatAligned.textContent =
      "Gagal mengaktifkan kompas.";
  }
}

/** Hentikan kompas (hemat baterai) */
function hentikanKompas() {
  if (handlerOrientasi) {
    window.removeEventListener("deviceorientationabsolute", handlerOrientasi, true);
    window.removeEventListener("deviceorientation", handlerOrientasi, true);
    handlerOrientasi = null;
  }
  kompasAktif = false;
  headingSekarang = 0;          // tambahan
  sudahVibrate = false;         // tambahan
  if (el.compassBtn) el.compassBtn.textContent = "Aktifkan Kompas";
  if (el.qiblatAligned) el.qiblatAligned.textContent = "";
  if (el.compassDial) el.compassDial.style.transform = "rotate(0deg)";
  renderKiblat();
}

el.compassBtn?.addEventListener("click", mulaiKompas);

// Perbarui kiblat saat koordinat berubah
function perbaruiKiblat(lat, lon, name) {
  koordKiblat = { lat, lon, name: name || "Lokasi Anda" };
  renderKiblat();
}

// Sinkron dengan lokasi yang dipakai jadwal shalat:
// panggil di setiap tempat yang mengubah `koordLokasi` (lihat bagian 5)

// =====================
// Navigasi tab
// =====================
const nav = document.getElementById("nav");
const tabs = nav ? [...nav.querySelectorAll(".nav__item")] : [];
let halamanAktif = "jadwal";

function go(name) {
  halamanAktif = name;
  tabs.forEach((t, i) => {
    const on = t.dataset.page === name;
    t.setAttribute("aria-selected", on);
    if (on) nav.style.setProperty("--i", i);
  });
  document.querySelectorAll(".page").forEach((p) =>
    p.classList.toggle("hidden", p.id !== "page-" + name)
  );

  if (name !== "kiblat" && kompasAktif) hentikanKompas();

  // Saat masuk tab Kiblat: modal jika belum pernah, auto-resume jika sudah
  if (name === "kiblat" && !kompasAktif) {
    if (localStorage.getItem("kompas_pernah") !== "1") {
      bukaModalKompas();
    } else {
      mulaiKompas(); // dipicu klik tab (user gesture), aman di iOS
    }
  }
}

// =====================
// Modal kompas
// =====================
const compassModal = document.getElementById("compassModal");
const compassModalOk = document.getElementById("compassModalOk");
const compassModalCancel = document.getElementById("compassModalCancel");

function bukaModalKompas() {
  if (compassModal) compassModal.hidden = false;
}
function tutupModalKompas() {
  if (compassModal) compassModal.hidden = true;
}

compassModalOk?.addEventListener("click", async () => {
  tutupModalKompas();
  await mulaiKompas(); // fungsi yang sudah ada
});

compassModalCancel?.addEventListener("click", tutupModalKompas);

compassModal?.querySelectorAll("[data-close]").forEach((el) =>
  el.addEventListener("click", tutupModalKompas)
);

// Tutup dengan tombol Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && compassModal && !compassModal.hidden) {
    tutupModalKompas();
  }
});
tabs.forEach((t) => t.addEventListener("click", () => go(t.dataset.page)));

// Pause kompas saat halaman tidak terlihat
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && kompasAktif) {
    hentikanKompas();
  } else if (
    document.visibilityState === "visible" &&
    halamanAktif === "kiblat" &&
    kompasAktif
  ) {
    mintaWakeLock();
  }
});