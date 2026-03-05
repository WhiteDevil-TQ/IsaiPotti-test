// src/utils/metadata.js
// Extracts audio metadata (duration, sample rate, bit depth, etc.) via ffprobe

import ffmpeg from 'fluent-ffmpeg';
import path from 'path';

/**
 * Extract technical metadata from an audio file using ffprobe.
 * Returns a best-effort object — never throws.
 */
export async function extractMetadata(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err || !data) {
        // ffprobe not available — fall back to filename-based guessing
        resolve(guessFromFilename(filePath));
        return;
      }

      const format = data.format || {};
      const audioStream = (data.streams || []).find(s => s.codec_type === 'audio') || {};

      const ext = path.extname(filePath).toLowerCase().slice(1);
      const formatName = (format.format_name || '').toLowerCase();

      resolve({
        duration:     parseFloat(format.duration) || parseFloat(audioStream.duration) || 0,
        fileSize:     parseInt(format.size) || 0,
        format:       detectFormat(formatName, ext),
        bitDepth:     parseInt(audioStream.bits_per_raw_sample) || parseInt(audioStream.bits_per_sample) || guessbitDepth(formatName, ext),
        sampleRate:   parseInt(audioStream.sample_rate) || 44100,
        bitrate:      Math.round((parseInt(format.bit_rate) || parseInt(audioStream.bit_rate) || 0) / 1000),
        channels:     parseInt(audioStream.channels) || 2,
        codec:        audioStream.codec_name || ext,
        title:        format.tags?.title || format.tags?.TITLE || null,
        artist:       format.tags?.artist || format.tags?.ARTIST || null,
        album:        format.tags?.album || format.tags?.ALBUM || null,
        trackNumber:  parseInt(format.tags?.track || format.tags?.TRACK) || null,
      });
    });
  });
}

function detectFormat(formatName, ext) {
  if (formatName.includes('flac') || ext === 'flac') return 'flac';
  if (formatName.includes('mp3') || ext === 'mp3') return 'mp3';
  if (formatName.includes('wav') || ext === 'wav') return 'wav';
  if (formatName.includes('aiff') || ext === 'aiff' || ext === 'aif') return 'aiff';
  if (formatName.includes('m4a') || ext === 'm4a') return 'm4a';
  return ext || 'unknown';
}

function guessbitDepth(formatName, ext) {
  if (formatName.includes('flac') || ext === 'flac') return 24;
  if (formatName.includes('wav') || ext === 'wav') return 24;
  if (formatName.includes('aiff') || ext === 'aiff') return 24;
  return 16;
}

function guessFromFilename(filePath) {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  return {
    duration: 0,
    fileSize: 0,
    format: ext || 'unknown',
    bitDepth: ext === 'flac' || ext === 'wav' || ext === 'aiff' ? 24 : 16,
    sampleRate: 44100,
    bitrate: ext === 'mp3' ? 320 : 0,
    channels: 2,
    codec: ext,
    title: null, artist: null, album: null, trackNumber: null,
  };
}

/**
 * Returns a human-readable quality string like "FLAC 24bit/96kHz"
 */
export function formatQualityLabel(track) {
  const fmt = (track.format || '').toUpperCase();
  if (track.format === 'mp3') {
    return `MP3 ${track.bitrate || 320}kbps`;
  }
  const bits = track.bit_depth || track.bitDepth;
  const rate = track.sample_rate || track.sampleRate || 44100;
  const rateLabel = rate >= 1000 ? `${rate / 1000}kHz` : `${rate}Hz`;
  if (bits) return `${fmt} ${bits}bit/${rateLabel}`;
  return `${fmt} ${rateLabel}`;
}
