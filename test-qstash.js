// test-qstash.js
// Jalankan: QSTASH_TOKEN=xxx node test-qstash.js
// Akan membuat 4 jadwal: +1, +2, +3, +4 menit dari sekarang

import { Client } from "@upstash/qstash";

const client = new Client({ token: process.env.QSTASH_TOKEN });
const TARGET_URL = "https://jadwal-shalat-app.vercel.app/api/send";

function cronFromDate(d) {
  const m = d.getMinutes();
  const h = d.getHours();
  return `CRON_TZ=Asia/Jakarta ${m} ${h} * * *`;
}

const now = new Date();
const delays = [1, 2, 3, 4];

for (const d of delays) {
  const target = new Date(now.getTime() + d * 60 * 1000);
  const cron = cronFromDate(target);
  const id = `test-${d}min`;

  await client.schedules.create({
    destination: TARGET_URL,
    cron,
    scheduleId: id,
    body: JSON.stringify({
      title: `Tes ${d} menit`,
      body: `Notifikasi uji coba ${d} menit dari sekarang.`,
      url: "./",
    }),
    headers: { "Content-Type": "application/json" },
  });

  console.log(`Terdaftar ${id} -> ${cron} (target ${target.toLocaleTimeString("id-ID")})`);
}