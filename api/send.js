import { Redis } from "@upstash/redis";
import webpush from "web-push";

const redis = Redis.fromEnv();

// Setup VAPID
webpush.setVapidDetails(
  "mailto:fawwannavir@gmail.com", // ganti dengan email Anda
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  // Proteksi sederhana: hanya izinkan POST dengan secret
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Secret sederhana (opsional, bisa ditambahkan nanti)
  const { title, body, url } = req.body || {};

  try {
    // Ambil semua subscription dari Redis
    const keys = await redis.keys("push:sub:*");
    if (!keys.length) {
      return res.status(200).json({ ok: true, sent: 0, message: "Tidak ada subscriber" });
    }

    const payload = JSON.stringify({
      title: title || "Jadwal Shalat",
      body: body || "Waktu shalat telah tiba.",
      url: url || "./",
    });

    let sent = 0;
    let failed = 0;

    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;

      const sub = typeof raw === "string" ? JSON.parse(raw) : raw;

      try {
        await webpush.sendNotification(sub, payload);
        sent++;
      } catch (err) {
        // 404/410 = subscription mati, hapus dari Redis
        if (err.statusCode === 404 || err.statusCode === 410) {
          await redis.del(key);
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