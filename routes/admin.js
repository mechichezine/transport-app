const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { protect, authorize } = require('../middleware/auth');

const guard = [protect, authorize('admin')];

// GET /api/admin/stats
router.get('/stats', guard, async (req, res) => {
  try {
    const [[{ total_users }]]        = await db.query('SELECT COUNT(*) AS total_users FROM users');
    const [[{ total_requests }]]     = await db.query('SELECT COUNT(*) AS total_requests FROM requests');
    const [[{ pending_requests }]]   = await db.query("SELECT COUNT(*) AS pending_requests FROM requests WHERE status = 'pending'");
    const [[{ completed_requests }]] = await db.query("SELECT COUNT(*) AS completed_requests FROM requests WHERE status = 'completed'");
    const [[{ total_messages }]]     = await db.query('SELECT COUNT(*) AS total_messages FROM messages');
    const [[{ clients }]]            = await db.query("SELECT COUNT(*) AS clients FROM users WHERE role = 'client'");
    const [[{ transporters }]]       = await db.query("SELECT COUNT(*) AS transporters FROM users WHERE role = 'transporter'");

    res.json({
      totalUsers: total_users, totalRequests: total_requests,
      pendingRequests: pending_requests, completedRequests: completed_requests,
      totalMessages: total_messages, clients, transporters,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/users
router.get('/users', guard, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role, phone, address, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows.map(u => ({ ...u, _id: u.id })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', guard, async (req, res) => {
  const { role, is_active, name, phone } = req.body;
  try {
    const fields = [];
    const vals   = [];
    if (role !== undefined)      { fields.push('role = ?');      vals.push(role); }
    if (is_active !== undefined) { fields.push('is_active = ?'); vals.push(is_active); }
    if (name !== undefined)      { fields.push('name = ?');      vals.push(name); }
    if (phone !== undefined)     { fields.push('phone = ?');     vals.push(phone); }

    if (!fields.length) return res.status(400).json({ message: 'Aucun champ à mettre à jour' });

    vals.push(req.params.id);
    await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, vals);

    const [rows] = await db.query(
      'SELECT id, name, email, role, phone, address, is_active, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    res.json({ ...rows[0], _id: rows[0].id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', guard, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id)
      return res.status(400).json({ message: 'Vous ne pouvez pas vous supprimer vous-même' });
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'Utilisateur supprimé' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/requests
router.get('/requests', guard, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.*,
        c.id AS client_id, c.name AS client_name, c.email AS client_email,
        t.id AS t_id,      t.name AS t_name,       t.email AS t_email
      FROM requests r
      LEFT JOIN users c ON r.client_id      = c.id
      LEFT JOIN users t ON r.transporter_id = t.id
      ORDER BY r.created_at DESC
    `);
    res.json(rows.map(row => ({
      _id: row.id, fromLocation: row.from_location, toLocation: row.to_location,
      vehicleType: row.vehicle_type, status: row.status,
      scheduledDate: row.scheduled_date, estimatedPrice: row.estimated_price,
      description: row.description, weight: row.weight,
      createdAt: row.created_at, updatedAt: row.updated_at,
      client     : row.client_id ? { _id: row.client_id, name: row.client_name, email: row.client_email } : null,
      transporter: row.t_id      ? { _id: row.t_id,      name: row.t_name,      email: row.t_email      } : null,
    })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
