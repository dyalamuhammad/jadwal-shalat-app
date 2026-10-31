// Placeholder: akan diisi di Step 4
export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  // Sementara hanya log, belum disimpan
  console.log("Subscription diterima:", req.body);
  return res.status(200).json({ ok: true });
}