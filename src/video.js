import ffmpeg from 'fluent-ffmpeg';
import { existsSync, copyFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { verificarFFmpeg } from './utils.js';
import { calcularTimings } from './legenda.js';

export function detectarDuracaoMP3(arquivo) {
  return new Promise((res, rej) => {
    ffmpeg.ffprobe(arquivo, (err, meta) => {
      if (err) return rej(err);
      res(meta.format.duration);
    });
  });
}

// Escapa path para o filtro subtitles do FFmpeg no Windows
function escPath(p) {
  return resolve(p).replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, l) => `${l}\\:`);
}

// Efeitos Ken Burns alternados — zoom + pan em 5 variações
// Nota: nas expressões do zoompan, 'd' NÃO é variável válida — usar ${frames(d)} literal
const KB = [
  // Zoom in suave ao centro
  (d) => `zoompan=z='min(zoom+0.0007,1.18)':d=${frames(d)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30`,
  // Zoom out suave ao centro
  (d) => `zoompan=z='if(lte(zoom,1.0),1.18,max(zoom-0.0007,1.0))':d=${frames(d)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30`,
  // Pan esquerda → direita com zoom leve
  (d) => `zoompan=z='1.12':d=${frames(d)}:x='(iw-iw/zoom)*on/${frames(d)}':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30`,
  // Pan direita → esquerda com zoom leve
  (d) => `zoompan=z='1.12':d=${frames(d)}:x='(iw-iw/zoom)*(1-on/${frames(d)})':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30`,
  // Pan de cima → baixo com zoom leve
  (d) => `zoompan=z='1.10':d=${frames(d)}:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*on/${frames(d)}':s=1920x1080:fps=30`,
];

function frames(d) { return Math.max(Math.ceil(d * 30), 2); }

/**
 * Calcula a duração de cada cena com base nos blocos de legenda
 * (mesma distribuição por contagem de chars, sincronizada com legenda.js)
 */
function duracoesDasCenas(roteiro, duracaoTotal) {
  const blocos = calcularTimings(roteiro, duracaoTotal);
  // blocos: [gancho, seg0, seg1, ..., segN-1, conclusao]
  // cenas:  [abertura, seg0, seg1, ..., segN-1, conclusao]
  // A cena de abertura cobre o bloco do gancho
  const duracoes = blocos.map(b => Math.max(b.fim - b.inicio, 2));
  return duracoes; // 1 cena por bloco, na mesma ordem
}

export async function composarVideo(cenas, assPath, narracao, musicaPath, outputDir, roteiro, onProgress) {
  if (!verificarFFmpeg()) throw new Error('❌ FFmpeg não encontrado. Instale em https://ffmpeg.org/download.html');

  const duracaoTotal = await detectarDuracaoMP3(narracao);
  const duracoes     = duracoesDasCenas(roteiro, duracaoTotal);
  const temMusica    = musicaPath && existsSync(musicaPath);
  const outputPath   = join(outputDir, 'video_final.mp4');

  // Copia o ASS para temp sem caracteres especiais no caminho (evita bug do FFmpeg/Windows)
  const tempAss = join(tmpdir(), 'bn_legendas.ass');
  copyFileSync(assPath, tempAss);
  const assEsc = escPath(tempAss);

  return new Promise((resolveP, rejectP) => {
    const cmd = ffmpeg();

    // Um input por cena (imagem em loop)
    cenas.forEach(c => cmd.input(c).inputOptions(['-loop 1']));
    cmd.input(narracao);
    if (temMusica) cmd.input(musicaPath);

    const numCenas  = cenas.length;
    const audioNIdx = numCenas;
    const audioMIdx = temMusica ? numCenas + 1 : -1;
    const FADE      = 0.5;

    const filters = [];

    // Ken Burns em cada cena
    for (let i = 0; i < numCenas; i++) {
      const dur = duracoes[i] || 5;
      filters.push(
        `[${i}:v]trim=duration=${dur.toFixed(2)},${KB[i % KB.length](dur)},setsar=1[kb${i}]`
      );
    }

    // Encadeia todas as cenas com xfade (fade entre cenas)
    if (numCenas === 1) {
      filters.push(`[kb0]copy[vpre]`);
    } else {
      let offset = (duracoes[0] || 5) - FADE;
      let prev   = 'kb0';
      for (let i = 1; i < numCenas; i++) {
        const out = i === numCenas - 1 ? 'vpre' : `xf${i}`;
        filters.push(`[${prev}][kb${i}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(2)}[${out}]`);
        offset += (duracoes[i] || 5) - FADE;
        prev = out;
      }
    }

    // Overlays as legendas (texto animado) sobre o vídeo final
    filters.push(
      `[vpre]subtitles='${assEsc}':force_style='FontName=Arial,Bold=1,FontSize=96,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=5,Shadow=3,Alignment=5,MarginV=80'[vout]`
    );

    // Mixagem de áudio
    if (temMusica) {
      filters.push(
        `[${audioNIdx}:a]aformat=fltp:44100:stereo[narracao]`,
        `[${audioMIdx}:a]aformat=fltp:44100:stereo,volume=0.12[musica]`,
        `[narracao][musica]amix=inputs=2:duration=first:dropout_transition=2[aout]`
      );
    } else {
      filters.push(`[${audioNIdx}:a]aformat=fltp:44100:stereo[aout]`);
    }

    let stderrLog = '';
    cmd
      .complexFilter(filters)
      .outputOptions([
        '-map [vout]', '-map [aout]',
        '-c:v libx264', '-preset medium', '-crf 20',
        '-c:a aac', '-b:a 192k',
        '-pix_fmt yuv420p', '-movflags +faststart',
        '-shortest', '-r 30',
      ])
      .output(outputPath)
      .on('stderr', line => { stderrLog += line + '\n'; })
      .on('progress', p => { if (onProgress && p.percent) onProgress(Math.min(Math.round(p.percent), 99)); })
      .on('end',   () => resolveP(outputPath))
      .on('error', err => {
        // Extrai as últimas 20 linhas do log para facilitar diagnóstico
        const tail = stderrLog.trim().split('\n').slice(-20).join('\n');
        rejectP(new Error(`❌ FFmpeg: ${err.message}\n\n--- FFmpeg stderr (últimas linhas) ---\n${tail}`));
      })
      .run();
  });
}
