import { createCanvas } from '@napi-rs/canvas';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { wrapText } from './utils.js';

const W = 1280;
const H = 720;

// Paletas por gênero do livro (definidas também em brand.js)
const PALETA_GENERO = {
  autodesenvolvimento: { fundo1: '#0D0D1A', fundo2: '#1A1028', acento: '#F5A623', texto: '#FFFFFF' },
  negocios:            { fundo1: '#0A2540', fundo2: '#0D1F35', acento: '#00D4AA', texto: '#FFFFFF' },
  psicologia:          { fundo1: '#1E0A3C', fundo2: '#150828', acento: '#E94560', texto: '#FFFFFF' },
  filosofia:           { fundo1: '#0D0D0D', fundo2: '#151515', acento: '#C0C0C0', texto: '#FFFFFF' },
  ciencia:             { fundo1: '#001F3F', fundo2: '#001228', acento: '#7FDBFF', texto: '#FFFFFF' },
  financas:            { fundo1: '#0B3D0B', fundo2: '#062206', acento: '#2ECC40', texto: '#FFFFFF' },
  default:             { fundo1: '#0D0D0D', fundo2: '#1A1A2E', acento: '#F5A623', texto: '#FFFFFF' },
};

const EMOJIS_TEMA = [
  { keys: ['hábito','habito','rotina','loop','habit'],      emoji: '🧠' },
  { keys: ['dinheiro','financ','rico','invest','riqueza'],  emoji: '💰' },
  { keys: ['mente','psicol','cogni','pensa','cérebro'],     emoji: '🧠' },
  { keys: ['lider','gestão','empresa','negócio','startup'], emoji: '🚀' },
  { keys: ['vida','felicidade','feliz','bem-estar'],        emoji: '✨' },
  { keys: ['sapiens','histor','humano','evolução'],         emoji: '🌍' },
  { keys: ['guerra','poder','estratégi'],                   emoji: '⚔️' },
  { keys: ['amor','relacionamento','família'],              emoji: '❤️' },
  { keys: ['ciência','tecnolog','futuro','ia'],             emoji: '🔬' },
  { keys: ['produtiv','foco','disciplin','atomic'],         emoji: '⚡' },
  { keys: ['auto','motivação','sucesso','conquist'],        emoji: '🏆' },
  { keys: ['nature','floresta','ecolog','ambiente'],        emoji: '🌿' },
];

function escolherEmoji(titulo, autor, roteiro) {
  if (roteiro?.thumbnail?.emoji) return roteiro.thumbnail.emoji;
  const txt = `${titulo} ${autor}`.toLowerCase();
  for (const { keys, emoji } of EMOJIS_TEMA) {
    if (keys.some(k => txt.includes(k))) return emoji;
  }
  return '📖';
}

function resolverPaleta(roteiro) {
  const genero = roteiro?.genero ?? 'default';
  return PALETA_GENERO[genero] ?? PALETA_GENERO.default;
}

function drawBackground(ctx, pal) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, pal.fundo1);
  g.addColorStop(1, pal.fundo2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ── Layout A: "Pergunta Poderosa" ─────────────────────────────────────────────
// Emoji no topo + frase de impacto em 2 linhas grandes + divisa + título/autor
function drawLayoutA(ctx, pal, emoji, frasePrincipal, titulo, autor) {
  drawBackground(ctx, pal);

  // Brilho decorativo no fundo
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, 350);
  glow.addColorStop(0, pal.acento + '25'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // Emoji centralizado no topo
  ctx.font = '130px Arial'; ctx.textAlign = 'center';
  ctx.fillText(emoji, W / 2, 160);

  // Frase principal em destaque
  ctx.shadowColor = pal.acento; ctx.shadowBlur = 24;
  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 76px Arial';
  const linhas = wrapTextLines(ctx, (frasePrincipal || titulo).toUpperCase(), W * 0.9, 90);
  let y = 270;
  for (const l of linhas.slice(0, 2)) { ctx.fillText(l, W / 2, y); y += 90; }
  ctx.shadowBlur = 0;

  // Linha acento
  ctx.fillStyle = pal.acento;
  ctx.fillRect(W / 2 - 100, y + 10, 200, 4);

  // Título + autor menores
  ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = '32px Arial';
  ctx.fillText(`📖 ${titulo}`, W / 2, y + 60);
  ctx.fillStyle = pal.acento + 'AA'; ctx.font = '24px Arial';
  ctx.fillText('RESUMO FÁCIL', W / 2, y + 100);
}

// ── Layout B: "Número Impactante" ─────────────────────────────────────────────
// Número ENORME à esquerda + descrição à direita
function drawLayoutB(ctx, pal, emoji, frasePrincipal, titulo, autor, numero) {
  drawBackground(ctx, pal);

  const num = numero ?? 3;
  const divX = W * 0.42;

  // Fundo esquerdo com gradiente de acento
  const gl = ctx.createLinearGradient(0, 0, divX, 0);
  gl.addColorStop(0, pal.acento + '22'); gl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gl; ctx.fillRect(0, 0, divX, H);

  // Número ENORME
  ctx.font = 'bold 280px Arial'; ctx.textAlign = 'center';
  ctx.shadowColor = pal.acento; ctx.shadowBlur = 40;
  ctx.fillStyle = pal.acento;
  ctx.fillText(String(num), divX * 0.5, H * 0.68);
  ctx.shadowBlur = 0;

  // Lado direito: frase, linha, título
  ctx.textAlign = 'left';
  const rx = divX + 36, rw = W - rx - 36;

  // Emoji pequeno
  ctx.font = '52px Arial'; ctx.fillText(emoji, rx, 110);

  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 52px Arial';
  const linhas = wrapTextLines(ctx, (frasePrincipal || titulo).toUpperCase(), rw, 62);
  let y = 190;
  for (const l of linhas.slice(0, 3)) { ctx.fillText(l, rx, y); y += 62; }

  ctx.fillStyle = pal.acento; ctx.fillRect(rx, y + 10, rw * 0.6, 3);

  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '26px Arial';
  ctx.fillText(titulo.length > 28 ? titulo.slice(0, 25) + '…' : titulo, rx, y + 50);

  ctx.fillStyle = pal.acento + 'AA'; ctx.font = 'bold 20px Arial';
  ctx.fillText('RESUMO FÁCIL', rx, y + 88);
}

// ── Layout C: "Divisão Visual" (padrão) ──────────────────────────────────────
// Emoji grande à esquerda | Título à direita (layout original aprimorado)
function drawLayoutC(ctx, pal, emoji, frasePrincipal, titulo, autor) {
  drawBackground(ctx, pal);

  // Glow esquerdo com cor de acento
  const gl = ctx.createLinearGradient(0, 0, W * 0.55, H);
  gl.addColorStop(0, pal.acento + '35'); gl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gl; ctx.fillRect(0, 0, W * 0.55, H);

  // Separador vertical sutil
  ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(W * 0.52, 0, 3, H);

  // Emoji grande
  ctx.font = '240px Arial'; ctx.textAlign = 'center';
  ctx.shadowColor = pal.acento; ctx.shadowBlur = 30;
  ctx.fillText(emoji, W * 0.27, H / 2 + 90);
  ctx.shadowBlur = 0;

  // Lado direito
  const divX = W * 0.55, textW = W - divX - 40;
  ctx.textAlign = 'left';

  // Gradiente acento na linha vertical
  ctx.fillStyle = pal.acento;
  ctx.fillRect(divX + 20, 100, 5, H - 200);

  // Título principal
  ctx.shadowColor = pal.acento; ctx.shadowBlur = 15;
  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 66px Arial';
  const tituloY = wrapText(ctx, titulo.toUpperCase(), divX + 50, 200, textW - 40, 80);
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '32px Arial';
  ctx.fillText(`por ${autor}`, divX + 50, tituloY + 10);

  ctx.fillStyle = pal.acento;
  ctx.fillRect(divX + 50, tituloY + 45, textW - 80, 3);

  ctx.fillStyle = pal.acento; ctx.font = 'bold 44px Arial';
  ctx.fillText('EM 10 MIN', divX + 50, tituloY + 115);

  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = pal.acento; ctx.font = '26px Arial';
    ctx.fillText('★', divX + 50 + i * 34, tituloY + 165);
  }
}

// Helper para wrapText com retorno de linhas
function wrapTextLines(ctx, text, maxWidth, lineHeight) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export async function gerarThumbnail(roteiro, outputDir) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  const pal    = resolverPaleta(roteiro);
  const emoji  = escolherEmoji(roteiro.titulo, roteiro.autor, roteiro);
  const layout = roteiro?.thumbnail?.layout ?? 'C';
  const frase  = roteiro?.thumbnail?.frase_principal ?? '';
  const numero = roteiro?.thumbnail?.numero_destaque ?? null;

  switch (layout) {
    case 'A': drawLayoutA(ctx, pal, emoji, frase, roteiro.titulo, roteiro.autor); break;
    case 'B': drawLayoutB(ctx, pal, emoji, frase, roteiro.titulo, roteiro.autor, numero); break;
    default:  drawLayoutC(ctx, pal, emoji, frase, roteiro.titulo, roteiro.autor);
  }

  const outputPath = join(outputDir, 'thumbnail.png');
  await writeFile(outputPath, await canvas.encode('png'));
  return outputPath;
}
