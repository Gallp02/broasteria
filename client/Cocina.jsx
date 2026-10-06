import { useState, useEffect } from 'react';
import { api, money } from './api.js';
export default function Cocina() {
  const [pedidos, setPedidos] = useState([]);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  async function cargar() {
    try {
      const r = await api('/api/cocina');
      setPedidos(r.pedidos);
      setItems(r.items);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 8000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      {error && <div className="warnbox">{error}</div>}
      {!pedidos.length && <div className="vacio">No hay pedidos pendientes</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
        {pedidos.map((p) => {
          const suyos = items.filter((i) => i.pedido_id === p.id);
          return (
            <div key={p.id} className="card" style={{ margin: 0, borderColor: p.es_delivery ? 'var(--info)' : 'var(--brand)' }}>
              <h3 style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
                <span>{p.es_delivery ? 'DELIVERY' : p.mesa || 'Delivery'}</span>
                <span className="hint">#{p.id}</span>
              </h3>
              <div className="hint" style={{ marginBottom: 6 }}>{p.mesero} · {hora(p.creado)}</div>
              {p.es_delivery && p.cliente_nombre && (
                <div className="warnbox" style={{ marginBottom: 8 }}>
                  <b>{p.cliente_nombre}</b><br />
                  {p.cliente_telefono && <span>{p.cliente_telefono}<br /></span>}
                  {p.cliente_direccion}
                  {p.envio > 0 && <><br />Envio: {money(p.envio)}</>}
                </div>
              )}
              {suyos.map((i) => (
                <div key={i.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}>
                  <b>{i.cantidad}x</b> {i.producto}
                  {i.nota && <div style={{ color: 'var(--warn)', fontSize: 12, fontStyle: 'italic' }}>* {i.nota}</div>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function hora(f) {
  return new Date(f).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
