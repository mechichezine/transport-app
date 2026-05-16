const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { protect } = require('../middleware/auth');

// GET /api/messages — conversation list for current user
router.get('/', protect, async (req, res) => {
  try {
    // Get the latest message per conversation partner
    const [rows] = await db.query(`
      SELECT
        m.*,
        s.id AS sender_id, s.name AS sender_name, s.email AS sender_email,
        r.id AS receiver_id, r.name AS receiver_name, r.email AS receiver_email,
        (SELECT COUNT(*) FROM messages unread
         WHERE unread.sender_id = partner_id
           AND unread.receiver_id = ?
           AND unread.is_read = 0) AS unread_count
      FROM messages m
      JOIN users s ON m.sender_id   = s.id
      JOIN users r ON m.receiver_id = r.id
      JOIN (
        SELECT
          IF(sender_id = ?, receiver_id, sender_id) AS partner_id,
          MAX(id) AS max_id
        FROM messages
        WHERE sender_id = ? OR receiver_id = ?
        GROUP BY partner_id
      ) latest ON m.id = latest.max_id
      ORDER BY m.created_at DESC
    `, [req.user.id, req.user.id, req.user.id, req.user.id]);

    const conversations = rows.map(row => {
      const isMe = row.sender_id === req.user.id;
      const partner = isMe
        ? { _id: row.receiver_id, name: row.receiver_name, email: row.receiver_email }
        : { _id: row.sender_id,   name: row.sender_name,   email: row.sender_email };
      return {
        partner,
        lastMessage: { content: row.content, createdAt: row.created_at },
        unread: row.unread_count || 0,
      };
    });
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/messages/:userId — thread between current user and userId
router.get('/:userId', protect, async (req, res) => {
  const other = parseInt(req.params.userId);
  try {
    const [rows] = await db.query(`
      SELECT
        m.*,
        s.id AS s_id, s.name AS s_name,
        r.id AS r_id, r.name AS r_name
      FROM messages m
      JOIN users s ON m.sender_id   = s.id
      JOIN users r ON m.receiver_id = r.id
      WHERE (m.sender_id = ? AND m.receiver_id = ?)
         OR (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.created_at ASC
    `, [req.user.id, other, other, req.user.id]);

    // Mark as read
    await db.query(
      'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
      [other, req.user.id]
    );

    res.json(rows.map(row => ({
      _id      : row.id,
      content  : row.content,
      is_read  : row.is_read,
      createdAt: row.created_at,
      sender   : { _id: row.s_id, name: row.s_name },
      receiver : { _id: row.r_id, name: row.r_name },
    })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/messages
router.post('/', protect, async (req, res) => {
  const { receiver, content, request_id } = req.body;
  if (!receiver || !content)
    return res.status(400).json({ message: 'Destinataire et contenu requis' });

  try {
    const [result] = await db.query(
      'INSERT INTO messages (sender_id, receiver_id, request_id, content) VALUES (?, ?, ?, ?)',
      [req.user.id, receiver, request_id || null, content.trim()]
    );

    const [rows] = await db.query(`
      SELECT m.*, s.id AS s_id, s.name AS s_name, r.id AS r_id, r.name AS r_name
      FROM messages m
      JOIN users s ON m.sender_id   = s.id
      JOIN users r ON m.receiver_id = r.id
      WHERE m.id = ?
    `, [result.insertId]);

    const row = rows[0];
    res.status(201).json({
      _id      : row.id,
      content  : row.content,
      createdAt: row.created_at,
      sender   : { _id: row.s_id, name: row.s_name },
      receiver : { _id: row.r_id, name: row.r_name },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
