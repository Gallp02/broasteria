import { db, transaction } from '../db.js';
import { requerirRol } from '../auth.js';
import { productosAgotados, costoProducto } from '../stock.js';

export function registrarRutasInventario(app) {
  // Insumos con su stock y estado
  app.get('/api/inventario', (req, res) => {
    const insumos = db
      .prepare(
        `SELECT i.*,
          CASE WHEN i.stock <= 0 THEN 'agotado'
               WHEN i.stock <= i.stock_min THEN 'bajo'
               ELSE 'ok' END AS estado
         FROM insumos i WHERE i.activo = 1
         ORDER BY CASE WHEN i.stock <= i.stock_min THEN 0 ELSE 1 END, i.nombre`
      )
      .all();

    const stockValor = db
      .prepare(`SELECT COALESCE(SUM(stock * costo),0) v FROM insumos WHERE activo = 1`)
      .get().v;
    const stockMinValor = db
      .prepare(`SELECT COALESCE(SUM(stock_min * costo),0) v FROM insumos WHERE activo = 1`)
      .get().v;

    res.json({ insumos, valorInventario: round2(stockValor), valorEnRiesgo: round2(stockMinValor) });
  });

  // Crear / editar insumo
  app.post('/api/inventario/insumos', requerirRol('jefe'), (req, res) => {
    const { id, nombre, unidad, stock, stock_min, costo } = req.body || {};
    if (!nombre || !unidad) return res.status(400).json({ error: 'Nombre y unidad son obligatorios' });

    const unidadValida = ['kg', 'g', 'Lt', 'ml', 'und', 'porcion'].includes(unidad);
    if (!unidadValida) return res.status(400).json({ error: 'Unidad no valida' });

    if (id) {
      db.prepare(
        `UPDATE insumos SET nombre = ?, unidad = ?, stock_min = ?, costo = ? WHERE id = ?`
      ).run(nombre, unidad, Number(stock_min) || 0, Number(costo) || 0, id);
      if (stock !== undefined && stock !== null && stock !== '') {
        const dif = Number(stock) - db.prepare('SELECT stock FROM insumos WHERE id = ?').get(id).stock;
        db.prepare('UPDATE insumos SET stock = ? WHERE id = ?').run(Number(stock), id);
        if (Math.abs(dif) > 0.0001)
          db.prepare(
            `INSERT INTO movimientos_stock (insumo_id, tipo, cantidad, motivo, ref, usuario_id)
             VALUES (?, 'ajuste', ?, 'Ajuste manual', 'Inventario', ?)`
          ).run(id, dif, req.usuario.id);
      }
      return res.json({ ok: true, id });
    }

    const st = Number(stock) || 0;
    const nuevoId = db
      .prepare('INSERT INTO insumos (nombre, unidad, stock, stock_min, costo) VALUES (?,?,?,?,?)')
      .run(nombre, unidad, st, Number(stock_min) || 0, Number(costo) || 0).lastInsertRowid;
    if (st > 0)
      db.prepare(
        `INSERT INTO movimientos_stock (insumo_id, tipo, cantidad, motivo, ref, usuario_id)
         VALUES (?, 'entrada', ?, 'Carga inicial', 'Alta insumo', ?)`
      ).run(nuevoId, st, req.usuario.id);
    res.json({ ok: true, id: nuevoId });
  });

  // Entrada / merma / ajuste rápido
  app.post('/api/inventario/movimiento', requerirRol('jefe', 'caja'), (req, res) => {
    const { insumo_id, tipo, cantidad, motivo } = req.body || {};
    if (!['entrada', 'salida', 'ajuste', 'merma'].includes(tipo))
      return res.status(400).json({ error: 'Tipo no valido' });
    const cant = Number(cantidad);
    if (!cant || cant <= 0) return res.status(400).json({ error: 'Cantidad debe ser mayor a 0' });

    const ins = db.prepare('SELECT * FROM insumos WHERE id = ?').get(insumo_id);
    if (!ins) return res.status(404).json({ error: 'Insumo no encontrado' });
    if ((tipo === 'salida' || tipo === 'merma') && ins.stock < cant)
      return res.status(400).json({ error: `Stock insuficiente (disponible: ${ins.stock} ${ins.unidad})` });

    transaction(() => {
      const signo = tipo === 'entrada' ? 1 : -1;
      db.prepare('UPDATE insumos SET stock = stock + ? WHERE id = ?').run(signo * cant, insumo_id);
      db.prepare(
        `INSERT INTO movimientos_stock (insumo_id, tipo, cantidad, motivo, ref, usuario_id)
         VALUES (?, ?, ?, ?, 'Manual', ?)`
      ).run(insumo_id, tipo, cant, motivo || (tipo === 'merma' ? 'Merma' : tipo === 'entrada' ? 'Compra' : 'Salida'), req.usuario.id);
    })();

    res.json({ ok: true, stock: db.prepare('SELECT stock FROM insumos WHERE id = ?').get(insumo_id).stock });
  });

  // Historial de movimientos
  app.get('/api/inventario/movimientos', (req, res) => {
    const desde = req.query.desde || null;
    const insumoId = req.query.insumo_id || null;
    let sql = `SELECT m.*, i.nombre AS insumo, i.unidad, u.nombre AS usuario
               FROM movimientos_stock m
               JOIN insumos i ON i.id = m.insumo_id
               LEFT JOIN usuarios u ON u.id = m.usuario_id
               WHERE 1 = 1`;
    const args = [];
    if (desde) { sql += ` AND date(m.creado) >= date(?)`; args.push(desde); }
    if (insumoId) { sql += ` AND m.insumo_id = ?`; args.push(insumoId); }
    sql += ` ORDER BY m.id DESC LIMIT 300`;
    res.json({ movimientos: db.prepare(sql).all(...args) });
  });

  // Productos y su receta
  app.get('/api/inventario/recetas', (req, res) => {
    const productos = db
      .prepare(
        `SELECT p.*, c.nombre AS categoria
         FROM productos p JOIN categorias c ON c.id = p.categoria_id
         WHERE p.activo = 1 ORDER BY c.orden, p.orden, p.nombre`
      )
      .all();

    const recs = db
      .prepare(
        `SELECT r.producto_id, r.insumo_id, r.cantidad, i.nombre AS insumo, i.unidad, i.stock
         FROM recetas r JOIN insumos i ON i.id = r.insumo_id
         ORDER BY i.nombre`
      )
      .all();

    const porProducto = new Map();
    for (const r of recs) {
      if (!porProducto.has(r.producto_id)) porProducto.set(r.producto_id, []);
      porProducto.get(r.producto_id).push(r);
    }

    const resultado = productos.map((p) => {
      const receta = porProducto.get(p.id) || [];
      const costo = receta.reduce((s, r) => s + r.cantidad * costoInsumo(r.insumo_id), 0);
      const disponibles = receta.length
        ? Math.min(...receta.map((r) => (r.cantidad > 0 ? r.stock / r.cantidad : Infinity)))
        : Infinity;
      return {
        ...p,
        receta,
        costo: round2(costo),
        margen: round2(p.precio - costo),
        margen_pct: costo > 0 ? round2(((p.precio - costo) / p.precio) * 100) : null,
        disponibles: Number.isFinite(disponibles) ? Math.floor(disponibles) : null,
      };
    });

    res.json({ productos: resultado, agotados: productosAgotados() });
  });

  // Guardar receta
  app.put('/api/inventario/recetas/:productoId', requerirRol('jefe'), (req, res) => {
    const pid = Number(req.params.productoId);
    const items = req.body?.items || [];
    transaction(() => {
      db.prepare('DELETE FROM recetas WHERE producto_id = ?').run(pid);
      const ins = db.prepare(
        'INSERT OR REPLACE INTO recetas (producto_id, insumo_id, cantidad) VALUES (?,?,?)'
      );
      for (const it of items) {
        const c = Number(it.cantidad);
        if (!c || c <= 0) continue;
        ins.run(pid, it.insumo_id, c);
      }
      // El jefe decide si este producto descuenta stock al venderse.
      if (req.body?.descuenta_stock !== undefined)
        db.prepare('UPDATE productos SET descuenta_stock = ? WHERE id = ?')
          .run(req.body.descuenta_stock ? 1 : 0, pid);
    })();
    res.json({ ok: true });
  });

  // Sugerencia: cuanto comprar para cubrir X dias
  app.get('/api/inventario/sugerencia', requerirRol('jefe'), (req, res) => {
    const dias = Number(req.query.dias || 7);
    const consumo = db
      .prepare(`SELECT id, nombre, unidad, stock, stock_min, costo FROM insumos WHERE activo = 1`)
      .all();

    const uso = db
      .prepare(
        `SELECT r.insumo_id, COALESCE(SUM(pi.cantidad * r.cantidad), 0) AS usado
         FROM pedido_items pi
         JOIN pedidos p ON p.id = pi.pedido_id
         JOIN recetas r ON r.producto_id = pi.producto_id
         WHERE p.estado = 'cerrado'
           AND date(p.cerrado) >= date('now','localtime', ?)
         GROUP BY r.insumo_id`
      )
      .all(`-${dias} days`);

    const mapa = new Map(uso.map((u) => [u.insumo_id, u.usado]));
    const sugerencia = consumo
      .map((i) => {
        const diario = (mapa.get(i.id) || 0) / dias;
        const proyectado = diario * dias;
        const faltante = proyectado - i.stock;
        return {
          ...i,
          consumo_diario: round2(diario),
          proyectado: round2(proyectado),
          faltante: round2(faltante),
          costo_compra: round2(Math.max(0, faltante) * i.costo),
        };
      })
      .filter((i) => i.faltante > 0)
      .sort((a, b) => b.costo_compra - a.costo_compra);

    res.json({ dias, sugerencia, costo_total: round2(sugerencia.reduce((s, i) => s + i.costo_compra, 0)) });
  });

  // Registro de compras
  app.post('/api/inventario/compras', requerirRol('jefe'), (req, res) => {
    const { proveedor = '', documento = '', items = [] } = req.body || {};
    if (!items.length) return res.status(400).json({ error: 'Compra sin items' });

    const id = transaction(() => {
      const total = items.reduce((s, i) => s + Number(i.cantidad) * Number(i.costo), 0);
      const compraId = db
        .prepare('INSERT INTO compras (proveedor, documento, total, usuario_id) VALUES (?,?,?,?)')
        .run(proveedor, documento, total, req.usuario.id).lastInsertRowid;

      const insItem = db.prepare('INSERT INTO compras_items (compra_id, insumo_id, cantidad, costo) VALUES (?,?,?,?)');
      const upd = db.prepare('UPDATE insumos SET stock = stock + ? WHERE id = ?');
      const mov = db.prepare(
        `INSERT INTO movimientos_stock (insumo_id, tipo, cantidad, motivo, ref, usuario_id)
         VALUES (?, 'entrada', ?, 'Compra', ?, ?)`
      );
      for (const it of items) {
        const c = Number(it.cantidad);
        if (!c || c <= 0) continue;
        insItem.run(compraId, it.insumo_id, c, Number(it.costo) || 0);
        upd.run(c, it.insumo_id);
        mov.run(it.insumo_id, c, proveedor ? `Compra: ${proveedor}` : 'Compra', `Compra #${compraId}`, req.usuario.id);
      }
      return compraId;
    })();

    res.json({ ok: true, id });
  });

  app.get('/api/inventario/compras', (req, res) => {
    const compras = db
      .prepare('SELECT * FROM compras ORDER BY id DESC LIMIT 200')
      .all();
    const items = db
      .prepare(
        `SELECT ci.*, i.nombre AS insumo, i.unidad FROM compras_items ci
         JOIN insumos i ON i.id = ci.insumo_id
         ORDER BY ci.compra_id DESC, ci.id`
      )
      .all();
    res.json({ compras, items });
  });
}

const cacheCosto = new Map();
function costoInsumo(id) {
  if (cacheCosto.has(id)) return cacheCosto.get(id);
  const r = db.prepare('SELECT costo FROM insumos WHERE id = ?').get(id);
  const v = r ? r.costo : 0;
  cacheCosto.set(id, v);
  return v;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
