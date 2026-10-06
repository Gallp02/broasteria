import { useState, useEffect } from 'react';
import { api, money } from './api.js';

export default function Admin({ avisar }) {
  const [tab, setTab] = useState('usuarios');
  const [usuarios, setUsuarios] = useState([]);
  const [mesas, setMesas] = useState([]);
  const [config, setConfig] = useState(null);
  const [porRevisar, setPorRevisar] = useState([]);

  async function cargarTodo() {
    try {
      const [u, m, c, r] = await Promise.all([
        api('/api/admin/usuarios'),
        api('/api/admin/mesas'),
        api('/api/admin/config'),
        api('/api/admin/productos/por-revisar'),
      ]);
      setUsuarios(u.usuarios);
      setMesas(m.mesas);
      setConfig(c);
      setPorRevisar(r.productos);
    } catch (e) {
      avisar(e.message, 'bad');
    }
  }

  useEffect(() => { cargarTodo(); }, []);

  async function guardarUsuario(u) {
    try {
      // Al editar, el PIN solo se envia si se escribio uno nuevo
      const cuerpo = { nombre: u.nombre, rol: u.rol, usuario: u.usuario };
      if (String(u.clave ?? '').trim()) cuerpo.clave = String(u.clave).trim();
      if (u.id) cuerpo.id = u.id;
      await api('/api/admin/usuarios', { method: 'POST', body: cuerpo });
      avisar('Usuario guardado', 'ok');
      setEditUsu(null);
      cargarTodo();
    } catch (e) {
      avisar(e.message, 'bad');
    }
  }

  const [editUsu, setEditUsu] = useState(null);
  const [nuevoMesa, setNuevoMesa] = useState('');
  const [testSunat, setTestSunat] = useState('');

  async function guardarConfig() {
    try {
      await api('/api/admin/config', { method: 'POST', body: config });
      avisar('Configuracion guardada', 'ok');
    } catch (e) {
      avisar(e.message, 'bad');
    }
  }

  async function probarSunat() {
    try {
      const r = await api('/api/admin/sunat/probar', { method: 'POST' });
      setTestSunat(r.mensaje);
    } catch (e) {
      setTestSunat(e.message);
    }
  }

  if (!config) return <div className="spin">Cargando...</div>;

  return (
    <div>
      <div className="subtabs">
        {[['usuarios', 'Usuarios'], ['mesas', 'Mesas'], ['precios', 'Revisar precios'], ['stock', 'Stock automatico'], ['empresa', 'Empresa y SUNAT']].map(([k, n]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>
        ))}
      </div>

      {tab === 'usuarios' && (
        <div className="card">
          <h3>Usuarios</h3>
          <table>
            <thead><tr><th>Nombre</th><th>Rol</th><th>Usuario</th><th>Clave</th><th></th></tr></thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} style={{ opacity: u.activo ? 1 : 0.45 }}>
              <td>{u.nombre}</td>
              <td><span className="badge info">{u.rol}</span></td>
              <td className="hint">@{u.usuario}</td>
              <td>
                {u.debe_cambiar_clave === 1
                  ? <span className="badge warn">debe cambiarla</span>
                  : <span className="hint">ok</span>}
              </td>
                  <td className="r">
                    <button className="btn sec sm" onClick={() => setEditUsu({ ...u, pin: '' })}>Editar</button>{' '}
                    {u.activo === 1 ? (
                      <button className="btn bad sm" onClick={async () => {
                        if (!confirm(`Desactivar a ${u.nombre}?`)) return;
                        await api(`/api/admin/usuarios/${u.id}`, { method: 'DELETE' });
                        cargarTodo();
                      }}>Desactivar</button>
                    ) : (
                      <button className="btn ok sm" onClick={async () => {
                        await api(`/api/admin/usuarios/${u.id}/activar`, { method: 'POST' });
                        cargarTodo();
                      }}>Activar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setEditUsu({ nombre: '', usuario: '', clave: '', rol: 'mozo' })}>+ Usuario</button>
          </div>
        </div>
      )}

      {tab === 'mesas' && (
        <div className="card">
          <h3>Mesas ({mesas.length})</h3>
          <div className="mesas" style={{ marginBottom: 14 }}>
            {mesas.map((m) => (
              <div key={m.id} className={`mesa ${m.pedidos_abiertos ? 'ocupada' : 'limpia'}`}>
                <div className="n">{m.nombre}</div>
                <div className="t">{m.zona}</div>
                {m.pedidos_abiertos > 0 && <div className="hint" style={{ color: 'var(--warn)' }}>Abierto</div>}
                {m.activa === 0 && <div className="hint">Inactiva</div>}
              </div>
            ))}
          </div>
          <div className="field">
            <label>Nueva mesa</label>
            <div className="row2">
              <input className="inp" value={nuevoMesa} onChange={(e) => setNuevoMesa(e.target.value)} placeholder="Mesa 11" />
              <button className="btn" onClick={async () => {
                if (!nuevoMesa.trim()) return;
                await api('/api/admin/mesas', { method: 'POST', body: { nombre: nuevoMesa.trim() } });
                setNuevoMesa('');
                cargarTodo();
              }}>Agregar</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'precios' && (
        <div className="card">
          <h3>Revisar precios ({porRevisar.length})</h3>
          {!porRevisar.length && <div className="hint">Todo revisado</div>}
          <table>
            <thead><tr><th>Producto</th><th className="r">Precio</th><th className="r">Nuevo</th><th></th></tr></thead>
            <tbody>
              {porRevisar.map((p) => (
                <Precios key={p.id} p={p} alGuardar={cargarTodo} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'stock' && (
        <div>
          <div className="card">
            <h3>Descuento automatico de stock</h3>
            <p className="hint">
              Cuando esta <b>encendido</b>, cada venta descuenta los insumos de la receta del producto.
              Cuando esta <b>apagado</b>, los pedidos ya no tocan el inventario y el stock queda fijo.
            </p>

            <label className="switch onda">
              <input
                type="checkbox"
                checked={!!config.stock_automatico}
                onChange={(e) => setConfig({ ...config, stock_automatico: e.target.checked })}
              />
              <span className="track" />
              <b className="sw-txt">{config.stock_automatico ? 'Encendido' : 'Apagado'}</b>
            </label>

            <div className="btn-row" style={{ marginTop: 16 }}>
              <button className="btn" onClick={guardarConfig}>Guardar</button>
            </div>
          </div>

          <div className="card">
            <h3>Como funciona</h3>
            <ul className="lista">
              <li>Cada pedido guarda la decision al abrirse: si luego cambias el interruptor, los pedidos abiertos no se alteran.</li>
              <li>Si desactivas el descuento y despues anulas un pedido, no se devuelve stock (porque nunca se desconto).</li>
              <li>Desde <b>Inventario → Recetas</b> puedes apagar el descuento <b>producto por producto</b>.</li>
              <li>Los productos sin receta nunca descuentan, con o sin interruptor.</li>
            </ul>
          </div>
        </div>
      )}

      {tab === 'empresa' && (
        <div className="card">
          <h3>Datos de la empresa</h3>
          <div className="field">
            <label>Nombre comercial</label>
            <input className="inp" value={config.empresa.nombre || ''}
              onChange={(e) => setConfig({ ...config, empresa: { ...config.empresa, nombre: e.target.value } })} />
          </div>
          <div className="row2">
            <div className="field">
              <label>RUC</label>
              <input className="inp" value={config.empresa.ruc || ''} inputMode="numeric"
                onChange={(e) => setConfig({ ...config, empresa: { ...config.empresa, ruc: e.target.value } })} />
            </div>
            <div className="field">
              <label>Telefono</label>
              <input className="inp" value={config.empresa.telefono || ''}
                onChange={(e) => setConfig({ ...config, empresa: { ...config.empresa, telefono: e.target.value } })} />
            </div>
          </div>
          <div className="field">
            <label>Direccion</label>
            <input className="inp" value={config.empresa.direccion || ''}
              onChange={(e) => setConfig({ ...config, empresa: { ...config.empresa, direccion: e.target.value } })} />
          </div>
          <div className="field">
            <label>IGV (%)</label>
            <input className="inp" value={config.igv} inputMode="decimal"
              onChange={(e) => setConfig({ ...config, igv: e.target.value })} />
          </div>

          <h3 style={{ marginTop: 18 }}>SUNAT</h3>
          <div className="field">
            <label>Modo de emision</label>
            <select className="inp" value={config.sunat.modo}
              onChange={(e) => setConfig({ ...config, sunat: { ...config.sunat, modo: e.target.value } })}>
              <option value="interna">Interna (sin SUNAT)</option>
              <option value="sunat">Electronica via SUNAT</option>
            </select>
          </div>
          {config.sunat.modo === 'sunat' && (
            <>
              <div className="field">
                <label>RUC</label>
                <input className="inp" value={config.sunat.ruc || ''} inputMode="numeric"
                  onChange={(e) => setConfig({ ...config, sunat: { ...config.sunat, ruc: e.target.value } })} />
              </div>
              <div className="field">
                <label>Usuario SOL</label>
                <input className="inp" value={config.sunat.usuario_sol || ''}
                  onChange={(e) => setConfig({ ...config, sunat: { ...config.sunat, usuario_sol: e.target.value } })} />
              </div>
              <div className="field">
                <label>Clave SOL</label>
                <input className="inp" type="password" value={config.sunat.clave_sol || ''}
                  onChange={(e) => setConfig({ ...config, sunat: { ...config.sunat, clave_sol: e.target.value } })} />
              </div>
              <div className="btn-row">
                <button className="btn sec" onClick={probarSunat}>Probar conexion</button>
              </div>
              {testSunat && <div className="hint" style={{ marginTop: 8 }}>{testSunat}</div>}
            </>
          )}

          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="btn" onClick={guardarConfig}>Guardar</button>
          </div>
        </div>
      )}

      {editUsu && (
        <div className="modal-bg" onClick={() => setEditUsu(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editUsu.id ? 'Editar usuario' : 'Nuevo usuario'}</h3>
            <div className="field">
              <label>Nombre</label>
              <input className="inp" value={editUsu.nombre}
                onChange={(e) => setEditUsu({ ...editUsu, nombre: e.target.value })} />
            </div>
            <div className="field">
              <label>Usuario (para entrar)</label>
              <input className="inp" value={editUsu.usuario ?? ''} autoCapitalize="none"
                autoCorrect="off" spellCheck={false} placeholder="ej. mario"
                onChange={(e) => setEditUsu({ ...editUsu, usuario: e.target.value })} />
              <div className="hint">Si lo dejas vacio se usa el nombre sin espacios.</div>
            </div>
            <div className="field">
              <label>Contrasena {editUsu.id ? '(dejar vacio = no cambiar)' : '(minimo 4 caracteres)'}</label>
              <input className="inp" type="password" value={editUsu.clave ?? ''}
                onChange={(e) => setEditUsu({ ...editUsu, clave: e.target.value })} />
              {!editUsu.id && (
                <div className="hint">El usuario debera cambiarla al entrar por primera vez.</div>
              )}
            </div>
            <div className="field">
              <label>Rol</label>
              <select className="inp" value={editUsu.rol}
                onChange={(e) => setEditUsu({ ...editUsu, rol: e.target.value })}>
                <option value="mozo">Mozo</option>
                <option value="caja">Caja</option>
                <option value="jefe">Jefe</option>
              </select>
            </div>
            <div className="btn-row">
              <button className="btn" onClick={() => guardarUsuario(editUsu)}>Guardar</button>
              <button className="btn sec" onClick={() => setEditUsu(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Precios({ p, alGuardar }) {
  const [precio, setPrecio] = useState(p.precio);
  return (
    <tr>
      <td>{p.nombre}<div className="hint">{p.categoria}</div></td>
      <td className="r">{money(p.precio)}</td>
      <td className="r">
        <input className="inp" style={{ width: 78, textAlign: 'right', padding: '5px 7px' }}
          value={precio} inputMode="decimal" onChange={(e) => setPrecio(e.target.value)} />
      </td>
      <td className="r">
        <button className="btn sm" onClick={async () => {
          await api('/api/admin/productos', {
            method: 'POST',
            body: { id: p.id, categoria_id: p.categoria_id, nombre: p.nombre, precio: Number(precio), descripcion: p.descripcion, activo: 1 },
          });
          alGuardar();
        }}>OK</button>
      </td>
    </tr>
  );
}
