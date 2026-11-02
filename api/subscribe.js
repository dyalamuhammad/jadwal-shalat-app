import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const subscription = req.body;
    if (!subscription?.endpoint) {
      return res.status(400).json({ error: "Subscription tidak valid" });
    }

    const sub = subscription;
    const meta = {
      subscription: sub,
      lat: req.body.lat ?? null,
      lon: req.body.lon ?? null,
      tz: req.body.tz || "Asia/Jakarta",
      city: req.body.city || "Jakarta",
    };

    await redis.set(
      `push:sub:${sub.endpoint}`,
      JSON.stringify(meta)
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Gagal simpan subscription:", err);
    return res.status(500).json({ error: "Gagal menyimpan subscription" });
  }
}