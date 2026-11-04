// Always anonymous: draft media never becomes public through an owner session.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(); }
  const path = new URL(req.url, 'http://localhost').searchParams.get('path');
  if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/.test(path || '')) { res.statusCode = 400; return res.end(); }
  const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) { res.statusCode = 503; return res.end('Portfolio storage is not configured.'); }
  try {
    const result = await fetch(`${url}/storage/v1/object/authenticated/portfolio/${path}`, {
      headers: { apikey: key }, signal: AbortSignal.timeout(15000)
    });
    if (!result.ok) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', 'image/jpeg'); res.end(Buffer.from(await result.arrayBuffer()));
  } catch { res.statusCode = 502; res.end('Photo unavailable. Please retry.'); }
}
