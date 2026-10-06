import { db, getConfig, setConfig } from '../db.js';
import { requerirRol } from '../auth.js';
import { hashClave, nuevoSalt, normalizarUsuario, verificarClave } from '../clave.js';

export function registrarRutasAdmin(app) {
  // ── Usuarios ──────────────────────────────────────────────
  app.get('/api/admin/usuarios', requerirRol('jefe'), (req, res) => {
    res.json({
      usuarios: db
        .prepare('SELECT id, nombre, usuario, rol, activo, debe_cambiar_clave FROM usuarios ORDER BY rol, nombre')
        .all(),
    });
  });

  app.post('/api/admin/usuarios', requerirRol('jefe'), (req, res) => {
    const { id, nombre, usuario, clave, pin, rol } = req.body || {};
    const nuevaClave = String(clave ?? pin ?? '').trim();
    if (!nombre || !['mozo', 'caja', 'jefe'].includes(rol))
      return res.status(400).json({ error: 'Falta el nombre o el rol' });

    const user = normalizarUsuario(usuario || nombre);
    const duplicado = db
      .prepare('SELECT id, nombre FROM usuarios WHERE usuario = ? AND id <> ?')
      .get(user, id ? Number(id) : -1);
    if (duplicado) return res.status(400).json({ error: `El usuario "${user}" ya lo usa ${duplicado.nombre}` });

    // Al editar, la contrasena solo se cambia si se envia una nueva
    const cambiaClave = nuevaClave !== '';
    if (!id && !cambiaClave) return res.status(400).json({ error: 'Falta la contrasena' });
    if (cambiaClave && nuevaClave.length < 4)
      return res.status(400).json({ error: 'La contrasena debe tener al menos 4 caracteres' });

    if (id) {
      if (cambiaClave) {
        const otros = db.prepare('SELECT id, pin_hash, pin_salt FROM usuarios WHERE activo = 1 AND id <> ?').all(id);
        if (otros.some((u) => verificarClave(nuevaClave, u.pin_hash, u.pin_salt)))
          return res.status(400).json({ error: 'Esa contrasena ya la usa otro usuario' });
        const salt = nuevoSalt();
        db.prepare(
          `UPDATE usuarios SET nombre = ?, usuario = ?, rol = ?, pin_hash = ?, pin_salt = ?,
            debe_cambiar_clave = 0 WHERE id = ?`
        ).run(nombre, user, rol, hashClave(nuevaClave, salt), salt, id);
        // Cambiar la contrasena cierra las sesiones abiertas de ese usuario
        db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(id);
      } else {
        db.prepare('UPDATE usuarios SET nombre = ?, usuario = ?, rol = ? WHERE id = ?')
          .run(nombre, user, rol, id);
      }
      return res.json({ ok: true, id });
    }

    const otros = db.prepare('SELECT id, pin_hash, pin_salt FROM usuarios WHERE activo = 1').all();
    if (otros.some((u) => verificarClave(nuevaClave, u.pin_hash, u.pin_salt)))
      return res.status(400).json({ error: 'Esa contrasena ya la usa otro usuario' });

    const salt = nuevoSalt();
    const nuevoId = db
      .prepare(
        `INSERT INTO usuarios (nombre, usuario, pin_hash, pin_salt, debe_cambiar_clave, rol)
         VALUES (?,?,?,?,1,?)`
      )
      .run(nombre, user, hashClave(nuevaClave, salt), salt, rol).lastInsertRowid;
    res.json({ ok: true, id: nuevoId, usuario: user });
  });

  app.delete('/api/admin/usuarios/:id', requerirRol('jefe'), (req, res) => {
    const id = Number(req.params.id);
    if (id === req.usuario.id) return res.status(400).json({ error: 'No puedes desactivar tu propio usuario' });
    db.prepare('UPDATE usuarios SET activo = 0 WHERE id = ?').run(id);
    db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(id);
    res.json({ ok: true });
  });

  app.post('/api/admin/usuarios/:id/activar', requerirRol('jefe'), (req, res) => {
    db.prepare('UPDATE usuarios SET activo = 1 WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // ── Productos ─────────────────────────────────────────────
  app.post('/api/admin/productos', requerirRol('jefe'), (req, res) => {
    const { id, categoria_id, nombre, precio, descripcion = '', activo = 1 } = req.body || {};
    if (!nombre || precio === undefined) return res.status(400).json({ error: 'Falta nombre o precio' });

    if (id) {
      db.prepare(
        'UPDATE productos SET categoria_id = ?, nombre = ?, precio = ?, descripcion = ?, activo = ?, revisar = 0 WHERE id = ?'
      ).run(categoria_id, nombre, Number(precio), descripcion, activo ? 1 : 0, id);
      return res.json({ ok: true, id });
    }
    const nuevoId = db
      .prepare(
        'INSERT INTO productos (categoria_id, nombre, precio, descripcion, activo, revisar) VALUES (?,?,?,?,?,?)'
      )
      .run(categoria_id, nombre, Number(precio), descripcion, activo ? 1 : 0, 0).lastInsertRowid;
    res.json({ ok: true, id: nuevoId });
  });

  app.delete('/api/admin/productos/:id', requerirRol('jefe'), (req, res) => {
    db.prepare('UPDATE productos SET activo = 0 WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get('/api/admin/productos/por-revisar', requerirRol('jefe'), (req, res) => {
    res.json({
      productos: db
        .prepare(
          `SELECT p.*, c.nombre AS categoria FROM productos p
           JOIN categorias c ON c.id = p.categoria_id
           WHERE p.revisar = 1 AND p.activo = 1 ORDER BY c.orden, p.orden`
        )
        .all(),
    });
  });

  // ── Categorías ────────────────────────────────────────────
  app.post('/api/admin/categorias', requerirRol('jefe'), (req, res) => {
    const { nombre, orden = 0 } = req.body || {};
    if (!nombre) return res.status(400).json({ error: 'Falta nombre' });
    const id = db.prepare('INSERT INTO categorias (nombre, orden) VALUES (?,?)').run(nombre, Number(orden)).lastInsertRowid;
    res.json({ ok: true, id });
  });

  // ── Mesas ─────────────────────────────────────────────────
  app.post('/api/admin/mesas', requerirRol('jefe'), (req, res) => {
    const { nombre, zona = 'Salon' } = req.body || {};
    if (!nombre) return res.status(400).json({ error: 'Falta nombre' });
    const id = db.prepare('INSERT INTO mesas (nombre, zona) VALUES (?,?)').run(nombre, zona).lastInsertRowid;
    res.json({ ok: true, id });
  });

  app.get('/api/admin/mesas', requerirRol('jefe'), (req, res) => {
    res.json({
      mesas: db
        .prepare(
          `SELECT m.*, (SELECT COUNT(*) FROM pedidos p WHERE p.mesa_id = m.id AND p.estado = 'abierto') AS pedidos_abiertos
           FROM mesas m ORDER BY m.id`
        )
        .all(),
    });
  });

  app.delete('/api/admin/mesas/:id', requerirRol('jefe'), (req, res) => {
    const id = Number(req.params.id);
    const abierto = db
      .prepare(`SELECT COUNT(*) c FROM pedidos WHERE mesa_id = ? AND estado = 'abierto'`)
      .get(id).c;
    if (abierto) return res.status(400).json({ error: 'La mesa tiene pedidos abiertos' });
    db.prepare('UPDATE mesas SET activa = 0 WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // ── Configuración ─────────────────────────────────────────
  app.get('/api/admin/config', (req, res) => {
    res.json({
      empresa: JSON.parse(getConfig('empresa', JSON.stringify({
        nombre: 'BROASTERIA', ruc: '', direccion: '', telefono: '', igv: 18,
      }))),
      igv: Number(getConfig('igv', 18)),
      sunat: {
        ruc: getConfig('sunat_ruc', ''),
        usuario_sol: getConfig('sunat_usuario', ''),
        clave_sol: getConfig('sunat_clave', ''),
        modo: getConfig('sunat_modo', 'interna'),
        endpoint_beta: getConfig('sunat_endpoint', 'https://api-beta.sunat.gob.pe'),
      },
      stock_automatico: getConfig('stock_automatico', '1') !== '0',
    });
  });

  app.post('/api/admin/config', requerirRol('jefe'), (req, res) => {
    const { empresa, igv, sunat, stock_automatico } = req.body || {};
    if (empresa) {
      const prev = JSON.parse(getConfig('empresa', '{}'));
      setConfig('empresa', JSON.stringify({ ...prev, ...empresa }));
    }
    if (igv !== undefined) setConfig('igv', Number(igv) || 0);
    if (stock_automatico !== undefined) setConfig('stock_automatico', stock_automatico ? '1' : '0');
    if (sunat) {
      if (sunat.ruc !== undefined) setConfig('sunat_ruc', sunat.ruc);
      if (sunat.usuario_sol !== undefined) setConfig('sunat_usuario', sunat.usuario_sol);
      if (sunat.clave_sol !== undefined) setConfig('sunat_clave', sunat.clave_sol);
      if (sunat.modo !== undefined) setConfig('sunat_modo', sunat.modo);
      if (sunat.endpoint_beta !== undefined) setConfig('sunat_endpoint', sunat.endpoint_beta);
    }
    res.json({ ok: true });
  });

  // Probar conexión SUNAT
  app.post('/api/admin/sunat/probar', requerirRol('jefe'), (req, res) => {
    const ruc = getConfig('sunat_ruc', '');
    const modo = getConfig('sunat_modo', 'interna');
    if (modo === 'interna')
      return res.json({
        ok: true,
        modo,
        mensaje: 'Emision interna activa. Para boleta electronica configura RUC y Clave SOL.',
      });
    if (!ruc) return res.status(400).json({ ok: false, mensaje: 'Falta configurar el RUC' });
    res.json({
      ok: true,
      modo,
      mensaje: `Credenciales presentes para RUC ${ruc}. Endpoint SUNAT pendiente de conectar.`,
    });
  });
}
