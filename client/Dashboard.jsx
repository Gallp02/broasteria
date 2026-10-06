import { useState, useEffect } from 'react';
import { api, money } from './api.js';

export default function Dashboard() {
  const [d, setD] = useState(null);

  useEffect(() => {
    api('/api/reportes/dashboard').then(setD).catch(() => {});
    const t = setInterval(() => api('/api/reportes/dashboard').then(setD).catch(() => {}), 60000);
    return () => clearInterval(t);
  }, []);

  if (!d) return <div className="spin">Cargando...</div>;

  const maxDia = Math.max(...d.porDia.map((x) => x.ingresos), 1);

  return (
    <div>
      <div className="kpis">
        <div className="kpi">
          <div className="l">Ventas hoy</div>
          <div className="v">{money(d.hoy.ingresos)}</div>
          <div className="s">
            {d.hoy.ventas} ventas
            {d.variacion !== null && (
              <span style={{ color: d.variacion >= 0 ? 'var(--ok)' : 'var(--bad)' }}>
                {' '}{d.variacion >= 0 ? '+' : ''}{d.variacion}%
              </span>
            )}
          </div>
        </div>
        <div className="kpi">
          <div className="l">Ticket promedio</div>
          <div className="v">{money(d.hoy.ticket_promedio)}</div>
        </div>
        <div className="kpi">
          <div className="l">Mes</div>
          <div className="v">{money(d.mes.ingresos)}</div>
          <div className="s">{d.mes.ventas} ventas</div>
        </div>
        <div className="kpi">
          <div className="l">Inventario</div>
          <div className="v">{money(d.stockValor)}</div>
          <div className="s">valor en insumos</div>
        </div>
        <div className="kpi">
          <div className="l">Descuentos hoy</div>
          <div className="v warn">{money(d.hoy.descuentos)}</div>
          <div className="s">IGV {money(d.hoy.igv)}</div>
        </div>
        <div className="kpi">
          <div className="l">Stock bajo</div>
          <div className={`v ${d.stockBajo.length ? 'bad' : 'ok'}`}>{d.stockBajo.length}</div>
          <div className="s">insumos por comprar</div>
        </div>
      </div>

      <div className="card">
        <h3>Ultimos 30 dias</h3>
        <div className="chart">
          {d.porDia.map((x) => (
            <div key={x.dia} className="col" style={{ height: `${Math.max(2, (x.ingresos / maxDia) * 100)}%` }}
              title={`${x.dia}: ${money(x.ingresos)} (${x.ventas} ventas)`} />
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Productos mas vendidos (30 dias)</h3>
        {!d.topProductos.length && <div className="hint">Sin ventas en el periodo</div>}
        <table>
          <thead><tr><th>Producto</th><th className="r">Unid.</th><th className="r">Ingresos</th></tr></thead>
          <tbody>
            {d.topProductos.map((p) => (
              <tr key={p.nombre}>
                <td>{p.nombre}</td>
                <td className="r">{p.unidades}</td>
                <td className="r" style={{ fontWeight: 700 }}>{money(p.ingresos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row2">
        <div className="card">
          <h3>Horas con mas venta</h3>
          {!d.porHora.length && <div className="hint">Sin datos</div>}
          <table>
            <tbody>
              {d.porHora.map((h) => (
                <tr key={h.hora}>
                  <td>{String(h.hora).padStart(2, '0')}:00</td>
                  <td><div className="bar"><i style={{ width: `${Math.min(100, (h.ingresos / Math.max(...d.porHora.map((x) => x.ingresos))) * 100)}%` }} /></div></td>
                  <td className="r hint">{h.ventas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Como pagan</h3>
          {!d.metodoPago.length && <div className="hint">Sin datos</div>}
          <table>
            <tbody>
              {d.metodoPago.map((m) => (
                <tr key={m.metodo_pago}>
                  <td style={{ textTransform: 'capitalize' }}>{m.metodo_pago}</td>
                  <td className="r">{m.ventas}</td>
                  <td className="r" style={{ fontWeight: 700 }}>{money(m.ingresos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Ventas por categoria (30 dias)</h3>
        <table>
          <tbody>
            {d.porCategoria.map((c) => (
              <tr key={c.nombre}>
                <td>{c.nombre}</td>
                <td style={{ width: '45%' }}>
                  <div className="bar">
                    <i style={{ width: `${(c.ingresos / Math.max(...d.porCategoria.map((x) => x.ingresos), 1)) * 100}%` }} />
                  </div>
                </td>
                <td className="r" style={{ fontWeight: 700 }}>{money(c.ingresos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {d.stockBajo.length > 0 && (
        <div className="card">
          <h3 style={{ color: 'var(--warn)' }}>Necesitan reposicion</h3>
          <table>
            <thead><tr><th>Insumo</th><th className="r">Stock</th><th className="r">Minimo</th></tr></thead>
            <tbody>
              {d.stockBajo.map((s) => (
                <tr key={s.id}>
                  <td>{s.nombre}</td>
                  <td className="r" style={{ color: 'var(--bad)', fontWeight: 800 }}>{s.stock} {s.unidad}</td>
                  <td className="r hint">{s.stock_min}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
