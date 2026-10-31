// =====================
// Konstanta & elemen DOM
// =====================
const API_URL =
  "https://api.aladhan.com/v1/timingsByCity?city=Jakarta&country=Indonesia&method=20";

// Daftar shalat: key dari API -> nama Indonesia
const PRAYERS = [
  { key: "Fajr", name: "Subuh" },
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
  cards: document.getElementById("cards"),
};

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

  // Semua sudah lewat -> Subuh besok
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

async function fetchPrayerTimes() {
  showLoading();
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("HTTP " + res.status);

    const json = await res.json();
    const data = json && json.data;
    const timings = data && data.timings;
    if (!timings) throw new Error("timings kosong");

    const clean = (t) => (t || "").split(" ")[0];

    prayerTimes = PRAYERS.map((p) => ({
      key: p.key,
      name: p.name,
      time: clean(timings[p.key]) || "--:--",
    }));

    const readable = (data.date && data.date.readable) || "";
    const hijri = (data.date && data.date.hijri) || null;
    renderDates(readable, hijri);

    renderCards();
    determineNextPrayer();
    highlightNextCard();
    startCountdown();
    showContent();
  } catch (err) {
    console.error("DEBUG gagal:", err); // <-- lihat pesan ini di Console
    showError("Gagal memuat jadwal: " + err.message);
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

fetchPrayerTimes();

// Daftarkan Service Worker (hanya jika browser mendukung)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => console.log("SW terdaftar:", reg.scope))
      .catch((err) => console.error("SW gagal:", err));
  });
}