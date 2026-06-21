// routes/folios.js
const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ─────────────────────────────────────────────────────────────
// IMPORTANTE: rutas con nombre específico ANTES de /:id
// ─────────────────────────────────────────────────────────────

// GET /api/folios/pendientes  (status_atencion = 0, solo hoy)
router.get('/pendientes', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT f.*, t.nombre AS terminal_nombre
      FROM   folios f
      LEFT JOIN terminales t ON f.terminal_id = t.id
      WHERE  f.status_atencion = 0
        AND  DATE(f.fecha_hora_toma) = CURRENT_DATE
      ORDER  BY f.folio ASC
    `);
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('[Folios] GET /pendientes:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/folios/pausados  (status_atencion = 3)
router.get('/pausados', async (req, res) => {
  try {
    let result;
    try {
      result = await db.query(`
        SELECT f.*,
               COALESCE(s.nombre, f.nombre_sucursal, '') AS nombre_sucursal
        FROM   folios f
        LEFT JOIN inicio_dia s ON DATE(f.fecha_hora_toma) = s.fecha
        WHERE  f.status_atencion = 3
        ORDER  BY f.folio ASC
      `);
    } catch(_) {
      result = await db.query(`
        SELECT f.*,
               COALESCE(f.nombre_sucursal, '') AS nombre_sucursal
        FROM   folios f
        WHERE  f.status_atencion = 3
        ORDER  BY f.folio ASC
      `);
    }
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('[Folios] GET /pausados:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/folios
//
// Query params opcionales:
//   ?desde=YYYY-MM-DD  fecha inicio (inclusive)
//   ?hasta=YYYY-MM-DD  fecha fin    (inclusive)
//   ?todo=1            sin filtro de fecha (historial completo)
// Sin params → solo hoy (comportamiento original)
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { desde, hasta, todo } = req.query;
    const conds = [], vals = [];
    let   idx   = 1;

    if (todo === '1') {
      // sin filtro de fecha: devuelve todo el historial
    } else if (desde || hasta) {
      const ini = desde || new Date().toISOString().slice(0, 10);
      const fin = hasta || new Date().toISOString().slice(0, 10);
      conds.push(`DATE(f.fecha_hora_toma) >= $${idx++}`); vals.push(ini);
      conds.push(`DATE(f.fecha_hora_toma) <= $${idx++}`); vals.push(fin);
    } else {
      // sin parámetros → solo hoy (compatible con código existente)
      conds.push(`DATE(f.fecha_hora_toma) = CURRENT_DATE`);
    }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const result = await db.query(`
      SELECT f.*, t.nombre AS terminal_nombre, t.mac AS terminal_mac
      FROM   folios f
      LEFT JOIN terminales t ON f.terminal_id = t.id
      ${where}
      ORDER  BY f.fecha_hora_toma ASC, f.folio ASC
    `, vals);

    res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('[Folios] GET /:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/folios/:id/cerrar-forzado
// ─────────────────────────────────────────────────────────────
router.post('/:id/cerrar-forzado', async (req, res) => {
  const io      = req.app.get('io');
  const folioId = parseInt(req.params.id, 10);

  if (isNaN(folioId))
    return res.status(400).json({ ok: false, error: 'ID inválido' });

  try {
    const { rows } = await db.query(`
      SELECT f.*, t.nombre AS terminal_nombre, t.id AS tid
      FROM   folios f
      LEFT JOIN terminales t ON f.terminal_id = t.id
      WHERE  f.id = $1
    `, [folioId]);

    if (!rows.length)
      return res.status(404).json({ ok: false, error: 'Folio no encontrado' });

    const folio = rows[0];

    if (folio.status_atencion === 2)
      return res.status(400).json({ ok: false, error: 'El folio ya está cerrado' });

    const ahora = new Date();
    let updated;

    // status 0 (por atender) o 3 (pausado): llenar inicio Y fin con ahora
    if (folio.status_atencion === 0 || folio.status_atencion === 3) {
      const q = await db.query(`
        UPDATE folios
        SET    status_atencion            = 2,
               status_entrega             = 1,
               fecha_hora_inicio_atencion = $1,
               fecha_hora_fin_atencion    = $1
        WHERE  id = $2
        RETURNING *
      `, [ahora, folioId]);
      updated = q.rows[0];
    } else {
      // status 1 (atendiendo): solo llenar fin
      const q = await db.query(`
        UPDATE folios
        SET    status_atencion         = 2,
               status_entrega          = 1,
               fecha_hora_fin_atencion = $1
        WHERE  id = $2
        RETURNING *
      `, [ahora, folioId]);
      updated = q.rows[0];
    }

    // Liberar terminal si estaba asignada
    if (folio.tid) {
      await db.query(`
        UPDATE terminales
        SET    status       = 'offline',
               folio_actual = NULL,
               updated_at   = NOW()
        WHERE  id = $1
      `, [folio.tid]);

      if (io) {
        io.to('vista').emit('terminal-update', {
          id: folio.tid, nombre: folio.terminal_nombre, status: 'offline', folio: null
        });
        io.to('vista').emit('folio-update', {
          folio: folio.folio, status_atencion: 2, terminal_nombre: folio.terminal_nombre
        });
      }
    }

    res.json({ ok: true, data: updated });

  } catch (err) {
    console.error('[Folios] POST /:id/cerrar-forzado:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
