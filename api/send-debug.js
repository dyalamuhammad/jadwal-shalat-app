import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

export default async function handler(req, res) {
  const keys = await redis.keys("push:sub:*");
  const out = [];

  for (const key of keys) {
    const raw = await redis.get(key);
    if (!raw) continue;
    const meta = typeof raw === "string" ? JSON.parse(raw) : raw;
    const sub = meta.subscription || meta;
    const schedRaw = await redis.get(`push:sched:${sub.endpoint}`);
    out.push({
      endpointTail: sub.endpoint.slice(-20),
      tz: meta.tz,
      city: meta.city,
      lat: meta.lat,
      lon: meta.lon,
      sched: schedRaw ? (typeof schedRaw === "string" ? JSON.parse(schedRaw) : schedRaw) : null,
    });
  }

  return res.status(200).json({ users: out });
}