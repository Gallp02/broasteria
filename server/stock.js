import { db } from './db.js';

/**
 * Mueve insumos segun la receta de los productos indicados.
 * `cantidad` negativa devuelve al stock, asi que sirve para quitar items
 * y para anular pedidos. Todo dentro de una transaccion: o todo, o nada.
 *
 * Respeta dos configuraciones del jefe:
 *  - el switch global `stock_automatico` (lo decide quien llama, aqui no)
 *  - el switch por producto `productos.descuenta_stock` (lo aplicamos aqui)
 */
export function descontarStock(items, usuarioId, ref, motivo = 'Venta') {
  return mover(items, usuarioId, ref, motivo);
}

/** Devuelve al stock lo que se desconto (anulaciones). */
export function devolverStock(items, usuarioId, ref, motivo = 'Anulacion') {
  return mover(
    items.map((i) => ({ ...i, cantidad: -(Number(i.cantidad) || 0) })),
    usuarioId,
    ref,
    motivo
  );
}

// Solo descuenta productos que el jefe no desactivo.
const recetaDelProducto = db.prepare(
  `SELECT r.insumo_id, r.cantidad
   FROM recetas r JOIN productos p ON p.id = r.producto_id
   WHERE r.producto_id = ? AND p.descuenta_stock = 1`
);

function mover(items, usuarioId, ref, motivo) {
  const updStock = db.prepare('UPDATE insumos SET stock = stock - ? WHERE id = ?');
  const insMov = db.prepare(
    `INSERT INTO movimientos_stock (insumo_id, tipo, cantidad, motivo, ref, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const getStock = db.prepare('SELECT nombre, unidad, stock, stock_min FROM insumos WHERE id = ?');

  const alertas = [];
  const stockCache = new Map();

  for (const { producto_id, cantidad } of items) {
    const filas = recetaDelProducto.all(producto_id);
    for (const f of filas) {
      const consumo = f.cantidad * (Number(cantidad) || 0);
      if (consumo === 0) continue;

      if (!stockCache.has(f.insumo_id)) {
        const info = getStock.get(f.insumo_id);
        stockCache.set(f.insumo_id, { ...info, restante: info.stock });
      }
      const st = stockCache.get(f.insumo_id);
      st.restante -= consumo;
      updStock.run(consumo, f.insumo_id);
      // El registro siempre guarda cantidad positiva y marca la direccion.
      insMov.run(
        f.insumo_id,
        consumo > 0 ? 'salida' : 'entrada',
        Math.abs(consumo),
        motivo,
        ref,
        usuarioId
      );
    }
  }

  for (const st of stockCache.values()) {
    if (st.restante <= st.stock_min) {
      alertas.push({
        insumo_id: st.id,
        nombre: st.nombre,
        unidad: st.unidad,
        stock: Math.round(st.restante * 1000) / 1000,
        stock_min: st.stock_min,
      });
    }
  }

  return alertas;
}

/** Costo de insumos de un producto, para calcular margen. */
export function costoProducto(productoId) {
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(r.cantidad * i.costo), 0) AS costo
       FROM recetas r JOIN insumos i ON i.id = r.insumo_id
       WHERE r.producto_id = ?`
    )
    .get(productoId);
  return r.costo;
}

/** Productos cuyo stock de insumos ya no alcanza para 1 unidad. */
export function productosAgotados() {
  return db
    .prepare(
      `SELECT p.id, p.nombre, p.precio,
        (SELECT COALESCE(SUM(r.cantidad * i.stock), 0)
         FROM recetas r JOIN insumos i ON i.id = r.insumo_id
         WHERE r.producto_id = p.id) AS stock_teorico
       FROM productos p
       WHERE p.activo = 1
         AND p.descuenta_stock = 1
         AND EXISTS (SELECT 1 FROM recetas r WHERE r.producto_id = p.id)`
    )
    .all()
    .map((p) => ({ ...p, disponibles: Math.floor(p.stock_teorico) }))
    .filter((p) => p.disponibles <= 0);
}
