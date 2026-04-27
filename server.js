// server.js — Tienda Pro Backend
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const multer     = require('multer');
const { v4: uuid } = require('uuid');
const db         = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── DIRECTORIO DE UPLOADS ──────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── MIDDLEWARE ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Servir archivos estáticos (HTML de los frontends)
app.use(express.static(path.join(__dirname, 'public')));
// Servir imágenes subidas
app.use('/uploads', express.static(UPLOADS_DIR));

// ─── MULTER (upload de imágenes) ─────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, uuid() + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB por imagen
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'));
  },
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function buildImageUrl(req, filename) {
  if (!filename) return null;
  // En Railway usa la URL pública; en local usa localhost
  const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  return `${base}/uploads/${filename}`;
}

function getProductoFull(req, id) {
  const p = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
  if (!p) return null;
  const imgs = db.prepare(
    'SELECT id, filename, orden FROM producto_imagenes WHERE producto_id = ? ORDER BY orden ASC'
  ).all(id);
  p.imagenes = imgs.map(img => ({
    id:       img.id,
    filename: img.filename,
    url:      buildImageUrl(req, img.filename),
  }));
  p.publicado = !!p.publicado;
  return p;
}

// ─── CONFIG ───────────────────────────────────────────────────────────────────

// GET /api/config
app.get('/api/config', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM config').all();
  const cfg  = {};
  rows.forEach(r => (cfg[r.key] = r.value));
  res.json(cfg);
});

// PATCH /api/config
app.patch('/api/config', (req, res) => {
  const upsert = db.prepare(
    `INSERT INTO config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  const updates = req.body; // { whatsapp: '...', store_name: '...' }
  Object.entries(updates).forEach(([k, v]) => upsert.run(k, String(v)));
  res.json({ ok: true });
});

// ─── PRODUCTOS ────────────────────────────────────────────────────────────────

// GET /api/productos — lista (con imágenes)
app.get('/api/productos', (req, res) => {
  const { publicado, search } = req.query;
  let sql = 'SELECT * FROM productos WHERE 1=1';
  const params = [];

  if (publicado !== undefined) {
    sql += ' AND publicado = ?';
    params.push(publicado === '1' || publicado === 'true' ? 1 : 0);
  }
  if (search) {
    sql += ' AND (nombre LIKE ? OR categoria LIKE ? OR talla LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q);
  }
  sql += ' ORDER BY id DESC';

  const prods = db.prepare(sql).all(...params);
  const result = prods.map(p => {
    const imgs = db.prepare(
      'SELECT id, filename, orden FROM producto_imagenes WHERE producto_id = ? ORDER BY orden ASC'
    ).all(p.id);
    p.imagenes = imgs.map(img => ({
      id:       img.id,
      filename: img.filename,
      url:      buildImageUrl(req, img.filename),
    }));
    p.publicado = !!p.publicado;
    return p;
  });
  res.json(result);
});

// GET /api/productos/:id
app.get('/api/productos/:id', (req, res) => {
  const p = getProductoFull(req, req.params.id);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(p);
});

// POST /api/productos — crear
app.post('/api/productos', (req, res) => {
  const { nombre, categoria, talla, color, pais_origen, costo, precio, stock, descripcion, publicado } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

  const stmt = db.prepare(`
    INSERT INTO productos (nombre, categoria, talla, color, pais_origen, costo, precio, stock, descripcion, publicado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    nombre,
    categoria || '',
    talla     || '',
    color     || '',
    pais_origen || 'USA',
    +costo  || 0,
    +precio || 0,
    +stock  || 0,
    descripcion || '',
    publicado === false ? 0 : 1
  );
  res.status(201).json(getProductoFull(req, info.lastInsertRowid));
});

// PUT /api/productos/:id — actualizar datos (sin imágenes)
app.put('/api/productos/:id', (req, res) => {
  const { nombre, categoria, talla, color, pais_origen, costo, precio, stock, descripcion, publicado } = req.body;
  const exists = db.prepare('SELECT id FROM productos WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'Producto no encontrado' });

  db.prepare(`
    UPDATE productos
    SET nombre=?, categoria=?, talla=?, color=?, pais_origen=?, costo=?, precio=?, stock=?, descripcion=?, publicado=?
    WHERE id=?
  `).run(
    nombre,
    categoria   || '',
    talla       || '',
    color       || '',
    pais_origen || 'USA',
    +costo  || 0,
    +precio || 0,
    +stock  || 0,
    descripcion || '',
    publicado === false ? 0 : 1,
    req.params.id
  );
  res.json(getProductoFull(req, req.params.id));
});

// DELETE /api/productos/:id
app.delete('/api/productos/:id', (req, res) => {
  // Borrar imágenes físicas del disco
  const imgs = db.prepare('SELECT filename FROM producto_imagenes WHERE producto_id = ?').all(req.params.id);
  imgs.forEach(img => {
    const fp = path.join(UPLOADS_DIR, img.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  db.prepare('DELETE FROM productos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── IMÁGENES DE PRODUCTO ─────────────────────────────────────────────────────

// POST /api/productos/:id/imagenes — subir 1 o varias imágenes
app.post('/api/productos/:id/imagenes', upload.array('imagenes', 10), (req, res) => {
  const p = db.prepare('SELECT id FROM productos WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });

  const insertImg = db.prepare(
    'INSERT INTO producto_imagenes (producto_id, filename, orden) VALUES (?, ?, ?)'
  );
  // Obtener máximo orden actual
  const maxOrden = db.prepare(
    'SELECT COALESCE(MAX(orden), -1) as m FROM producto_imagenes WHERE producto_id = ?'
  ).get(req.params.id).m;

  const inserted = [];
  req.files.forEach((file, i) => {
    const info = insertImg.run(req.params.id, file.filename, maxOrden + 1 + i);
    inserted.push({
      id:       info.lastInsertRowid,
      filename: file.filename,
      url:      buildImageUrl(req, file.filename),
    });
  });
  res.status(201).json(inserted);
});

// DELETE /api/imagenes/:id — eliminar imagen individual
app.delete('/api/imagenes/:id', (req, res) => {
  const img = db.prepare('SELECT * FROM producto_imagenes WHERE id = ?').get(req.params.id);
  if (!img) return res.status(404).json({ error: 'Imagen no encontrada' });
  const fp = path.join(UPLOADS_DIR, img.filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  db.prepare('DELETE FROM producto_imagenes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── REVENDEDORES ─────────────────────────────────────────────────────────────

// GET /api/revendedores
app.get('/api/revendedores', (req, res) => {
  const { search } = req.query;
  let sql = 'SELECT * FROM revendedores WHERE 1=1';
  const params = [];
  if (search) {
    sql += ' AND (nombre LIKE ? OR telefono LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q);
  }
  sql += ' ORDER BY id DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/revendedores/by-key/:key — login por KEY
app.get('/api/revendedores/by-key/:key', (req, res) => {
  const r = db.prepare('SELECT * FROM revendedores WHERE key = ?').get(req.params.key.toUpperCase());
  if (!r) return res.status(404).json({ error: 'KEY inválida' });
  res.json(r);
});

// POST /api/revendedores
app.post('/api/revendedores', (req, res) => {
  const { nombre, telefono, descuento, notas, key } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  if (!key)    return res.status(400).json({ error: 'La KEY es obligatoria' });

  try {
    const info = db.prepare(`
      INSERT INTO revendedores (nombre, telefono, descuento, notas, key)
      VALUES (?, ?, ?, ?, ?)
    `).run(nombre, telefono || '', +descuento || 0, notas || '', key.toUpperCase());
    res.status(201).json(db.prepare('SELECT * FROM revendedores WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Esa KEY ya existe' });
    throw e;
  }
});

// PUT /api/revendedores/:id
app.put('/api/revendedores/:id', (req, res) => {
  const { nombre, telefono, descuento, notas } = req.body;
  const exists = db.prepare('SELECT id FROM revendedores WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'Revendedor no encontrado' });

  db.prepare(`
    UPDATE revendedores SET nombre=?, telefono=?, descuento=?, notas=? WHERE id=?
  `).run(nombre, telefono || '', +descuento || 0, notas || '', req.params.id);
  res.json(db.prepare('SELECT * FROM revendedores WHERE id = ?').get(req.params.id));
});

// DELETE /api/revendedores/:id
app.delete('/api/revendedores/:id', (req, res) => {
  db.prepare('DELETE FROM revendedores WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── COMPRAS ─────────────────────────────────────────────────────────────────

// GET /api/compras
app.get('/api/compras', (req, res) => {
  res.json(db.prepare('SELECT * FROM compras ORDER BY id DESC').all());
});

// POST /api/compras
app.post('/api/compras', (req, res) => {
  const { ref, proveedor, pais, fecha, estado, cprod, cenvio, otros, notas } = req.body;
  const info = db.prepare(`
    INSERT INTO compras (ref, proveedor, pais, fecha, estado, cprod, cenvio, otros, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ref || '', proveedor || '', pais || 'USA', fecha || '',
    estado || 'En tránsito',
    +cprod || 0, +cenvio || 0, +otros || 0, notas || ''
  );
  res.status(201).json(db.prepare('SELECT * FROM compras WHERE id = ?').get(info.lastInsertRowid));
});

// PATCH /api/compras/:id/llego — marcar como llegó
app.patch('/api/compras/:id/llego', (req, res) => {
  db.prepare(`UPDATE compras SET estado='Llegó', fecha_llegada=date('now') WHERE id=?`).run(req.params.id);
  res.json(db.prepare('SELECT * FROM compras WHERE id = ?').get(req.params.id));
});

// DELETE /api/compras/:id
app.delete('/api/compras/:id', (req, res) => {
  db.prepare('DELETE FROM compras WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── VENTAS ──────────────────────────────────────────────────────────────────

// GET /api/ventas
app.get('/api/ventas', (req, res) => {
  const ventas = db.prepare('SELECT * FROM ventas ORDER BY id DESC').all();
  const result = ventas.map(v => {
    v.items = db.prepare('SELECT * FROM venta_items WHERE venta_id = ?').all(v.id);
    return v;
  });
  res.json(result);
});

// POST /api/ventas — registrar venta y descontar stock
app.post('/api/ventas', (req, res) => {
  const { cliente, metodo, total, items } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'El carrito está vacío' });

  // Verificar stock suficiente
  for (const item of items) {
    const prod = db.prepare('SELECT stock FROM productos WHERE id = ?').get(item.id);
    if (prod && prod.stock < item.qty) {
      return res.status(409).json({ error: `Stock insuficiente para "${item.nombre}"` });
    }
  }

  // Todo en una transacción
  const registrar = db.transaction(() => {
    const ventaInfo = db.prepare(`
      INSERT INTO ventas (cliente, metodo, total, fecha)
      VALUES (?, ?, ?, datetime('now'))
    `).run(cliente || 'Cliente general', metodo || 'Efectivo', +total || 0);

    const insertItem = db.prepare(`
      INSERT INTO venta_items (venta_id, producto_id, nombre, qty, precio)
      VALUES (?, ?, ?, ?, ?)
    `);
    const decreaseStock = db.prepare(`
      UPDATE productos SET stock = MAX(0, stock - ?) WHERE id = ?
    `);

    items.forEach(item => {
      insertItem.run(ventaInfo.lastInsertRowid, item.id || null, item.nombre, item.qty, item.precio);
      if (item.id) decreaseStock.run(item.qty, item.id);
    });

    return ventaInfo.lastInsertRowid;
  });

  const newId = registrar();
  const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(newId);
  venta.items = db.prepare('SELECT * FROM venta_items WHERE venta_id = ?').all(newId);
  res.status(201).json(venta);
});

// ─── DASHBOARD STATS ─────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const ventasHoy = db.prepare(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as ing FROM ventas WHERE date(fecha) = ?`
  ).get(today);
  const totalVentas = db.prepare(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as ing FROM ventas`
  ).get();
  const productos  = db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(stock),0) as stock FROM productos`).get();
  const revendedores = db.prepare(`SELECT COUNT(*) as cnt FROM revendedores`).get();

  // Top productos más vendidos
  const top = db.prepare(`
    SELECT vi.nombre, SUM(vi.qty) as total_qty
    FROM venta_items vi
    GROUP BY vi.nombre
    ORDER BY total_qty DESC
    LIMIT 5
  `).all();

  res.json({
    ventas_hoy:       ventasHoy.cnt,
    ingresos_hoy:     ventasHoy.ing,
    total_ventas:     totalVentas.cnt,
    total_ingresos:   totalVentas.ing,
    total_productos:  productos.cnt,
    total_stock:      productos.stock,
    total_revendedores: revendedores.cnt,
    top_productos:    top,
  });
});

// ─── FALLBACK → sirve index.html para SPA ────────────────────────────────────
app.get('*', (req, res) => {
  const index = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(index)) res.sendFile(index);
  else res.status(404).json({ error: 'Not found' });
});

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Tienda Pro backend corriendo en puerto ${PORT}`);
  console.log(`   API:      http://localhost:${PORT}/api`);
  console.log(`   Frontend: http://localhost:${PORT}`);
});
