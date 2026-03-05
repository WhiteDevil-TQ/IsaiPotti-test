// src/routes/auth.js

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

  // Update last login
  db.prepare('UPDATE users SET last_login = unixepoch() WHERE id = ?').run(user.id);

  res.json({
    token: signToken(user.id),
    user: sanitizeUser(user),
  });
});

// ── POST /api/auth/register ───────────────────────────────────────────────────
// Admin-only: creates a new user account
router.post('/register', requireAuth, requireAdmin, (req, res) => {
  const { username, display_name, password, role = 'user', color = '#c90c0c' } = req.body;

  if (!username || !display_name || !password) {
    return res.status(400).json({ error: 'username, display_name and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const key = username.toLowerCase().trim().replace(/\s+/g, '_');
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(key);
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 12);
  const avatar = display_name[0].toUpperCase();

  db.prepare(`
    INSERT INTO users (id, username, display_name, password_hash, avatar_letter, color, role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, key, display_name.trim(), hash, avatar, color, role);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.status(201).json({ user: sanitizeUser(user) });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

// ── PUT /api/auth/me/password ────────────────────────────────────────────────
router.put('/me/password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Both current and new password required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(new_password, 12), req.user.id);

  res.json({ message: 'Password updated' });
});

// ── GET /api/auth/users ───────────────────────────────────────────────────────
// Admin: list all users
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, avatar_letter, color, role, created_at, last_login FROM users ORDER BY created_at').all();
  res.json({ users });
});

// ── DELETE /api/auth/users/:id ───────────────────────────────────────────────
router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'User deleted' });
});

export default router;
