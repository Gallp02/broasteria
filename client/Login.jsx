import { useState, useEffect } from 'react';
import { api, setToken } from './api.js';

export default function Login({ onLogin }) {
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [err, setErr] = useState('');
  const [cargando, setCargando] = useState(false);

  async function entrar() {
    if (!usuario.trim()) return setErr('Escribe tu usuario');
    if (!clave) return setErr('Escribe tu contrasena');
    setCargando(true);
    setErr('');
    try {
      const r = await api('/api/login', {
        method: 'POST',
        body: { usuario: usuario.trim(), clave },
      });
      setToken(r.token);
      setClave('');
      onLogin(r.usuario);
    } catch (e) {
      setErr(e.message || 'Usuario o contrasena incorrectos');
      setClave('');
      setCargando(false);
    }
  }

  // Teclado fisico: Enter envia, Backspace borra el campo que corresponda.
  function onKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      entrar();
    }
  }

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="login">
      <div className="login-box">
        <div className="login-logo">
          <img src="/logo-login.png" alt="Broasteria" />
        </div>
        <h2>Broastería</h2>
        <p>Inicia sesión con tu cuenta</p>

        <form
          onSubmit={(e) => { e.preventDefault(); entrar(); }}
        >
          <div className="field">
            <label>Usuario</label>
            <input
              className="inp"
              value={usuario}
              onChange={(e) => { setUsuario(e.target.value); setErr(''); }}
              placeholder="jefe / caja / mozo"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="field">
            <label>Contrasena</label>
            <div className="clave-wrap">
              <input
                className="inp"
                type={verClave ? 'text' : 'password'}
                value={clave}
                onChange={(e) => { setClave(e.target.value); setErr(''); }}
                placeholder="••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="ojo"
                onClick={() => setVerClave((v) => !v)}
                aria-label={verClave ? 'Ocultar' : 'Ver'}
              >
                {verClave ? 'Ocultar' : 'Ver'}
              </button>
            </div>
          </div>

          {err && <div className="login-err">{err}</div>}

          <button className="btn" type="submit" disabled={cargando} style={{ marginTop: 6 }}>
            {cargando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="login-foot">
          Cada persona entra con su cuenta. La contrasena esta cifrada y no se muestra.
        </div>
      </div>
    </div>
  );
}
