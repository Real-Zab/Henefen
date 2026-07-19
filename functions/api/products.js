// GET /api/products            -> liste tous les articles actifs
// GET /api/products?category=casual -> filtre par occasion
// Nécessite la base D1 liée dans Cloudflare Pages sous le nom "DB"
// (Dashboard > Pages > henefen > Settings > Functions > D1 database bindings)

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const category = url.searchParams.get('category');

  let query = `
    SELECT p.id, p.name, p.slug, p.description, p.category, p.piece_type, p.price_fcfa
    FROM products p
    WHERE p.active = 1
  `;
  const params = [];

  if (category) {
    query += ` AND p.category = ?`;
    params.push(category);
  }
  query += ` ORDER BY p.created_at DESC`;

  try {
    const { results: products } = await env.DB.prepare(query).bind(...params).all();

    // Récupère les couleurs de chaque produit
    for (const product of products) {
      const { results: colors } = await env.DB
        .prepare(`SELECT color_name, hex FROM product_colors WHERE product_id = ? ORDER BY sort_order`)
        .bind(product.id)
        .all();
      product.colors = colors;
    }

    return Response.json({ products });
  } catch (err) {
    return Response.json({ error: 'Erreur base de données', detail: err.message }, { status: 500 });
  }
}
