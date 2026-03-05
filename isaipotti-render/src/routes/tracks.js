// src/routes/tracks.js

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadAudioFiles, UPLOADS_BASE_PATH } from '../middleware/upload.js';
import { extractMetadata, formatQualityLabel } from '../utils/metadata.js';

const router = Router();

// ── POST /api/tracks/upload/:albumId ─────────────────────────────────────────
// Upload one or more audio files to an album
router.post('/upload/:albumId', requireAuth, (req, res) => {
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.albumId);
  if (!album) return res.status(404).json({ error: 'Album not found' });
  if (album.uploaded_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  uploadAudioFiles(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files?.length) return res.status(400).json({ error: 'No audio files provided' });

    const insertedTracks = [];
    let startTrackNo = (db.prepare('SELECT MAX(track_no) AS max FROM tracks WHERE album_id = ?').get(album.id)?.max || 0) + 1;

    for (const file of req.files) {
      const filePath = `audio/${file.filename}`;
      const fullPath = path.join(UPLOADS_BASE_PATH, filePath);

      // Extract metadata via ffprobe (async)
      const meta = await extractMetadata(fullPath);

      // Title: prefer embedded tag → filename (cleaned)
      const rawName = path.basename(file.originalname, path.extname(file.originalname));
      const title = meta.title || rawName.replace(/^\d+[\s._\-]+/, '').trim() || rawName;

      const id = uuidv4();
      const trackNo = meta.trackNumber || startTrackNo++;

      db.prepare(`
        INSERT INTO tracks
          (id, album_id, title, track_no, duration, file_path, file_size,
           format, bit_depth, sample_rate, bitrate, channels)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, album.id, title, trackNo,
        meta.duration || 0,
        filePath,
        meta.fileSize || file.size || 0,
        meta.format,
        meta.bitDepth || null,
        meta.sampleRate || 44100,
        meta.bitrate || null,
        meta.channels || 2,
      );

      const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id);
      insertedTracks.push({ ...track, quality: formatQualityLabel(track) });
    }

    res.status(201).json({ tracks: insertedTracks });
  });
});

// ── GET /api/tracks/:id ───────────────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  const track = db.prepare(`
    SELECT t.*, a.title AS album_title, a.artist, a.cover_path, a.color
    FROM tracks t JOIN albums a ON a.id = t.album_id
    WHERE t.id = ?
  `).get(req.params.id);
  if (!track) return res.status(404).json({ error: 'Track not found' });
  res.json({ track: { ...track, quality: formatQualityLabel(track) } });
});

// ── GET /api/tracks/:id/stream ────────────────────────────────────────────────
// HTTP Range-request streaming — works with HTML <audio> and any player
router.get('/:id/stream', requireAuth, (req, res) => {
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.id);
  if (!track) return res.status(404).json({ error: 'Track not found' });

  const filePath = path.join(UPLOADS_BASE_PATH, track.file_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Audio file not found on disk' });

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const rangeHeader = req.headers.range;

  // Detect MIME type
  const mimeMap = { flac:'audio/flac', mp3:'audio/mpeg', wav:'audio/wav', aiff:'audio/aiff', aif:'audio/aiff', m4a:'audio/mp4' };
  const ext = path.extname(track.file_path).toLowerCase().slice(1);
  const contentType = mimeMap[ext] || 'audio/octet-stream';

  if (rangeHeader) {
    // Parse Range: bytes=start-end
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': chunkSize,
      'Content-Type':   contentType,
      'Cache-Control':  'no-cache',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    // Full file
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type':   contentType,
      'Accept-Ranges':  'bytes',
      'Cache-Control':  'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  }

  // Record play in history (fire-and-forget)
  try {
    db.prepare('INSERT INTO play_history (user_id, track_id) VALUES (?, ?)').run(req.user.id, track.id);
  } catch { /* non-fatal */ }
});

// ── GET /api/tracks/:id/download ─────────────────────────────────────────────
// Forces file download with original extension (full resolution, no transcoding)
router.get('/:id/download', requireAuth, (req, res) => {
  const track = db.prepare(`
    SELECT t.*, a.title AS album_title, a.artist FROM tracks t
    JOIN albums a ON a.id = t.album_id WHERE t.id = ?
  `).get(req.params.id);
  if (!track) return res.status(404).json({ error: 'Track not found' });

  const filePath = path.join(UPLOADS_BASE_PATH, track.file_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

  const ext = path.extname(track.file_path);
  // Sanitize filename for download
  const safeTitle = track.title.replace(/[^a-zA-Z0-9 \-_.]/g, '');
  const safeArtist = track.artist.replace(/[^a-zA-Z0-9 \-_.]/g, '');
  const downloadName = `${safeArtist} - ${safeTitle}${ext}`;

  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

// ── PUT /api/tracks/:id ───────────────────────────────────────────────────────
// Update track metadata (title, track number)
router.put('/:id', requireAuth, (req, res) => {
  const track = db.prepare('SELECT t.*, a.uploaded_by FROM tracks t JOIN albums a ON a.id = t.album_id WHERE t.id = ?').get(req.params.id);
  if (!track) return res.status(404).json({ error: 'Track not found' });
  if (track.uploaded_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const { title, track_no } = req.body;
  db.prepare('UPDATE tracks SET title = COALESCE(?, title), track_no = COALESCE(?, track_no) WHERE id = ?')
    .run(title || null, track_no !== undefined ? parseInt(track_no) : null, req.params.id);

  const updated = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.id);
  res.json({ track: { ...updated, quality: formatQualityLabel(updated) } });
});

// ── DELETE /api/tracks/:id ────────────────────────────────────────────────────
router.delete('/:id', requireAuth, (req, res) => {
  const track = db.prepare('SELECT t.*, a.uploaded_by FROM tracks t JOIN albums a ON a.id = t.album_id WHERE t.id = ?').get(req.params.id);
  if (!track) return res.status(404).json({ error: 'Track not found' });
  if (track.uploaded_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const filePath = path.join(UPLOADS_BASE_PATH, track.file_path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  db.prepare('DELETE FROM tracks WHERE id = ?').run(track.id);
  res.json({ message: 'Track deleted' });
});

export default router;
