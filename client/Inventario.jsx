import { useState, useEffect } from 'react';
import { api, money } from './api.js';

export default function Inventario({ avisar }) {
  const [tab, setTab] = useState('insumos');
  const [insumos, setInsumos] = useState([]);
  const [valor, setValor] = useState(0);
  const [mov, setMov] = useState(null);
  const [sugerencia, setSugerencia] = useState(null);
  const [dias, setDias] = useState(7);

  async function cargar() {
    try {
      const r = await api('/api/inventario');
      setInsumos(r.insumos);
      setValor(r.valorInventario);
    } catch (e) {
      avisar(e.message, 'bad');
    }
  }

  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    if (tab === 'movimientos') {
      api('/api/inventario/movimientos').then((r) => setMov(r.movimientos)).catch(() => {});
    }
    if (tab === 'compras') {
      api(`/api/inventario/sugerencia?dias=${dias}`).then(setSugerencia).catch(() => {});
    }
  }, [tab, dias]);

  const bajos = insumos.filter((i) => i.estado !== 'ok');

  return (
    <div>
      <div className="subtabs">
        {[['insumos', 'Insumos'], ['recetas', 'Recetas'], ['compras', 'Sugerencia de compra'], ['movimientos', 'Movimientos']].map(([k, n]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>
        ))}
      </div>

      {tab === 'insumos' && <Insumos insumos={insumos} valor={valor} cargar={cargar} avisar={avisar} />}
      {tab === 'recetas' && <Recetas avisar={avisar} />}
      {tab === 'compras' && (
        <div className="card">
          <h3>Sugerencia de compra</h3>
          <div className="field">
            <label>Proyectar a {dias} dias</label>
            <div className="row3">
              {[3, 7, 15, 30].map((d) => (
                <button key={d} className={`btn ${dias === d ? '' : 'sec'} sm`} onClick={() => setDias(d)}>{d}d</button>
              ))}
            </div>
          </div>
          {!sugerencia ? <div className="hint">Cargando...</div> : (
            <>
              {!sugerencia.sugerencia.length ? <div className="hint">No falta ningun insumo para esos dias</div> : (
                <>
                  <div className="kpis" style={{ marginBottom: 10 }}>
                    <div className="kpi">
                      <div className="l">Costo estimado</div>
                      <div className="v warn">{money(sugerencia.costo_total)}</div>
                    </div>
                  </div>
                  <table>
                    <thead><tr><th>Insumo</th><th className="r">Stock</th><th className="r">Falta</th><th className="r">Costo</th></tr></thead>
                    <tbody>
                      {sugerencia.sugerencia.map((s) => (
                        <tr key={s.id}>
                          <td>{s.nombre}</td>
                          <td className="r">{s.stock} {s.unidad}</td>
                          <td className="r" style={{ color: 'var(--warn)', fontWeight: 700 }}>{s.faltante} {s.unidad}</td>
                          <td className="r">{money(s.costo_compra)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </div>
      )}
      {tab === 'movimientos' && (
        <div className="card">
          <h3>Ultimos movimientos</h3>
          <table>
            <thead><tr><th>Fecha</th><th>Insumo</th><th>Tipo</th><th className="r">Cant.</th><th>Motivo</th><th>Usuario</th></tr></thead>
            <tbody>
              {(mov || []).map((m) => (
                <tr key={m.id}>
                  <td className="hint">{new Date(m.creado).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{m.insumo}</td>
                  <td>
                    <span className={`badge ${m.tipo === 'entrada' ? 'ok' : m.tipo === 'merma' ? 'bad' : 'info'}`}>
                      {m.tipo}
                    </span>
                  </td>
                  <td className="r">{m.tipo === 'entrada' ? '+' : '-'}{Math.abs(m.cantidad).toFixed(2)} {m.unidad}</td>
    <td className="hint">{m.motivo}</td>
      <td>{m.usuario || <span className="hint">sistema</span>}</td>
    </tr>
  ))}
  {!mov?.length && <tr><td colSpan={6} className="hint">Sin movimientos</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {bajos.length > 0 && tab === 'insumos' && (
        <div className="warnbox">
          <b>{bajos.length} insumo(s) en stock bajo:</b>{' '}
          {bajos.slice(0, 6).map((i) => `${i.nombre} (${i.stock} ${i.unidad})`).join(', ')}
        </div>
      )}
    </div>
  );
}

function Insumos({ insumos, valor, cargar, avisar }) {
  const [editando, setEditando] = useState(null);

  async function guardar(i) {
    try {
      await api('/api/inventario/insumos', {
        method: 'POST',
        body: {
          id: i.id, nombre: i.nombre, unidad: i.unidad,
          stock: i.stock, stock_min: i.stock_min, costo: i.costo,
        },
      });
      avisar('Guardado', 'ok');
      setEditando(null);
      cargar();
    } catch (e) {
      avisar(e.message, 'bad');
    }
  }

  return (
    <div className="card">
      <h3>Insumos · valor total {money(valor)}</h3>
      <table>
        <thead>
          <tr><th>Insumo</th><th className="r">Stock</th><th className="r">Min</th><th className="r">Costo</th><th></th></tr>
        </thead>
        <tbody>
          {insumos.map((i) => (
            <tr key={i.id}>
              <td>{i.nombre}<div className="hint">{i.unidad}</div></td>
              <td className="r">
                {editando === i.id ? (
                  <input className="inp" style={{ width: 76, textAlign: 'right', padding: '5px 7px' }}
                    value={i.stock} onChange={(e) => (i.stock = e.target.value)} inputMode="decimal" />
                ) : (
                  <b style={{ color: i.estado === 'ok' ? 'var(--txt)' : i.estado === 'bajo' ? 'var(--warn)' : 'var(--bad)' }}>
                    {i.stock}
                  </b>
                )}
              </td>
              <td className="r hint">{i.stock_min}</td>
              <td className="r hint">{money(i.costo)}</td>
              <td className="r">
                {editando === i.id ? (
                  <span>
                    <button className="btn ok sm" onClick={() => guardar(i)}>OK</button>{' '}
                    <button className="btn sec sm" onClick={() => setEditando(null)}>X</button>
                  </span>
                ) : (
                  <button className="btn sec sm" onClick={() => { setEditando(i.id); }}>Cargar</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Recetas({ avisar }) {
  const [productos, setProductos] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [sel, setSel] = useState(null);
  const [editando, setEditando] = useState(false);

  async function cargar() {
    const [r, i] = await Promise.all([api('/api/inventario/recetas'), api('/api/inventario')]);
    setProductos(r.productos);
    setInsumos(i.insumos);
    // Refresca el producto seleccionado para que el interruptor quede actualizado
    const fresco = sel ? r.productos.find((p) => p.id === sel.id) : r.productos[0];
    if (fresco) setSel(fresco);
  }

  useEffect(() => { cargar(); }, []);

  async function guardar() {
    const items = (sel.receta || []).map((r) => ({ insumo_id: r.insumo_id, cantidad: Number(r.cantidad) || 0 }));
    try {
      await api(`/api/inventario/recetas/${sel.id}`, {
        method: 'PUT',
        body: { items, descuenta_stock: sel.descuenta_stock !== 0 },
      });
      avisar('Receta guardada', 'ok');
      setEditando(false);
      cargar();
    } catch (e) {
      avisar(e.message, 'bad');
    }
  }

  function agregarLinea() {
    setSel({ ...sel, receta: [...(sel.receta || []), { insumo_id: insumos[0]?.id, insumo: insumos[0]?.nombre, unidad: insumos[0]?.unidad, cantidad: 1, nuevo: true }] });
  }

  if (!sel) return <div className="vacio">Cargando recetas...</div>;

  return (
    <div>
      <div className="card">
        <h3>Receta y margen</h3>
        <div className="field">
          <label>Producto</label>
          <select className="inp" value={sel.id} onChange={(e) => {
            const p = productos.find((x) => x.id === Number(e.target.value));
            setSel(p); setEditando(false);
          }}>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>{p.categoria} — {p.nombre} ({money(p.precio)})</option>
            ))}
          </select>
        </div>

        <label className="switch">
          <input
            type="checkbox"
            checked={sel.descuenta_stock !== 0}
            onChange={(e) => {
              setSel({ ...sel, descuenta_stock: e.target.checked ? 1 : 0 });
              setEditando(true);
            }}
          />
          <span className="track" />
          <b>Descuenta stock al vender</b>
          <span className="hint">
            {sel.descuenta_stock !== 0 ? 'los insumos bajan con cada venta' : 'ignorado: este producto no toca el inventario'}
          </span>
        </label>

        <table>
          <thead><tr><th>Insumo</th><th className="r">Cantidad</th><th className="r">Stock</th><th></th></tr></thead>
          <tbody>
            {(sel.receta || []).map((r, idx) => (
              <tr key={idx}>
                <td>
                  {editando ? (
                    <select className="inp" value={r.insumo_id} onChange={(e) => {
                      const nuevo = insumos.find((i) => i.id === Number(e.target.value));
                      const rec = [...sel.receta];
                      rec[idx] = { ...r, insumo_id: nuevo.id, insumo: nuevo.nombre, unidad: nuevo.unidad, stock: nuevo.stock };
                      setSel({ ...sel, receta: rec });
                    }}>
                      {insumos.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                    </select>
                  ) : `${r.insumo} <span className="hint">(${r.unidad})</span>`}
                </td>
                <td className="r">
                  {editando ? (
                    <input className="inp" style={{ width: 72, textAlign: 'right', padding: '5px 7px' }}
                      value={r.cantidad} inputMode="decimal"
                      onChange={(e) => {
                        const rec = [...sel.receta];
                        rec[idx] = { ...r, cantidad: e.target.value };
                        setSel({ ...sel, receta: rec });
                      }} />
                  ) : r.cantidad}
                </td>
                <td className="r hint">{r.stock}</td>
                <td className="r">
                  {editando && (
                    <button className="btn bad sm" onClick={() => {
                      setSel({ ...sel, receta: sel.receta.filter((_, j) => j !== idx) });
                    }}>X</button>
                  )}
                </td>
              </tr>
            ))}
            {!sel.receta?.length && <tr><td colSpan={4} className="hint">Sin receta: el stock no se descuenta</td></tr>}
          </tbody>
        </table>

        <div className="btn-row" style={{ marginTop: 12 }}>
          {editando ? (
            <>
              <button className="btn" onClick={agregarLinea}>+ Agregar insumo</button>
              <button className="btn ok" onClick={guardar}>Guardar receta</button>
              <button className="btn sec" onClick={() => { setEditando(false); cargar(); }}>Cancelar</button>
            </>
          ) : (
            <button className="btn" onClick={() => setEditando(true)}>Editar receta</button>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Margen</h3>
        <table>
          <tbody>
            <tr><td>Precio</td><td className="r">{money(sel.precio)}</td></tr>
            <tr><td>Costo insumos</td><td className="r">{money(sel.costo)}</td></tr>
            <tr><td><b>Margen</b></td><td className="r" style={{ color: 'var(--ok)', fontWeight: 800 }}>{money(sel.margen)}</td></tr>
            <tr><td>Margen %</td><td className="r">{sel.margen_pct ?? '-'}%</td></tr>
            <tr><td>Unidades disponibles</td><td className="r"><b>{sel.disponibles ?? '-'}</b></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
