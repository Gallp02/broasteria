import { db, transaction } from '../db.js';
import { requerirRol } from '../auth.js';
import { devolverStock } from '../stock.js';

export function registrarRutasCaja(app) {
  // Lista de pedidos para cobrar
  app.get('/api/caja/pendientes', (req, res) => {
    const pedidos = db
      .prepare(
        `SELECT p.*, m.nombre AS mesa_nombre, u.nombre AS mesero
         FROM pedidos p
         LEFT JOIN mesas m ON m.id = p.mesa_id
         LEFT JOIN usuarios u ON u.id = p.mesero_id
         WHERE p.estado = 'abierto'
         ORDER BY p.creado`
      )
      .all();
    res.json({ pedidos });
  });

  // Boleta emitida hoy
  app.get('/api/caja/boletas', requerirRol('caja', 'jefe'), (req, res) => {
    const desde = req.query.desde || null;
    const hasta = req.query.hasta || null;
    const tipo = req.query.tipo || null;

    let sql = `SELECT * FROM boletas WHERE 1 = 1`;
    const args = [];
    if (desde) { sql += ` AND date(creado) >= date(?)`; args.push(desde); }
    if (hasta) { sql += ` AND date(creado) <= date(?)`; args.push(hasta); }
    if (tipo) { sql += ` AND tipo = ?`; args.push(tipo); }
    sql += ` ORDER BY id DESC LIMIT 500`;

    const boletas = db.prepare(sql).all(...args);
    const totales = db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN estado = 'emitida' THEN total END), 0) AS ingresos,
           COUNT(*) AS cantidad,
           COALESCE(SUM(CASE WHEN estado='emitida' AND metodo_pago='efectivo' THEN total END),0) AS efectivo,
           COALESCE(SUM(CASE WHEN estado='emitida' AND metodo_pago='tarjeta' THEN total END),0) AS tarjeta,
           COALESCE(SUM(CASE WHEN estado='emitida' AND metodo_pago='yape' THEN total END),0) AS yape,
           COALESCE(SUM(CASE WHEN estado='emitida' AND metodo_pago='transferencia' THEN total END),0) AS transferencia
         FROM boletas WHERE 1 = 1`
      )
      .get();
    res.json({ boletas, totales });
  });

  // Anular boleta (devuelve insumos)
  app.post('/api/caja/boletas/:id/anular', requerirRol('jefe'), (req, res) => {
    const id = Number(req.params.id);
    const b = db.prepare(`SELECT * FROM boletas WHERE id = ? AND estado = 'emitida'`).get(id);
    if (!b) return res.status(400).json({ error: 'Boleta no encontrada o ya anulada' });

    transaction(() => {
      db.prepare(`UPDATE boletas SET estado = 'anulada' WHERE id = ?`).run(id);
      if (!b.pedido_id) return;

      const items = db
        .prepare('SELECT producto_id, cantidad FROM pedido_items WHERE pedido_id = ?')
        .all(b.pedido_id);
      const ped = db.prepare('SELECT descuento_stock FROM pedidos WHERE id = ?').get(b.pedido_id);
      // Solo devuelve si el pedido desconto stock al abrirse.
      if (!ped || ped.descuento_stock !== 0) {
        devolverStock(items, req.usuario.id, `Anulacion ${b.numero}`);
      }
      db.prepare(`UPDATE pedidos SET estado = 'anulado' WHERE id = ?`).run(b.pedido_id);
    })();

    res.json({ ok: true });
  });

  // Ver boleta printable
  app.get('/api/caja/boletas/:id', (req, res) => {
    const b = db.prepare('SELECT * FROM boletas WHERE id = ?').get(Number(req.params.id));
    if (!b) return res.status(404).json({ error: 'Boleta no encontrada' });
    const items = b.pedido_id
      ? db
          .prepare(
            `SELECT i.cantidad, i.precio, i.nota, p.nombre
             FROM pedido_items i JOIN productos p ON p.id = i.producto_id
             WHERE i.pedido_id = ? ORDER BY i.id`
          )
          .all(b.pedido_id)
      : [];
    const empresa = db.prepare(`SELECT value FROM config WHERE key = 'empresa'`).get();
    res.json({
      boleta: b,
      items,
      empresa: empresa
        ? JSON.parse(empresa.value)
        : { nombre: 'BROASTERIA', ruc: '', direccion: '', telefono: '' },
    });
  });
}
