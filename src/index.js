// Henefen — Worker principal
// Gère les routes /api/*, sert les fichiers statiques (public/) pour tout le reste.

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signToken(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const body = btoa(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const sigHex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${body}.${sigHex}`;
}

async function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [body, sigHex] = token.split('.');
  const expected = await signToken(JSON.parse(atob(body)), secret);
  if (expected !== token) return null;
  const payload = JSON.parse(atob(body));
  if (payload.exp < Date.now()) return null;
  return payload;
}

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

async function requireAdmin(request, env) {
  const token = getCookie(request, 'henefen_admin');
  return await verifyToken(token, env.ADMIN_SESSION_SECRET);
}

function slugify(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // ---------- Public: liste produits ----------
      if (path === '/api/products' && method === 'GET') {
        const category = url.searchParams.get('category');
        let query = `SELECT id, name, slug, description, category, piece_type, price_fcfa FROM products WHERE active = 1`;
        const params = [];
        if (category) { query += ` AND category = ?`; params.push(category); }
        query += ` ORDER BY created_at DESC`;
        const { results: products } = await env.DB.prepare(query).bind(...params).all();
        for (const p of products) {
          const { results: colors } = await env.DB.prepare('SELECT color_name, hex FROM product_colors WHERE product_id = ? ORDER BY sort_order').bind(p.id).all();
          p.colors = colors;
        }
        return json({ products });
      }

      // ---------- Public: catégories (libellés) ----------
      if (path === '/api/categories' && method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM categories ORDER BY sort_order').all();
        return json({ categories: results });
      }

      // ---------- Public: taux de change ----------
      if (path === '/api/settings' && method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM settings').all();
        const settings = {};
        results.forEach(r => settings[r.key] = r.value);
        return json({ settings });
      }

      // ---------- Admin: login ----------
      if (path === '/api/admin/login' && method === 'POST') {
        const { email, password } = await request.json();
        if (!email || !password) return json({ error: 'Email et mot de passe requis' }, 400);
        const admin = await env.DB.prepare('SELECT * FROM admin_users WHERE email = ?').bind(email).first();
        if (!admin) return json({ error: 'Identifiants incorrects' }, 401);
        const hash = await hashPassword(password);
        if (hash !== admin.password_hash) return json({ error: 'Identifiants incorrects' }, 401);
        const token = await signToken({ adminId: admin.id, email: admin.email, exp: Date.now() + 1000 * 60 * 60 * 12 }, env.ADMIN_SESSION_SECRET);
        return json({ ok: true }, 200, {
          'Set-Cookie': `henefen_admin=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`
        });
      }

      // ---------- Admin: session ----------
      if (path === '/api/admin/me' && method === 'GET') {
        const admin = await requireAdmin(request, env);
        if (!admin) return json({ authenticated: false }, 401);
        return json({ authenticated: true, email: admin.email });
      }

      // ---------- Admin: produits (CRUD) ----------
      if (path === '/api/admin/products') {
        const admin = await requireAdmin(request, env);
        if (!admin) return json({ error: 'Non autorisé' }, 401);

        if (method === 'GET') {
          const { results: products } = await env.DB.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
          for (const p of products) {
            const { results: colors } = await env.DB.prepare('SELECT id, color_name, hex FROM product_colors WHERE product_id = ? ORDER BY sort_order').bind(p.id).all();
            p.colors = colors;
          }
          return json({ products });
        }

        if (method === 'POST') {
          const body = await request.json();
          const { name, category, piece_type, price_fcfa, description, colors } = body;
          if (!name || !category || !piece_type || !price_fcfa) return json({ error: 'Champs requis manquants' }, 400);
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
          return json({ ok: true, id: productId, slug });
        }

        if (method === 'PUT') {
          const body = await request.json();
          const { id, name, category, piece_type, price_fcfa, description, active, colors } = body;
          if (!id) return json({ error: 'id requis' }, 400);
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
          return json({ ok: true });
        }

        if (method === 'DELETE') {
          const id = url.searchParams.get('id');
          if (!id) return json({ error: 'id requis' }, 400);
          await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
          return json({ ok: true });
        }
      }

      // ---------- Admin: catégories ----------
      if (path === '/api/admin/categories' && method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM categories ORDER BY sort_order').all();
        return json({ categories: results });
      }
      if (path === '/api/admin/categories' && method === 'PUT') {
        const admin = await requireAdmin(request, env);
        if (!admin) return json({ error: 'Non autorisé' }, 401);
        const { slug, label_top, label_bottom } = await request.json();
        if (!slug || !label_top || !label_bottom) return json({ error: 'Champs requis manquants' }, 400);
        await env.DB.prepare('UPDATE categories SET label_top = ?, label_bottom = ? WHERE slug = ?').bind(label_top, label_bottom, slug).run();
        return json({ ok: true });
      }

      // ---------- Admin: taux de change ----------
      if (path === '/api/admin/settings' && method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM settings').all();
        const settings = {};
        results.forEach(r => settings[r.key] = r.value);
        return json({ settings });
      }
      if (path === '/api/admin/settings' && method === 'PUT') {
        const admin = await requireAdmin(request, env);
        if (!admin) return json({ error: 'Non autorisé' }, 401);
        const updates = await request.json();
        for (const [key, value] of Object.entries(updates)) {
          await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, String(value)).run();
        }
        return json({ ok: true });
      }

      // ---------- Tout le reste : fichiers statiques (index.html, boutique/, admin/) ----------
      return env.ASSETS.fetch(request);

    } catch (err) {
      return json({ error: 'Erreur serveur', detail: err.message }, 500);
    }
  }
};
