import { requireAdmin } from '../../_auth.js';

// GET /api/admin/settings -> { fx_eur, fx_usd, fx_gbp } (public aussi, utilisé par les fiches produit)
// PUT /api/admin/settings -> met à jour un ou plusieurs taux { fx_eur?, fx_usd?, fx_gbp? }

export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare('SELECT * FROM settings').all();
  const settings = {};
  results.forEach(r => settings[r.key] = r.value);
  return Response.json({ settings });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const admin = await requireAdmin(request, env);
  if (!admin) return Response.json({ error: 'Non autorisé' }, { status: 401 });

  const updates = await request.json();
  for (const [key, value] of Object.entries(updates)) {
    await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .bind(key, String(value)).run();
  }
  return Response.json({ ok: true });
}
