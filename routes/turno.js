// routes/turno.js - Genera un nuevo turno
const express = require('express');
const router = express.Router();
const db = require('../db');
const net = require('net');

// POST generar turno
router.post('/generar', async (req, res) => {
  const io = req.app.get('io');

  try {
    // 1. Obtener configuración de hoy
    const hoy = new Intl.DateTimeFormat('en-CA').format(new Date());
    /*const hoy = new Date().toISOString().split('T')[0];*/
    const configResult = await db.query(
      'SELECT * FROM inicio_dia WHERE fecha=$1', [hoy]
    );

    if (!configResult.rows.length) {
      return res.status(400).json({
        ok: false,
        error: 'No hay configuración de inicio del día para hoy. Configure en /inicio'
      });
    }

    const config = configResult.rows[0];

    // 2. Incrementar folio
    const nuevoFolio = config.folio_actual + 1;
    await db.query(
      'UPDATE inicio_dia SET folio_actual=$1, updated_at=NOW() WHERE id=$2',
      [nuevoFolio, config.id]
    );

    // 3. Crear registro de folio
    const folioResult = await db.query(
      `INSERT INTO folios (folio, nombre_sucursal, status_atencion, status_entrega)
       VALUES ($1, $2, 0, 0) RETURNING *`,
      [nuevoFolio, config.nombre_sucursal]
    );
    const folioReg = folioResult.rows[0];

    // 4. Obtener config de ticket
    const ticketResult = await db.query('SELECT * FROM config_ticket WHERE id=1');
    const ticket = ticketResult.rows[0] || {};

    // 5. Formatear fecha para ticket
    const ahora = new Date();
    const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
                   'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const fechaStr = `${String(ahora.getDate()).padStart(2,'0')}-${meses[ahora.getMonth()]}-${ahora.getFullYear()}`;
    const horaStr = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')} HRS`;

    // 6. Construir contenido del ticket (80mm = ~42 chars)
    const linea = '─'.repeat(32);
    const center = (str, width=32) => {
      const pad = Math.max(0, Math.floor((width - str.length) / 2));
      return ' '.repeat(pad) + str;
    };

    let contenidoTicket = [
      center('¡ BIENVENIDO A FOFEL !'),
      center(config.nombre_sucursal),
      linea,
      center(`TURNO: ${nuevoFolio}`),
      linea,
      ticket.promocion || '',
      ticket.descripcion || '',
      ticket.codigo ? `CODIGO: ${ticket.codigo}` : '',
      ticket.precio ? `A SOLO: $${parseFloat(ticket.precio).toFixed(2)}` : '',
      linea,
      center(`${fechaStr} ${horaStr}`),
      '',
    ].filter(l => l !== undefined).join('\n');

    // 7. Imprimir
    const impResult = await db.query('SELECT * FROM config_impresora WHERE id=1');
    const imp = impResult.rows[0];
    let imprimioOk = false;

    if (imp && imp.ip_address) {
      try {
        await imprimirTicket(imp.ip_address, imp.puerto || 9100, contenidoTicket);
        imprimioOk = true;
      } catch (printErr) {
        console.error('[Impresora] Error:', printErr.message);
      }
    }

    // 8. Emitir evento Socket.IO para actualizar /vista
    if (io) {
      io.to('vista').emit('nuevo-folio', {
        folio: nuevoFolio,
        sucursal: config.nombre_sucursal,
        terminal_nombre: null,
        status_atencion: 0
      });
    }

    res.json({
      ok: true,
      folio: nuevoFolio,
      sucursal: config.nombre_sucursal,
      imprimio: imprimioOk,
      ticket: contenidoTicket
    });

  } catch (err) {
    console.error('[Turno] Error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET info de la sucursal para mostrar en pantalla
router.get('/info-sucursal', async (req, res) => {
  try {
    const hoy = new Intl.DateTimeFormat('en-CA').format(new Date());
    /*const hoy = new Date().toISOString().split('T')[0];*/
    const result = await db.query(
      'SELECT nombre_sucursal, folio_actual FROM inicio_dia WHERE fecha=$1', [hoy]
    );
    res.json({ ok: true, data: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Función interna para imprimir
function imprimirTicket(ip, puerto, contenido) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.connect(puerto, ip, () => {
      const ESC = '\x1B';
      const GS = '\x1D';
      const cmds = Buffer.concat([
        Buffer.from(`${ESC}@`, 'latin1'),     // Reset
        Buffer.from(`${ESC}a\x01`, 'latin1'), // Centrar
        Buffer.from(`${ESC}!\x10`, 'latin1'), // Negrita
        /*Buffer.from('¡ BIENVENIDO A FOFELL !\n', 'latin1'),*/
        /*Buffer.from(`${ESC}!\x00`, 'latin1'), // Normal 02mayo26*/
        Buffer.from(contenido, 'latin1'),
        Buffer.from('\n\n\n', 'latin1'),
        Buffer.from(`${GS}V\x41\x03`, 'latin1'), // Cortar
      ]);
      socket.write(cmds, () => {
        socket.destroy();
        resolve();
      });
    });

    socket.on('error', reject);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Timeout de impresora'));
    });
  });
}

module.exports = router;
