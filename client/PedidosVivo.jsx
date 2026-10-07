import { useState, useEffect, useCallback } from 'react';
import { api, money } from './api.js';

// Los timestamps se guardan en hora local (YYYY-MM-DD HH:MM:SS).
function aFecha(creado) {
  const [d, t] = String(creado || '').split(' ');
  if (!d || !t) return null;
  const [Y, M, D] = d.split('-').map(Number);
  const [h, m] = t.split(':').map(Number);
  return new Date(Y, M - 1, D, h, m, 0);
}

function minutos(creado) {
  const f = aFecha(creado);
  return f ? Math.max(0, Math.floor((Date.now() - f.getTime()) / 60000)) : 0;
}

function reloj(m) {
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

// Verde si va rapido, amarillo si se hace esperar, rojo si lleva mucho.
function nivel(m) {
  if (m < 15) return 'ok';
  if (m < 25) return 'warn';
  return 'bad';
}

export default function PedidosVivo({ irA }) {
  const [mesas, setMesas] = useState([]);
  const [abiertos, setAbiertos] = useState([]);
  const [items, setItems] = useState([]);
  const [, setTick] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [ultima, setUltima] = useState(null);
  const [err, setErr] = useState('');

  const cargar = useCallback(() => {
    setCargando(true);
    Promise.all([
      api('/api/mesas')
        .then((r) => { setMesas(r.mesas || []); setAbiertos(r.abiertos || []); setErr(''); })
        .catch((e) => { setErr(e.message || 'Sin conexion con el servidor'); }),
      api('/api/cocina').then((r) => setItems(r.items || [])).catch(() => {}),
    ]).finally(() => { setCargando(false); setUltima(new Date()); });
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 10000);
    return () => clearInterval(t);
  }, [cargar]);

  // Solo para que los minutos avancen solos en pantalla
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const porPedido = {};
  for (const i of items) (porPedido[i.pedido_id] ||= []).push(i);

  const libres = Math.max(0, mesas.length - abiertos.length);
  const porCobrar = abiertos.reduce((s, p) => s + (p.total || 0), 0);
  const entregas = abiertos.filter((p) => p.es_delivery).length;

  return (
    <div>
      <div className="vivo-top">
        <div className="vivo-stats">
          <div className="vivo-stat">
            <div className="l">Pedidos abiertos</div>
            <div className="v">{abiertos.length}</div>
          </div>
          <div className="vivo-stat">
            <div className="l">Por cobrar</div>
            <div className="v">{money(porCobrar)}</div>
          </div>
          <div className="vivo-stat">
            <div className="l">En delivery</div>
            <div className="v">{entregas}</div>
          </div>
          <div className="vivo-stat">
            <div className="l">Mesas libres</div>
            <div className="v ok">{libres}</div>
          </div>
        </div>
        <div className="vivo-act">
          {ultima && <span className="hint">Actualizado {ultima.toLocaleTimeString('es-PE')}</span>}
          <button className="btn sec sm" onClick={cargar} disabled={cargando}>{cargando ? 'Actualizando…' : 'Actualizar'}</button>
        </div>
      </div>

      {err && <div className="login-err">{err}</div>}

      {!abiertos.length && !err && (
        <div className="card">
          <div className="vacio">
            <div className="vacio-ic">🍗</div>
            <h3>No hay pedidos abiertos</h3>
            <p className="hint">Abre un pedido desde Pedidos y aparecera aqui con sus platos y el tiempo que lleva.</p>
            <button className="btn" onClick={() => irA('pos')}>Ir a Pedidos</button>
          </div>
        </div>
      )}

      <div className="vivo-grid">
        {abiertos.map((p) => {
          const m = minutos(p.creado);
          const nv = nivel(m);
          const susItems = porPedido[p.id] || [];
          const cant = susItems.reduce((s, i) => s + i.cantidad, 0);
          return (
            <button
              key={p.id}
              className={`vivo-card nv-${nv}`}
              onClick={() => irA('pos')}
              title="Abrir este pedido"
            >
              <div className="vivo-head">
                <div className="vivo-who">
                  {p.es_delivery ? (
                    <>
                      <div className="vivo-mesa del">{p.cliente_nombre || 'Delivery'}</div>
                      <div className="vivo-sub">
                        <span className="tag del">Delivery</span>
                        {p.cliente_telefono || ''}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="vivo-mesa">{p.mesa_nombre || `Mesa ${p.mesa_id}`}</div>
                      <div className="vivo-sub">
                        {p.zona || 'Salon'}
                        {p.mesero ? ` · ${p.mesero}` : ''}
                      </div>
                    </>
                  )}
                </div>
                <div
                  className="ring"
                  style={{ '--p': Math.min(100, Math.round((m / 45) * 100)) }}
                  title={`${m} minutos`}
                >
                  <span>{m}</span>
                </div>
              </div>

              <div className="vivo-items">
                {!susItems.length && <div className="hint">Pedido vacio, sin platos ainda</div>}
                {susItems.map((i) => (
                  <div key={i.id} className="vivo-item">
                    <span className="q">{i.cantidad}</span>
                    <span className="n">
                      {i.producto}
                      {i.nota ? <em className="nota">{i.nota}</em> : null}
                    </span>
                  </div>
                ))}
              </div>

              <div className="vivo-foot">
                <span className="hint">{cant} {cant === 1 ? 'plato' : 'platos'}</span>
                <span className="vivo-total">{money(p.total || 0)}</span>
              </div>
              <div className="vivo-reloj">{reloj(m)} en mesa</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
