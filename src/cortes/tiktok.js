import { exec }                          from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { statSync, createReadStream }   from 'fs';
import { join }                         from 'path';

const TOKENS_FILE  = './assets/tiktok_tokens.json';
const CLIENT_KEY   = process.env.TIKTOK_CLIENT_KEY;
const CLIENT_SECRET= process.env.TIKTOK_CLIENT_SECRET;

function lerTokens() {
  if (!existsSync(TOKENS_FILE)) return null;
  try { return JSON.parse(readFileSync(TOKENS_FILE, 'utf-8')); }
  catch { return null; }
}

async function renovarToken(tokens) {
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key:    CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      grant_type:    'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Refresh falhou: ${JSON.stringify(data)}`);
  const novo = { ...tokens, ...data, saved_at: Date.now() };
  writeFileSync(TOKENS_FILE, JSON.stringify(novo, null, 2));
  return novo;
}

async function getAccessToken() {
  // Fallback direto da env var (token manual do portal)
  if (process.env.TIKTOK_ACCESS_TOKEN && !existsSync(TOKENS_FILE)) {
    return process.env.TIKTOK_ACCESS_TOKEN;
  }

  let tokens = lerTokens();
  if (!tokens) throw new Error('TikTok não autenticado. Execute: node setup-tiktok.js');

  // Se não tiver refresh_token (token manual), usa direto sem tentar renovar
  if (!tokens.refresh_token) return tokens.access_token;

  const expiradoEm = tokens.saved_at + (tokens.expires_in - 60) * 1000;
  if (Date.now() > expiradoEm) {
    console.log('         🔄 Renovando token TikTok...');
    tokens = await renovarToken(tokens);
  }
  return tokens.access_token;
}

/**
 * Upload para TikTok via Content Posting API v2 (Direct Post).
 * Requer node setup-tiktok.js executado previamente.
 */
export async function uploadTikTok(videoPath, metadata) {
  if (!existsSync(TOKENS_FILE)) {
    console.log('         ℹ️  TikTok não autenticado — execute: node setup-tiktok.js');
    return null;
  }

  try {
    const accessToken = await getAccessToken();
    const tamanho     = statSync(videoPath).size;

    // 1. Inicializar upload
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title:           metadata.titulo_tiktok?.slice(0, 150) ?? metadata.titulo_corte,
          privacy_level:   'SELF_ONLY', // rascunho — altere para MUTUAL_FOLLOW_FRIENDS ou PUBLIC_TO_EVERYONE quando pronto
          disable_comment: false,
          disable_duet:    false,
          disable_stitch:  false,
        },
        source_info: {
          source:            'FILE_UPLOAD',
          video_size:        tamanho,
          chunk_size:        tamanho,
          total_chunk_count: 1,
        },
      }),
    });

    const initData = await initRes.json();
    if (!initData.data?.upload_url) {
      throw new Error(`TikTok init falhou: ${JSON.stringify(initData)}`);
    }

    const { upload_url, publish_id } = initData.data;

    // 2. Upload do vídeo em chunk único
    const chunks = [];
    for await (const chunk of createReadStream(videoPath)) chunks.push(chunk);
    const videoBuffer = Buffer.concat(chunks);

    const uploadRes = await fetch(upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type':   'video/mp4',
        'Content-Range':  `bytes 0-${tamanho - 1}/${tamanho}`,
        'Content-Length': String(tamanho),
      },
      body: videoBuffer,
    });

    if (!uploadRes.ok) throw new Error(`Upload falhou (${uploadRes.status})`);

    const creatorUrl = 'https://www.tiktok.com/creator-center/content';
    console.log(`\n         🎵 TikTok enviado como rascunho! Revise aqui:\n            ${creatorUrl}`);
    exec(process.platform === 'win32' ? `start "" "${creatorUrl}"` : `open "${creatorUrl}"`);

    return publish_id;
  } catch (e) {
    console.warn(`\n         ⚠️  TikTok upload falhou: ${e.message} — continuando.`);
    return null;
  }
}
