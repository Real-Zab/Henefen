import { verifyToken, getCookie } from '../../_auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const token = getCookie(request, 'henefen_admin');
  const payload = await verifyToken(token, env.ADMIN_SESSION_SECRET);
  if (!payload) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  return Response.json({ authenticated: true, email: payload.email });
}
