const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ─────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── STATIC FILES ───────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ─── ENSURE UPLOADS DIR ─────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ─── MULTER CONFIG ──────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

// ─── DATABASE ───────────────────────────────────
const dbPath = process.env.DATABASE_URL ? process.env.DATABASE_URL : path.join(__dirname, 'data.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// ─── INIT TABLES ────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    categoria TEXT,
    talla TEXT,
    color TEXT,
    pais_origen TEXT DEFAULT 'USA',
    costo REAL DEFAULT 0,
    precio REAL DEFAULT 0,
    stock INTEGER DEFAULT 0,
    descripcion TEXT,
    imagenes TEXT DEFAULT '[]',
    publicado INTEGER DEFAULT 1,
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS revendedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    telefono TEXT,
    descuento REAL DEFAULT 0,
    notas TEXT,
    key TEXT UNIQUE NOT NULL,
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS compras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref TEXT,
    proveedor TEXT,
    pais TEXT DEFAULT 'USA',
    fecha TEXT,
    estado TEXT DEFAULT 'En tránsito',
    cprod REAL DEFAULT 0,
    cenvio REAL DEFAULT 0,
    otros REAL DEFAULT 0,
    notas TEXT,
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT,
    cliente TEXT,
    metodo TEXT,
    total REAL DEFAULT 0,
    items TEXT DEFAULT '[]',
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ─── HELPERS ────────────────────────────────────
const now = () => new Date().toISOString();

// ─── PRODUCTOS API ──────────────────────────────
app.get('/api/productos', (req, res) => {
  const { publicado } = req.query;
  let sql = 'SELECT * FROM productos';
  const params = [];
  if (publicado !== undefined) {
    sql += ' WHERE publicado = ?';
    params.push(publicado === '1' || publicado === 'true' ? 1 : 0);
  }
  sql += ' ORDER BY id DESC';
  const rows = db.prepare(sql).all(...params);
  rows.forEach(r => { try { r.imagenes = JSON.parse(r.imagenes || '[]'); } catch { r.imagenes = []; } });
  res.json(rows);
});

app.get('/api/productos/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  try { row.imagenes = JSON.parse(row.imagenes || '[]'); } catch { row.imagenes = []; }
  res.json(row);
});

app.post('/api/productos', upload.array('imagenes', 10), (req, res) => {
  const { nombre, categoria, talla, color, pais_origen, costo, precio, stock, descripcion } = req.body;
  const imagenes = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
  const stmt = db.prepare(`
    INSERT INTO productos (nombre, categoria, talla, color, pais_origen, costo, precio, stock, descripcion, imagenes, publicado, createdAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const result = stmt.run(nombre, categoria, talla, color, pais_origen || 'USA', costo || 0, precio || 0, stock || 0, descripcion, JSON.stringify(imagenes), 1, now());
  res.json({ id: result.lastInsertRowid, ...req.body, imagenes, publicado: 1, createdAt: now() });
});

app.put('/api/productos/:id', upload.array('imagenes', 10), (req, res) => {
  const { nombre, categoria, talla, color, pais_origen, costo, precio, stock, descripcion, publicado, imagenesExistentes } = req.body;
  const existing = db.prepare('SELECT imagenes FROM productos WHERE id = ?').get(req.params.id);
  let oldImages = [];
  try { oldImages = JSON.parse(existing?.imagenes || '[]'); } catch { oldImages = []; }
  
  // Keep existing images if sent, plus new uploads
  let keptImages = [];
  if (imagenesExistentes) {
    try { keptImages = JSON.parse(imagenesExistentes); } catch { keptImages = imagenesExistentes.split(','); }
  }
  const newImages = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
  const merged = [...keptImages, ...newImages];

  const stmt = db.prepare(`
    UPDATE productos SET nombre=?, categoria=?, talla=?, color=?, pais_origen=?, costo=?, precio=?, stock=?, descripcion=?, imagenes=?, publicado=?
    WHERE id=?
  `);
  stmt.run(nombre, categoria, talla, color, pais_origen || 'USA', costo || 0, precio || 0, stock || 0, descripcion, JSON.stringify(merged), publicado !== undefined ? publicado : 1, req.params.id);
  res.json({ id: req.params.id, nombre, categoria, talla, color, pais_origen, costo, precio, stock, descripcion, imagenes: merged, publicado });
});

app.delete('/api/productos/:id', (req, res) => {
  const row = db.prepare('SELECT imagenes FROM productos WHERE id = ?').get(req.params.id);
  if (row) {
    try {
      const imgs = JSON.parse(row.imagenes || '[]');
      imgs.forEach(img => {
        const fp = path.join(__dirname, img.replace('/uploads/', 'uploads/'));
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      });
    } catch {}
  }
  db.prepare('DELETE FROM productos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── REVENDEDORES API ───────────────────────────
app.get('/api/revendedores', (req, res) => {
  res.json(db.prepare('SELECT * FROM revendedores ORDER BY id DESC').all());
});

app.get('/api/revendedores/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM revendedores WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  res.json(row);
});

app.post('/api/revendedores', (req, res) => {
  const { nombre, telefono, descuento, notas, key } = req.body;
  const stmt = db.prepare('INSERT INTO revendedores (nombre, telefono, descuento, notas, key, createdAt) VALUES (?,?,?,?,?,?)');
  const result = stmt.run(nombre, telefono, descuento || 0, notas, key, now());
  res.json({ id: result.lastInsertRowid, ...req.body, createdAt: now() });
});

app.put('/api/revendedores/:id', (req, res) => {
  const { nombre, telefono, descuento, notas } = req.body;
  db.prepare('UPDATE revendedores SET nombre=?, telefono=?, descuento=?, notas=? WHERE id=?')
    .run(nombre, telefono, descuento || 0, notas, req.params.id);
  res.json({ id: req.params.id, ...req.body });
});

app.delete('/api/revendedores/:id', (req, res) => {
  db.prepare('DELETE FROM revendedores WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── COMPRAS API ────────────────────────────────
app.get('/api/compras', (req, res) => {
  res.json(db.prepare('SELECT * FROM compras ORDER BY id DESC').all());
});

app.post('/api/compras', (req, res) => {
  const { ref, proveedor, pais, fecha, estado, cprod, cenvio, otros, notas } = req.body;
  const stmt = db.prepare('INSERT INTO compras (ref, proveedor, pais, fecha, estado, cprod, cenvio, otros, notas, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const result = stmt.run(ref, proveedor, pais || 'USA', fecha, estado || 'En tránsito', cprod || 0, cenvio || 0, otros || 0, notas, now());
  res.json({ id: result.lastInsertRowid, ...req.body, createdAt: now() });
});

app.put('/api/compras/:id', (req, res) => {
  const { estado, fechaLlegada } = req.body;
  db.prepare('UPDATE compras SET estado=?, fecha=? WHERE id=?').run(estado, fechaLlegada, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/compras/:id', (req, res) => {
  db.prepare('DELETE FROM compras WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── VENTAS API ─────────────────────────────────
app.get('/api/ventas', (req, res) => {
  const rows = db.prepare('SELECT * FROM ventas ORDER BY id DESC').all();
  rows.forEach(r => { try { r.items = JSON.parse(r.items || '[]'); } catch { r.items = []; } });
  res.json(rows);
});

app.post('/api/ventas', (req, res) => {
  const { fecha, cliente, metodo, total, items } = req.body;
  const stmt = db.prepare('INSERT INTO ventas (fecha, cliente, metodo, total, items, createdAt) VALUES (?,?,?,?,?,?)');
  const result = stmt.run(fecha, cliente, metodo, total || 0, JSON.stringify(items || []), now());
  
  // Update stock
  if (items && Array.isArray(items)) {
    items.forEach(item => {
      db.prepare('UPDATE productos SET stock = MAX(0, stock - ?) WHERE id = ?').run(item.qty || 1, item.id);
    });
  }
  
  res.json({ id: result.lastInsertRowid, ...req.body, createdAt: now() });
});

app.delete('/api/ventas/:id', (req, res) => {
  db.prepare('DELETE FROM ventas WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── CONFIG / WHATSAPP ──────────────────────────
app.get('/api/config/:key', (req, res) => {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(req.params.key);
  res.json({ value: row?.value || '' });
});

app.post('/api/config/:key', (req, res) => {
  const { value } = req.body;
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?,?)').run(req.params.key, value);
  res.json({ ok: true });
});

// ─── HEALTH CHECK ───────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));

// ─── START ──────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Tienda Pro backend corriendo en puerto ${PORT}`);
});
