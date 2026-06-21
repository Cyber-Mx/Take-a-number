// routes/ticket.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// GET config del ticket
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM config_ticket WHERE id=1');
    res.json({ ok: true, data: result.rows[0] || {} });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT actualizar config del ticket
router.put('/', async (req, res) => {
  const { promocion, codigo, descripcion, precio } = req.body;
  try {
    const result = await db.query(
      `UPDATE config_ticket SET promocion=$1, codigo=$2, descripcion=$3, precio=$4, updated_at=NOW()
       WHERE id=1 RETURNING *`,
      [promocion || '', codigo || '', descripcion || '', parseFloat(precio) || 0]
    );
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
