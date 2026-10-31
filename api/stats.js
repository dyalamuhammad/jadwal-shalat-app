import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Opsional: proteksi dengan secret agar tidak publik
  const secret = req.headers["x-stats-secret"];
  if (process.env.STATS_SECRET && secret !== process.env.STATS_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const keys = await redis.keys("push:sub:*");
    return res.status(200).json({ users: keys.length });
  } catch (err) {
    console.error("Gagal ambil stats:", err);
    return res.status(500).json({ error: "Gagal ambil stats" });
  }
}