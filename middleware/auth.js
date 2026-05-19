const jwt = require('jsonwebtoken');
const db  = require('../config/db');

const protect = async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer '))
      return res.status(401).json({ message: 'Non autorisé — token manquant' });

    const token   = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'transport_secret_2024');

    const [rows] = await db.query(
      'SELECT id, name, email, role, phone, address, is_active, created_at FROM users WHERE id = ?',
      [decoded.id]
    );
    if (!rows.length)
      return res.status(401).json({ message: 'Utilisateur introuvable' });
    if (!rows[0].is_active)
      return res.status(403).json({ message: 'Compte désactivé' });

    req.user = rows[0];
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token invalide ou expiré' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return res.status(403).json({ message: `Rôle '${req.user.role}' non autorisé` });
  next();
};

module.exports = { protect, authorize };
