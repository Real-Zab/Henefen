import { requireAdmin } from '../../_auth.js';

// GET /api/admin/categories -> liste les 4 catégories avec leurs libellés
// PUT /api/admin/categories -> met à jour un libellé { slug, label_top, label_bottom }
// (GET est aussi utilisé publiquement par l'accueil pour afficher les bons libellés)

export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  return Response.json({ categories: results });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const admin = await requireAdmin(request, env);
  if (!admin) return Response.json({ error: 'Non autorisé' }, { status: 401 });

  const { slug, label_top, label_bottom } = await request.json();
  if (!slug || !label_top || !label_bottom) {
    return Response.json({ error: 'Champs requis manquants' }, { status: 400 });
  }
  await env.DB.prepare('UPDATE categories SET label_top = ?, label_bottom = ? WHERE slug = ?')
    .bind(label_top, label_bottom, slug).run();
  return Response.json({ ok: true });
}
