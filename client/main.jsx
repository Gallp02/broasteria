import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import Login from './Login.jsx';
import CambiarClave from './CambiarClave.jsx';
import App from './App.jsx';
import { getToken, api } from './api.js';
import './styles.css';

function Raiz() {
  const [user, setUser] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!getToken()) return setCargando(false);
    api('/api/yo')
      .then(setUser)
      .catch(() => setCargando(false))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <div className="spin">Cargando...</div>;
  if (!user) return <Login onLogin={setUser} />;
  if (user.debe_cambiar_clave)
    return <CambiarClave onListo={() => setUser({ ...user, debe_cambiar_clave: false })} />;
  return <App user={user} onLogout={() => setUser(null)} />;
}

createRoot(document.getElementById('root')).render(<Raiz />);
