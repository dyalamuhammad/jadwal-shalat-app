import { Redis } from "@upstash/redis";
import webpush from "web-push";
import { Receiver } from "@upstash/qstash";

const redis = Redis.fromEnv();

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
});

webpush.setVapidDetails(
  "mailto:fawwannavir@gmail.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

// Helper: ambil jam & menit di zona waktu tertentu
function getMinutesInTz(date, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const h = Number(parts.find(p => p.type === "hour").value);
  const m = Number(parts.find(p => p.type === "minute").value);
  return h * 60 + m;
}

const PRAYER_NAMES = {
  Fajr: "Shubuh", Dhuhr: "Dzuhur", Asr: "Ashar", Maghrib: "Maghrib", Isha: "Isya",
};

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const signature = req.headers["upstash-signature"];
  if (!signature) return res.status(401).json({ error: "Missing signature" });

  let rawBody;
  try {
    rawBody = await getRawBody(req);
    await receiver.verify({
      signature,
      body: rawBody,
      url: `https://${req.headers.host}/api/send`,
    });
  } catch (err) {
    console.error("Signature invalid:", err.message);
    return res.status(401).json({ error: "Invalid signature" });
  }

  try {
    const keys = await redis.keys("push:sub:*");
    if (!keys.length) {
      return res.status(200).json({ ok: true, sent: 0, message: "Tidak ada subscriber" });
    }

    const now = new Date();
    let sent = 0, failed = 0;

    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      const meta = typeof raw === "string" ? JSON.parse(raw) : raw;
      const sub = meta.subscription || meta;
      if (!sub?.endpoint) continue;

      const tz = meta.tz || "Asia/Jakarta";

      // Hitung menit lokal user
      let nowMinutes;
      try {
        nowMinutes = getMinutesInTz(now, tz);
      } catch {
        nowMinutes = getMinutesInTz(now, "Asia/Jakarta");
      }

      // Baca jadwal user
      const schedRaw = await redis.get(`push:sched:${sub.endpoint}`);
      if (!schedRaw) continue;
      const sched = typeof schedRaw === "string" ? JSON.parse(schedRaw) : schedRaw;

      // Cari shalat yang jatuh di menit ini (±1 menit toleransi)
      const hit = Object.entries(sched).find(([_, time]) => {
        const diff = Math.abs(toMinutes(time) - nowMinutes);
        return diff <= 1;
      });

      console.log("[cek]", {
        tz: meta.tz,
        nowMinutes,
        sched,
        match: hit ? hit[0] : "tidak ada",
      });

      if (!hit) continue;

      const [prayerKey] = hit;
      const jam = sched[prayerKey]; // contoh "04:07"
      const nama = PRAYER_NAMES[prayerKey] || prayerKey;
      const payload = JSON.stringify({
        title: `Waktu ${nama} ${jam}`,
        body: `Telah masuk waktu ${nama} pukul ${jam}.`,
        url: "./",
      });

      try {
        await webpush.sendNotification(sub, payload);
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await redis.del(key);
          await redis.del(`push:sched:${sub.endpoint}`);
        }
        failed++;
      }
    }

    return res.status(200).json({ ok: true, sent, failed });
  } catch (err) {
    console.error("Gagal kirim push:", err);
    return res.status(500).json({ error: "Gagal mengirim notifikasi" });
  }
}