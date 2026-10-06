import { useState, useEffect } from 'react';
import { api, money, hoy, haceDias } from './api.js';

export default function Reportes({ avisar }) {
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(hoy());
  const [r, setR] = useState(null);
  const [cierre, setCierre] = useState(null);
  const [fechaCierre, setFechaCierre] = useState(hoy());

  async function cargar() {
    try {
      const v = await api(`/api/reportes/ventas?desde=${desde}&hasta=${hasta}`);
      setR(v);
    } catch (e) {
      avisar(e.message, 'bad');
    }
  }

  useEffect(() => { cargar(); }, [desde, hasta]);

  useEffect(() => {
    api(`/api/reportes/cierre-caja?fecha=${fechaCierre}`).then(setCierre).catch(() => {});
  }, [fechaCierre]);

  return (
    <div>
      <div className="card">
        <h3>Reporte de ventas</h3>
        <div className="row3">
          <div className="field">
            <label>Desde</label>
            <input className="inp" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="field">
            <label>Hasta</label>
            <input className="inp" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <a className="btn sec" href={`/api/reportes/ventas.xlsx?desde=${desde}&hasta=${hasta}`}>Excel</a>
          </div>
        </div>

        {!r ? <div className="hint">Cargando...</div> : (
          <>
            <div className="kpis">
              <div className="kpi"><div className="l">Ingresos</div><div className="v ok">{money(r.resumen.ingresos)}</div></div>
              <div className="kpi"><div className="l">Ventas</div><div className="v">{r.resumen.ventas}</div></div>
              <div className="kpi"><div className="l">Ticket prom.</div><div className="v">{money(r.resumen.ticket_promedio)}</div></div>
              <div className="kpi"><div className="l">IGV</div><div className="v">{money(r.resumen.igv)}</div></div>
              <div className="kpi"><div className="l">Descuentos</div><div className="v warn">{money(r.resumen.descuentos)}</div></div>
              <div className="kpi"><div className="l">Anuladas</div><div className="v bad">{r.resumen.anuladas}</div></div>
            </div>

            <table>
              <thead><tr><th>Producto</th><th className="r">Unidades</th><th className="r">Ingresos</th></tr></thead>
              <tbody>
                {r.porProducto.map((p) => (
                  <tr key={p.nombre}>
                    <td>{p.nombre}</td>
                    <td className="r">{p.unidades}</td>
                    <td className="r" style={{ fontWeight: 700 }}>{money(p.ingresos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {r.porMesero.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>Por mesero</h3>
                <table>
                  <thead><tr><th>Mesero</th><th className="r">Pedidos</th><th className="r">Ingresos</th></tr></thead>
                  <tbody>
                    {r.porMesero.map((m) => (
                      <tr key={m.mesero}>
                        <td>{m.mesero}</td>
                        <td className="r">{m.pedidos}</td>
                        <td className="r" style={{ fontWeight: 700 }}>{money(m.ingresos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3>Cierre de caja</h3>
        <div className="field">
          <label>Fecha</label>
          <input className="inp" type="date" value={fechaCierre} onChange={(e) => setFechaCierre(e.target.value)} />
        </div>
        {!cierre ? <div className="hint">Cargando...</div> : (
          <>
            <table>
              <tbody>
                <tr><td>Comprobantes</td><td className="r">{cierre.cantidad}</td></tr>
                <tr><td>Venta bruta</td><td className="r">{money(cierre.total)}</td></tr>
                <tr><td>(-) IGV</td><td className="r">{money(cierre.igv)}</td></tr>
                <tr><td><b>Venta neta</b></td><td className="r"><b>{money(cierre.base)}</b></td></tr>
                {Object.entries(cierre.porPago).map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ paddingLeft: 18, textTransform: 'capitalize' }}>{k}</td>
                    <td className="r">{money(v)}</td>
                  </tr>
                ))}
                {cierre.anuladas.length > 0 && (
                  <tr><td style={{ color: 'var(--bad)' }}>Anuladas</td><td className="r" style={{ color: 'var(--bad)' }}>{cierre.anuladas.length}</td></tr>
                )}
              </tbody>
            </table>
            <div className="hint" style={{ marginTop: 10 }}>
              Efectivo esperado en caja: <b style={{ color: 'var(--ok)' }}>{money(cierre.efectivoEsperado)}</b>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3>Descargar</h3>
        <div className="btn-row">
          <a className="btn sec" href={`/api/reportes/ventas.xlsx?desde=${desde}&hasta=${hasta}`}>Ventas Excel</a>
          <a className="btn sec" href="/api/reportes/inventario.xlsx">Inventario Excel</a>
        </div>
      </div>
    </div>
  );
}
