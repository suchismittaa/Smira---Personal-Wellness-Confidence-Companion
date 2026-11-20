// /api/gemini.js
// Vercel Serverless Function — proxies requests to the Gemini API.
// The key (GEMINI_KEY, no VITE_ prefix) never reaches the browser.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed. Use POST." } });
    return;
  }

  const apiKey = process.env.GEMINI_KEY;
  if (!apiKey) {
    res.status(500).json({ error: { message: "Server is missing GEMINI_KEY environment variable." } });
    return;
  }

  // Google has been retiring Gemini model IDs every few months in 2026.
  // GEMINI_MODEL lets you swap models via an env var + redeploy, no code change.
  const model = (req.query && req.query.model) || process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: { message: "Failed to reach the Gemini API.", detail: err.message } });
  }
}
