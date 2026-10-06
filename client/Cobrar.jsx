import { useState } from 'react';
import { api, money } from './api.js';

const METODOS = [
  ['efectivo', 'Efectivo'],
  ['tarjeta', 'Tarjeta'],
  ['yape', 'Yape / Plin'],
  ['transferencia', 'Transferencia'],
];

export default function Cobrar({ pedido, onCerrado, avisar }) {
  const [descuento, setDescuento] = useState(0);
  const [tipo, setTipo] = useState('boleta');
  const [metodo, setMetodo] = useState('efectivo');
  const [doc, setDoc] = useState('');
  const [nombre, setNombre] = useState('');
  const [igvPct, setIgvPct] = useState(18);
  const [cobrando, setCobrando] = useState(false);
  const [recibo, setRecibo] = useState(null);
  const [efectivo, setEfectivo] = useState('');

  const subtotal = pedido.total || 0;
  const base = Math.max(0, subtotal - descuento);
  const igv = base * (igvPct / 100);
  const total = base + igv;
  const vuelto = Math.max(0, Number(efectivo || 0) - total);

  async function cobrar() {
    if (tipo === 'factura' && !doc.trim()) return avisar('Factura necesita el documento del cliente', 'bad');
    setCobrando(true);
    try {
      const r = await api(`/api/pedidos/${pedido.id}/cerrar`, {
        method: 'POST',
        body: {
          descuento,
          tipo,
          metodo_pago: metodo,
          cliente_doc: doc.trim(),
          cliente_nombre: nombre.trim(),
        },
      });
      setRecibo(r);
      avisar(`Venta registrada: ${r.numero}`, 'ok');
    } catch (e) {
      avisar(e.message, 'bad');
    } finally {
      setCobrando(false);
    }
  }

  if (recibo) {
    return (
      <div style={{ padding: 16, maxWidth: 460, margin: '0 auto' }}>
        <div className="card" style={{ textAlign: 'center', borderColor: 'var(--ok)' }}>
          <div style={{ fontSize: 40 }}>✓</div>
          <h3 style={{ fontSize: 19, marginBottom: 4 }}>Venta registrada</h3>
          <div className="hint">{recibo.numero}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--brand2)', margin: '10px 0' }}>
            {money(recibo.total)}
          </div>
          {metodo === 'efectivo' && Number(efectivo) >= total && (
            <div style={{ fontSize: 16, marginBottom: 10 }}>
              Vuelto: <b style={{ color: 'var(--ok)' }}>{money(vuelto)}</b>
            </div>
          )}
          <div className="btn-row" style={{ marginTop: 12 }}>
            <a className="btn sec" href={`/api/caja/boletas/${recibo.boleta_id}/pdf`} target="_blank" rel="noreferrer">
              Ver boleta
            </a>
            <button className="btn" onClick={onCerrado}>Siguiente venta</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 14, maxWidth: 480, margin: '0 auto' }}>
      <div className="card">
        <h3>Cobrar {pedido.mesa_nombre || `Pedido #${pedido.id}`}</h3>

        <div className="field">
          <label>Tipo de comprobante</label>
          <div className="row2">
            <button className={`btn ${tipo === 'boleta' ? '' : 'sec'}`} onClick={() => setTipo('boleta')}>Boleta</button>
            <button className={`btn ${tipo === 'factura' ? '' : 'sec'}`} onClick={() => setTipo('factura')}>Factura</button>
          </div>
        </div>

        {tipo === 'factura' && (
          <div className="row2">
            <div className="field">
              <label>RUC / Documento</label>
              <input className="inp" value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="20XXXXXXXXX" inputMode="numeric" />
            </div>
            <div className="field">
              <label>Razon social</label>
              <input className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Cliente" />
            </div>
          </div>
        )}

        <div className="field">
          <label>Descuento (S/)</label>
          <div className="row3">
            {[0, 5, 10].map((d) => (
              <button key={d} className={`btn ${descuento === d ? '' : 'sec'} sm`} onClick={() => setDescuento(d)}>
                {d === 0 ? 'Ninguno' : `S/${d}`}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Metodo de pago</label>
          <div className="row2">
            {METODOS.map(([k, n]) => (
              <button key={k} className={`btn ${metodo === k ? '' : 'sec'} sm`} onClick={() => setMetodo(k)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {metodo === 'efectivo' && (
          <div className="field">
            <label>Efectivo recibido</label>
            <input className="inp" value={efectivo} onChange={(e) => setEfectivo(e.target.value)}
              placeholder="0.00" inputMode="decimal" />
            {Number(efectivo) >= total && (
              <div className="hint" style={{ marginTop: 6, color: 'var(--ok)', fontWeight: 700 }}>
                Vuelto: {money(vuelto)}
              </div>
            )}
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 6 }}>
          <table>
            <tbody>
              <tr><td>Subtotal</td><td className="r">{money(subtotal)}</td></tr>
              {descuento > 0 && <tr><td>Descuento</td><td className="r">-{money(descuento)}</td></tr>}
              <tr><td>IGV ({igvPct}%)</td><td className="r">{money(igv)}</td></tr>
              <tr style={{ fontWeight: 800, fontSize: 17 }}>
                <td>TOTAL</td><td className="r" style={{ color: 'var(--brand2)' }}>{money(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn sec" onClick={onCerrado}>Cancelar</button>
          <button className="btn ok" onClick={cobrar} disabled={cobrando}>
            {cobrando ? 'Cobrando...' : `Cobrar ${money(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
