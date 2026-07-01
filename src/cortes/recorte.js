import ffmpeg from 'fluent-ffmpeg';
import { resolve } from 'path';
import { ensureDir } from '../utils.js';

function escPath(p) {
  return resolve(p).replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, l) => `${l}\\:`);
}

function frames(d) { return Math.max(Math.ceil(d * 30), 2); }

// Escapa texto para uso seguro no filtro drawtext do FFmpeg
function escText(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g,  "\\'")
    .replace(/:/g,  '\\:')
    .replace(/,/g,  '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .trim()
    .slice(0, 55); // máx ~55 chars cabe em uma linha a 44px no frame 1080px
}

/**
 * Corta um segmento do video_final.mp4 e converte para formato vertical 1080x1920.
 *
 * Estratégia de conversão landscape→portrait:
 *   1. Escala para altura 1920 (mantém AR → ~3414px de largura)
 *   2. Crop central 1080px de largura → frame 1080x1920
 *   3. Ken Burns sutil para dinamismo
 *   4. Texto do gancho sobreposto nos primeiros 3.5 segundos
 *
 * O áudio (narração + música já mixados no video_final.mp4) é preservado.
 * As legendas já queimadas no vídeo horizontal ficam legíveis após a escala/crop.
 */
export function recortarVertical(corte, videoPath, outputDir, onProgress) {
  const { inicio_real, duracao, gancho } = corte;
  const saida = `${outputDir}/corte_vertical.mp4`;
  ensureDir(outputDir);

  const dFrames  = frames(duracao);
  const ganchoEsc = escText(gancho);

  return new Promise((res, rej) => {
    let stderrLog = '';

    const filters = [
      // Landscape 1920×1080 → escala para height=1920 → width≈3414
      `[0:v]scale=-2:1920[scaled]`,
      // Crop central 1080px → 1080×1920 (9:16)
      `[scaled]crop=1080:1920[cropped]`,
      // Ken Burns leve no formato vertical
      `[cropped]zoompan=z='min(zoom+0.0004,1.1)':d=${dFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30[zoomed]`,
      // Gancho em destaque nos primeiros 3.5 segundos
      `[zoomed]drawtext=text='${ganchoEsc}':fontsize=44:fontcolor=white:` +
        `x=(w-text_w)/2:y=120:` +
        `box=1:boxcolor=0x000000AA:boxborderw=18:` +
        `enable='lte(t\\,3.5)'[vout]`,
    ];

    ffmpeg()
      .input(videoPath)
      .inputOptions([`-ss ${inicio_real.toFixed(2)}`])
      .complexFilter(filters)
      .outputOptions([
        '-map [vout]',
        '-map 0:a',
        `-t ${duracao.toFixed(2)}`,
        '-c:v libx264', '-preset fast', '-crf 22',
        '-c:a aac', '-b:a 128k',
        '-pix_fmt yuv420p',
        '-r 30',
        '-movflags +faststart',
      ])
      .output(saida)
      .on('stderr',   line => { stderrLog += line + '\n'; })
      .on('progress', p => { if (onProgress && p.percent) onProgress(Math.min(Math.round(p.percent), 99)); })
      .on('end',      () => res(saida))
      .on('error',    err => {
        const tail = stderrLog.trim().split('\n').slice(-10).join('\n');
        rej(new Error(`FFmpeg corte: ${err.message}\n${tail}`));
      })
      .run();
  });
}
