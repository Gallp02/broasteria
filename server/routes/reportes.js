import { db, getConfig } from '../db.js';
import { requerirRol } from '../auth.js';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import path from 'node:path';
import fs from 'node:fs';
export function registrarRutasReportes(app) {
  // ── Dashboard del jefe ────────────────────────────────────
  app.get('/api/reportes/dashboard', (req, res) => {
    const hoy = db
      .prepare(
        `SELECT
          COALESCE(SUM(total),0) ingresos,
          COUNT(*) ventas,
          COALESCE(SUM(descuento),0) descuentos,
          COALESCE(SUM(igv),0) igv
         FROM boletas
         WHERE estado = 'emitida' AND date(creado) = date('now','localtime')`
      )
      .get();

    const ayer = db
      .prepare(
        `SELECT COALESCE(SUM(total),0) ingresos, COUNT(*) ventas
         FROM boletas
         WHERE estado = 'emitida' AND date(creado) = date('now','localtime','-1 day')`
      )
      .get();

    const mes = db
      .prepare(
        `SELECT COALESCE(SUM(total),0) ingresos, COUNT(*) ventas
         FROM boletas
         WHERE estado = 'emitida' AND strftime('%Y-%m', creado) = strftime('%Y-%m','now','localtime')`
      )
      .get();

    const porDia = db
      .prepare(
        `SELECT date(creado) dia, COALESCE(SUM(total),0) ingresos, COUNT(*) ventas
         FROM boletas WHERE estado = 'emitida'
         GROUP BY date(creado) ORDER BY dia DESC LIMIT 30`
      )
      .all()
      .reverse();

    const topProductos = db
      .prepare(
        `SELECT pr.nombre, pr.precio, SUM(i.cantidad) unidades,
                SUM(i.cantidad * i.precio) ingresos
         FROM pedido_items i
         JOIN productos pr ON pr.id = i.producto_id
         JOIN pedidos p ON p.id = i.pedido_id
         WHERE p.estado = 'cerrado'
           AND date(p.cerrado) >= date('now','localtime','-30 days')
         GROUP BY pr.id ORDER BY unidades DESC LIMIT 15`
      )
      .all();

    const porCategoria = db
      .prepare(
        `SELECT c.nombre, SUM(i.cantidad * i.precio) ingresos
         FROM pedido_items i
         JOIN productos pr ON pr.id = i.producto_id
         JOIN categorias c ON c.id = pr.categoria_id
         JOIN pedidos p ON p.id = i.pedido_id
         WHERE p.estado = 'cerrado'
           AND date(p.cerrado) >= date('now','localtime','-30 days')
         GROUP BY c.id ORDER BY ingresos DESC`
      )
      .all();

    const porHora = db
      .prepare(
        `SELECT CAST(strftime('%H', creado) AS INTEGER) hora, COUNT(*) ventas, COALESCE(SUM(total),0) ingresos
         FROM boletas WHERE estado = 'emitida'
           AND date(creado) >= date('now','localtime','-30 days')
         GROUP BY hora ORDER BY hora`
      )
      .all();

    const metodoPago = db
      .prepare(
        `SELECT metodo_pago, COUNT(*) ventas, COALESCE(SUM(total),0) ingresos
         FROM boletas WHERE estado = 'emitida'
           AND date(creado) >= date('now','localtime','-30 days')
         GROUP BY metodo_pago ORDER BY ingresos DESC`
      )
      .all();

    const stockBajo = db
      .prepare(
        `SELECT id, nombre, unidad, stock, stock_min FROM insumos
         WHERE activo = 1 AND stock <= stock_min ORDER BY stock`
      )
      .all();

    const stockValor = db
      .prepare(`SELECT COALESCE(SUM(stock * costo),0) v FROM insumos WHERE activo = 1`)
      .get().v;

    const ventasMes = mes.ventas || 0;
    res.json({
      hoy: {
        ...hoy,
        ticket_promedio: hoy.ventas > 0 ? round2(hoy.ingresos / hoy.ventas) : 0,
      },
      ayer,
      mes: {
        ...mes,
        ticket_promedio: ventasMes > 0 ? round2(mes.ingresos / ventasMes) : 0,
      },
      variacion: ayer.ingresos > 0
        ? round2(((hoy.ingresos - ayer.ingresos) / ayer.ingresos) * 100)
        : null,
      porDia,
      topProductos,
      porCategoria,
      porHora,
      metodoPago,
      stockBajo,
      stockValor: round2(stockValor),
      igvPct: Number(getConfig('igv', 18)),
    });
  });

  // ── Reporte de ventas ─────────────────────────────────────
  app.get('/api/reportes/ventas', (req, res) => {
    const desde = req.query.desde || dateFrom(-30);
    const hasta = req.query.hasta || dateFrom(0);

    const resumen = db
      .prepare(
        `SELECT COALESCE(SUM(total),0) ingresos, COALESCE(SUM(descuento),0) descuentos,
                COALESCE(SUM(igv),0) igv, COUNT(*) ventas,
                COALESCE(SUM(CASE WHEN estado='anulada' THEN 1 END),0) anuladas
         FROM boletas WHERE date(creado) BETWEEN date(?) AND date(?)`
      )
      .get(desde, hasta);

    const porDia = db
      .prepare(
        `SELECT date(creado) dia, COUNT(*) ventas, COALESCE(SUM(total),0) ingresos
         FROM boletas WHERE estado='emitida' AND date(creado) BETWEEN date(?) AND date(?)
         GROUP BY dia ORDER BY dia`
      )
      .all(desde, hasta);

    const porProducto = db
      .prepare(
        `SELECT pr.nombre,
                COALESCE(SUM(i.cantidad),0) unidades,
                COALESCE(SUM(i.cantidad * i.precio),0) ingresos
         FROM pedido_items i
         JOIN productos pr ON pr.id = i.producto_id
         JOIN pedidos p ON p.id = i.pedido_id
         WHERE p.estado = 'cerrado' AND date(p.cerrado) BETWEEN date(?) AND date(?)
         GROUP BY pr.id ORDER BY ingresos DESC`
      )
      .all(desde, hasta);

    const porMesero = db
      .prepare(
        `SELECT COALESCE(u.nombre,'Sin asignar') mesero, COUNT(DISTINCT p.id) pedidos,
                COALESCE(SUM(b.total),0) ingresos
         FROM boletas b
         JOIN pedidos p ON p.id = b.pedido_id
         LEFT JOIN usuarios u ON u.id = p.mesero_id
         WHERE b.estado='emitida' AND date(b.creado) BETWEEN date(?) AND date(?)
         GROUP BY u.id ORDER BY ingresos DESC`
      )
      .all(desde, hasta);

    const boletas = db
      .prepare(
        `SELECT * FROM boletas WHERE date(creado) BETWEEN date(?) AND date(?) ORDER BY id DESC LIMIT 2000`
      )
      .all(desde, hasta);

    res.json({
      desde,
      hasta,
      resumen: {
        ...resumen,
        ticket_promedio: resumen.ventas > 0 ? round2(resumen.ingresos / resumen.ventas) : 0,
      },
      porDia,
      porProducto,
      porMesero,
      boletas,
    });
  });

  // ── Exportar Excel ────────────────────────────────────────
  app.get('/api/reportes/ventas.xlsx', requerirRol('caja', 'jefe'), async (req, res) => {
    const desde = req.query.desde || dateFrom(-30);
    const hasta = req.query.hasta || dateFrom(0);

    const r = db
      .prepare(
        `SELECT numero, tipo, cliente_doc, cliente_nombre, subtotal, descuento, igv, total,
                metodo_pago, estado, creado
         FROM boletas WHERE date(creado) BETWEEN date(?) AND date(?) ORDER BY id DESC`
      )
      .all(desde, hasta);

    const porProducto = db
      .prepare(
        `SELECT pr.nombre, COALESCE(SUM(i.cantidad),0) unidades,
                COALESCE(SUM(i.cantidad * i.precio),0) ingresos
         FROM pedido_items i
         JOIN productos pr ON pr.id = i.producto_id
         JOIN pedidos p ON p.id = i.pedido_id
         WHERE p.estado='cerrado' AND date(p.cerrado) BETWEEN date(?) AND date(?)
         GROUP BY pr.id ORDER BY ingresos DESC`
      )
      .all(desde, hasta);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Broasteria';
    wb.created = new Date();

    const ws = wb.addWorksheet('Ventas');
    ws.columns = [
      { header: 'Numero', key: 'numero', width: 14 },
      { header: 'Tipo', key: 'tipo', width: 10 },
      { header: 'Fecha', key: 'creado', width: 20 },
      { header: 'Cliente', key: 'cliente_nombre', width: 24 },
      { header: 'Documento', key: 'cliente_doc', width: 14 },
      { header: 'Subtotal', key: 'subtotal', width: 12 },
      { header: 'Descuento', key: 'descuento', width: 12 },
      { header: 'IGV', key: 'igv', width: 12 },
      { header: 'Total', key: 'total', width: 12 },
      { header: 'Pago', key: 'metodo_pago', width: 12 },
      { header: 'Estado', key: 'estado', width: 12 },
    ];
    ws.getRow(1).font = { bold: true };
    r.forEach((x) => ws.addRow(x));
    ws.getColumn('total').numFmt = '"S/"#,##0.00';

    const wp = wb.addWorksheet('Por producto');
    wp.columns = [
      { header: 'Producto', key: 'nombre', width: 32 },
      { header: 'Unidades', key: 'unidades', width: 12 },
      { header: 'Ingresos', key: 'ingresos', width: 14 },
    ];
    wp.getRow(1).font = { bold: true };
    porProducto.forEach((x) => wp.addRow(x));
    wp.getColumn('ingresos').numFmt = '"S/"#,##0.00';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ventas_${desde}_${hasta}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  });

  // ── Exportar inventario Excel ─────────────────────────────
  app.get('/api/reportes/inventario.xlsx', requerirRol('jefe'), async (req, res) => {
    const insumos = db
      .prepare(
        `SELECT i.nombre, i.unidad, i.stock, i.stock_min, i.costo,
                (i.stock * i.costo) valor,
                CASE WHEN i.stock <= 0 THEN 'AGOTADO'
                     WHEN i.stock <= i.stock_min THEN 'BAJO' ELSE 'OK' END estado
         FROM insumos i WHERE i.activo = 1 ORDER BY estado, i.nombre`
      )
      .all();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Inventario');
    ws.columns = [
      { header: 'Insumo', key: 'nombre', width: 30 },
      { header: 'Unidad', key: 'unidad', width: 10 },
      { header: 'Stock', key: 'stock', width: 12 },
      { header: 'Stock min', key: 'stock_min', width: 12 },
      { header: 'Costo unit.', key: 'costo', width: 14 },
      { header: 'Valor', key: 'valor', width: 14 },
      { header: 'Estado', key: 'estado', width: 12 },
    ];
    ws.getRow(1).font = { bold: true };
    insumos.forEach((x) => ws.addRow(x));
    ws.getColumn('valor').numFmt = '"S/"#,##0.00';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="inventario_${dateFrom(0)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  });

  // ── Boleta / factura en PDF ───────────────────────────────
  app.get('/api/caja/boletas/:id/pdf', (req, res) => {
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

    const cfgEmp = JSON.parse(getConfig('empresa', '{}'));
    const igvPct = Number(getConfig('igv', 18));
    const pedido = b.pedido_id
      ? db.prepare('SELECT * FROM pedidos WHERE id = ?').get(b.pedido_id)
      : null;

    const doc = new PDFDocument({ margin: 40, size: [226, 400] });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', (e) => {
      console.error('Error generando PDF:', e.message);
      if (!res.headersSent) res.status(500).json({ error: 'No se pudo generar el PDF' });
    });

    const W = 226 - 80;

    // Logo del local
    const logoPath = path.join(import.meta.dirname, '..', '..', 'assets', 'logo-recibo.jpg');
    if (fs.existsSync(logoPath) && cfgEmp.logo !== false) {
      try {
        const anchoLogo = 110;
        const altoLogo = Math.min(60, anchoLogo * 0.62);
        doc.image(logoPath, 40 + (W - anchoLogo) / 2, doc.y, { fit: [anchoLogo, altoLogo], align: 'center' });
        doc.y += altoLogo + 6;
      } catch {
        // si el logo no se puede leer, sigue igual sin el
      }
    }

    doc.fontSize(9).font('Helvetica-Bold').text(cfgEmp.nombre || 'BROASTERIA', { align: 'center' });
    if (cfgEmp.ruc) doc.fontSize(7).font('Helvetica').text(`RUC: ${cfgEmp.ruc}`, { align: 'center' });
    if (cfgEmp.direccion) doc.fontSize(6).text(cfgEmp.direccion, { align: 'center' });
    if (cfgEmp.telefono) doc.fontSize(6).text(`Tel: ${cfgEmp.telefono}`, { align: 'center' });

    doc.moveDown(0.5);
    doc.fontSize(7).text(b.tipo.toUpperCase(), { align: 'center' });
    doc.fontSize(8).font('Helvetica-Bold').text(b.numero, { align: 'center' });
    doc.fontSize(6).font('Helvetica').text(`Fecha: ${b.creado}`, { align: 'center' });
    if (b.estado === 'anulada') {
      doc.moveDown(0.2);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#c00').text('ANULADA', { align: 'center' });
      doc.fillColor('#000');
    }
    if (b.cliente_doc || b.cliente_nombre) {
      doc.fontSize(6).text(`Cliente: ${b.cliente_nombre || '-'} ${b.cliente_doc || ''}`);
    }
    if (pedido?.es_delivery) {
      doc.fontSize(6).text('DELIVERY');
      if (pedido.cliente_telefono) doc.text(`Tel: ${pedido.cliente_telefono}`);
      if (pedido.cliente_direccion) doc.text(`Dir: ${pedido.cliente_direccion}`, { width: W });
      if (pedido.envio > 0) doc.text(`Envio: S/${pedido.envio.toFixed(2)}`);
    }

    doc.moveDown(0.4);
    doc.moveTo(40, doc.y).lineTo(40 + W, doc.y).stroke();
    doc.moveDown(0.3);

    doc.fontSize(7).font('Helvetica-Bold');
    const x0 = 40, x1 = 128, x2 = 172;
    let y = doc.y;
    doc.text('Cant', x0, y, { width: 16 });
    doc.text('Descripcion', x1, y, { width: 44 });
    doc.text('Importe', x2, y, { width: 54, align: 'right' });
    doc.moveDown(0.25);
    doc.moveTo(40, doc.y).lineTo(40 + W, doc.y).stroke();
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(6.5);

    for (const it of items) {
      const importe = it.cantidad * it.precio;
      doc.text(String(it.cantidad), x0, doc.y, { width: 16 });
      doc.text(it.nombre, x1, doc.y, { width: 44 });
      doc.text(`S/${importe.toFixed(2)}`, x2, doc.y, { width: 54, align: 'right' });
      if (it.nota) {
        doc.fillColor('#666').fontSize(5.5).text(`  * ${it.nota}`, x1, doc.y, { width: 44 });
        doc.fillColor('#000').fontSize(6.5);
      }
      doc.moveDown(0.15);
    }

    doc.moveDown(0.2);
    doc.moveTo(40, doc.y).lineTo(40 + W, doc.y).stroke();
    doc.moveDown(0.3);

    const linea = (label, valor, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7);
      doc.text(label, 40, doc.y, { width: 100 });
      doc.text(valor, 140, doc.y, { width: 86, align: 'right' });
      doc.moveDown(0.15);
    };

    linea('Subtotal', `S/${b.subtotal.toFixed(2)}`);
    if (b.descuento > 0) linea('Descuento', `- S/${b.descuento.toFixed(2)}`);
    linea(`IGV (${igvPct}%)`, `S/${b.igv.toFixed(2)}`);
    doc.moveDown(0.15);
    linea('TOTAL', `S/${b.total.toFixed(2)}`, true);
    linea('Pago', b.metodo_pago);

    doc.moveDown(0.5);
    doc.fontSize(5.5).fillColor('#666').text(
      b.sunat_estado === 'aceptada'
        ? 'Comprobante de pago electronico - SUNAT'
        : 'Comprobante interno de venta',
      { align: 'center' }
    );
    doc.text('Gracias por su compra', { align: 'center' });
    doc.fillColor('#000');

    doc.end();
    doc.on('end', () => {
      const pdf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${b.numero}.pdf"`);
      res.end(pdf);
    });
  });

  // ── Cierre de caja del día ────────────────────────────────
  app.get('/api/reportes/cierre-caja', requerirRol('caja', 'jefe'), (req, res) => {
    const fecha = req.query.fecha || dateFrom(0);
    const boletas = db
      .prepare(
        `SELECT * FROM boletas WHERE date(creado) = date(?) ORDER BY id`
      )
      .all(fecha);

    const emitidas = boletas.filter((b) => b.estado === 'emitida');
    const porPago = {};
    for (const b of emitidas) {
      porPago[b.metodo_pago] = round2((porPago[b.metodo_pago] || 0) + b.total);
    }

    const total = round2(emitidas.reduce((s, b) => s + b.total, 0));
    const igv = round2(emitidas.reduce((s, b) => s + b.igv, 0));
    const base = round2(total - igv);

    res.json({
      fecha,
      boletas: emitidas,
      anuladas: boletas.filter((b) => b.estado === 'anulada'),
      cantidad: emitidas.length,
      porPago,
      total,
      igv,
      base,
      efectivoEsperado: porPago.efectivo || 0,
    });
  });
}

function dateFrom(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
