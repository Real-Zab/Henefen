import { requireAdmin } from '../../_auth.js';

// GET  /api/admin/products        -> liste tous les produits (actifs et inactifs)
// POST /api/admin/products        -> crée un produit { name, category, piece_type, price_fcfa, description, colors: [{color_name, hex}] }
// PUT  /api/admin/products        -> modifie un produit { id, ...mêmes champs }
// DELETE /api/admin/products?id=5 -> supprime un produit

function slugify(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const admin = await requireAdmin(request, env);
  if (!admin) return Response.json({ error: 'Non autorisé' }, { status: 401 });

  const { results: products } = await env.DB.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  for (const p of products) {
    const { results: colors } = await env.DB.prepare('SELECT id, color_name, hex FROM product_colors WHERE product_id = ? ORDER BY sort_order').bind(p.id).all();
    p.colors = colors;
  }
  return Response.json({ products });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const admin = await requireAdmin(request, env);
  if (!admin) return Response.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await request.json();
  const { name, category, piece_type, price_fcfa, description, colors } = body;
  if (!name || !category || !piece_type || !price_fcfa) {
    return Response.json({ error: 'Champs requis manquants' }, { status: 400 });
  }
  const slug = slugify(name) + '-' + Date.now().toString(36);

  const result = await env.DB.prepare(
    `INSERT INTO products (name, slug, description, category, piece_type, price_fcfa) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(name, slug, description || '', category, piece_type, price_fcfa).run();

  const productId = result.meta.last_row_id;

  if (Array.isArray(colors)) {
    for (let i = 0; i < colors.length; i++) {
      await env.DB.prepare('INSERT INTO product_colors (product_id, color_name, hex, sort_order) VALUES (?, ?, ?, ?)')
        .bind(productId, colors[i].color_name, colors[i].hex, i).run();
    }
  }

  return Response.json({ ok: true, id: productId, slug });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const admin = await requireAdmin(request, env);
  if (!admin) return Response.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await request.json();
  const { id, name, category, piece_type, price_fcfa, description, active, colors } = body;
  if (!id) return Response.json({ error: 'id requis' }, { status: 400 });

  await env.DB.prepare(
    `UPDATE products SET name=?, description=?, category=?, piece_type=?, price_fcfa=?, active=? WHERE id=?`
  ).bind(name, description || '', category, piece_type, price_fcfa, active ? 1 : 0, id).run();

  if (Array.isArray(colors)) {
    await env.DB.prepare('DELETE FROM product_colors WHERE product_id = ?').bind(id).run();
    for (let i = 0; i < colors.length; i++) {
      await env.DB.prepare('INSERT INTO product_colors (product_id, color_name, hex, sort_order) VALUES (?, ?, ?, ?)')
        .bind(id, colors[i].color_name, colors[i].hex, i).run();
    }
  }

  return Response.json({ ok: true });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const admin = await requireAdmin(request, env);
  if (!admin) return Response.json({ error: 'Non autorisé' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'id requis' }, { status: 400 });

  await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
  return Response.json({ ok: true });
}
