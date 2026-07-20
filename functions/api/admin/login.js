import { hashPassword, signToken, getCookie } from '../../_auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const { email, password } = await request.json();

  if (!email || !password) {
    return Response.json({ error: 'Email et mot de passe requis' }, { status: 400 });
  }

  const admin = await env.DB.prepare('SELECT * FROM admin_users WHERE email = ?').bind(email).first();
  if (!admin) {
    return Response.json({ error: 'Identifiants incorrects' }, { status: 401 });
  }

  const hash = await hashPassword(password);
  if (hash !== admin.password_hash) {
    return Response.json({ error: 'Identifiants incorrects' }, { status: 401 });
  }

  const token = await signToken(
    { adminId: admin.id, email: admin.email, exp: Date.now() + 1000 * 60 * 60 * 12 }, // 12h
    env.ADMIN_SESSION_SECRET
  );

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `henefen_admin=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`
    }
  });
}
