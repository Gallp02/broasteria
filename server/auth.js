import { db } from './db.js';

export function auth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return next();
  const row = db
    .prepare(
      `SELECT u.id, u.nombre, u.rol, u.activo, u.usuario, u.debe_cambiar_clave, s.token
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token = ?`
    )
    .get(token);
  if (row && row.activo) {
    req.usuario = {
    id: row.id,
    nombre: row.nombre,
    rol: row.rol,
    usuario: row.usuario,
    debe_cambiar_clave: !!row.debe_cambiar_clave,
  };
    req.token = row.token;
  }
  next();
}

export function requerirAuth(req, res, next) {
  if (!req.usuario) return res.status(401).json({ error: 'Sin sesion, inicia con tu PIN' });
  next();
}

export function requerirRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ error: 'Sin sesion' });
    if (!roles.includes(req.usuario.rol))
      return res.status(403).json({ error: 'No tienes permiso para esta accion' });
    next();
  };
}

export function init() {
  // Limpia sesiones viejas (> 12 horas) al arrancar
  db.prepare(`DELETE FROM sesiones WHERE creado < datetime('now','-12 hours')`).run();
}
