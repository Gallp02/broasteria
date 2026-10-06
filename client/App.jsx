import { useState } from 'react';
import { clearToken } from './api.js';
import Pos from './Pos.jsx';
import Cocina from './Cocina.jsx';
import Caja from './Caja.jsx';
import PedidosVivo from './PedidosVivo.jsx';
import Inventario from './Inventario.jsx';
import Dashboard from './Dashboard.jsx';
import Reportes from './Reportes.jsx';
import Admin from './Admin.jsx';

// Mozo y caja tienen exactamente las mismas vistas: ambos toman pedidos y cobran.
// El jefe (owner) es el unico con la vista global de negocio.
const OPERACION = [
  { id: 'caja', label: 'Cobrar', corto: 'Cobrar', comp: Caja, icon: 'cash' },
  { id: 'pos', label: 'Pedidos', corto: 'Pedir', comp: Pos, icon: 'order' },
  { id: 'vivo', label: 'En vivo', corto: 'Vivo', comp: PedidosVivo, icon: 'live' },
  { id: 'cocina', label: 'Cocina', corto: 'Cocina', comp: Cocina, icon: 'kitchen' },
];

const GLOBAL = [
  { id: 'dash', label: 'Panel', comp: Dashboard, icon: 'chart' },
  { id: 'inventario', label: 'Inventario', comp: Inventario, icon: 'box' },
  { id: 'reportes', label: 'Reportes', comp: Reportes, icon: 'report' },
  { id: 'admin', label: 'Config', comp: Admin, icon: 'gear' },
];

const POR_ROL = {
  mozo: OPERACION,
  caja: OPERACION,
  jefe: [
    { id: 'dash', label: 'Panel', comp: Dashboard, icon: 'chart' },
    ...OPERACION,
    { id: 'inventario', label: 'Inventario', comp: Inventario, icon: 'box' },
    { id: 'reportes', label: 'Reportes', comp: Reportes, icon: 'report' },
    { id: 'admin', label: 'Config', comp: Admin, icon: 'gear' },
  ],
};

const ICONOS = {
  chart: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="15" width="7" height="6" rx="1.5" /></>,
  order: <><path d="M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M8.5 7h7M8.5 11h7M8.5 15h4" /></>,
  kitchen: <><path d="M7 2v8a3 3 0 0 0 6 0V2M10 13v9" /><path d="M17 2c-1.5 1.5-2 3-2 5s.5 3.5 2 5V2zM17 13v9" /></>,
  cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>,
  live: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
  box: <><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5M12 21v-8" /></>,
  report: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" /><path d="M14 3v6h6M8 17v-3M12 17v-6M16 17v-2" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>,
};

function Icono({ nombre }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONOS[nombre] || ICONOS.order}
    </svg>
  );
}

const ROL_TXT = { jefe: 'Jefe', caja: 'Caja', mozo: 'Mozo' };
const ROL_COLOR = { jefe: 'var(--brand)', caja: 'var(--info)', mozo: 'var(--ok)' };

export default function App({ user, onLogout }) {
  const pestanas = POR_ROL[user.rol] || POR_ROL.mozo;
  const [vista, setVista] = useState(pestanas[0].id);
  const [pedidoActual, setPedidoActual] = useState(null);
  const [toast, setToast] = useState(null);
  const [menu, setMenu] = useState(false);

  const Actual = pestanas.find((p) => p.id === vista)?.comp || pestanas[0].comp;
  const esJefe = user.rol === 'jefe';
  const globales = pestanas.filter((p) => GLOBAL.some((g) => g.id === p.id));
  const operativas = pestanas.filter((p) => !GLOBAL.some((g) => g.id === p.id));

  function avisar(msg, tipo = '') {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 2600);
  }

  function salir() {
    clearToken();
    onLogout();
  }

  const boton = (p) => (
    <button
      key={p.id}
      className={`task ${vista === p.id ? 'on' : ''}`}
      onClick={() => { setVista(p.id); setMenu(false); }}
      aria-current={vista === p.id ? 'page' : undefined}
    >
      <Icono nombre={p.icon} />
      <span className="task-lbl">{p.label}</span>
    </button>
  );

  return (
    <div className="app">
      <header className="topbar">
        <img className="brand-logo" src="/logo.png" alt="" />
        <div className="brand-txt">
          <h1>Broastería</h1>
          <span className="brand-sub">Pedidos · Cocina · Caja</span>
        </div>

        <div className="spacer" />

        <span className="rol-chip" style={{ '--rol': ROL_COLOR[user.rol] }}>
          <i /> {ROL_TXT[user.rol]}
        </span>
        <span className="user-chip">{user.nombre}</span>

        <button className="btn sec sm salir" onClick={salir}>Salir</button>

        {esJefe && (
          <button className="menu-btn" onClick={() => setMenu((v) => !v)} aria-label="Mas vistas">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
      </header>

      <nav className="taskbar">
        {operativas.map(boton)}
        {esJefe && <span className="task-sep" />}
        {globales.map(boton)}
      </nav>

      {menu && esJefe && (
        <div className="task-menu" onClick={() => setMenu(false)}>
          {globales.map((p) => (
            <button key={p.id} className={vista === p.id ? 'on' : ''} onClick={() => { setVista(p.id); setMenu(false); }}>
              <Icono nombre={p.icon} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      )}

      <main className={`content vista-${vista}`}>
        <Actual
          user={user}
          avisar={avisar}
          pedidoActual={pedidoActual}
          setPedidoActual={setPedidoActual}
          irA={setVista}
        />
      </main>

      {toast && <div className={`toast ${toast.tipo}`}>{toast.msg}</div>}
    </div>
  );
}