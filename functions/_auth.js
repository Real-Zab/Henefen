// Utilitaires d'authentification admin partagés
// Nécessite une variable d'environnement ADMIN_SESSION_SECRET dans Cloudflare Pages
// (Settings > Environment variables > ajouter ADMIN_SESSION_SECRET avec une valeur aléatoire longue)

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

export { hashPassword, signToken, verifyToken, getCookie, requireAdmin };
