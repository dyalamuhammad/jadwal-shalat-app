// api/send.js — tambahkan verifikasi di awal
import { Receiver } from "@upstash/qstash";
import { Redis } from "@upstash/redis";
import webpush from "web-push";

const redis = Redis.fromEnv();

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
});


// Setup VAPID
webpush.setVapidDetails(
  "mailto:fawwannavir@gmail.com", // ganti dengan email Anda
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Matikan body parser Vercel supaya dapat raw body untuk verifikasi signature
export const config = { api: { bodyParser: false } };

// Helper baca raw body
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 1) Ambil signature
  const signature = req.headers["upstash-signature"];
  if (!signature) {
    return res.status(401).json({ error: "Missing signature" });
  }

  // 2) Baca raw body & verifikasi signature
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

  // 3) Parse body setelah signature valid
  let parsed = {};
  try {
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    parsed = {};
  }
  const { title, body, url } = parsed;

  try {
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