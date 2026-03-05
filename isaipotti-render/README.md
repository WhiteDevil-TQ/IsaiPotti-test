# 🎵 IsaiPotti Backend

Self-hosted music streaming server. Upload FLAC/MP3 albums, stream at full quality, share with friends.

**Stack:** Node.js · Express · SQLite · JWT · Multer · ffprobe

---

## Deploy to Render (5 minutes)

### Step 1 — Fork / Push to GitHub

Push this repo to your GitHub account.

### Step 2 — Create a Render account

Go to [render.com](https://render.com) and sign up (free).

### Step 3 — New Web Service

1. Click **New +** → **Web Service**
2. Connect your GitHub account
3. Select this repository
4. Render will auto-detect the `render.yaml` config

### Step 4 — Set Environment Variables

In the Render dashboard, go to **Environment** and set:

| Key | Value |
|-----|-------|
| `JWT_SECRET` | Any long random string (min 32 chars) |
| `ADMIN_USERNAME` | `rohit` (or whatever you want) |
| `ADMIN_PASSWORD` | A strong password — **change this!** |
| `ADMIN_DISPLAY_NAME` | `Rohit` |
| `NODE_ENV` | `production` |
| `PORT` | `3001` |

### Step 5 — Deploy

Click **Create Web Service**. Render will:
- Install Node.js 20
- Install ffmpeg (for audio metadata)
- Run `npm install`
- Start the server

Your API will be live at:
```
https://isaipotti.onrender.com
```

### Step 6 — Test it

Visit: `https://your-app-name.onrender.com/api/health`

You should see:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "stats": { "users": 1, "albums": 0, "tracks": 0 }
}
```

### Step 7 — Connect your frontend

In your React project's `.env`:
```env
VITE_API_URL=https://your-app-name.onrender.com
```

---

## API Quick Reference

### Login
```bash
curl -X POST https://your-app.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"rohit","password":"yourpassword"}'
```

### Create a user (admin only)
```bash
curl -X POST https://your-app.onrender.com/api/auth/register \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"karthik","display_name":"Karthik","password":"pass123"}'
```

### Upload an album
```bash
# 1. Create album
curl -X POST https://your-app.onrender.com/api/albums \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Roja","artist":"A.R. Rahman","year":1992,"genre":"Film Score"}'

# 2. Upload cover
curl -X POST https://your-app.onrender.com/api/albums/ALBUM_ID/cover \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "cover=@roja-cover.jpg"

# 3. Upload tracks
curl -X POST https://your-app.onrender.com/api/tracks/upload/ALBUM_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "tracks=@track1.flac" \
  -F "tracks=@track2.flac"
```

---

## ⚠️ Free Tier Limitations

Render's **free tier** has two limitations:
1. **Server sleeps** after 15 mins of inactivity (wakes up in ~30 seconds on next request)
2. **No persistent disk** — uploaded files reset on redeploy

For testing this is fine. For permanent use, upgrade to **Starter ($7/mo)** and uncomment the `disk:` section in `render.yaml` for 50GB persistent storage.

---

## Local Development

```bash
# Install dependencies
npm install

# Install ffmpeg (macOS)
brew install ffmpeg

# Install ffmpeg (Ubuntu/Debian)
sudo apt install ffmpeg

# Copy and configure env
cp .env.example .env

# Run with auto-restart
npm run dev
```

Server runs at `http://localhost:3001`
