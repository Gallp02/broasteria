import { useState, useEffect } from 'react';
import { api, money, hoy } from './api.js';
import Cobrar from './Cobrar.jsx';

export default function Caja({ avisar }) {
  const [pendientes, setPendientes] = useState([]);
  const [boletas, setBoletas] = useState([]);
  const [totales, setTotales] = useState(null);
  const [fecha, setFecha] = useState(hoy());
  const [cobrando, setCobrando] = useState(null);

  async function cargar() {
    try {
      const [p, b] = await Promise.all([
        api('/api/caja/pendientes'),
        api(`/api/caja/boletas?desde=${fecha}&hasta=${fecha}`),
      ]);
      setPendientes(p.pedidos);
      setBoletas(b.boletas);
      setTotales(b.totales);
    } catch (e) {
      avisar(e.message, 'bad');
    }
  }

  useEffect(() => { cargar(); }, [fecha]);

  async function anular(b) {
    if (!confirm(`Anular ${b.numero}? Se devuelve el stock.`)) return;
    try {
      await api(`/api/caja/boletas/${b.id}/anular`, { method: 'POST' });
      avisar('Boleta anulada', 'ok');
      cargar();
    } catch (e) {
      avisar(e.message, 'bad');
    }
  }

  if (cobrando) {
    return <Cobrar pedido={cobrando} onCerrado={() => { setCobrando(null); cargar(); }} avisar={avisar} />;
  }

  return (
    <div>
      <div className="card">
        <h3>Pendientes de cobro ({pendientes.length})</h3>
        {!pendientes.length && <div className="hint">No hay pedidos por cobrar</div>}
        {pendientes.map((p) => (
          <div key={p.id} className="item" style={{ cursor: 'pointer' }} onClick={() => setCobrando({ ...p, items: [] })}>
            <div className="nm">
              {p.mesa_nombre || 'Delivery'}
              <small style={{ color: 'var(--muted)' }}>Mesero {p.mesero || '-'}</small>
            </div>
            <b style={{ color: 'var(--brand2)', fontSize: 15 }}>{money(p.total)}</b>
          </div>
        ))}
      </div>

      {totales && (
        <div className="kpis">
          <div className="kpi">
            <div className="l">Ventas</div>
            <div className="v ok">{money(totales.ingresos)}</div>
            <div className="s">{totales.cantidad} comprobantes</div>
          </div>
          <div className="kpi">
            <div className="l">Efectivo</div>
            <div className="v">{money(totales.efectivo)}</div>
          </div>
          <div className="kpi">
            <div className="l">Digital</div>
            <div className="v">{money((totales.tarjeta || 0) + (totales.yape || 0) + (totales.transferencia || 0))}</div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Comprobantes del día</h3>
        <div className="field">
          <input className="inp" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        {!boletas.length && <div className="hint">Sin comprobantes en esta fecha</div>}
        <table>
          <thead>
            <tr><th>Numero</th><th>Hora</th><th className="r">Total</th><th></th></tr>
          </thead>
          <tbody>
            {boletas.map((b) => (
              <tr key={b.id} style={{ opacity: b.estado === 'anulada' ? 0.5 : 1 }}>
                <td>
                  {b.numero}
                  {b.estado === 'anulada' && <span className="badge bad" style={{ marginLeft: 6 }}>Anulada</span>}
                  <div className="hint" style={{ fontSize: 10.5 }}>{b.metodo_pago}</div>
                </td>
                <td className="hint">{new Date(b.creado).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</td>
                <td className="r" style={{ fontWeight: 700 }}>{money(b.total)}</td>
                <td className="r" style={{ whiteSpace: 'nowrap' }}>
                  <a className="btn sec sm" href={`/api/caja/boletas/${b.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>{' '}
                  {b.estado === 'emitida' && (
                    <button className="btn bad sm" onClick={() => anular(b)}>Anular</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
