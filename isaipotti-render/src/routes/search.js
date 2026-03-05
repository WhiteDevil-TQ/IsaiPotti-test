// src/routes/search.js

import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { formatQualityLabel } from '../utils/metadata.js';

const router = Router();

// ── GET /api/search?q=... ─────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ albums: [], tracks: [], playlists: [] });

  const like = `%${q}%`;

  const albums = db.prepare(`
    SELECT a.*, COUNT(t.id) AS track_count
    FROM albums a
    LEFT JOIN tracks t ON t.album_id = a.id
    WHERE a.title LIKE ? OR a.artist LIKE ? OR a.genre LIKE ?
    GROUP BY a.id
    ORDER BY a.title ASC
    LIMIT 20
  `).all(like, like, like);

  const tracks = db.prepare(`
    SELECT t.*, a.title AS album_title, a.artist, a.cover_path, a.color
    FROM tracks t
    JOIN albums a ON a.id = t.album_id
    WHERE t.title LIKE ? OR a.artist LIKE ? OR a.title LIKE ?
    ORDER BY t.title ASC
    LIMIT 50
  `).all(like, like, like).map(t => ({ ...t, quality: formatQualityLabel(t) }));

  const playlists = db.prepare(`
    SELECT p.*, u.display_name AS owner_name, COUNT(pt.track_id) AS track_count
    FROM playlists p
    JOIN users u ON u.id = p.owner_id
    LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
    WHERE (p.owner_id = ? OR p.is_public = 1) AND p.name LIKE ?
    GROUP BY p.id
    ORDER BY p.name ASC
    LIMIT 20
  `).all(req.user.id, like);

  res.json({ albums, tracks, playlists });
});

export default router;
