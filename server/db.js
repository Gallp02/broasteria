import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.BROASTERIA_DB || path.join(DATA_DIR, 'broasteria.db');

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS usuarios (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre   TEXT    NOT NULL,
  usuario  TEXT    UNIQUE,
  pin_hash TEXT,
  pin_salt TEXT,
  debe_cambiar_clave INTEGER NOT NULL DEFAULT 0,
  rol      TEXT    NOT NULL CHECK (rol IN ('mozo','caja','jefe')),
  activo   INTEGER NOT NULL DEFAULT 1,
  creado   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  );

CREATE TABLE IF NOT EXISTS categorias (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT    NOT NULL UNIQUE,
  orden  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS insumos (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre   TEXT    NOT NULL UNIQUE,
  unidad   TEXT    NOT NULL CHECK (unidad IN ('kg','g','Lt','ml','und','porcion')),
  stock    REAL    NOT NULL DEFAULT 0,
  stock_min REAL   NOT NULL DEFAULT 0,
  costo    REAL    NOT NULL DEFAULT 0,
  activo   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS productos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria_id INTEGER REFERENCES categorias(id),
  nombre     TEXT    NOT NULL,
  precio     REAL    NOT NULL,
  descripcion TEXT   NOT NULL DEFAULT '',
  imagen     TEXT    NOT NULL DEFAULT '',
  activo     INTEGER NOT NULL DEFAULT 1,
  revisar    INTEGER NOT NULL DEFAULT 0,
  orden      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recetas (
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  insumo_id   INTEGER NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  cantidad    REAL    NOT NULL,
  PRIMARY KEY (producto_id, insumo_id)
);

CREATE TABLE IF NOT EXISTS mesas (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT    NOT NULL UNIQUE,
  zona   TEXT    NOT NULL DEFAULT 'Salon',
  activa INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pedidos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mesa_id    INTEGER REFERENCES mesas(id),
  es_delivery INTEGER   NOT NULL DEFAULT 0,
  cliente_nombre TEXT   NOT NULL DEFAULT '',
  cliente_telefono TEXT NOT NULL DEFAULT '',
  cliente_direccion TEXT NOT NULL DEFAULT '',
  envio      REAL    NOT NULL DEFAULT 0,
  estado_envio TEXT   NOT NULL DEFAULT 'pendiente'
             CHECK (estado_envio IN ('pendiente','en_camino','entregado')),
  mesero_id  INTEGER REFERENCES usuarios(id),
  cajero_id  INTEGER REFERENCES usuarios(id),
  estado     TEXT    NOT NULL DEFAULT 'abierto'
             CHECK (estado IN ('abierto','cerrado','anulado')),
  total      REAL    NOT NULL DEFAULT 0,
  descuento  REAL    NOT NULL DEFAULT 0,
  total_pagar REAL   NOT NULL DEFAULT 0,
  creado     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  cerrado     TEXT
);

CREATE TABLE IF NOT EXISTS pedido_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id   INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad    REAL    NOT NULL,
  precio      REAL    NOT NULL,
  nota        TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS boletas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  numero      TEXT    NOT NULL UNIQUE,
  tipo        TEXT    NOT NULL DEFAULT 'boleta' CHECK (tipo IN ('boleta','factura')),
  pedido_id   INTEGER REFERENCES pedidos(id),
  cliente_doc TEXT    NOT NULL DEFAULT '',
  cliente_nombre TEXT NOT NULL DEFAULT '',
  subtotal    REAL    NOT NULL,
  descuento    REAL    NOT NULL DEFAULT 0,
  igv         REAL    NOT NULL DEFAULT 0,
  total       REAL    NOT NULL,
  metodo_pago TEXT    NOT NULL DEFAULT 'efectivo',
  estado      TEXT    NOT NULL DEFAULT 'emitida' CHECK (estado IN ('emitida','anulada')),
  sunat_id    TEXT,
  sunat_estado TEXT   NOT NULL DEFAULT 'interna',
  xml         TEXT,
  cdr         TEXT,
  creado      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS movimientos_stock (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  insumo_id  INTEGER NOT NULL REFERENCES insumos(id),
  tipo       TEXT    NOT NULL CHECK (tipo IN ('entrada','salida','ajuste','merma')),
  cantidad   REAL    NOT NULL,
  motivo     TEXT    NOT NULL DEFAULT '',
  ref        TEXT    NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  creado     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS compras (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  proveedor  TEXT    NOT NULL DEFAULT '',
  documento  TEXT    NOT NULL DEFAULT '',
  total      REAL    NOT NULL DEFAULT 0,
  usuario_id INTEGER REFERENCES usuarios(id),
  creado     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS compras_items (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  insumo_id INTEGER NOT NULL REFERENCES insumos(id),
  cantidad  REAL    NOT NULL,
  costo     REAL    NOT NULL
);

CREATE TABLE IF NOT EXISTS sesiones (
  token      TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  creado     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_pedidos_estado  ON pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_mesa    ON pedidos(mesa_id);
CREATE INDEX IF NOT EXISTS idx_items_pedido    ON pedido_items(pedido_id);
CREATE INDEX IF NOT EXISTS idx_mov_insumo      ON movimientos_stock(insumo_id);
CREATE INDEX IF NOT EXISTS idx_boletas_creado  ON boletas(creado);
CREATE INDEX IF NOT EXISTS idx_recetas_insumo  ON recetas(insumo_id);
`);

// Migracion: fechas en hora local (no UTC) en todas las tablas con timestamp.
// SQLite guarda el DEFAULT en sqlite_master, y CREATE TABLE IF NOT EXISTS no lo
// cambia en tablas ya creadas, asi que reconstruimos conservando los datos.
{
  const tablas = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND sql LIKE '%datetime(''now'')%'")
    .all();
  for (const { name, sql } of tablas) {
    const nuevo = sql.replace(/datetime\('now'\)/g, "datetime('now','localtime')");
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('PRAGMA legacy_alter_table = ON');
    try {
      db.exec('BEGIN');
      db.exec(`CREATE TABLE ${name}_nuevo AS SELECT * FROM ${name}`);
      db.exec('DROP TABLE ' + name);
      db.exec(nuevo);
      db.exec(`INSERT INTO ${name} SELECT * FROM ${name}_nuevo`);
      db.exec(`DROP TABLE ${name}_nuevo`);
      db.exec('COMMIT');
      console.log(`  fecha local -> ${name}`);
    } catch (e) {
      db.exec('ROLLBACK');
      console.error(`  No se pudo migrar ${name}: ${e.message}`);
    }
    db.exec('PRAGMA legacy_alter_table = OFF');
    db.exec('PRAGMA foreign_keys = ON');
  }
}

// Migracion: cuentas con usuario + contrasena hasheada
{
  const cols = db.prepare('PRAGMA table_info(usuarios)').all().map((c) => c.name);
  if (!cols.includes('usuario')) db.exec('ALTER TABLE usuarios ADD COLUMN usuario TEXT');
  if (!cols.includes('debe_cambiar_clave'))
    db.exec('ALTER TABLE usuarios ADD COLUMN debe_cambiar_clave INTEGER NOT NULL DEFAULT 0');

  // Username derivado del nombre en las cuentas que ya existian
  const sinUsuario = db.prepare('SELECT id, nombre FROM usuarios WHERE usuario IS NULL OR usuario = \'\'').all();
  const normalizar = (t) =>
    String(t).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  for (const u of sinUsuario) {
    let cand = normalizar(u.nombre) || `user${u.id}`;
    let n = 1;
    while (db.prepare('SELECT id FROM usuarios WHERE usuario = ? AND id <> ?').get(cand, u.id)) {
      cand = `${normalizar(u.nombre)}${++n}`;
    }
    db.prepare('UPDATE usuarios SET usuario = ? WHERE id = ?').run(cand, u.id);
    console.log(`  cuenta -> ${u.nombre} = usuario "${cand}"`);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario)');
}

// Migracion: campos de delivery en pedidos (agrega columnas si faltan)
const agregarColumna = (col, def) => {
  const existe = db.prepare('PRAGMA table_info(pedidos)').all().some((c) => c.name === col);
  if (!existe) db.exec(`ALTER TABLE pedidos ADD COLUMN ${col} ${def}`);
};
agregarColumna('es_delivery', 'INTEGER NOT NULL DEFAULT 0');
agregarColumna('cliente_nombre', "TEXT NOT NULL DEFAULT ''");
agregarColumna('cliente_telefono', "TEXT NOT NULL DEFAULT ''");
agregarColumna('cliente_direccion', "TEXT NOT NULL DEFAULT ''");
agregarColumna('envio', 'REAL NOT NULL DEFAULT 0');
agregarColumna('estado_envio', "TEXT NOT NULL DEFAULT 'pendiente'");

// Migracion: PINs con hash + salt (antes en texto plano)
const colsUsuarios = db.prepare('PRAGMA table_info(usuarios)').all().map((c) => c.name);

if (!colsUsuarios.includes('pin_hash') || !colsUsuarios.includes('pin_salt')) {
  // SQLite no permite ALTER COLUMN: reconstruimos la tabla
  const vieja = colsUsuarios.includes('pin') ? 'pin' : 'NULL';
  db.exec(`
    CREATE TABLE usuarios_nueva (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre   TEXT    NOT NULL,
      pin_hash TEXT,
      pin_salt TEXT,
      rol      TEXT    NOT NULL CHECK (rol IN ('mozo','caja','jefe')),
      activo   INTEGER NOT NULL DEFAULT 1,
      creado   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
    INSERT INTO usuarios_nueva (id, nombre, rol, activo, creado, ${vieja})
      SELECT id, nombre, rol, activo, creado, ${vieja} FROM usuarios;
    DROP TABLE usuarios;
    ALTER TABLE usuarios_nueva RENAME TO usuarios;
  `);
}

// Convierte los PINs en texto plano que queden a hash y borra el texto plano
const quedanEnClaro = db.prepare('PRAGMA table_info(usuarios)').all().some((c) => c.name === 'pin');
if (quedanEnClaro) {
  for (const u of db.prepare(`SELECT id, pin FROM usuarios WHERE pin_hash IS NULL`).all()) {
    if (u.pin === null || u.pin === undefined || u.pin === '') continue;
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(String(u.pin), salt, 32).toString('hex');
    db.prepare('UPDATE usuarios SET pin_hash = ?, pin_salt = ?, pin = NULL WHERE id = ?').run(hash, salt, u.id);
  }
}

/**
 * Ejecuta fn dentro de una transaccion. Si lanza error, hace rollback.
 * node:sqlite no trae db.transaction(), asi que lo implementamos aqui.
 */
export function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const r = fn(...args);
      db.exec('COMMIT');
      return r;
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* ya deshecha */ }
      throw e;
    }
  };
}

export function getConfig(key, def = null) {  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : def;
}

export function setConfig(key, value) {
  db.prepare(
    'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

// ── Configurable desde la cuenta jefe: descuento de stock ──
// `pedidos.descuento_stock` guarda la decision al abrir el pedido, para que
// anular lo que se descuento vuelva exactamente lo que se desconto, aunque el
// jefe cambie la configuracion mientras el pedido esta abierto.
function agregarColumnaEn(tabla, columna, ddl) {
  const existe = db
    .prepare(`PRAGMA table_info(${tabla})`)
    .all()
    .some((c) => c.name === columna);
  if (!existe) db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${ddl}`);
}
agregarColumnaEn('pedidos', 'descuento_stock', 'descuento_stock INTEGER NOT NULL DEFAULT 1');
agregarColumnaEn('productos', 'descuenta_stock', 'descuenta_stock INTEGER NOT NULL DEFAULT 1');
if (getConfig('stock_automatico') === null) setConfig('stock_automatico', '1');

/** El descuento automatico por receta esta activo en la configuracion general. */
export function stockAutomaticoActivo() {
  return getConfig('stock_automatico', '1') !== '0';
}

export function nuevoToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export { DB_PATH };
