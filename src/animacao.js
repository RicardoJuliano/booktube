import { HiggsfieldClient, InputImage, DoPModel } from '@higgsfield/client';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { ensureDir } from './utils.js';

// Variações de movimento de câmera — alternadas por cena (mesma lógica do Ken Burns em video.js)
const MOTION_PROMPTS = [
  'slow cinematic zoom in, subtle atmospheric motion, gentle parallax, no camera shake',
  'slow cinematic zoom out, gentle drifting light and atmosphere, cinematic mood',
  'smooth horizontal camera drift left to right, subtle parallax depth, cinematic',
  'smooth horizontal camera drift right to left, subtle parallax depth, cinematic',
  'gentle vertical camera drift, soft atmospheric particles, cinematic mood',
];

export function temHiggsfield() {
  return Boolean(process.env.HIGGSFIELD_API_KEY && process.env.HIGGSFIELD_API_SECRET);
}

function criarCliente() {
  return new HiggsfieldClient({
    apiKey:    process.env.HIGGSFIELD_API_KEY,
    apiSecret: process.env.HIGGSFIELD_API_SECRET,
  });
}

function extrairUrlVideo(jobSet) {
  const job = jobSet?.jobs?.[0];
  return job?.results?.raw?.url ?? job?.results?.min?.url ?? null;
}

async function animarUmaCena(hf, cenaPath, index) {
  const buffer   = await readFile(cenaPath);
  const imageUrl = await hf.uploadImage(buffer, 'png');

  const jobSet = await hf.generate('/v1/image2video/dop', {
    model:        DoPModel.TURBO,
    prompt:       MOTION_PROMPTS[index % MOTION_PROMPTS.length],
    duration:     5,
    input_images: [InputImage.fromUrl(imageUrl)],
  }, { withPolling: true });

  if (jobSet.isFailed || jobSet.isNsfw) throw new Error('geração recusada pelo Higgsfield');

  const videoUrl = extrairUrlVideo(jobSet);
  if (!videoUrl) throw new Error('Higgsfield não retornou URL de vídeo');

  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`falha ao baixar vídeo animado (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Anima cada cena estática (PNG) em um clipe de vídeo curto via Higgsfield AI.
 * Cenas que falharem na animação caem de volta para a imagem estática original
 * (o Ken Burns de video.js continua funcionando normalmente nesse caso).
 */
export async function animarCenas(cenas, outputDir, onProgress) {
  if (!temHiggsfield()) return cenas;

  const hf  = criarCliente();
  const dir = join(outputDir, 'cenas_animadas');
  await ensureDir(dir);

  const resultado = [];
  for (let i = 0; i < cenas.length; i++) {
    try {
      const videoBuffer = await animarUmaCena(hf, cenas[i], i);
      const out = join(dir, `cena_${String(i).padStart(2, '0')}.mp4`);
      await writeFile(out, videoBuffer);
      resultado.push(out);
    } catch (e) {
      console.warn(`\n      ⚠  Cena ${i + 1} não animada (${e.message}). Usando imagem estática.`);
      resultado.push(cenas[i]);
    }
    if (onProgress) onProgress();
  }
  return resultado;
}
