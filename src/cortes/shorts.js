import { google } from 'googleapis';
import { createReadStream, existsSync, statSync } from 'fs';
import { exec } from 'child_process';
import { getAuth } from '../youtube.js';

/**
 * Faz upload de um YouTube Short (vídeo vertical ≤60s) como rascunho privado
 * e abre o YouTube Studio para revisão.
 *
 * O YouTube detecta Shorts automaticamente quando:
 *  - Vídeo é vertical (9:16)
 *  - Duração ≤ 60 segundos
 *  - Título contém #shorts
 */
export async function uploadShort(videoPath, thumbnailPath, metadata, onProgress) {
  if (!existsSync('./assets/yt_tokens.json')) return null;

  const auth    = await getAuth();
  const youtube = google.youtube({ version: 'v3', auth });
  const tamanho = statSync(videoPath).size;

  const videoRes = await youtube.videos.insert(
    {
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title:                metadata.titulo_youtube_short,
          description:          metadata.descricao_short,
          tags:                 metadata.hashtags_shorts ?? [],
          categoryId:           '27',
          defaultLanguage:      'pt',
          defaultAudioLanguage: 'pt',
        },
        status: {
          privacyStatus:           'private',
          selfDeclaredMadeForKids: false,
          madeForKids:             false,
        },
      },
      media: { body: createReadStream(videoPath) },
    },
    {
      onUploadProgress: evt => {
        if (onProgress) onProgress(Math.min(Math.round((evt.bytesRead / tamanho) * 95), 95));
      },
    }
  );

  const videoId = videoRes.data.id;

  // Thumbnail (falha silenciosamente se canal não for verificado)
  if (thumbnailPath && existsSync(thumbnailPath)) {
    try {
      await youtube.thumbnails.set({ videoId, media: { body: createReadStream(thumbnailPath) } });
    } catch { /* canal não verificado — sem bloqueio */ }
  }

  if (onProgress) onProgress(100);

  const studioUrl = `https://studio.youtube.com/video/${videoId}/edit`;
  console.log(`\n         📺 Short enviado! Revise aqui:\n            ${studioUrl}`);
  exec(process.platform === 'win32' ? `start "" "${studioUrl}"` : `open "${studioUrl}"`);

  return `https://youtu.be/${videoId}`;
}
