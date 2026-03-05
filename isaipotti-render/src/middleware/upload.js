// src/middleware/upload.js

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// On Render with persistent disk, store uploads at /var/data/uploads
// Falls back to ./uploads for local dev or free-tier deploys
const UPLOADS_BASE = process.env.RENDER_PERSISTENT_DISK
  ? '/var/data/uploads'
  : path.join(__dirname, '../../uploads');

// Ensure directories exist
['covers', 'audio'].forEach(dir => {
  const p = path.join(UPLOADS_BASE, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const AUDIO_MIME_TYPES = new Set([
  'audio/flac', 'audio/x-flac',
  'audio/mpeg', 'audio/mp3',
  'audio/wav', 'audio/x-wav', 'audio/wave',
  'audio/aiff', 'audio/x-aiff',
  'audio/mp4', 'audio/x-m4a',
  'application/octet-stream', // some systems send flac as this
]);

const AUDIO_EXTENSIONS = new Set(['.flac', '.mp3', '.wav', '.aiff', '.aif', '.m4a']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// Cover art storage
const coverStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOADS_BASE, 'covers')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

// Audio storage
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOADS_BASE, 'audio')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

export const uploadCover = multer({
  storage: coverStorage,
  limits: { fileSize: parseInt(process.env.MAX_COVER_SIZE_MB || '10') * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      return cb(new Error(`Invalid image type: ${ext}`));
    }
    cb(null, true);
  },
}).single('cover');

export const uploadAudioFiles = multer({
  storage: audioStorage,
  limits: { fileSize: parseInt(process.env.MAX_AUDIO_SIZE_MB || '500') * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext) && !AUDIO_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error(`Invalid audio type: ${file.originalname}`));
    }
    cb(null, true);
  },
}).array('tracks', 200); // up to 200 tracks per album

export const UPLOADS_BASE_PATH = UPLOADS_BASE;
