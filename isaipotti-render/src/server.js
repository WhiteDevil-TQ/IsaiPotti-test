// src/server.js
// IsaiPotti — self-hosted music streaming backend
// Stack: Express · SQLite (better-sqlite3) · JWT · Multer · ffprobe

import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

// ── Import DB + routes ────────────────────────────────────────────────────────
import db from './db.js';
import authRoutes      from './routes/auth.js';
import albumRoutes     from './routes/albums.js';
import trackRoutes     from './routes/tracks.js';
import playlistRoutes  from './routes/playlists.js';
import likesRoutes     from './routes/likes.js';
import searchRoutes    from './routes/search.js';
import statsRoutes     from './routes/stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

// ── Bootstrap admin user ──────────────────────────────────────────────────────
function ensureAdminUser() {
  const adminUsername = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
  if (!existing) {
    const password = process.env.ADMIN_PASSWORD || 'changeme123';
    const name = process.env.ADMIN_DISPLAY_NAME || 'Admin';
    db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, avatar_letter, color, role)
      VALUES (?, ?, ?, ?, ?, ?, 'admin')
    `).run(uuidv4(), adminUsername, name, bcrypt.hashSync(password, 12), name[0].toUpperCase(), '#c90c0c');
    console.log(`✅ Admin user created: ${adminUsername} / ${password}`);
    console.log('   ⚠️  Change the admin password after first login!');
  }
}

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Static file serving ───────────────────────────────────────────────────────
// Uploaded covers and audio files (cover images served directly; audio via /api/tracks/:id/stream)
const uploadsPath = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath));

// Serve the built React frontend (if it exists) — for production deployments
const frontendDist = path.join(__dirname, '../dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
}

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/albums',    albumRoutes);
app.use('/api/tracks',    trackRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/likes',     likesRoutes);
app.use('/api/search',    searchRoutes);
app.use('/api/stats',     statsRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const userCount  = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const albumCount = db.prepare('SELECT COUNT(*) AS c FROM albums').get().c;
  const trackCount = db.prepare('SELECT COUNT(*) AS c FROM tracks').get().c;
  res.json({
    status: 'ok',
    version: '1.0.0',
    stats: { users: userCount, albums: albumCount, tracks: trackCount },
  });
});

// ── SPA fallback (serve index.html for any unmatched route) ───────────────────
if (fs.existsSync(frontendDist)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
ensureAdminUser();

app.listen(PORT, () => {
  console.log('');
  console.log('  🎵 IsaiPotti Server');
  console.log(`  ➜  http://localhost:${PORT}`);
  console.log(`  ➜  API: http://localhost:${PORT}/api/health`);
  console.log('');
});

export default app;
