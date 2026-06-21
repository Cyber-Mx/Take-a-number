// server.js - Servidor principal FOFEL Toma de Turnos
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Pasar io a las rutas
app.set('io', io);

// ============================================================
// RUTAS DE PÁGINAS
// ============================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/inicio', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'inicio.html'));
});

app.get('/turno', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'turno.html'));
});

app.get('/vista', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vista.html'));
});

app.get('/mostrador', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mostrador.html'));
});

// ============================================================
// RUTAS API
// ============================================================
app.use('/api/videos', require('./routes/videos'));
app.use('/api/impresora', require('./routes/impresora'));
app.use('/api/inicio-dia', require('./routes/inicioDia'));
app.use('/api/ticket', require('./routes/ticket'));
app.use('/api/terminales', require('./routes/terminales'));
app.use('/api/folios', require('./routes/folios'));
app.use('/api/turno', require('./routes/turno'));
app.use('/api/mostrador', require('./routes/mostrador'));
app.use('/api/clima', require('./routes/clima'));

// ============================================================
// SOCKET.IO - Tiempo real
// ============================================================
io.on('connection', (socket) => {
  console.log(`[Socket] Cliente conectado: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[Socket] Cliente desconectado: ${socket.id}`);
  });

  // Unirse a sala de vista
  socket.on('join-vista', () => {
    socket.join('vista');
  });

  // Unirse a sala de mostrador
  socket.on('join-mostrador', (mac) => {
    socket.join('mostrador');
    socket.data.mac = mac;
  });
});

// Exportar io para uso en rutas
module.exports.io = io;

// ============================================================
// INICIO DEL SERVIDOR
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🔧 FOFEL - Sistema de Turnos`);
  console.log(`📡 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`   /          → Página principal`);
  console.log(`   /inicio    → Configuración`);
  console.log(`   /turno     → Toma de turno`);
  console.log(`   /vista     → Pantalla de presentación`);
  console.log(`   /mostrador → Atención al cliente\n`);
});
