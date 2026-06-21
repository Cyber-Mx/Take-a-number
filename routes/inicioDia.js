// routes/inicioDia.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// GET configuración de hoy
router.get('/', async (req, res) => {
  try {
    const hoy = new Intl.DateTimeFormat('en-CA').format(new Date());
    /*const hoy = new Date().toISOString().split('T')[0];*/
    const result = await db.query(
      'SELECT * FROM inicio_dia WHERE fecha=$1',[hoy]
    );
    res.json({ ok: true, data: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET todos los registros
router.get('/todos', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM inicio_dia ORDER BY fecha DESC LIMIT 30');
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST crear inicio del día
router.post('/', async (req, res) => {
  const { folio_inicio, nombre_sucursal, fecha } = req.body;
  if (!folio_inicio || !nombre_sucursal) {
    return res.status(400).json({ ok: false, error: 'folio_inicio y nombre_sucursal son requeridos' });
  }
  const folioNum = parseInt(folio_inicio);
  if (folioNum < 1000 || folioNum > 9999) {
    return res.status(400).json({ ok: false, error: 'Folio debe ser entero de 4 dígitos (1000-9999)' });
  }
  if (nombre_sucursal.length > 20) {
    return res.status(400).json({ ok: false, error: 'Nombre de sucursal máximo 20 caracteres' });
  }
  const fechaUso = fecha || new Intl.DateTimeFormat('en-CA').format(new Date());
  /*const fechaUso = fecha || new Date().toISOString().split('T')[0];*/

  try {
    const result = await db.query(
      `INSERT INTO inicio_dia (folio_inicio, folio_actual, nombre_sucursal, fecha)
       VALUES ($1,$1,$2,$3)
       ON CONFLICT (fecha) DO UPDATE
         SET folio_inicio=$1, folio_actual=$1, nombre_sucursal=$2, updated_at=NOW()
       RETURNING *`,
      [folioNum, nombre_sucursal, fechaUso]
    );
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT actualizar un registro específico
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { folio_inicio, nombre_sucursal, fecha } = req.body;
  try {
    const result = await db.query(
      `UPDATE inicio_dia SET folio_inicio=$1, nombre_sucursal=$2, fecha=$3, updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [folio_inicio, nombre_sucursal, fecha, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
