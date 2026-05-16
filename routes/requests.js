const express  = require('express');
const router   = express.Router();
const db       = require('../config/db');
const { protect, authorize } = require('../middleware/auth');

const SELECT_REQUEST = `
  SELECT
    r.*,
    c.id   AS client_id,   c.name   AS client_name,   c.email AS client_email,   c.phone AS client_phone,
    t.id   AS t_id,        t.name   AS t_name,         t.email AS t_email,        t.phone AS t_phone
  FROM requests r
  LEFT JOIN users c ON r.client_id      = c.id
  LEFT JOIN users t ON r.transporter_id = t.id
`;

function formatRequest(row) {
  if (!row) return null;
  return {
    _id           : row.id,
    fromLocation  : row.from_location,
    toLocation    : row.to_location,
    vehicleType   : row.vehicle_type,
    description   : row.description,
    weight        : row.weight,
    scheduledDate : row.scheduled_date,
    estimatedPrice: row.estimated_price,
    finalPrice    : row.final_price,
    status        : row.status,
    createdAt     : row.created_at,
    updatedAt     : row.updated_at,
    client: row.client_id ? {
      _id: row.client_id, name: row.client_name,
      email: row.client_email, phone: row.client_phone
    } : null,
    transporter: row.t_id ? {
      _id: row.t_id, name: row.t_name,
      email: row.t_email, phone: row.t_phone
    } : null,
  };
}

// GET /api/requests
router.get('/', protect, async (req, res) => {
  try {
    let sql = SELECT_REQUEST;
    let params = [];

    if (req.user.role === 'client') {
      sql += ' WHERE r.client_id = ? ORDER BY r.created_at DESC';
      params = [req.user.id];
    } else if (req.user.role === 'transporter') {
      sql += ` WHERE r.status IN ('pending','accepted','in_progress') ORDER BY r.created_at DESC`;
    } else {
      sql += ' ORDER BY r.created_at DESC';
    }

    const [rows] = await db.query(sql, params);
    res.json(rows.map(formatRequest));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/requests
router.post('/', protect, authorize('client'), async (req, res) => {
  const { fromLocation, toLocation, vehicleType, description, weight, scheduledDate, estimatedPrice } = req.body;
  if (!fromLocation || !toLocation || !vehicleType || !scheduledDate)
    return res.status(400).json({ message: 'Champs obligatoires manquants' });

  try {
    const [result] = await db.query(
      `INSERT INTO requests
         (client_id, from_location, to_location, vehicle_type, description, weight, scheduled_date, estimated_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, fromLocation, toLocation, vehicleType,
       description || '', weight || 0, scheduledDate, estimatedPrice || 0]
    );

    const [rows] = await db.query(SELECT_REQUEST + ' WHERE r.id = ?', [result.insertId]);
    res.status(201).json(formatRequest(rows[0]));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/requests/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const [rows] = await db.query(SELECT_REQUEST + ' WHERE r.id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Demande introuvable' });
    res.json(formatRequest(rows[0]));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/requests/:id/status
router.put('/:id/status', protect, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending','accepted','in_progress','completed','cancelled','rejected'];
  if (!validStatuses.includes(status))
    return res.status(400).json({ message: 'Statut invalide' });

  try {
    const [existing] = await db.query('SELECT * FROM requests WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ message: 'Demande introuvable' });

    // If transporter accepts → assign themselves
    if (req.user.role === 'transporter' && status === 'accepted') {
      await db.query(
        'UPDATE requests SET status = ?, transporter_id = ? WHERE id = ?',
        [status, req.user.id, req.params.id]
      );
    } else {
      await db.query('UPDATE requests SET status = ? WHERE id = ?', [status, req.params.id]);
    }

    const [rows] = await db.query(SELECT_REQUEST + ' WHERE r.id = ?', [req.params.id]);
    res.json(formatRequest(rows[0]));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/requests/:id
router.delete('/:id', protect, authorize('client','admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM requests WHERE id = ?', [req.params.id]);
    res.json({ message: 'Demande supprimée' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
