// routes/mostrador.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// POST - Terminal toma/suelta turno (toggle online/offline)
router.post('/toggle', async (req, res) => {
  const { mac } = req.body;
  const io = req.app.get('io');

  if (!mac) return res.status(400).json({ ok: false, error: 'MAC requerida' });

  try {
    // Buscar terminal por MAC
    const termResult = await db.query(
      'SELECT * FROM terminales WHERE mac=$1', [mac.toLowerCase()]
    );

    if (!termResult.rows.length) {
      return res.status(404).json({ ok: false, error: 'Terminal no registrada. Registre esta MAC en /inicio' });
    }

    const terminal = termResult.rows[0];

    if (terminal.status === 'offline') {
      // → Poner ONLINE y asignar siguiente folio pendiente
      const folioResult = await db.query(`
        SELECT * FROM folios
        WHERE status_atencion = 0
          AND DATE(fecha_hora_toma) = CURRENT_DATE
        ORDER BY folio ASC
        LIMIT 1
      `);

      if (!folioResult.rows.length) {
        // No hay folios pendientes, poner online sin folio
        await db.query(
          `UPDATE terminales SET status='online', folio_actual=NULL, updated_at=NOW() WHERE id=$1`,
          [terminal.id]
        );
        if (io) io.to('vista').emit('terminal-update', { id: terminal.id, nombre: terminal.nombre, status: 'online', folio: null });
        return res.json({ ok: true, status: 'online', folio: null, mensaje: 'Online - sin folios pendientes' });
      }

      const folio = folioResult.rows[0];

      // Actualizar terminal
      await db.query(
        `UPDATE terminales SET status='online', folio_actual=$1, updated_at=NOW() WHERE id=$2`,
        [folio.folio, terminal.id]
      );

      // Actualizar folio: asignar terminal y marcar status=1 (atendiendo)
      await db.query(
        `UPDATE folios SET terminal_id=$1, status_atencion=1, fecha_hora_inicio_atencion=NOW()
         WHERE id=$2`,
        [terminal.id, folio.id]
      );

      // Emitir actualización en tiempo real
      if (io) {
        io.to('vista').emit('terminal-update', {
          id: terminal.id,
          nombre: terminal.nombre,
          status: 'online',
          folio: folio.folio
        });
        io.to('vista').emit('folio-update', {
          folio: folio.folio,
          status_atencion: 1,
          terminal_nombre: terminal.nombre
        });
      }

      return res.json({
        ok: true,
        status: 'online',
        folio: folio.folio,
        terminal: terminal.nombre
      });

    } else {
      // → Poner OFFLINE: marcar folio actual como atendido
      if (terminal.folio_actual) {
        await db.query(
          `UPDATE folios SET status_atencion=2, fecha_hora_fin_atencion=NOW()
           WHERE folio=$1 AND DATE(fecha_hora_toma)=CURRENT_DATE`,
          [terminal.folio_actual]
        );
        if (io) {
          io.to('vista').emit('folio-update', {
            folio: terminal.folio_actual,
            status_atencion: 2,
            terminal_nombre: terminal.nombre
          });
        }
      }

      await db.query(
        `UPDATE terminales SET status='offline', folio_actual=NULL, updated_at=NOW() WHERE id=$1`,
        [terminal.id]
      );

      if (io) {
        io.to('vista').emit('terminal-update', {
          id: terminal.id,
          nombre: terminal.nombre,
          status: 'offline',
          folio: null
        });
      }

      return res.json({ ok: true, status: 'offline', folio: null });
    }

  } catch (err) {
    console.error('[Mostrador] Error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET - Info de la terminal por MAC
router.get('/terminal/:mac', async (req, res) => {
  const mac = req.params.mac.toLowerCase();
  try {
    const result = await db.query('SELECT * FROM terminales WHERE mac=$1', [mac]);
    res.json({ ok: true, data: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
