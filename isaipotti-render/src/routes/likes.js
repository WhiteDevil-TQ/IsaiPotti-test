// src/routes/likes.js

import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { formatQualityLabel } from '../utils/metadata.js';

const router = Router();

// ── POST /api/likes/:trackId ──────────────────────────────────────────────────
router.post('/:trackId', requireAuth, (req, res) => {
  const track = db.prepare('SELECT id FROM tracks WHERE id = ?').get(req.params.trackId);
  if (!track) return res.status(404).json({ error: 'Track not found' });

  try {
    db.prepare('INSERT INTO liked_tracks (user_id, track_id) VALUES (?, ?)').run(req.user.id, track.id);
    res.json({ liked: true });
  } catch {
    res.json({ liked: true }); // already liked — idempotent
  }
});

// ── DELETE /api/likes/:trackId ────────────────────────────────────────────────
router.delete('/:trackId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM liked_tracks WHERE user_id = ? AND track_id = ?').run(req.user.id, req.params.trackId);
  res.json({ liked: false });
});

// ── GET /api/likes ────────────────────────────────────────────────────────────
// Returns set of liked track IDs for the current user (fast lookup)
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT track_id FROM liked_tracks WHERE user_id = ?').all(req.user.id);
  res.json({ liked_track_ids: rows.map(r => r.track_id) });
});

export default router;
