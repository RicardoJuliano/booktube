import { createCanvas } from '@napi-rs/canvas';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { wrapText } from './utils.js';

const W = 1280;
const H = 720;

const EMOJIS_POR_TEMA = [
  { palavras: ['hábito', 'habito', 'habit'], emoji: '🔄' },
  { palavras: ['dinheiro', 'finan', 'rico', 'riqueza', 'invest'], emoji: '💰' },
  { palavras: ['mente', 'cérebro', 'psicol', 'pensa'], emoji: '🧠' },
  { palavras: ['lider', 'líder', 'gestão', 'empresa', 'negócio'], emoji: '🚀' },
  { palavras: ['vida', 'felicidade', 'feliz', 'bem-estar'], emoji: '✨' },
  { palavras: ['sapiens', 'história', 'humano', 'evolução'], emoji: '🌍' },
  { palavras: ['guerra', 'estratégia', 'poder'], emoji: '⚔️' },
  { palavras: ['amor', 'relacionamento'], emoji: '❤️' },
  { palavras: ['ciência', 'tecnologia', 'futuro', 'ia'], emoji: '🔬' },
  { palavras: ['auto', 'motivação', 'sucesso'], emoji: '🏆' },
];

function escolherEmoji(titulo, autor) {
  const textoLower = `${titulo} ${autor}`.toLowerCase();
  for (const { palavras, emoji } of EMOJIS_POR_TEMA) {
    if (palavras.some(p => textoLower.includes(p))) return emoji;
  }
  return '📖';
}

function tituloResumido(titulo) {
  const palavras = titulo.split(' ');
  if (palavras.length <= 4) return titulo;
  return palavras.slice(0, 4).join(' ') + '...';
}

export async function gerarThumbnail(roteiro, outputDir) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const gradBg = ctx.createLinearGradient(0, 0, W, H);
  gradBg.addColorStop(0, '#0D0D0D');
  gradBg.addColorStop(0.5, '#1A1A2E');
  gradBg.addColorStop(1, '#16213E');
  ctx.fillStyle = gradBg;
  ctx.fillRect(0, 0, W, H);

  const gradLeft = ctx.createLinearGradient(0, 0, W * 0.55, H);
  gradLeft.addColorStop(0, 'rgba(233, 69, 96, 0.3)');
  gradLeft.addColorStop(1, 'rgba(233, 69, 96, 0)');
  ctx.fillStyle = gradLeft;
  ctx.fillRect(0, 0, W * 0.55, H);

  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(W * 0.52, 0, 3, H);

  const emoji = escolherEmoji(roteiro.titulo, roteiro.autor);
  ctx.font = '220px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(emoji, W * 0.27, H / 2 + 80);

  const divX = W * 0.55;
  const textAreaW = W - divX - 40;

  const gradAcento = ctx.createLinearGradient(divX, 0, W, 0);
  gradAcento.addColorStop(0, '#E94560');
  gradAcento.addColorStop(1, '#F5A623');

  ctx.fillStyle = gradAcento;
  ctx.fillRect(divX + 20, 120, 6, H - 240);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 68px Arial';
  ctx.textAlign = 'left';
  const tituloY = wrapText(ctx, tituloResumido(roteiro.titulo).toUpperCase(), divX + 50, 200, textAreaW - 40, 82);

  ctx.fillStyle = '#B0B0C0';
  ctx.font = '34px Arial';
  ctx.fillText(`por ${roteiro.autor}`, divX + 50, tituloY + 20);

  ctx.fillStyle = gradAcento;
  ctx.fillRect(divX + 50, tituloY + 55, textAreaW - 80, 4);

  ctx.fillStyle = '#F5A623';
  ctx.font = 'bold 52px Arial';
  ctx.fillText('EM 10 MIN', divX + 50, tituloY + 130);

  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = '#F5A623';
    ctx.font = '28px Arial';
    ctx.fillText('★', divX + 50 + i * 36, tituloY + 185);
  }

  const outputPath = join(outputDir, 'thumbnail.png');
  await writeFile(outputPath, await canvas.encode('png'));
  return outputPath;
}
