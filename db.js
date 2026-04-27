// db.js — Inicialización y esquema de SQLite
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'tienda.db');
const db = new Database(DB_PATH);

// WAL mode para mejor rendimiento en producción
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── ESQUEMA ─────────────────────────────────────────────────────────────────

db.exec(`
  -- Configuración global de la tienda
  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Productos
  CREATE TABLE IF NOT EXISTS productos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT    NOT NULL,
    categoria   TEXT    DEFAULT '',
    talla       TEXT    DEFAULT '',
    color       TEXT    DEFAULT '',
    pais_origen TEXT    DEFAULT 'USA',
    costo       REAL    DEFAULT 0,
    precio      REAL    DEFAULT 0,
    stock       INTEGER DEFAULT 0,
    descripcion TEXT    DEFAULT '',
    publicado   INTEGER DEFAULT 1,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  -- Imágenes de productos (relación 1:N)
  CREATE TABLE IF NOT EXISTS producto_imagenes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    filename    TEXT    NOT NULL,
    orden       INTEGER DEFAULT 0
  );

  -- Revendedores
  CREATE TABLE IF NOT EXISTS revendedores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre     TEXT    NOT NULL,
    telefono   TEXT    DEFAULT '',
    descuento  REAL    DEFAULT 0,
    notas      TEXT    DEFAULT '',
    key        TEXT    UNIQUE NOT NULL,
    created_at TEXT    DEFAULT (datetime('now'))
  );

  -- Compras del exterior
  CREATE TABLE IF NOT EXISTS compras (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ref          TEXT    DEFAULT '',
    proveedor    TEXT    DEFAULT '',
    pais         TEXT    DEFAULT 'USA',
    fecha        TEXT    DEFAULT '',
    estado       TEXT    DEFAULT 'En tránsito',
    cprod        REAL    DEFAULT 0,
    cenvio       REAL    DEFAULT 0,
    otros        REAL    DEFAULT 0,
    notas        TEXT    DEFAULT '',
    fecha_llegada TEXT   DEFAULT NULL,
    created_at   TEXT    DEFAULT (datetime('now'))
  );

  -- Ventas
  CREATE TABLE IF NOT EXISTS ventas (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha      TEXT    NOT NULL DEFAULT (datetime('now')),
    cliente    TEXT    DEFAULT 'Cliente general',
    metodo     TEXT    DEFAULT 'Efectivo',
    total      REAL    DEFAULT 0
  );

  -- Items de cada venta (relación 1:N)
  CREATE TABLE IF NOT EXISTS venta_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id    INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id INTEGER,
    nombre      TEXT    NOT NULL,
    qty         INTEGER DEFAULT 1,
    precio      REAL    DEFAULT 0
  );
`);

// Valores por defecto de config
const insertConfig = db.prepare(
  `INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)`
);
insertConfig.run('whatsapp', '');
insertConfig.run('store_name', 'Mi Tienda');

module.exports = db;
