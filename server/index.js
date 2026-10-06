import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { db, getConfig, setConfig, nuevoToken, DB_PATH } from './db.js';
import { auth, requerirRol, init } from './auth.js';
import { hashClave, nuevoSalt, normalizarUsuario, verificarClave } from './clave.js';
import { registrarRutasPedidos } from './routes/pedidos.js';
import { registrarRutasCaja } from './routes/caja.js';
import { registrarRutasInventario } from './routes/inventario.js';
import { registrarRutasAdmin } from './routes/admin.js';
import { registrarRutasReportes } from './routes/reportes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';

app.use(express.json({ limit: '2mb' }));
app.disable('x-powered-by');

// Solo se acepta traffic de loopback o de la red local privada.
// El firewall de Windows ya bloquea la red publica; esto es la segunda barrera.
const RedesLocales = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || '';
  const limpio = ip.replace(/^::ffff:/, '');
  if (RedesLocales.has(ip) || RedesLocales.has(limpio)) return next();
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(limpio)) return next();
  res.status(403).json({ error: 'Acceso denegado: solo red local' });
});

app.use('/api', auth);

app.get('/api/health', (req, res) =>
  res.json({ ok: true, hora: new Date().toISOString(), db: path.basename(DB_PATH) })
);

// Login publico (usuario + contrasena, ambas contra hash en la BD)
app.post('/api/login', (req, res) => {
  const { usuario, clave } = req.body || {};
  const user = normalizarUsuario(usuario);
  const valor = String(clave ?? '');
  if (!user || !valor) return res.status(400).json({ error: 'Escribe tu usuario y contrasena' });

  const u = db
    .prepare(
      `SELECT id, nombre, rol, pin_hash, pin_salt, debe_cambiar_clave
       FROM usuarios WHERE usuario = ? AND activo = 1`
    )
    .get(user);

  if (!u || !verificarClave(valor, u.pin_hash, u.pin_salt))
    return res.status(401).json({ error: 'Usuario o contrasena incorrectos' });

  const token = nuevoToken();
  db.prepare('INSERT INTO sesiones (token, usuario_id) VALUES (?,?)').run(token, u.id);
  res.json({
    token,
    usuario: {
      id: u.id,
      nombre: u.nombre,
      rol: u.rol,
      usuario: user,
      debe_cambiar_clave: !!u.debe_cambiar_clave,
    },
  });
});

// Cambio de contrasena del propio usuario (con la actual)
app.post('/api/cuenta/clave', (req, res) => {
  const { actual, nueva } = req.body || {};
  if (String(nueva || '').length < 4)
    return res.status(400).json({ error: 'La contrasena debe tener al menos 4 caracteres' });

  const u = db.prepare('SELECT pin_hash, pin_salt FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!verificarClave(String(actual || ''), u.pin_hash, u.pin_salt))
    return res.status(400).json({ error: 'La contrasena actual no es correcta' });

  const salt = nuevoSalt();
  db.prepare('UPDATE usuarios SET pin_hash = ?, pin_salt = ?, debe_cambiar_clave = 0 WHERE id = ?')
    .run(hashClave(String(nueva), salt), salt, req.usuario.id);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
  res.json({ ok: true });
});

app.get('/api/yo', (req, res) => res.json(req.usuario));

registrarRutasPedidos(app);
registrarRutasCaja(app);
registrarRutasInventario(app);
registrarRutasAdmin(app);
registrarRutasReportes(app);

// Cliente compilado
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (req, res) =>
    res.send('<h1>Broasteria API</h1><p>Ejecuta <code>npm run dev:client</code> para el frontend, o <code>npm run build</code>.</p>')
  );
}

init();

// El servidor nunca debe caerse por un error puntual: se registra y sigue.
process.on('uncaughtException', (e) => console.error('Error no capturado:', e));
process.on('unhandledRejection', (e) => console.error('Promesa rechazada:', e));

app.listen(PORT, HOST, () => {
  const nets = os.networkInterfaces();
  const locales = [];
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && /^192\.168\.|^10\./.test(n.address)) locales.push(n.address);
    }
  }
  console.log(`\n  Broasteria  ->  http://localhost:${PORT}`);
  locales.forEach((ip) => console.log(`  Red local    ->  http://${ip}:${PORT}`));
  console.log(`\n  Base de datos: ${DB_PATH}`);
  console.log(`  PINs: Jefe 0000 | Caja 1111 | Mozo 2222\n`);
});
