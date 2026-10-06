import { useState } from 'react';
import { api } from './api.js';

export default function CambiarClave({ onListo }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [ver, setVer] = useState(false);
  const [err, setErr] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    if (nueva.length < 4) return setErr('La contrasena nueva debe tener al menos 4 caracteres');
    if (nueva !== repetir) return setErr('Las contrasenas nuevas no coinciden');
    if (nueva === actual) return setErr('La contrasena nueva debe ser distinta a la actual');

    setGuardando(true);
    setErr('');
    try {
      await api('/api/cuenta/clave', { method: 'POST', body: { actual, nueva } });
      onListo();
    } catch (e2) {
      setErr(e2.message || 'No se pudo cambiar la contrasena');
      setGuardando(false);
    }
  }

  return (
    <div className="login">
      <div className="login-box">
        <div className="login-logo">
          <img src="/logo.png" alt="Broasteria" />
        </div>
        <h2>Cambia tu contrasena</h2>
        <p>Primer ingreso con esta cuenta. Pon una contrasena solo tuya.</p>

        <form onSubmit={enviar}>
          <div className="field">
            <label>Contrasena actual</label>
            <input
              className="inp"
              type={ver ? 'text' : 'password'}
              value={actual}
              autoComplete="current-password"
              autoFocus
              onChange={(e) => { setActual(e.target.value); setErr(''); }}
            />
          </div>

          <div className="field">
            <label>Contrasena nueva</label>
            <input
              className="inp"
              type={ver ? 'text' : 'password'}
              value={nueva}
              autoComplete="new-password"
              onChange={(e) => { setNueva(e.target.value); setErr(''); }}
            />
          </div>

          <div className="field">
            <label>Repite la nueva</label>
            <input
              className="inp"
              type={ver ? 'text' : 'password'}
              value={repetir}
              autoComplete="new-password"
              onChange={(e) => { setRepetir(e.target.value); setErr(''); }}
            />
          </div>

          <div className="btn-row" style={{ marginTop: 4 }}>
            <button className="btn sec" type="button" onClick={() => setVer((v) => !v)}>
              {ver ? 'Ocultar' : 'Ver'}
            </button>
            <button className="btn" type="submit" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar y entrar'}
            </button>
          </div>
        </form>

        {err && <div className="login-err" style={{ marginTop: 12 }}>{err}</div>}
      </div>
    </div>
  );
}
