// src/routes/playlists.js

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { formatQualityLabel } from '../utils/metadata.js';

const router = Router();

function enrichTrack(t) {
  return { ...t, quality: formatQualityLabel(t) };
}

function getPlaylistTracks(playlistId) {
  return db.prepare(`
    SELECT t.*, a.title AS album_title, a.artist, a.cover_path, a.color,
           pt.position, pt.added_at
    FROM playlist_tracks pt
    JOIN tracks t ON t.id = pt.track_id
    JOIN albums a ON a.id = t.album_id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position ASC, pt.added_at ASC
  `).all(playlistId).map(enrichTrack);
}

// ── GET /api/playlists ────────────────────────────────────────────────────────
// Returns: user's own playlists + public playlists from others
router.get('/', requireAuth, (req, res) => {
  const playlists = db.prepare(`
    SELECT p.*, u.display_name AS owner_name, u.avatar_letter AS owner_avatar,
           COUNT(pt.track_id) AS track_count
    FROM playlists p
    JOIN users u ON u.id = p.owner_id
    LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
    WHERE p.owner_id = ? OR p.is_public = 1
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `).all(req.user.id);
  res.json({ playlists });
});

// ── GET /api/playlists/liked ──────────────────────────────────────────────────
// Synthetic "Liked Songs" playlist for the current user
router.get('/liked', requireAuth, (req, res) => {
  const tracks = db.prepare(`
    SELECT t.*, a.title AS album_title, a.artist, a.cover_path, a.color,
           lt.liked_at AS added_at
    FROM liked_tracks lt
    JOIN tracks t ON t.id = lt.track_id
    JOIN albums a ON a.id = t.album_id
    WHERE lt.user_id = ?
    ORDER BY lt.liked_at DESC
  `).all(req.user.id).map(enrichTrack);

  res.json({
    playlist: {
      id: 'liked',
      name: 'Liked Songs',
      owner_id: req.user.id,
      is_public: false,
      track_count: tracks.length,
      tracks,
    },
  });
});

// ── GET /api/playlists/:id ────────────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  const playlist = db.prepare(`
    SELECT p.*, u.display_name AS owner_name, u.avatar_letter AS owner_avatar
    FROM playlists p JOIN users u ON u.id = p.owner_id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  if (!playlist.is_public && playlist.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'This playlist is private' });
  }

  res.json({ playlist: { ...playlist, tracks: getPlaylistTracks(playlist.id) } });
});

// ── POST /api/playlists ───────────────────────────────────────────────────────
router.post('/', requireAuth, (req, res) => {
  const { name, is_public = false, color = '#c90c0c' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Playlist name required' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO playlists (id, name, owner_id, is_public, color)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name.trim(), req.user.id, is_public ? 1 : 0, color);

  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(id);
  res.status(201).json({ playlist: { ...playlist, tracks: [] } });
});

// ── PUT /api/playlists/:id ────────────────────────────────────────────────────
router.put('/:id', requireAuth, (req, res) => {
  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  if (playlist.owner_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const { name, is_public, color } = req.body;
  db.prepare(`
    UPDATE playlists SET
      name      = COALESCE(?, name),
      is_public = COALESCE(?, is_public),
      color     = COALESCE(?, color),
      updated_at = unixepoch()
    WHERE id = ?
  `).run(name || null, is_public !== undefined ? (is_public ? 1 : 0) : null, color || null, playlist.id);

  const updated = db.prepare('SELECT * FROM playlists WHERE id = ?').get(playlist.id);
  res.json({ playlist: { ...updated, tracks: getPlaylistTracks(updated.id) } });
});

// ── DELETE /api/playlists/:id ─────────────────────────────────────────────────
router.delete('/:id', requireAuth, (req, res) => {
  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  if (playlist.owner_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }
  db.prepare('DELETE FROM playlists WHERE id = ?').run(playlist.id);
  res.json({ message: 'Playlist deleted' });
});

// ── POST /api/playlists/:id/tracks ────────────────────────────────────────────
// Add a track to a playlist
router.post('/:id/tracks', requireAuth, (req, res) => {
  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  if (playlist.owner_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

  const { track_id } = req.body;
  if (!track_id) return res.status(400).json({ error: 'track_id required' });

  const track = db.prepare('SELECT id FROM tracks WHERE id = ?').get(track_id);
  if (!track) return res.status(404).json({ error: 'Track not found' });

  // Get next position
  const maxPos = db.prepare('SELECT MAX(position) AS m FROM playlist_tracks WHERE playlist_id = ?').get(playlist.id)?.m || 0;

  try {
    db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)').run(playlist.id, track_id, maxPos + 1);
    db.prepare("UPDATE playlists SET updated_at = unixepoch() WHERE id = ?").run(playlist.id);
  } catch {
    return res.status(409).json({ error: 'Track already in playlist' });
  }

  res.json({ message: 'Track added', tracks: getPlaylistTracks(playlist.id) });
});

// ── DELETE /api/playlists/:id/tracks/:trackId ─────────────────────────────────
router.delete('/:id/tracks/:trackId', requireAuth, (req, res) => {
  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  if (playlist.owner_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

  db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').run(playlist.id, req.params.trackId);
  db.prepare("UPDATE playlists SET updated_at = unixepoch() WHERE id = ?").run(playlist.id);
  res.json({ message: 'Track removed', tracks: getPlaylistTracks(playlist.id) });
});

// ── POST /api/playlists/:id/tracks/reorder ────────────────────────────────────
// Body: { ordered_track_ids: ["id1","id2",...] }
router.post('/:id/tracks/reorder', requireAuth, (req, res) => {
  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  if (playlist.owner_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

  const { ordered_track_ids } = req.body;
  if (!Array.isArray(ordered_track_ids)) return res.status(400).json({ error: 'ordered_track_ids array required' });

  const update = db.prepare('UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?');
  const tx = db.transaction((ids) => {
    ids.forEach((trackId, i) => update.run(i + 1, playlist.id, trackId));
  });
  tx(ordered_track_ids);

  res.json({ message: 'Reordered', tracks: getPlaylistTracks(playlist.id) });
});

export default router;
