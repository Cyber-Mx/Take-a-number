# 🔧 FOFEL — Sistema de Control de Turnos

Sistema completo de gestión de turnos para ferretería, desarrollado con Node.js + Express + PostgreSQL + Socket.IO.

---

## 📋 Requisitos

- Node.js v18+
- PostgreSQL 14+
- Impresora térmica compatible con ESC/POS (ancho de papel 80mm/8cm)

---

## 🚀 Instalación

### 1. Clonar / descomprimir el proyecto

```bash
cd tomaaturno
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con sus datos de PostgreSQL:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tomaaturno_db
DB_USER=postgres
DB_PASSWORD=su_password

PORT=3000

# Opcional - para el pronóstico del tiempo (openweathermap.org - cuenta gratuita)
WEATHER_API_KEY=tu api key aqui
WEATHER_CITY=Veracruz
WEATHER_COUNTRY=MX
```

### 4. Crear base de datos

```bash
# En PostgreSQL, crear la base de datos
psql -U postgres -c "CREATE DATABASE tomaaturno_db;"

# Ejecutar el schema
psql -U postgres -d tomaaturno_db -f db/schema.sql
```

### 5. Iniciar el servidor

```bash
# Producción
npm start

# Desarrollo (con reinicio automático)
npm run dev
```

---

## 🖥️ Subdominios / Rutas

| Ruta | Descripción |
|------|-------------|
| `/` | Página principal de bienvenida FOFEL |
| `/inicio` | Panel de configuración del sistema |
| `/turno` | Kiosco para toma de turno por el cliente |
| `/vista` | Pantalla grande de presentación (TV/Monitor) |
| `/mostrador` | Panel del personal de mostrador |

---

## ⚙️ Configuración inicial (en `/inicio`)

### Paso 1 — Videos
Registre los videos promocionales que se reproducirán en la pantalla `/vista`. Indique la ruta del archivo `.mp4` relativa a la carpeta `/public` del proyecto.

Ejemplo de ruta: `/videos/promo01.mp4`

Coloque los archivos de video en: `public/videos/`

### Paso 2 — Impresora
Configure la IP y puerto de la impresora térmica de red.
- Puerto estándar ESC/POS: **9100**
- Use el botón "Probar" para verificar conectividad

### Paso 3 — Sucursal / Día
Configure el folio de inicio y nombre de sucursal para el día de trabajo.
- El folio debe ser un número de 4 dígitos (1000–9999)
- La fecha default es la fecha actual

### Paso 4 — Ticket
Configure el contenido promocional que aparecerá en el ticket impreso.

### Paso 5 — Terminales
Registre cada equipo de mostrador con su dirección MAC y un nombre descriptivo.
- Use el botón "Leer MAC" si el servidor corre en ese mismo equipo
- O ingrese la MAC manualmente

---

## 🖨️ Impresora Térmica

El sistema envía comandos **ESC/POS** directamente por TCP/IP al puerto 9100.

Compatible con:
- Epson TM-T20, TM-T88
- Star TSP100, TSP650
- Bixolon SRP-350
- Cualquier impresora térmica con soporte ESC/POS por red

---

## 🔌 Socket.IO — Tiempo real

Las pantallas `/vista` y `/mostrador` se actualizan en tiempo real mediante WebSockets:

| Evento | Descripción |
|--------|-------------|
| `nuevo-folio` | Se generó un nuevo turno en `/turno` |
| `folio-update` | Cambio de status de un folio |
| `terminal-update` | Terminal cambió de online/offline |

---

## 📊 Estructura del proyecto

```
tomaaturno/
├── server.js              # Servidor principal
├── package.json
├── .env.example
├── db/
│   ├── index.js           # Pool de conexión PostgreSQL
│   └── schema.sql         # Esquema de base de datos
├── routes/
│   ├── videos.js          # CRUD videos
│   ├── impresora.js       # Config e impresión ESC/POS
│   ├── inicioDia.js       # Config de sucursal / día
│   ├── ticket.js          # Config del ticket
│   ├── terminales.js      # CRUD terminales + lectura MAC
│   ├── folios.js          # Registro de turnos
│   ├── turno.js           # Generar turno + imprimir
│   ├── mostrador.js       # Toggle online/offline personal
│   └── clima.js           # Pronóstico del tiempo
└── public/
    ├── index.html         # Página principal
    ├── inicio.html        # Configuración
    ├── turno.html         # Kiosco cliente
    ├── vista.html         # Pantalla presentación
    ├── mostrador.html     # Panel personal
    └── videos/            # Aquí van los archivos .mp4
```

---

## 🌐 Clima (opcional)

Para el pronóstico del tiempo en el pie de página de `/vista`:

1. Cree cuenta gratuita en [openweathermap.org](https://openweathermap.org)
2. Obtenga su API key
3. Configúrela en `.env`:
   ```
   WEATHER_API_KEY=xxxxxxxxxxxx
   WEATHER_CITY=Veracruz
   WEATHER_COUNTRY=MX
   ```

---

## 🔒 Consideraciones de despliegue

- Para múltiples mostradores, cada PC debe abrir `/mostrador` en su navegador
- La MAC del mostrador se detecta automáticamente si Node corre en esa misma PC, o se puede ingresar manualmente
- Se recomienda ejecutar el servidor en una PC dedicada o servidor local de la red
- Use `pm2` para mantener el servidor corriendo en producción:
  ```bash
  npm install -g pm2
  pm2 start server.js --name fofel-turnos
  pm2 startup
  pm2 save
  ```
