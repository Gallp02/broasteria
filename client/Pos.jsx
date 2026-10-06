import { useState, useEffect } from 'react';
import { api, money } from './api.js';
import Cobrar from './Cobrar.jsx';

const ESTADOS_ENVIO = [
  ['pendiente', 'Pendiente'],
  ['en_camino', 'En camino'],
  ['entregado', 'Entregado'],
];

export default function Pos({ user, avisar, setPedidoActual }) {
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [mesas, setMesas] = useState([]);
  const [abiertos, setAbiertos] = useState([]);
  const [catSel, setCatSel] = useState(null);
  const [pedido, setPedido] = useState(null);
  const [nota, setNota] = useState('');
  const [agotados, setAgotados] = useState([]);
  const [cobrando, setCobrando] = useState(null);
  const [cargandoMesa, setCargandoMesa] = useState(false);
  const [formDelivery, setFormDelivery] = useState({ nombre: '', telefono: '', direccion: '', envio: '' });

  const puedeVerStock = user.rol === 'jefe';

  async function cargar() {
    try {
      const [c, m, inv] = await Promise.all([
        api('/api/catalogo'),
        api('/api/mesas'),
        puedeVerStock ? api('/api/inventario/recetas').catch(() => ({ agotados: [] })) : Promise.resolve({ agotados: [] }),
      ]);
      setCategorias(c.categorias);
      setProductos(c.productos);
      setMesas(m.mesas);
      setAbiertos(m.abiertos);
      setAgotados((inv.agotados || []).map((a) => a.id));
      setCatSel((v) => v ?? c.categorias[0]?.id ?? null);
    } catch (e) {
      avisar(e.message, 'bad');
    }
  }

  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    const t = setInterval(cargar, 15000);
    return () => clearInterval(t);
  }, []);

  function refrescarPedido(p) {
    setPedido(p);
    setPedidoActual(p);
  }

  // ── Paso 1: elegir mesa. El delivery pide datos del cliente ──
  async function elegirMesa(m) {
    if (m.zona === 'Delivery') return setFormDelivery({ nombre: '', telefono: '', direccion: '', envio: '', _mesa: m.id });
    setCargandoMesa(true);
    try {
      const yaAbierto = abiertos.find((a) => a.mesa_id === m.id);
      if (yaAbierto) return refrescarPedido(await api(`/api/pedidos/${yaAbierto.id}`));
      refrescarPedido(await api('/api/pedidos', { method: 'POST', body: { mesa_id: m.id, items: [] } }));
      avisar(`Pedido abierto en ${m.nombre}`, 'ok');
    } catch (e) {
      avisar(e.message, 'bad');
    } finally {
      setCargandoMesa(false);
    }
  }

  async function confirmarDelivery() {
    const f = formDelivery;
    if (!f.nombre.trim()) return avisar('Falta el nombre del cliente', 'bad');
    if (f.telefono.trim().length < 6) return avisar('Falta un telefono de contacto', 'bad');
    if (!f.direccion.trim()) return avisar('Falta la direccion de entrega', 'bad');

    setCargandoMesa(true);
    try {
      const yaAbierto = abiertos.find((a) => a.mesa_id === f._mesa);
      if (yaAbierto) return refrescarPedido(await api(`/api/pedidos/${yaAbierto.id}`));
      refrescarPedido(await api('/api/pedidos', {
        method: 'POST',
        body: {
          mesa_id: f._mesa,
          items: [],
          cliente_nombre: f.nombre.trim(),
          cliente_telefono: f.telefono.trim(),
          cliente_direccion: f.direccion.trim(),
          envio: Number(f.envio) || 0,
        },
      }));
      avisar('Pedido de delivery abierto', 'ok');
      setFormDelivery({ nombre: '', telefono: '', direccion: '', envio: '' });
    } catch (e) {
      avisar(e.message, 'bad');
    } finally {
      setCargandoMesa(false);
    }
  }

  // ── Paso 2: agregar platos ──
  async function agregar(p) {
    if (!pedido) return avisar('Primero elige la mesa', 'bad');
    if (agotados.includes(p.id)) return avisar(`${p.nombre} sin stock`, 'bad');
    try {
      const r = await api(`/api/pedidos/${pedido.id}/items`, {
        method: 'POST',
        body: { producto_id: p.id, cantidad: 1, nota },
      });
      refrescarPedido(r);
      setNota('');
      if (puedeVerStock && r.alertas?.length) avisar(`Stock bajo: ${r.alertas[0].nombre}`, 'bad');
    } catch (e) {
      avisar(e.message, 'bad');
    }
  }

  async function cambiar(p, delta) {
    try {
      refrescarPedido(await api(`/api/pedidos/${pedido.id}/items`, {
        method: 'POST',
        body: { producto_id: p.id, cantidad: 1, accion: delta > 0 ? 'sumar' : 'quitar' },
      }));
    } catch (e) {
      avisar(e.message, 'bad');
    }
  }

  async function setEstadoEnvio(estado) {
    try {
      refrescarPedido(await api(`/api/pedidos/${pedido.id}/envio`, {
        method: 'POST',
        body: { estado_envio: estado },
      }));
      avisar(`Reparto: ${estado.replace('_', ' ')}`, 'ok');
    } catch (e) {
      avisar(e.message, 'bad');
    }
  }

  if (cobrando) {
    return (
      <Cobrar
        pedido={cobrando}
        onCerrado={() => { setCobrando(null); setPedido(null); setPedidoActual(null); cargar(); }}
        avisar={avisar}
      />
    );
  }

  const visibles = productos.filter((p) => p.categoria_id === catSel);

  // ── Modal de datos de delivery ──
  if (formDelivery._mesa) {
    return (
      <div className="modal-bg">
        <div className="modal">
          <h3>Datos del delivery</h3>
          <div className="field">
            <label>Nombre del cliente *</label>
            <input className="inp" value={formDelivery.nombre} autoFocus
              onChange={(e) => setFormDelivery({ ...formDelivery, nombre: e.target.value })} />
          </div>
          <div className="field">
            <label>Telefono *</label>
            <input className="inp" value={formDelivery.telefono} inputMode="tel"
              onChange={(e) => setFormDelivery({ ...formDelivery, telefono: e.target.value })} />
          </div>
          <div className="field">
            <label>Direccion de entrega *</label>
            <textarea className="inp" rows={2} value={formDelivery.direccion}
              placeholder="Calle, numero, referencia"
              onChange={(e) => setFormDelivery({ ...formDelivery, direccion: e.target.value })} />
          </div>
          <div className="field">
            <label>Costo de envio (S/)</label>
            <input className="inp" value={formDelivery.envio} inputMode="decimal" placeholder="0.00"
              onChange={(e) => setFormDelivery({ ...formDelivery, envio: e.target.value })} />
          </div>
          <div className="btn-row">
            <button className="btn sec" onClick={() => setFormDelivery({ nombre: '', telefono: '', direccion: '', envio: '' })}>
              Cancelar
            </button>
            <button className="btn" onClick={confirmarDelivery} disabled={cargandoMesa}>
              {cargandoMesa ? 'Abriendo...' : 'Abrir delivery'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Paso 1: selector de mesas ──
  if (!pedido) {
    const deliveries = abiertos.filter((a) => a.es_delivery);
    return (
      <div style={{ padding: 12, height: '100%', overflowY: 'auto' }}>
        <div className="card">
          <h3>1. Elige mesa o delivery</h3>
          <div className="hint" style={{ marginBottom: 12 }}>
            Verde = libre · Amarillo = ocupada con su total
          </div>
          <div className="mesas">
            {mesas.map((m) => {
              const oc = abiertos.find((a) => a.mesa_id === m.id);
              return (
                <button key={m.id} className={`mesa ${oc ? 'ocupada' : 'limpia'}`}
                  onClick={() => elegirMesa(m)} disabled={cargandoMesa}>
                  <div className="n">{m.nombre}</div>
                  <div className="t">
                    {oc ? money(oc.total) : m.zona === 'Delivery' ? 'Nuevo pedido' : 'Libre'}
                  </div>
                </button>
              );
            })}
            {!mesas.length && <div className="vacio">Cargando mesas...</div>}
          </div>
        </div>

        {deliveries.length > 0 && (
          <div className="card">
            <h3>Deliveries pendientes ({deliveries.length})</h3>
            {deliveries.map((d) => (
              <div key={d.id} className="item">
                <div className="nm">
                  {d.cliente_nombre || 'Delivery'}
                  <small>{money(d.total)} · {d.estado_envio?.replace('_', ' ')}</small>
                  {d.cliente_direccion && <div className="nt">{d.cliente_direccion}</div>}
                  {d.cliente_telefono && <div className="nt">{d.cliente_telefono}</div>}
                </div>
                <button className="btn sec sm" onClick={() => refrescarPedido(d)}>Abrir</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Paso 2: carta + pedido ──
  const esDelivery = pedido.es_delivery === 1;

  return (
    <div className="pos">
      <div className="pos-left">
        <div className="cats">
          {categorias.map((c) => (
            <button key={c.id} className={catSel === c.id ? 'on' : ''} onClick={() => setCatSel(c.id)}>
              {c.nombre}
            </button>
          ))}
        </div>

        <div className="grid">
          {visibles.map((p) => {
            const agotado = agotados.includes(p.id);
            return (
              <button key={p.id} className={`tile ${agotado ? 'agotado' : ''}`} onClick={() => agregar(p)}>
                <div>
                  {p.revisar && puedeVerStock ? <span className="flag">REVISAR</span> : null}
                  <div className="n">{p.nombre}</div>
                </div>
                {p.descripcion && <div className="d">{p.descripcion}</div>}
                <div className="p">{money(p.precio)}</div>
              </button>
            );
          })}
          {!visibles.length && <div className="vacio">Cargando catalogo...</div>}
        </div>
      </div>

      <div className="pos-right">
        <div className="pedido-head">
          <div className="t">{esDelivery ? 'Delivery' : pedido.mesa_nombre}</div>
          <div className="s">
            #{pedido.id} · {pedido.items.length} items · {pedido.mesero || user.nombre}
          </div>
        </div>

        <div className="items">
          {!pedido.items.length && (
            <div className="vacio">
              Toca los platos de la carta<br />
              <span style={{ fontSize: 11.5 }}>2. Arma el pedido del cliente</span>
            </div>
          )}
          {pedido.items.map((it) => {
            const base = productos.find((p) => p.id === it.producto_id) || {};
            return (
              <div key={it.id} className="item">
                <div className="nm">
                  {it.producto}
                  <small>{money(it.precio * it.cantidad)}</small>
                  {it.nota && <div className="nt">* {it.nota}</div>}
                </div>
                <div className="qty">
                  <button onClick={() => cambiar(base, -1)}>-</button>
                  <span className="v">{it.cantidad}</span>
                  <button onClick={() => cambiar(base, 1)}>+</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="pedido-foot">
          <input className="inp" placeholder="Nota de cocina (opcional)" value={nota}
            onChange={(e) => setNota(e.target.value)} style={{ marginBottom: 9 }} />

          {esDelivery && (
            <div className="card" style={{ padding: 9, marginBottom: 9 }}>
              <div className="hint" style={{ marginBottom: 6 }}>
                <b>{pedido.cliente_nombre}</b> · {pedido.cliente_telefono}
              </div>
              <div className="hint" style={{ marginBottom: 7 }}>{pedido.cliente_direccion}</div>
              {pedido.envio > 0 && <div className="hint">Envio: {money(pedido.envio)}</div>}
              <div className="btn-row" style={{ marginTop: 7 }}>
                {ESTADOS_ENVIO.map(([k, n]) => (
                  <button key={k} className={`btn ${pedido.estado_envio === k ? '' : 'sec'} sm`}
                    onClick={() => setEstadoEnvio(k)}>{n}</button>
                ))}
              </div>
            </div>
          )}

          <div className="total-row">
            <span className="l">Subtotal</span>
            <span className="v">{money(pedido.total)}</span>
          </div>
          <div className="btn-row">
            <button className="btn sec" onClick={() => refrescarPedido(null)}>Cambiar mesa</button>
            <button className="btn" disabled={!pedido.items.length} onClick={() => setCobrando(pedido)}>
              Cobrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
