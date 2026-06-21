// routes/terminales.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const os = require('os');

// GET MAC de la máquina actual
router.get('/mac-local', (req, res) => {
  try {
    const interfaces = os.networkInterfaces();
    const macs = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
          macs.push({ interfaz: name, mac: iface.mac });
        }
      }
    }
    res.json({ ok: true, data: macs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET todas las terminales
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM terminales ORDER BY id ASC');
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST crear terminal
router.post('/', async (req, res) => {
  const { mac, nombre } = req.body;
  if (!mac || !nombre) {
    return res.status(400).json({ ok: false, error: 'mac y nombre son requeridos' });
  }
  try {
    const result = await db.query(
      `INSERT INTO terminales (mac, nombre, status) VALUES ($1,$2,'offline') RETURNING *`,
      [mac.toLowerCase(), nombre]
    );
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'MAC ya registrada' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT actualizar terminal
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { mac, nombre } = req.body;
  try {
    const result = await db.query(
      `UPDATE terminales SET mac=$1, nombre=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
      [mac.toLowerCase(), nombre, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: 'Terminal no encontrada' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE eliminar terminal
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM terminales WHERE id=$1', [id]);
    res.json({ ok: true, message: 'Terminal eliminada' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
