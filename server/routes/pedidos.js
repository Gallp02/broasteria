import { db, transaction, stockAutomaticoActivo } from '../db.js';
import { requerirAuth, requerirRol } from '../auth.js';
import { descontarStock, devolverStock } from '../stock.js';

export function registrarRutasPedidos(app) {
  // Catálogo para el POS
  app.get('/api/catalogo', (req, res) => {
    const categorias = db.prepare('SELECT * FROM categorias ORDER BY orden, nombre').all();
    const productos = db
      .prepare('SELECT * FROM productos WHERE activo = 1 ORDER BY categoria_id, orden, nombre')
      .all();
    res.json({ categorias, productos });
  });

  app.get('/api/mesas', (req, res) => {
    const mesas = db.prepare('SELECT * FROM mesas WHERE activa = 1 ORDER BY id').all();
    const abiertos = db
      .prepare(
        `SELECT p.*, m.nombre AS mesa_nombre, m.zona, u.nombre AS mesero
         FROM pedidos p
         JOIN mesas m ON m.id = p.mesa_id
         LEFT JOIN usuarios u ON u.id = p.mesero_id
         WHERE p.estado = 'abierto'`
      )
      .all();
    res.json({ mesas, abiertos });
  });
  // Abrir pedido
  app.post('/api/pedidos', requerirAuth, (req, res) => {
    const { mesa_id, items = [], nota } = req.body || {};
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items debe ser una lista' });
    if (!mesa_id) return res.status(400).json({ error: 'Elige la mesa antes de tomar el pedido' });

    const cliente = db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesa_id);
    if (!cliente) return res.status(404).json({ error: 'Mesa no encontrada' });

    const esDelivery = cliente.zona === 'Delivery' ? 1 : 0;
    const cNombre = String(req.body?.cliente_nombre ?? '').trim();
    const cTel = String(req.body?.cliente_telefono ?? '').trim();
    const cDir = String(req.body?.cliente_direccion ?? '').trim();
    const envio = Math.max(0, Number(req.body?.envio) || 0);

    if (esDelivery) {
      if (!cNombre) return res.status(400).json({ error: 'Delivery necesita el nombre del cliente' });
      if (cTel.length < 6) return res.status(400).json({ error: 'Delivery necesita un telefono de contacto' });
      if (!cDir) return res.status(400).json({ error: 'Delivery necesita la direccion de entrega' });
    }

    const existe = db.prepare(`SELECT id FROM pedidos WHERE mesa_id = ? AND estado = 'abierto'`).get(mesa_id);
    if (existe)
      return res.status(409).json({ error: 'Esa mesa ya tiene un pedido abierto', pedido_id: existe.id });

    const getProd = db.prepare('SELECT * FROM productos WHERE id = ? AND activo = 1');
    const insItem = db.prepare(
      'INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio, nota) VALUES (?,?,?,?,?)'
    );
    const insPedido = db.prepare(
      `INSERT INTO pedidos (mesa_id, es_delivery, cliente_nombre, cliente_telefono,
         cliente_direccion, envio, mesero_id, total, descuento_stock)
       VALUES (?,?,?,?,?,?,?,0,?)`
    );

    // La configuracion del jefe queda fijada al abrir el pedido: si luego la
    // apaga, anular este pedido devolvera exactamente lo que se desconto.
    const descuentaStock = stockAutomaticoActivo() ? 1 : 0;

    let pid = 0;
    const alertas = transaction(() => {
      pid = insPedido.run(
        mesa_id, esDelivery, cNombre, cTel, cDir, envio, req.usuario.id, descuentaStock
      ).lastInsertRowid;
      let total = 0;
      for (const it of items) {
        const p = getProd.get(it.producto_id);
        if (!p) throw new Error(`Producto ${it.producto_id} no existe`);
        const cant = Number(it.cantidad) || 1;
        if (cant <= 0) throw new Error('Cantidad invalida');
        insItem.run(pid, p.id, cant, p.precio, it.nota ?? nota ?? '');
        total += p.precio * cant;
      }
      db.prepare('UPDATE pedidos SET total = ? WHERE id = ?').run(total + envio, pid);
      if (!descuentaStock) return [];
      return descontarStock(items, req.usuario.id, `Pedido #${pid}`);
    })();

    res.json({ ...getPedido(pid), alertas });
  });

  // Estado del reparto (delivery): pendiente -> en camino -> entregado
  app.post('/api/pedidos/:id/envio', requerirAuth, (req, res) => {
    const { estado_envio } = req.body || {};
    if (!['pendiente', 'en_camino', 'entregado'].includes(estado_envio))
      return res.status(400).json({ error: 'Estado de reparto invalido' });
    const r = db
      .prepare('UPDATE pedidos SET estado_envio = ? WHERE id = ? AND es_delivery = 1')
      .run(estado_envio, Number(req.params.id));
    if (!r.changes) return res.status(400).json({ error: 'Ese pedido no es de delivery' });
    res.json(getPedido(Number(req.params.id)));
  });

  // Editar datos de delivery
  app.post('/api/pedidos/:id/delivery', requerirAuth, (req, res) => {
    const { cliente_nombre, cliente_telefono, cliente_direccion, envio } = req.body || {};
    const ped = db.prepare(`SELECT * FROM pedidos WHERE id = ? AND es_delivery = 1`).get(
      Number(req.params.id)
    );
    if (!ped) return res.status(400).json({ error: 'Ese pedido no es de delivery' });

    const nombre = String(cliente_nombre ?? ped.cliente_nombre).trim();
    const tel = String(cliente_telefono ?? ped.cliente_telefono).trim();
    const dir = String(cliente_direccion ?? ped.cliente_direccion).trim();
    const nuevoEnvio = envio === undefined ? ped.envio : Math.max(0, Number(envio) || 0);

    if (!nombre) return res.status(400).json({ error: 'Falta el nombre del cliente' });
    if (tel.length < 6) return res.status(400).json({ error: 'Telefono demasiado corto' });
    if (!dir) return res.status(400).json({ error: 'Falta la direccion' });

    const nuevoTotal = round2(ped.total - ped.envio + nuevoEnvio);
    db.prepare(
      `UPDATE pedidos SET cliente_nombre = ?, cliente_telefono = ?, cliente_direccion = ?,
        envio = ?, total = ? WHERE id = ?`
    ).run(nombre, tel, dir, nuevoEnvio, nuevoTotal, ped.id);

    res.json(getPedido(ped.id));
  });

  app.get('/api/pedidos/:id', (req, res) => {
    const p = getPedido(Number(req.params.id));
    if (!p) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(p);
  });

  // Agregar / quitar ítems
  app.post('/api/pedidos/:id/items', requerirAuth, (req, res) => {
    const pid = Number(req.params.id);
    const ped = db.prepare(`SELECT * FROM pedidos WHERE id = ? AND estado = 'abierto'`).get(pid);
    if (!ped) return res.status(400).json({ error: 'Pedido no abierto' });

    const { producto_id, cantidad = 1, nota = '', accion } = req.body || {};
    const getProd = db.prepare('SELECT * FROM productos WHERE id = ? AND activo = 1');
    const p = getProd.get(producto_id);
    if (!p) return res.status(400).json({ error: 'Producto no encontrado' });

    try {
      transaction(() => {
        if (accion === 'quitar') {
          const item = db
            .prepare(
              `SELECT * FROM pedido_items WHERE pedido_id = ? AND producto_id = ?
               ORDER BY id DESC LIMIT 1`
            )
            .get(pid, producto_id);
          if (!item) return;
          const cant = Number(cantidad) || 1;
          const restante = item.cantidad - cant;
          if (restante <= 0) {
            db.prepare('DELETE FROM pedido_items WHERE id = ?').run(item.id);
          } else {
            db.prepare('UPDATE pedido_items SET cantidad = ? WHERE id = ?').run(restante, item.id);
          }
        } else {
          // Si el mismo plato (misma nota) ya esta en el pedido, se incrementa
          // la cantidad en vez de crear otra linea: la boleta queda compacta.
          const cant = Number(cantidad) || 1;
          const repetido = db
            .prepare(
              `SELECT id, cantidad FROM pedido_items
               WHERE pedido_id = ? AND producto_id = ? AND nota = ?
               LIMIT 1`
            )
            .get(pid, producto_id, nota);

          if (repetido) {
            db.prepare('UPDATE pedido_items SET cantidad = cantidad + ? WHERE id = ?').run(
              cant,
              repetido.id
            );
          } else {
            db.prepare(
              'INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio, nota) VALUES (?,?,?,?,?)'
            ).run(pid, producto_id, cant, p.precio, nota);
          }
        }
        recalcular(pid);
        // Si el jefe apago el descuento, no se toca nada (ni al quitar).
        if (ped.descuento_stock !== 0) {
          descontarStock(
            [{ producto_id, cantidad: accion === 'quitar' ? -(Number(cantidad) || 1) : Number(cantidad) || 1 }],
            req.usuario.id,
            `Pedido #${pid}`
          );
        }
      })();
      res.json(getPedido(pid));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/pedidos/:id/items/:itemId', requerirAuth, (req, res) => {
    const pid = Number(req.params.id);
    const item = db
      .prepare('SELECT * FROM pedido_items WHERE id = ? AND pedido_id = ?')
      .get(Number(req.params.itemId), pid);
    if (!item) return res.status(404).json({ error: 'Item no encontrado' });
    db.prepare('DELETE FROM pedido_items WHERE id = ?').run(item.id);
    recalcular(pid);
    db.prepare(
      `INSERT INTO movimientos_stock (insumo_id, tipo, cantidad, motivo, ref, usuario_id)
       VALUES (?, 'entrada', 0, 'Item eliminado', ?, ?)`
    );
    res.json(getPedido(pid));
  });

  // Nota de cocina
  app.post('/api/pedidos/:id/nota', requerirAuth, (req, res) => {
    const { nota } = req.body || {};
    const ped = db.prepare(`SELECT * FROM pedidos WHERE id = ? AND estado = 'abierto'`).get(
      Number(req.params.id)
    );
    if (!ped) return res.status(400).json({ error: 'Pedido no abierto' });
    const ultimo = db
      .prepare('SELECT id FROM pedido_items WHERE pedido_id = ? ORDER BY id DESC LIMIT 1')
      .get(ped.id);
    if (!ultimo) return res.status(400).json({ error: 'Pedido sin items' });
    db.prepare('UPDATE pedido_items SET nota = ? WHERE id = ?').run(nota ?? '', ultimo.id);
    res.json(getPedido(ped.id));
  });

  // Mozo pide cuenta / caja cierra
  app.post('/api/pedidos/:id/cerrar', requerirRol('mozo', 'caja', 'jefe'), (req, res) => {
    const pid = Number(req.params.id);
    const ped = db.prepare(`SELECT * FROM pedidos WHERE id = ? AND estado = 'abierto'`).get(pid);
    if (!ped) return res.status(400).json({ error: 'Pedido no abierto o ya cerrado' });

    const descuento = Math.max(0, Number(req.body?.descuento) || 0);
    const tipo = req.body?.tipo === 'factura' ? 'factura' : 'boleta';
    const clienteDoc = req.body?.cliente_doc ?? '';
    const clienteNombre = req.body?.cliente_nombre ?? '';
    const metodo = req.body?.metodo_pago ?? 'efectivo';
    const igvPct = Number(getIgv());

    const resultado = transaction(() => {
      const subtotal = ped.total;
      const base = Math.max(0, subtotal - descuento);
      const igv = round2(base * (igvPct / 100));
      const total = round2(base + igv);

      const numero = siguienteNumero(tipo);
      const b = db
        .prepare(
          `INSERT INTO boletas (numero, tipo, pedido_id, cliente_doc, cliente_nombre,
             subtotal, descuento, igv, total, metodo_pago)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
        )
        .run(numero, tipo, pid, clienteDoc, clienteNombre, subtotal, descuento, igv, total, metodo)
        .lastInsertRowid;

      db.prepare(
        `UPDATE pedidos SET estado = 'cerrado', cajero_id = ?, descuento = ?, total_pagar = ?, cerrado = datetime('now','localtime')
         WHERE id = ?`
      ).run(req.usuario.id, descuento, total, pid);

      return { boleta_id: b, numero, total, igv };
    })();

    res.json({ ...resultado, pedido: getPedido(pid) });
  });

  // Anular pedido (devuelve insumos)
  app.post('/api/pedidos/:id/anular', requerirRol('jefe'), (req, res) => {
    const pid = Number(req.params.id);
    const ped = db.prepare(`SELECT * FROM pedidos WHERE id = ? AND estado != 'anulado'`).get(pid);
    if (!ped) return res.status(404).json({ error: 'Pedido no encontrado' });

    transaction(() => {
      const items = db
        .prepare('SELECT producto_id, cantidad FROM pedido_items WHERE pedido_id = ?')
        .all(pid);
      // Solo devuelve si este pedido desconto stock al abrirse.
      if (ped.descuento_stock !== 0) {
        devolverStock(items, req.usuario.id, `Anulacion pedido #${pid}`);
      }
      db.prepare(`UPDATE pedidos SET estado = 'anulado' WHERE id = ?`).run(pid);
      db.prepare(`UPDATE boletas SET estado = 'anulada' WHERE pedido_id = ?`).run(pid);
    })();

    res.json(getPedido(pid));
  });

  // Ticket de cocina: pedidos abiertos del día
  app.get('/api/cocina', (req, res) => {
    const pedidos = db
      .prepare(
        `SELECT p.id, p.creado, p.es_delivery, p.cliente_nombre, p.cliente_telefono,
                p.cliente_direccion, p.envio, p.estado_envio,
                m.nombre AS mesa, u.nombre AS mesero
         FROM pedidos p
         LEFT JOIN mesas m ON m.id = p.mesa_id
         LEFT JOIN usuarios u ON u.id = p.mesero_id
         WHERE p.estado = 'abierto' AND date(p.creado) = date('now','localtime')
         ORDER BY p.creado`
      )
      .all();
    const items = db
      .prepare(
        `SELECT i.*, pr.nombre AS producto, c.nombre AS categoria
         FROM pedido_items i
         JOIN productos pr ON pr.id = i.producto_id
         JOIN categorias c ON c.id = pr.categoria_id
         JOIN pedidos p ON p.id = i.pedido_id
         WHERE p.estado = 'abierto' AND date(p.creado) = date('now','localtime')
         ORDER BY i.id`
      )
      .all();
    res.json({ pedidos, items });
  });
}

function recalcular(pid) {
  const t = db
    .prepare('SELECT COALESCE(SUM(cantidad * precio),0) t FROM pedido_items WHERE pedido_id = ?')
    .get(pid);
  // El costo de envio se suma al total de los platos
  const envio = db.prepare('SELECT envio FROM pedidos WHERE id = ?').get(pid).envio || 0;
  db.prepare('UPDATE pedidos SET total = ? WHERE id = ?').run(t.t + envio, pid);
}

export function getPedido(id) {
  const p = db
    .prepare(
      `SELECT p.*, m.nombre AS mesa_nombre, m.zona, u.nombre AS mesero, c.nombre AS cajero
       FROM pedidos p
       LEFT JOIN mesas m ON m.id = p.mesa_id
       LEFT JOIN usuarios u ON u.id = p.mesero_id
       LEFT JOIN usuarios c ON c.id = p.cajero_id
       WHERE p.id = ?`
    )
    .get(id);
  if (!p) return null;
  const items = db
    .prepare(
      `SELECT i.*, pr.nombre AS producto, pr.categoria_id
       FROM pedido_items i JOIN productos pr ON pr.id = i.producto_id
       WHERE i.pedido_id = ? ORDER BY i.id`
    )
    .all(id);
  const boleta = db.prepare('SELECT * FROM boletas WHERE pedido_id = ?').get(id) || null;
  return { ...p, items, boleta };
}

function getIgv() {
  const r = db.prepare(`SELECT value FROM config WHERE key = 'igv'`).get();
  return r ? Number(r.value) : 18;
}

function siguienteNumero(tipo) {
  const serie = tipo === 'factura' ? 'F001' : 'B001';
  const row = db
    .prepare(`SELECT numero FROM boletas WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1`)
    .get(serie + '%');
  const n = row ? Number(row.numero.slice(serie.length)) + 1 : 1;
  return `${serie}${String(n).padStart(6, '0')}`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
