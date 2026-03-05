// src/api.js
// IsaiPotti frontend API client
// Drop this into your React project and import from it.

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ─── Token management ─────────────────────────────────────────────────────────
export const token = {
  get: () => localStorage.getItem('isaipotti_token'),
  set: (t) => localStorage.setItem('isaipotti_token', t),
  clear: () => localStorage.removeItem('isaipotti_token'),
};

// ─── Core fetch wrapper ───────────────────────────────────────────────────────
async function api(method, path, body = null, isFormData = false) {
  const headers = { Authorization: `Bearer ${token.get()}` };
  if (body && !isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

const get  = (path)        => api('GET',    path);
const post = (path, body)  => api('POST',   path, body);
const put  = (path, body)  => api('PUT',    path, body);
const del  = (path)        => api('DELETE', path);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const auth = {
  login: async (username, password) => {
    const data = await post('/api/auth/login', { username, password });
    token.set(data.token);
    return data.user;
  },

  logout: () => token.clear(),

  me: () => get('/api/auth/me').then(d => d.user),

  // Admin: create a new user account
  createUser: (userData) => post('/api/auth/register', userData).then(d => d.user),

  // Admin: list all users
  listUsers: () => get('/api/auth/users').then(d => d.users),

  // Admin: delete a user
  deleteUser: (userId) => del(`/api/auth/users/${userId}`),

  changePassword: (current_password, new_password) =>
    put('/api/auth/me/password', { current_password, new_password }),
};

// ─── Albums ───────────────────────────────────────────────────────────────────
export const albums = {
  list: () => get('/api/albums').then(d => d.albums),

  get: (id) => get(`/api/albums/${id}`).then(d => d.album),

  create: (data) => post('/api/albums', data).then(d => d.album),

  update: (id, data) => put(`/api/albums/${id}`, data).then(d => d.album),

  uploadCover: async (albumId, file) => {
    const fd = new FormData();
    fd.append('cover', file);
    return api('POST', `/api/albums/${albumId}/cover`, fd, true);
  },

  delete: (id) => del(`/api/albums/${id}`),
};

// ─── Tracks ───────────────────────────────────────────────────────────────────
export const tracks = {
  // Upload multiple audio files to an album
  upload: async (albumId, files, onProgress) => {
    const fd = new FormData();
    Array.from(files).forEach(f => fd.append('tracks', f));

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}/api/tracks/upload/${albumId}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token.get()}`);

      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try { reject(new Error(JSON.parse(xhr.responseText).error)); }
          catch { reject(new Error(`Upload failed: ${xhr.status}`)); }
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(fd);
    });
  },

  get: (id) => get(`/api/tracks/${id}`).then(d => d.track),

  // Returns a streaming URL (use as <audio src="..."> or for direct playback)
  streamUrl: (id) => `${BASE}/api/tracks/${id}/stream?token=${token.get()}`,

  // Returns a download URL
  downloadUrl: (id) => `${BASE}/api/tracks/${id}/download`,

  update: (id, data) => put(`/api/tracks/${id}`, data).then(d => d.track),

  delete: (id) => del(`/api/tracks/${id}`),
};

// ─── Playlists ────────────────────────────────────────────────────────────────
export const playlists = {
  list: () => get('/api/playlists').then(d => d.playlists),

  getLiked: () => get('/api/playlists/liked').then(d => d.playlist),

  get: (id) => get(`/api/playlists/${id}`).then(d => d.playlist),

  create: (name, options = {}) =>
    post('/api/playlists', { name, ...options }).then(d => d.playlist),

  update: (id, data) => put(`/api/playlists/${id}`, data).then(d => d.playlist),

  delete: (id) => del(`/api/playlists/${id}`),

  addTrack: (playlistId, trackId) =>
    post(`/api/playlists/${playlistId}/tracks`, { track_id: trackId }),

  removeTrack: (playlistId, trackId) =>
    del(`/api/playlists/${playlistId}/tracks/${trackId}`),

  reorder: (playlistId, orderedTrackIds) =>
    post(`/api/playlists/${playlistId}/tracks/reorder`, { ordered_track_ids: orderedTrackIds }),
};

// ─── Likes ────────────────────────────────────────────────────────────────────
export const likes = {
  getAll: () => get('/api/likes').then(d => d.liked_track_ids),
  add: (trackId) => post(`/api/likes/${trackId}`),
  remove: (trackId) => del(`/api/likes/${trackId}`),
  toggle: async (trackId, currentlyLiked) => {
    if (currentlyLiked) return likes.remove(trackId);
    return likes.add(trackId);
  },
};

// ─── Search ───────────────────────────────────────────────────────────────────
export const search = {
  query: (q) => get(`/api/search?q=${encodeURIComponent(q)}`),
};

// ─── Stats / Wrapped ──────────────────────────────────────────────────────────
export const stats = {
  wrapped: (year = new Date().getFullYear()) => get(`/api/stats/wrapped?year=${year}`),
  recent: (limit = 20) => get(`/api/stats/recent?limit=${limit}`),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Full URL for an album cover */
export function coverUrl(coverPath) {
  if (!coverPath) return null;
  if (coverPath.startsWith('http')) return coverPath;
  return `${BASE}/uploads/${coverPath}`;
}

/** Check if user is logged in (token exists) */
export function isLoggedIn() {
  return !!token.get();
}
