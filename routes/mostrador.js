// routes/mostrador.js
const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ── Migración automática al cargar el módulo ──────────────────
// 1. Ampliar CHECK constraint para permitir status_atencion = 3 (pausado)
// 2. Agregar columna fecha_hora_pausa si no existe
(async () => {
  try {
    await db.query(`ALTER TABLE folios DROP CONSTRAINT IF EXISTS folios_status_atencion_check`);
    await db.query(`ALTER TABLE folios ADD CONSTRAINT folios_status_atencion_check CHECK (status_atencion IN (0,1,2,3))`);
  } catch(e) { console.warn('[Mostrador] CHECK constraint:', e.message); }
  try {
    await db.query(`ALTER TABLE folios ADD COLUMN IF NOT EXISTS fecha_hora_pausa TIMESTAMP DEFAULT NULL`);
  } catch(e) { console.warn('[Mostrador] fecha_hora_pausa:', e.message); }
})();

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
      return res.status(404).json({
        ok: false,
        error: 'Terminal no registrada. Registre esta MAC en /inicio'
      });
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
        // No hay folios pendientes: poner online sin folio asignado
        await db.query(
          `UPDATE terminales SET status='online', folio_actual=NULL, updated_at=NOW() WHERE id=$1`,
          [terminal.id]
        );
        if (io) {
          io.to('vista').emit('terminal-update', {
            id: terminal.id,
            nombre: terminal.nombre,
            status: 'online',
            folio: null
          });
        }
        return res.json({
          ok: true,
          status: 'online',
          folio: null,
          // ► Se incluye 'terminal' para que el frontend pueda usarlo en el anuncio de voz
          terminal: terminal.nombre,
          mensaje: 'Online - sin folios pendientes'
        });
      }

      const folio = folioResult.rows[0];

      // Actualizar terminal
      await db.query(
        `UPDATE terminales SET status='online', folio_actual=$1, updated_at=NOW() WHERE id=$2`,
        [folio.folio, terminal.id]
      );

      // Actualizar folio: asignar terminal y marcar status=1 (atendiendo)
      await db.query(
        `UPDATE folios
         SET terminal_id=$1, status_atencion=1, fecha_hora_inicio_atencion=NOW()
         WHERE id=$2`,
        [terminal.id, folio.id]
      );

      // Emitir actualizaciones en tiempo real
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
        // ► Se incluye 'terminal' con el nombre para que el frontend
        //   pueda construir la frase de voz: "Turno X pase a <terminal>"
        terminal: terminal.nombre
      });

    } else {
      // → Poner OFFLINE: marcar folio actual como atendido
      if (terminal.folio_actual) {
        await db.query(
          `UPDATE folios
           SET status_atencion=2, fecha_hora_fin_atencion=NOW()
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

      return res.json({
        ok: true,
        status: 'offline',
        folio: null,
        // ► Se incluye también en offline para consistencia
        terminal: terminal.nombre
      });
    }

  } catch (err) {
    console.error('[Mostrador] Error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/mostrador/pausar
//
// Pone un turno en pausa:
//   • El folio pasa a status_atencion = 3 (pausado — nuevo estado)
//   • Se graba fecha_hora_pausa = NOW()
//   • La terminal queda offline con folio_actual = NULL
//   • Emite terminal-update y folio-update por socket
// ─────────────────────────────────────────────────────────────
router.post('/pausar', async (req, res) => {
  const { mac } = req.body;
  const io = req.app.get('io');
  if (!mac) return res.status(400).json({ ok: false, error: 'MAC requerida' });

  try {
    const termRes = await db.query(
      'SELECT * FROM terminales WHERE mac=$1', [mac.toLowerCase()]
    );
    if (!termRes.rows.length)
      return res.status(404).json({ ok: false, error: 'Terminal no registrada' });

    const terminal = termRes.rows[0];

    if (terminal.status !== 'online' || !terminal.folio_actual)
      return res.status(400).json({ ok: false, error: 'La terminal no tiene un turno activo' });

    const folioNum = terminal.folio_actual;

    // Marcar el folio como pausado (status_atencion = 3)
    await db.query(`
      UPDATE folios
      SET    status_atencion    = 3,
             terminal_id        = NULL,
             fecha_hora_pausa   = NOW()
      WHERE  folio = $1
        AND  DATE(fecha_hora_toma) = CURRENT_DATE
    `, [folioNum]);

    // Liberar la terminal
    await db.query(`
      UPDATE terminales
      SET status='offline', folio_actual=NULL, updated_at=NOW()
      WHERE id=$1
    `, [terminal.id]);

    if (io) {
      io.to('vista').emit('terminal-update', {
        id: terminal.id, nombre: terminal.nombre, status: 'offline', folio: null
      });
      io.to('vista').emit('folio-update', {
        folio: folioNum, status_atencion: 3, terminal_nombre: null
      });
    }

    res.json({ ok: true, folio: folioNum, terminal: terminal.nombre });

  } catch (err) {
    console.error('[Mostrador] Error /pausar:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/mostrador/retomar
//
// Retoma un turno pausado desde cualquier terminal libre:
//   Body: { mac, folio_id }
//   • Verifica que el folio esté en status 3 (pausado)
//   • Verifica que la terminal esté offline
//   • Folio → status_atencion = 1, terminal_id = terminal.id,
//     fecha_hora_pausa = NULL
//   • Terminal → online, folio_actual = folio
//   • Emite terminal-update y folio-update
// ─────────────────────────────────────────────────────────────
router.post('/retomar', async (req, res) => {
  const { mac, folio_id } = req.body;
  const io = req.app.get('io');
  if (!mac || !folio_id)
    return res.status(400).json({ ok: false, error: 'MAC y folio_id son requeridos' });

  try {
    const termRes = await db.query(
      'SELECT * FROM terminales WHERE mac=$1', [mac.toLowerCase()]
    );
    if (!termRes.rows.length)
      return res.status(404).json({ ok: false, error: 'Terminal no registrada' });

    const terminal = termRes.rows[0];

    if (terminal.status !== 'offline')
      return res.status(400).json({ ok: false, error: 'La terminal ya tiene un turno activo' });

    const folioRes = await db.query(
      'SELECT * FROM folios WHERE id=$1', [folio_id]
    );
    if (!folioRes.rows.length)
      return res.status(404).json({ ok: false, error: 'Folio no encontrado' });

    const folio = folioRes.rows[0];

    if (folio.status_atencion !== 3)
      return res.status(400).json({ ok: false, error: 'El folio no está en pausa' });

    // Reactivar el folio
    await db.query(`
      UPDATE folios
      SET    status_atencion  = 1,
             terminal_id      = $1,
             fecha_hora_pausa = NULL
      WHERE  id = $2
    `, [terminal.id, folio_id]);

    // Asignar terminal
    await db.query(`
      UPDATE terminales
      SET status='online', folio_actual=$1, updated_at=NOW()
      WHERE id=$2
    `, [folio.folio, terminal.id]);

    if (io) {
      io.to('vista').emit('terminal-update', {
        id: terminal.id, nombre: terminal.nombre, status: 'online', folio: folio.folio
      });
      io.to('vista').emit('folio-update', {
        folio: folio.folio, status_atencion: 1, terminal_nombre: terminal.nombre
      });
    }

    res.json({ ok: true, folio: folio.folio, terminal: terminal.nombre });

  } catch (err) {
    console.error('[Mostrador] Error /retomar:', err);
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
