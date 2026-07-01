import { writeFile } from 'fs/promises';
import { join } from 'path';

// H:MM:SS.CS  (formato ASS — centisegundos)
function assTime(s) {
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const se = Math.floor(s % 60);
  const cs = Math.round((s % 1) * 100);
  return `${h}:${String(m).padStart(2,'0')}:${String(se).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}

function esc(t) {
  return t.replace(/\\/g,'\\\\').replace(/\{/g,'\\{').replace(/\}/g,'\\}').replace(/\r?\n/g,'\\N');
}

// Divide texto em grupos de N palavras e espalha no intervalo [inicio, fim]
function emFrases(texto, inicio, fim, n = 4) {
  const words = texto.trim().replace(/\s+/g,' ').split(' ').filter(Boolean);
  if (!words.length) return [];

  const grupos = [];
  for (let i = 0; i < words.length; i += n)
    grupos.push(words.slice(i, i + n).join(' ').toUpperCase());

  const dur = Math.max(fim - inicio, 0.3);
  const dp  = dur / grupos.length;
  return grupos.map((t, i) => ({
    t,
    inicio: inicio + i * dp,
    fim:    Math.min(inicio + (i + 1) * dp - 0.05, fim),
  }));
}

/**
 * Distribui as frases ao longo do áudio usando CONTAGEM DE CARACTERES como proxy
 * para duração real de fala — muito mais preciso que os duracao_segundos estimados pelo Claude.
 *
 * ⚠️ INVARIANTE CRÍTICO: esta função depende da estrutura de breaks definida
 * em construirTextoNarracao() em src/narracao.js. Alterar lá exige alterar aqui também.
 * video.js (duracoesDasCenas) e metadata.js (calcularTimestamps) reutilizam esta
 * mesma função para os timings de cena e dos capítulos do YouTube — os três
 * estágios precisam concordar com o mesmo timeline.
 *
 * Estrutura SSML enviada ao ElevenLabs (ver narracao.js):
 *   [gancho_7s+gancho] <break 1.5s> [seg+transicao] <break 1.0s> ... <break 1.5s> [conclusao]
 */
export function calcularTimings(roteiro, duracaoTotal) {
  const PAUSA_GANCHO = 1.5;
  const PAUSA_SEG   = 1.0;
  const PAUSA_CONC  = 1.5;

  const nSegs       = roteiro.segmentos.length;
  const totalPausas = PAUSA_GANCHO + (nSegs - 1) * PAUSA_SEG + PAUSA_CONC;
  const tempoFala   = Math.max(duracaoTotal - totalPausas, 5);

  // Bloco do gancho = gancho_7s + gancho (espelha narracao.js)
  const ganchoTexto = [roteiro.gancho_7s, roteiro.gancho].filter(Boolean).join('\n\n');
  const charG = ganchoTexto.length || (roteiro.gancho?.length ?? 0);

  // Cada segmento = texto_narrado + transicao_para_proximo (espelha narracao.js)
  const charS = roteiro.segmentos.map(s =>
    [s.texto_narrado, s.transicao_para_proximo].filter(Boolean).join('\n\n').length
  );
  const charC = roteiro.conclusao.length;
  const total = charG + charS.reduce((a, b) => a + b, 0) + charC;

  const toSec = (c) => (c / total) * tempoFala;

  const blocos = [];
  let t = 0;

  // Gancho
  const dG = toSec(charG);
  blocos.push({ texto: ganchoTexto, inicio: t, fim: t + dG, tipo: 'gancho' });
  t += dG + PAUSA_GANCHO;

  // Segmentos
  for (let i = 0; i < nSegs; i++) {
    const d = toSec(charS[i]);
    const segTexto = [roteiro.segmentos[i].texto_narrado, roteiro.segmentos[i].transicao_para_proximo].filter(Boolean).join('\n\n');
    blocos.push({ texto: segTexto, inicio: t, fim: t + d, tipo: 'segmento', segIndex: i });
    t += d;
    if (i < nSegs - 1) t += PAUSA_SEG;
  }

  // Conclusão
  t += PAUSA_CONC;
  const dC = toSec(charC);
  blocos.push({ texto: roteiro.conclusao, inicio: t, fim: t + dC, tipo: 'conclusao' });

  return blocos;
}

export async function gerarLegenda(roteiro, duracaoTotal, outputDir) {
  const blocos = calcularTimings(roteiro, duracaoTotal);

  // Expande cada bloco em frases de 4 palavras
  const dialogos = [];
  for (const bloco of blocos) {
    dialogos.push(...emFrases(bloco.texto, bloco.inicio, bloco.fim, 4));
  }

  const ass = `[Script Info]
ScriptType: v4.00+
WrapStyle: 2
ScaledBorderAndShadow: yes
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,54,&H00FFFFFF,&H000000FF,&H00000000,&H99000000,1,0,0,0,100,100,0,0,3,2,1,2,20,20,300,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogos.map(d => `Dialogue: 0,${assTime(d.inicio)},${assTime(d.fim)},Default,,0,0,0,,{\\fad(120,80)}${esc(d.t)}`).join('\n')}`;

  const assPath = join(outputDir, 'legendas.ass');
  await writeFile(assPath, ass, 'utf-8');
  return { assPath, totalFrases: dialogos.length, blocos };
}
