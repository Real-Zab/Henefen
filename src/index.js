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

async function requireUser(request, env) {
  const token = getCookie(request, 'henefen_user');
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
        const pieceType = url.searchParams.get('type');
        let query = `SELECT id, name, slug, description, category, piece_type, price_fcfa FROM products WHERE active = 1`;
        const params = [];
        if (category) { query += ` AND category = ?`; params.push(category); }
        if (pieceType) { query += ` AND piece_type = ?`; params.push(pieceType); }
        query += ` ORDER BY created_at DESC`;
        const { results: products } = await env.DB.prepare(query).bind(...params).all();
        for (const p of products) {
          const { results: colors } = await env.DB.prepare('SELECT color_name, hex FROM product_colors WHERE product_id = ? ORDER BY sort_order').bind(p.id).all();
          p.colors = colors;
          const photo = await env.DB.prepare('SELECT key FROM photos WHERE target_type = ? AND target_id = ? ORDER BY sort_order LIMIT 1').bind('product', p.id).first();
          p.photo_url = photo ? `/api/photos/${photo.key}` : null;
        }
        return json({ products });
      }

      // ---------- Public: un seul produit (fiche article) ----------
      if (path.startsWith('/api/products/') && method === 'GET') {
        const slug = decodeURIComponent(path.replace('/api/products/', ''));
        const product = await env.DB.prepare('SELECT * FROM products WHERE slug = ? AND active = 1').bind(slug).first();
        if (!product) return json({ error: 'Introuvable' }, 404);
        const { results: colors } = await env.DB.prepare('SELECT id, color_name, hex FROM product_colors WHERE product_id = ? ORDER BY sort_order').bind(product.id).all();
        const { results: photoRows } = await env.DB.prepare('SELECT key FROM photos WHERE target_type = ? AND target_id = ? ORDER BY sort_order').bind('product', product.id).all();
        product.colors = colors;
        product.photos = photoRows.map(p => `/api/photos/${p.key}`);
        return json({ product });
      }

      // ---------- Public: catégories (libellés) ----------
      if (path === '/api/categories' && method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM categories ORDER BY sort_order').all();
        results.forEach(c => c.photo_url = c.photo_key ? `/api/photos/${c.photo_key}` : null);
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
        results.forEach(c => c.photo_url = c.photo_key ? `/api/photos/${c.photo_key}` : null);
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

      // ---------- Public: photo d'accueil actuelle ----------
      if (path === '/api/hero-photo' && method === 'GET') {
        const photo = await env.DB.prepare('SELECT key FROM photos WHERE target_type = ? ORDER BY sort_order LIMIT 1').bind('hero').first();
        return json({ url: photo ? `/api/photos/${photo.key}` : null });
      }

      // ---------- Public: sert le fichier image depuis R2 ----------
      if (path.startsWith('/api/photos/') && method === 'GET') {
        const key = decodeURIComponent(path.replace('/api/photos/', ''));
        const object = await env.PHOTOS.get(key);
        if (!object) return new Response('Introuvable', { status: 404 });
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Cache-Control', 'public, max-age=31536000');
        return new Response(object.body, { headers });
      }

      // ---------- Admin: liste des photos (avec filtre optionnel) ----------
      if (path === '/api/admin/photos' && method === 'GET') {
        const admin = await requireAdmin(request, env);
        if (!admin) return json({ error: 'Non autorisé' }, 401);
        const targetType = url.searchParams.get('target_type');
        const targetId = url.searchParams.get('target_id');
        let q = 'SELECT * FROM photos';
        const conds = [];
        const params = [];
        if (targetType) { conds.push('target_type = ?'); params.push(targetType); }
        if (targetId) { conds.push('target_id = ?'); params.push(targetId); }
        if (conds.length) q += ' WHERE ' + conds.join(' AND ');
        q += ' ORDER BY sort_order';
        const { results } = await env.DB.prepare(q).bind(...params).all();
        return json({ photos: results.map(p => ({ ...p, url: `/api/photos/${p.key}` })) });
      }

      // ---------- Admin: upload d'une photo (vers R2 + référence en base) ----------
      if (path === '/api/admin/photos' && method === 'POST') {
        const admin = await requireAdmin(request, env);
        if (!admin) return json({ error: 'Non autorisé' }, 401);
        const form = await request.formData();
        const file = form.get('file');
        const targetType = form.get('target_type');
        const targetId = form.get('target_id') || null;
        if (!file || !targetType) return json({ error: 'Fichier et target_type requis' }, 400);
        if (!['hero', 'product', 'category'].includes(targetType)) return json({ error: 'target_type invalide' }, 400);

        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();

        // Photo de catégorie : stockée directement sur la catégorie, pas dans la table photos
        if (targetType === 'category') {
          if (!targetId) return json({ error: 'target_id (slug de catégorie) requis' }, 400);
          const key = `category/${targetId}/${Date.now().toString(36)}.${ext}`;
          const existing = await env.DB.prepare('SELECT photo_key FROM categories WHERE slug = ?').bind(targetId).first();
          if (existing && existing.photo_key) { await env.PHOTOS.delete(existing.photo_key); }
          await env.PHOTOS.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'image/jpeg' } });
          await env.DB.prepare('UPDATE categories SET photo_key = ? WHERE slug = ?').bind(key, targetId).run();
          return json({ ok: true, key, url: `/api/photos/${key}` });
        }

        const key = `${targetType}/${targetId || 'accueil'}/${Date.now().toString(36)}.${ext}`;
        await env.PHOTOS.put(key, await file.arrayBuffer(), {
          httpMetadata: { contentType: file.type || 'image/jpeg' }
        });

        // Pour la photo d'accueil : une seule à la fois — on retire les précédentes
        if (targetType === 'hero') {
          const { results: old } = await env.DB.prepare('SELECT key FROM photos WHERE target_type = ?').bind('hero').all();
          for (const o of old) { await env.PHOTOS.delete(o.key); }
          await env.DB.prepare('DELETE FROM photos WHERE target_type = ?').bind('hero').run();
        }

        await env.DB.prepare('INSERT INTO photos (key, target_type, target_id) VALUES (?, ?, ?)')
          .bind(key, targetType, targetId).run();

        return json({ ok: true, key, url: `/api/photos/${key}` });
      }

      // ---------- Admin: suppression d'une photo ----------
      if (path === '/api/admin/photos' && method === 'DELETE') {
        const admin = await requireAdmin(request, env);
        if (!admin) return json({ error: 'Non autorisé' }, 401);
        const key = url.searchParams.get('key');
        if (!key) return json({ error: 'key requis' }, 400);
        await env.PHOTOS.delete(key);
        await env.DB.prepare('DELETE FROM photos WHERE key = ?').bind(key).run();
        return json({ ok: true });
      }

      // ---------- Client: inscription ----------
      if (path === '/api/auth/register' && method === 'POST') {
        const { phone, email, password, name } = await request.json();
        if (!phone || !email || !password) return json({ error: 'Téléphone, email et mot de passe requis' }, 400);
        const existingPhone = await env.DB.prepare('SELECT id FROM users WHERE phone = ?').bind(phone).first();
        if (existingPhone) return json({ error: 'Ce numéro est déjà utilisé' }, 400);
        const existingEmail = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
        if (existingEmail) return json({ error: 'Cet email est déjà utilisé' }, 400);
        const hash = await hashPassword(password);
        const result = await env.DB.prepare('INSERT INTO users (email, password_hash, name, phone) VALUES (?, ?, ?, ?)')
          .bind(email, hash, name || '', phone).run();
        const userId = result.meta.last_row_id;
        const token = await signToken({ userId, phone, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 }, env.ADMIN_SESSION_SECRET);
        return json({ ok: true }, 200, {
          'Set-Cookie': `henefen_user=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`
        });
      }

      // ---------- Client: connexion ----------
      if (path === '/api/auth/login' && method === 'POST') {
        const { phone, password } = await request.json();
        if (!phone || !password) return json({ error: 'Téléphone et mot de passe requis' }, 400);
        const user = await env.DB.prepare('SELECT * FROM users WHERE phone = ?').bind(phone).first();
        if (!user) return json({ error: 'Identifiants incorrects' }, 401);
        const hash = await hashPassword(password);
        if (hash !== user.password_hash) return json({ error: 'Identifiants incorrects' }, 401);
        const token = await signToken({ userId: user.id, phone: user.phone, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 }, env.ADMIN_SESSION_SECRET);
        return json({ ok: true }, 200, {
          'Set-Cookie': `henefen_user=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`
        });
      }

      // ---------- Client: déconnexion ----------
      if (path === '/api/auth/logout' && method === 'POST') {
        return json({ ok: true }, 200, {
          'Set-Cookie': `henefen_user=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
        });
      }

      // ---------- Client: mon compte ----------
      if (path === '/api/auth/me' && method === 'GET') {
        const session = await requireUser(request, env);
        if (!session) return json({ authenticated: false }, 401);
        const user = await env.DB.prepare('SELECT id, name, email, phone, created_at FROM users WHERE id = ?').bind(session.userId).first();
        if (!user) return json({ authenticated: false }, 401);
        return json({ authenticated: true, user });
      }

      // ---------- Client: passer une commande ----------
      if (path === '/api/orders' && method === 'POST') {
        const session = await requireUser(request, env);
        if (!session) return json({ error: 'Connexion requise' }, 401);
        const { items, display_currency } = await request.json();
        if (!Array.isArray(items) || !items.length) return json({ error: 'Panier vide' }, 400);
        const total = items.reduce((sum, it) => sum + (it.unit_price_fcfa * (it.quantity || 1)), 0);
        const order = await env.DB.prepare('INSERT INTO orders (user_id, total_fcfa, display_currency) VALUES (?, ?, ?)')
          .bind(session.userId, total, display_currency || 'FCFA').run();
        const orderId = order.meta.last_row_id;
        for (const it of items) {
          await env.DB.prepare('INSERT INTO order_items (order_id, product_id, color_id, quantity, unit_price_fcfa) VALUES (?, ?, ?, ?, ?)')
            .bind(orderId, it.product_id, it.color_id || null, it.quantity || 1, it.unit_price_fcfa).run();
        }
        return json({ ok: true, order_id: orderId });
      }

      // ---------- Client: historique de mes commandes ----------
      if (path === '/api/orders/mine' && method === 'GET') {
        const session = await requireUser(request, env);
        if (!session) return json({ error: 'Connexion requise' }, 401);
        const { results: orders } = await env.DB.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').bind(session.userId).all();
        for (const o of orders) {
          const { results: items } = await env.DB.prepare(
            `SELECT oi.quantity, oi.unit_price_fcfa, p.name, p.slug FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`
          ).bind(o.id).all();
          o.items = items;
        }
        return json({ orders });
      }

      // ---------- Tout le reste : fichiers statiques (index.html, boutique/, admin/) ----------
      return env.ASSETS.fetch(request);

    } catch (err) {
      return json({ error: 'Erreur serveur', detail: err.message }, 500);
    }
  }
};
