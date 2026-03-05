// src/routes/albums.js

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { uploadCover, UPLOADS_BASE_PATH } from '../middleware/upload.js';

const router = Router();

// Helper: attach full track list to an album row
function albumWithTracks(album) {
  if (!album) return null;
  const tracks = db.prepare(`
    SELECT t.*, a.title AS album_title, a.artist, a.cover_path, a.color
    FROM tracks t
    JOIN albums a ON a.id = t.album_id
    WHERE t.album_id = ?
    ORDER BY t.track_no ASC, t.title ASC
  `).all(album.id);
  return { ...album, tracks };
}

// ── GET /api/albums ───────────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const albums = db.prepare(`
    SELECT a.*, COUNT(t.id) AS track_count
    FROM albums a
    LEFT JOIN tracks t ON t.album_id = a.id
    GROUP BY a.id
    ORDER BY a.created_at DESC
  `).all();
  res.json({ albums });
});

// ── GET /api/albums/:id ───────────────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!album) return res.status(404).json({ error: 'Album not found' });
  res.json({ album: albumWithTracks(album) });
});

// ── POST /api/albums ──────────────────────────────────────────────────────────
// Create album metadata (without tracks — tracks added separately)
router.post('/', requireAuth, (req, res) => {
  const { title, artist, year, genre, color } = req.body;
  if (!title || !artist) return res.status(400).json({ error: 'title and artist required' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO albums (id, title, artist, year, genre, color, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, title.trim(), artist.trim(), parseInt(year) || null, genre?.trim() || null, color || '#c90c0c', req.user.id);

  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(id);
  res.status(201).json({ album });
});

// ── PUT /api/albums/:id ───────────────────────────────────────────────────────
router.put('/:id', requireAuth, (req, res) => {
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!album) return res.status(404).json({ error: 'Album not found' });
  if (album.uploaded_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized to edit this album' });
  }

  const { title, artist, year, genre, color } = req.body;
  db.prepare(`
    UPDATE albums SET
      title  = COALESCE(?, title),
      artist = COALESCE(?, artist),
      year   = COALESCE(?, year),
      genre  = COALESCE(?, genre),
      color  = COALESCE(?, color)
    WHERE id = ?
  `).run(title || null, artist || null, parseInt(year) || null, genre || null, color || null, req.params.id);

  res.json({ album: albumWithTracks(db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id)) });
});

// ── POST /api/albums/:id/cover ────────────────────────────────────────────────
router.post('/:id/cover', requireAuth, (req, res) => {
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!album) return res.status(404).json({ error: 'Album not found' });
  if (album.uploaded_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  uploadCover(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Delete old cover if exists
    if (album.cover_path) {
      const old = path.join(UPLOADS_BASE_PATH, album.cover_path);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }

    const coverPath = `covers/${req.file.filename}`;
    db.prepare('UPDATE albums SET cover_path = ? WHERE id = ?').run(coverPath, album.id);

    res.json({ cover_path: coverPath, cover_url: `/uploads/${coverPath}` });
  });
});

// ── DELETE /api/albums/:id ────────────────────────────────────────────────────
router.delete('/:id', requireAuth, (req, res) => {
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!album) return res.status(404).json({ error: 'Album not found' });
  if (album.uploaded_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  // Get all tracks to clean up files
  const tracks = db.prepare('SELECT file_path FROM tracks WHERE album_id = ?').all(album.id);
  tracks.forEach(t => {
    const fp = path.join(UPLOADS_BASE_PATH, t.file_path);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  if (album.cover_path) {
    const cp = path.join(UPLOADS_BASE_PATH, album.cover_path);
    if (fs.existsSync(cp)) fs.unlinkSync(cp);
  }

  db.prepare('DELETE FROM albums WHERE id = ?').run(album.id); // cascades to tracks
  res.json({ message: 'Album deleted' });
});

export default router;
