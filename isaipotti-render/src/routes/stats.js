// src/routes/stats.js
// Play history stats — foundation for IsaiPotti Wrapped

import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { formatQualityLabel } from '../utils/metadata.js';

const router = Router();

// ── GET /api/stats/wrapped?year=2025 ─────────────────────────────────────────
// Returns a Wrapped-style summary for the given year
router.get('/wrapped', requireAuth, (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const from = Math.floor(new Date(`${year}-01-01`).getTime() / 1000);
  const to   = Math.floor(new Date(`${year + 1}-01-01`).getTime() / 1000);

  // Top tracks
  const topTracks = db.prepare(`
    SELECT t.*, a.title AS album_title, a.artist, a.cover_path, a.color,
           COUNT(*) AS play_count
    FROM play_history ph
    JOIN tracks t ON t.id = ph.track_id
    JOIN albums a ON a.id = t.album_id
    WHERE ph.user_id = ? AND ph.played_at >= ? AND ph.played_at < ?
    GROUP BY ph.track_id
    ORDER BY play_count DESC
    LIMIT 10
  `).all(req.user.id, from, to).map(t => ({ ...t, quality: formatQualityLabel(t) }));

  // Top artists
  const topArtists = db.prepare(`
    SELECT a.artist, COUNT(*) AS play_count
    FROM play_history ph
    JOIN tracks t ON t.id = ph.track_id
    JOIN albums a ON a.id = t.album_id
    WHERE ph.user_id = ? AND ph.played_at >= ? AND ph.played_at < ?
    GROUP BY a.artist
    ORDER BY play_count DESC
    LIMIT 5
  `).all(req.user.id, from, to);

  // Top albums
  const topAlbums = db.prepare(`
    SELECT a.*, COUNT(*) AS play_count
    FROM play_history ph
    JOIN tracks t ON t.id = ph.track_id
    JOIN albums a ON a.id = t.album_id
    WHERE ph.user_id = ? AND ph.played_at >= ? AND ph.played_at < ?
    GROUP BY a.id
    ORDER BY play_count DESC
    LIMIT 5
  `).all(req.user.id, from, to);

  // Total minutes listened
  const totalPlays = db.prepare(`
    SELECT COUNT(*) AS plays
    FROM play_history ph
    JOIN tracks t ON t.id = ph.track_id
    WHERE ph.user_id = ? AND ph.played_at >= ? AND ph.played_at < ?
  `).get(req.user.id, from, to);

  const totalMinutes = db.prepare(`
    SELECT SUM(t.duration) AS total_seconds
    FROM play_history ph
    JOIN tracks t ON t.id = ph.track_id
    WHERE ph.user_id = ? AND ph.played_at >= ? AND ph.played_at < ?
  `).get(req.user.id, from, to);

  res.json({
    year,
    total_plays: totalPlays?.plays || 0,
    total_minutes: Math.round((totalMinutes?.total_seconds || 0) / 60),
    top_tracks:  topTracks,
    top_artists: topArtists,
    top_albums:  topAlbums,
  });
});

// ── GET /api/stats/recent ─────────────────────────────────────────────────────
router.get('/recent', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const recent = db.prepare(`
    SELECT DISTINCT t.*, a.title AS album_title, a.artist, a.cover_path, a.color,
           MAX(ph.played_at) AS last_played
    FROM play_history ph
    JOIN tracks t ON t.id = ph.track_id
    JOIN albums a ON a.id = t.album_id
    WHERE ph.user_id = ?
    GROUP BY ph.track_id
    ORDER BY last_played DESC
    LIMIT ?
  `).all(req.user.id, limit).map(t => ({ ...t, quality: formatQualityLabel(t) }));

  res.json({ tracks: recent });
});

export default router;
