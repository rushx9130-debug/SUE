# Tienda Pro — Backend en Railway

Sistema completo de gestión de tienda con backend Express + SQLite.

## Estructura del proyecto

```
tienda-pro/
├── server.js              # API REST (Express)
├── db.js                  # Esquema SQLite (better-sqlite3)
├── package.json
├── railway.json           # Configuración Railway
├── .env.example           # Variables de entorno de ejemplo
├── .gitignore
├── uploads/               # Imágenes subidas (creado automáticamente)
└── public/
    ├── index.html         # Landing con links a los 3 paneles
    ├── panel-admin.html   # Panel de administración
    ├── tienda-publica.html # Tienda para clientes
    └── portal-revendedores.html # Portal con login por KEY
```

## API Endpoints

### Config
- `GET  /api/config` — obtener configuración (whatsapp, store_name)
- `PATCH /api/config` — actualizar configuración

### Productos
- `GET  /api/productos` — listar (soporta `?publicado=1&search=texto`)
- `GET  /api/productos/:id` — obtener uno
- `POST /api/productos` — crear
- `PUT  /api/productos/:id` — editar
- `DELETE /api/productos/:id` — eliminar

### Imágenes
- `POST /api/productos/:id/imagenes` — subir imágenes (multipart/form-data, campo `imagenes`)
- `DELETE /api/imagenes/:id` — eliminar imagen

### Revendedores
- `GET  /api/revendedores` — listar
- `GET  /api/revendedores/by-key/:key` — login por KEY única
- `POST /api/revendedores` — crear
- `PUT  /api/revendedores/:id` — editar
- `DELETE /api/revendedores/:id` — eliminar

### Compras
- `GET  /api/compras` — listar
- `POST /api/compras` — crear
- `PATCH /api/compras/:id/llego` — marcar como llegó
- `DELETE /api/compras/:id` — eliminar

### Ventas
- `GET  /api/ventas` — listar con items
- `POST /api/ventas` — registrar (descuenta stock automáticamente)

### Estadísticas
- `GET  /api/stats` — resumen del dashboard

---

## Desplegar en Railway

### 1. Preparar el repositorio

```bash
cd tienda-pro
git init
git add .
git commit -m "Initial commit"
```

### 2. Crear proyecto en Railway

1. Ve a [railway.app](https://railway.app) → New Project
2. **Deploy from GitHub repo** → selecciona tu repositorio
3. Railway detecta automáticamente Node.js con nixpacks

### 3. Variables de entorno en Railway

En tu proyecto Railway → **Variables** → agrega:

| Variable | Valor |
|----------|-------|
| `PORT` | (Railway lo pone automáticamente, no hace falta) |
| `PUBLIC_URL` | La URL de tu app, ej: `https://tienda-pro-production.up.railway.app` |
| `NODE_ENV` | `production` |

> `PUBLIC_URL` es importante para que las URLs de las imágenes sean correctas.

### 4. Volumen persistente para SQLite + uploads

Railway puede reiniciar los contenedores (los archivos locales se borran).  
Para datos persistentes necesitas un **Volume**:

1. En tu servicio Railway → **Add Volume**
2. Mount path: `/data`
3. En las variables de entorno agrega:
   - `DB_PATH` = `/data/tienda.db`
4. En `server.js` la constante `UPLOADS_DIR` también debe apuntar a `/data/uploads`:
   ```js
   const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
   ```
   Y agrega `UPLOADS_DIR=/data/uploads` en las variables.

### 5. URL de tu app

Una vez desplegado, Railway te da una URL como:
```
https://tienda-pro-production.up.railway.app
```

Esa es tu `PUBLIC_URL`. Los tres HTML estarán disponibles en:
- `/` → Landing con links
- `/panel-admin.html` → Panel Admin  
- `/tienda-publica.html` → Tienda pública
- `/portal-revendedores.html` → Portal revendedores

---

## Desarrollo local

```bash
# Instalar dependencias
npm install

# Copiar y configurar variables de entorno
cp .env.example .env

# Iniciar servidor
npm start
# → http://localhost:3000
```

## Notas importantes

- **SQLite** está incluido (`better-sqlite3`). Para producción con mucho tráfico considera migrar a PostgreSQL usando el plugin de Railway.
- **Imágenes**: se guardan en `uploads/` como archivos físicos. Si usas Railway, configura el volumen persistente como se explica arriba, o migra a Cloudinary/S3 para imágenes.
- El **panel admin no tiene autenticación** por diseño (igual que el original). Si vas a exponer la URL públicamente, agrega una contraseña de acceso básica.
