// routes/videos.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// GET todos los videos
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM videos ORDER BY numero ASC'
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST crear video
router.post('/', async (req, res) => {
  const { numero, nombre, ruta } = req.body;
  if (!numero || !nombre || !ruta) {
    return res.status(400).json({ ok: false, error: 'Campos requeridos: numero, nombre, ruta' });
  }
  try {
    const result = await db.query(
      'INSERT INTO videos (numero, nombre, ruta) VALUES ($1,$2,$3) RETURNING *',
      [numero, nombre, ruta]
    );
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT actualizar video
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { numero, nombre, ruta } = req.body;
  try {
    const result = await db.query(
      'UPDATE videos SET numero=$1, nombre=$2, ruta=$3, updated_at=NOW() WHERE id=$4 RETURNING *',
      [numero, nombre, ruta, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: 'Video no encontrado' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE eliminar video
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM videos WHERE id=$1', [id]);
    res.json({ ok: true, message: 'Video eliminado' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
