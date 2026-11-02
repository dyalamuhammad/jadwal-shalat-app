import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const keys = await redis.keys("push:sub:*");
    if (!keys.length) return res.status(200).json({ ok: true, updated: 0 });

    // Tanggal hari ini (WIB) - API AlAdhan pakai DD-MM-YYYY
    const now = new Date();
    const dateStr =
      String(now.getDate()).padStart(2, "0") + "-" +
      String(now.getMonth() + 1).padStart(2, "0") + "-" +
      now.getFullYear();

    let updated = 0;
    const cache = new Map(); // cache per koordinat unik

    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      const meta = typeof raw === "string" ? JSON.parse(raw) : raw;

      const lat = meta.lat ?? -6.2088; // default Jakarta
      const lon = meta.lon ?? 106.8456;
      const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;

      let schedule = cache.get(cacheKey);

      if (!schedule) {
        const r = await fetch(
          `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${lat}&longitude=${lon}&method=20`
        );
        const j = await r.json();
        const t = j?.data?.timings;
        if (!t) continue;

        schedule = {
          Fajr: t.Fajr.split(" ")[0],
          Dhuhr: t.Dhuhr.split(" ")[0],
          Asr: t.Asr.split(" ")[0],
          Maghrib: t.Maghrib.split(" ")[0],
          Isha: t.Isha.split(" ")[0],
        };
        cache.set(cacheKey, schedule);
      }

      await redis.set(
        `push:sched:${meta.subscription.endpoint}`,
        JSON.stringify(schedule),
        { ex: 86400 * 2 } // expire 2 hari
      );
      updated++;
    }

    return res.status(200).json({ ok: true, updated });
  } catch (err) {
    console.error("Gagal update jadwal:", err);
    return res.status(500).json({ error: "Gagal update jadwal" });
  }
}