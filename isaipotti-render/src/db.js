// src/db.js
// SQLite database setup using better-sqlite3 (synchronous, zero-config, fast)

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// On Render with a persistent disk, /var/data is the mount path.
// Falls back to local ./data for dev or free-tier deploys.
const DATA_DIR = process.env.RENDER_PERSISTENT_DISK
  ? '/var/data'
  : path.join(__dirname, '../data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'isaipotti.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  -- Users
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_letter TEXT NOT NULL DEFAULT 'U',
    color       TEXT NOT NULL DEFAULT '#c90c0c',
    role        TEXT NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    last_login  INTEGER
  );

  -- Albums
  CREATE TABLE IF NOT EXISTS albums (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    artist      TEXT NOT NULL,
    year        INTEGER,
    genre       TEXT,
    cover_path  TEXT,
    color       TEXT DEFAULT '#c90c0c',
    uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- Tracks
  CREATE TABLE IF NOT EXISTS tracks (
    id           TEXT PRIMARY KEY,
    album_id     TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    track_no     INTEGER,
    duration     REAL,          -- seconds (from ffprobe)
    file_path    TEXT NOT NULL, -- relative path under uploads/audio/
    file_size    INTEGER,       -- bytes
    format       TEXT,          -- flac | mp3 | wav | aiff
    bit_depth    INTEGER,       -- 16 | 24 | 32
    sample_rate  INTEGER,       -- 44100 | 48000 | 96000 | 192000
    bitrate      INTEGER,       -- kbps for lossy
    channels     INTEGER,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- Playlists
  CREATE TABLE IF NOT EXISTS playlists (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    color       TEXT DEFAULT '#c90c0c',
    is_public   INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- Playlist <-> Track mapping
  CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id    TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL DEFAULT 0,
    added_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (playlist_id, track_id)
  );

  -- Liked tracks (per user)
  CREATE TABLE IF NOT EXISTS liked_tracks (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id    TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    liked_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, track_id)
  );

  -- Play history (for Wrapped feature later)
  CREATE TABLE IF NOT EXISTS play_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id    TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    played_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    play_duration INTEGER  -- seconds actually listened
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_tracks_album   ON tracks(album_id);
  CREATE INDEX IF NOT EXISTS idx_pl_tracks_pl   ON playlist_tracks(playlist_id);
  CREATE INDEX IF NOT EXISTS idx_liked_user     ON liked_tracks(user_id);
  CREATE INDEX IF NOT EXISTS idx_history_user   ON play_history(user_id);
  CREATE INDEX IF NOT EXISTS idx_history_played ON play_history(played_at);
`);

export default db;
