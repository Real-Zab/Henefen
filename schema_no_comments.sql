CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('casual','diner','ceremonie','traditionnel')),
  piece_type TEXT NOT NULL CHECK (piece_type IN ('chemise','supersan','pantalon','ensemble')),
  price_fcfa INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS product_colors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color_name TEXT NOT NULL,
  hex TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color_id INTEGER REFERENCES product_colors(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  total_fcfa INTEGER NOT NULL,
  display_currency TEXT NOT NULL DEFAULT 'FCFA',
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente','confirmee','annulee')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  color_id INTEGER REFERENCES product_colors(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_fcfa INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  slug TEXT PRIMARY KEY CHECK (slug IN ('casual','diner','ceremonie','traditionnel')),
  label_top TEXT NOT NULL,
  label_bottom TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO categories (slug, label_top, label_bottom, sort_order) VALUES
  ('casual', 'Jour', 'Casual', 0),
  ('diner', 'Soir', 'Dîner', 1),
  ('ceremonie', 'Grand jour', 'Cérémonie', 2),
  ('traditionnel', 'Héritage', 'Tenue traditionnelle', 3);
INSERT INTO settings (key, value) VALUES
  ('fx_eur', '0.0015244'),
  ('fx_usd', '0.00165'),
  ('fx_gbp', '0.0012987');
INSERT INTO admin_users (email, password_hash) VALUES
  ('admin@henefen.sn', '9fc38a6757c4310ec9de92f0bc0afe572ef8eb4200df91551d83ce5145b43631');
INSERT INTO products (name, slug, description, category, piece_type, price_fcfa) VALUES
  ('Chemise en lin, col mao', 'chemise-lin-col-mao', 'Coupe droite, manches longues — pièce casual ou dîner', 'casual', 'chemise', 45000),
  ('Supersan lin bordeaux', 'supersan-lin-bordeaux', 'Taille ajustable, coupe droite', 'casual', 'supersan', 38000);
INSERT INTO product_colors (product_id, color_name, hex, sort_order) VALUES
  (1, 'Bordeaux', '#7C2333', 0),
  (1, 'Ivoire', '#EFE9DE', 1),
  (1, 'Noir', '#1B1714', 2);
