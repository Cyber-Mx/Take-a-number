// routes/impresora.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const net = require('net');

// GET config impresora
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM config_impresora WHERE id=1');
    res.json({ ok: true, data: result.rows[0] || {} });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT actualizar config impresora
router.put('/', async (req, res) => {
  const { tipo, ip_address, puerto, nombre } = req.body;
  try {
    const result = await db.query(
      `UPDATE config_impresora SET tipo=$1, ip_address=$2, puerto=$3, nombre=$4, updated_at=NOW()
       WHERE id=1 RETURNING *`,
      [tipo || 'ip', ip_address || '', puerto || 9100, nombre || '']
    );
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST probar conexión a impresora
router.post('/probar', async (req, res) => {
  const { ip_address, puerto } = req.body;
  if (!ip_address) return res.status(400).json({ ok: false, error: 'IP requerida' });

  const port = parseInt(puerto) || 9100;
  const socket = new net.Socket();
  let responded = false;

  socket.setTimeout(3000);

  socket.connect(port, ip_address, () => {
    responded = true;
    socket.destroy();
    res.json({ ok: true, message: `Impresora accesible en ${ip_address}:${port}` });
  });

  socket.on('error', (err) => {
    if (!responded) {
      responded = true;
      res.json({ ok: false, error: `No se pudo conectar: ${err.message}` });
    }
  });

  socket.on('timeout', () => {
    if (!responded) {
      responded = true;
      socket.destroy();
      res.json({ ok: false, error: 'Tiempo de espera agotado' });
    }
  });
});

// POST imprimir ticket (usado internamente)
router.post('/imprimir', async (req, res) => {
  const { contenido } = req.body;
  try {
    const cfgResult = await db.query('SELECT * FROM config_impresora WHERE id=1');
    const cfg = cfgResult.rows[0];

    if (!cfg || !cfg.ip_address) {
      return res.json({ ok: false, error: 'Impresora no configurada' });
    }

    // Enviar datos raw a la impresora térmica vía TCP
    const socket = new net.Socket();
    let done = false;

    socket.setTimeout(5000);
    socket.connect(cfg.puerto || 9100, cfg.ip_address, () => {
      // Comandos ESC/POS básicos
      const ESC = '\x1B';
      const GS = '\x1D';
      const commands = [
        `${ESC}@`,            // Reset
        `${ESC}a\x01`,        // Centrar
        `${ESC}!\x30`,        // Fuente grande
        `¡ BIENVENIDO A FOFEL !\n`,
        /*`${ESC}!\x00`,        // Fuente normal*/
        `${ESC}a\x01`,        // Centrar
        contenido,
        '\n\n\n',
        `${GS}V\x41\x03`,    // Cortar papel
      ].join('');

      socket.write(Buffer.from(commands, 'latin1'), () => {
        done = true;
        socket.destroy();
        res.json({ ok: true, message: 'Impresión enviada' });
      });
    });

    socket.on('error', (err) => {
      if (!done) {
        done = true;
        res.json({ ok: false, error: `Error de impresión: ${err.message}` });
      }
    });

    socket.on('timeout', () => {
      if (!done) {
        done = true;
        socket.destroy();
        res.json({ ok: false, error: 'Tiempo agotado al imprimir' });
      }
    });

  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
