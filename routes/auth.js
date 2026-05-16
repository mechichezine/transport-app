const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../config/db');
const { protect } = require('../middleware/auth');

const makeToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET || 'transport_secret_2024',
            { expiresIn: process.env.JWT_EXPIRES || '30d' });

const safeUser = (u) => {
  const { password, ...rest } = u;
  return rest;
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, role, phone } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ message: 'Champs obligatoires manquants' });

  try {
    const [exist] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (exist.length)
      return res.status(400).json({ message: 'Cet email est déjà utilisé' });

    const hash = await bcrypt.hash(password, 12);
    const allowedRole = ['client','transporter'].includes(role) ? role : 'client';

    const [result] = await db.query(
      'INSERT INTO users (name, email, password, role, phone) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), hash, allowedRole, phone || '']
    );

    const [rows] = await db.query(
      'SELECT id, name, email, role, phone, address, created_at FROM users WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json({ token: makeToken(rows[0].id), user: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email et mot de passe requis' });

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!rows.length)
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });

    const user = rows[0];
    const ok   = await bcrypt.compare(password, user.password);
    if (!ok)
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    if (!user.is_active)
      return res.status(403).json({ message: 'Compte désactivé' });

    res.json({ token: makeToken(user.id), user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => res.json(req.user));

// PUT /api/auth/profile
router.put('/profile', protect, async (req, res) => {
  const { name, phone, address } = req.body;
  try {
    await db.query(
      'UPDATE users SET name = ?, phone = ?, address = ? WHERE id = ?',
      [name || req.user.name, phone || '', address || '', req.user.id]
    );
    const [rows] = await db.query(
      'SELECT id, name, email, role, phone, address, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
