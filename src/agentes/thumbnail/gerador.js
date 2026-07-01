import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFile, access } from 'fs/promises';
import { existsSync } from 'fs';
import { wrapText } from '../../utils.js';

// ── Helpers de renderização ────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function desenharFundo(ctx, W, H, paleta) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, paleta.fundo); g.addColorStop(0.5, paleta.sombra ?? paleta.fundo); g.addColorStop(1, paleta.fundo);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function desenharVinheta(ctx, W, H, intensidade = 0.55) {
  const g = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${intensidade})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function desenharGlow(ctx, cx, cy, r, cor, alpha = 0.35) {
  const [rv,gv,bv] = hexToRgb(cor);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(${rv},${gv},${bv},${alpha})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
}

function desenharLinhaAcento(ctx, x, y, w, h, cor) {
  ctx.fillStyle = cor; ctx.fillRect(x, y, w, h);
}

function desenharTextoComSombra(ctx, texto, x, y, maxW, cor, sombra, fonte) {
  ctx.shadowColor = sombra; ctx.shadowBlur = 20;
  ctx.fillStyle = cor; ctx.font = fonte;
  ctx.textAlign = 'left';
  wrapText(ctx, texto, x, y, maxW, parseInt(fonte) * 1.25);
  ctx.shadowBlur = 0;
}

function linhasTexto(ctx, texto, maxWidth) {
  const words = texto.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxWidth && line) { lines.push(line); line = w; }
    else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function desenharLogoBranding(ctx, W, H, canal, acento) {
  ctx.fillStyle = acento + '88'; ctx.font = 'bold 22px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`📚 ${canal.toUpperCase()}`, W/2, H - 28);
}

// ── LAYOUT A — Imersão Total ───────────────────────────────────────────────
function layoutA(ctx, W, H, cfg) {
  const { paleta, texto, livro, canal } = cfg;

  desenharFundo(ctx, W, H, paleta);
  desenharGlow(ctx, W*0.5, H*0.35, H*0.55, paleta.acento, 0.2);
  desenharVinheta(ctx, W, H);

  // Faixa inferior com texto
  const faixaY = H * 0.62;
  const grad = ctx.createLinearGradient(0, faixaY - 60, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.3, 'rgba(0,0,0,0.85)'); grad.addColorStop(1, 'rgba(0,0,0,0.97)');
  ctx.fillStyle = grad; ctx.fillRect(0, faixaY - 60, W, H - faixaY + 60);

  const estiloFonte = cfg.genero === 'literatura_classica' ? 'bold' : 'bold';
  ctx.shadowColor = paleta.acento; ctx.shadowBlur = 25;
  ctx.fillStyle = paleta.acento; ctx.font = `${estiloFonte} ${W < 800 ? 68 : 82}px Arial`;
  ctx.textAlign = 'center';
  const linhas = linhasTexto(ctx, texto.toUpperCase(), W * 0.9);
  linhas.slice(0, 2).forEach((l, i) => ctx.fillText(l, W/2, faixaY + 20 + i * 88));
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '28px Arial';
  ctx.fillText(`${livro}`, W/2, H - 68);
  desenharLogoBranding(ctx, W, H, canal, paleta.acento);
}

// ── LAYOUT B — Divisão 60/40 ──────────────────────────────────────────────
function layoutB(ctx, W, H, cfg) {
  const { paleta, texto, livro, autor, canal } = cfg;
  const divX = W * 0.56;

  desenharFundo(ctx, W, H, paleta);

  // Gradiente esquerda (área visual)
  const gl = ctx.createLinearGradient(0, 0, divX, 0);
  gl.addColorStop(0, paleta.acento + '22'); gl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gl; ctx.fillRect(0, 0, divX, H);

  // Padrão decorativo na esquerda (círculos concêntricos)
  ctx.strokeStyle = paleta.acento + '18'; ctx.lineWidth = 2;
  [160, 280, 400].forEach(r => { ctx.beginPath(); ctx.arc(divX*0.42, H/2, r, 0, Math.PI*2); ctx.stroke(); });
  desenharGlow(ctx, divX*0.42, H/2, 280, paleta.acento, 0.18);

  // Emoji / ícone central esquerdo
  ctx.font = `${W < 800 ? 160 : 200}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('📚', divX * 0.42, H/2 + 70);

  // Linha vertical separadora
  desenharLinhaAcento(ctx, divX - 2, H*0.1, 4, H*0.8, paleta.acento);

  // Lado direito — texto
  const rx = divX + 32, rw = W - rx - 32;
  ctx.textAlign = 'left';
  ctx.shadowColor = paleta.acento; ctx.shadowBlur = 18;
  ctx.fillStyle = paleta.acento; ctx.font = `bold ${W < 800 ? 58 : 70}px Arial`;
  let ty = H * 0.22;
  const linhas = linhasTexto(ctx, texto.toUpperCase(), rw);
  linhas.slice(0, 3).forEach(l => { ctx.fillText(l, rx, ty); ty += 78; });
  ctx.shadowBlur = 0;

  desenharLinhaAcento(ctx, rx, ty + 12, rw * 0.65, 3, paleta.acento);

  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '28px Arial';
  ctx.fillText(livro.length > 30 ? livro.slice(0,28)+'…' : livro, rx, ty + 55);
  ctx.fillStyle = paleta.acento+'AA'; ctx.font = 'bold 20px Arial';
  ctx.fillText(`por ${autor}`, rx, ty + 90);
  ctx.fillStyle = paleta.acento + '77'; ctx.font = 'bold 18px Arial';
  ctx.fillText(canal, rx, H - 30);
  desenharVinheta(ctx, W, H, 0.25);
}

// ── LAYOUT C — Pergunta + Visual ──────────────────────────────────────────
function layoutC(ctx, W, H, cfg) {
  const { paleta, texto, livro, autor, canal } = cfg;

  desenharFundo(ctx, W, H, paleta);

  // Faixa superior com pergunta
  const grad = ctx.createLinearGradient(0, 0, 0, H*0.28);
  grad.addColorStop(0, 'rgba(0,0,0,0.92)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H*0.3);

  ctx.textAlign = 'center';
  ctx.shadowColor = paleta.acento; ctx.shadowBlur = 22;
  ctx.fillStyle = paleta.acento; ctx.font = `bold ${W < 800 ? 64 : 78}px Arial`;
  const linhas = linhasTexto(ctx, texto.toUpperCase(), W*0.88);
  linhas.slice(0,2).forEach((l, i) => ctx.fillText(l, W/2, 80 + i * 82));
  ctx.shadowBlur = 0;

  // Visual central (círculo decorativo com glow)
  const cy = H * 0.52;
  desenharGlow(ctx, W*0.5, cy, H*0.38, paleta.acento, 0.28);
  ctx.strokeStyle = paleta.acento+'55'; ctx.lineWidth = 3;
  [120, 200, 290].forEach(r => { ctx.beginPath(); ctx.arc(W/2, cy, r, 0, Math.PI*2); ctx.stroke(); });
  ctx.fillStyle = paleta.acento; ctx.font = '110px Arial';
  ctx.fillText('📖', W/2, cy + 42);

  // Rodapé
  const gradBt = ctx.createLinearGradient(0, H*0.74, 0, H);
  gradBt.addColorStop(0, 'rgba(0,0,0,0)'); gradBt.addColorStop(0.4, 'rgba(0,0,0,0.88)'); gradBt.addColorStop(1, 'rgba(0,0,0,0.96)');
  ctx.fillStyle = gradBt; ctx.fillRect(0, H*0.74, W, H*0.26);

  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '30px Arial';
  ctx.fillText(livro.length > 36 ? livro.slice(0,33)+'…' : livro, W/2, H - 68);
  ctx.fillStyle = paleta.acento+'AA'; ctx.font = '22px Arial';
  ctx.fillText(`por ${autor}  •  ${canal}`, W/2, H - 32);
  desenharVinheta(ctx, W, H, 0.3);
}

// ── LAYOUT D — Número Impacto ──────────────────────────────────────────────
function layoutD(ctx, W, H, cfg) {
  const { paleta, texto, livro, autor, canal, numero } = cfg;
  const num = numero ?? 3;

  desenharFundo(ctx, W, H, paleta);
  desenharGlow(ctx, W*0.38, H*0.42, H*0.48, paleta.acento, 0.22);

  // Número enorme
  ctx.textAlign = 'center';
  ctx.shadowColor = paleta.acento; ctx.shadowBlur = 40;
  ctx.fillStyle = paleta.acento; ctx.font = `bold ${Math.min(W, H) * (W < 800 ? 0.55 : 0.62)}px Arial`;
  ctx.fillText(String(num), W * 0.35, H * 0.62);
  ctx.shadowBlur = 0;

  // Texto descritivo à direita
  const rx = W * 0.6, rw = W * 0.36;
  ctx.textAlign = 'left';
  const semNumero = texto.replace(/\d+\s*/,'').trim();
  ctx.fillStyle = '#FFFFFF'; ctx.font = `bold ${W < 800 ? 46 : 56}px Arial`;
  let ty = H * 0.28;
  linhasTexto(ctx, semNumero.toUpperCase(), rw).slice(0,4).forEach(l => { ctx.fillText(l, rx, ty); ty += 62; });

  desenharLinhaAcento(ctx, rx, ty + 10, rw * 0.7, 3, paleta.acento);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '26px Arial';
  ctx.fillText(livro.length > 22 ? livro.slice(0,20)+'…' : livro, rx, ty + 48);
  ctx.fillStyle = paleta.acento+'AA'; ctx.font = 'bold 18px Arial';
  ctx.fillText(canal, rx, H - 28);
  desenharVinheta(ctx, W, H, 0.35);
}

// ── LAYOUT E — Rosto/Emoção Vertical ──────────────────────────────────────
function layoutE(ctx, W, H, cfg) {
  const { paleta, texto, livro, canal } = cfg;

  desenharFundo(ctx, W, H, paleta);
  desenharGlow(ctx, W*0.5, H*0.42, H*0.38, paleta.acento, 0.25);

  // Topo — pergunta
  const gt = ctx.createLinearGradient(0, 0, 0, H*0.25);
  gt.addColorStop(0, 'rgba(0,0,0,0.95)'); gt.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gt; ctx.fillRect(0, 0, W, H*0.28);

  ctx.textAlign = 'center';
  ctx.shadowColor = paleta.acento; ctx.shadowBlur = 20;
  ctx.fillStyle = paleta.acento; ctx.font = 'bold 72px Arial';
  linhasTexto(ctx, texto.toUpperCase(), W*0.9).slice(0,2).forEach((l,i) => ctx.fillText(l, W/2, 90 + i*84));
  ctx.shadowBlur = 0;

  // Visual central
  ctx.fillStyle = paleta.acento; ctx.font = '200px Arial'; ctx.fillText('📚', W/2, H*0.6);

  // Rodapé
  const gb = ctx.createLinearGradient(0, H*0.72, 0, H);
  gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(0.4, 'rgba(0,0,0,0.92)');
  ctx.fillStyle = gb; ctx.fillRect(0, H*0.72, W, H*0.28);
  ctx.fillStyle = '#FFF'; ctx.font = 'bold 44px Arial';
  ctx.fillText(livro.length > 20 ? livro.slice(0,18)+'…' : livro, W/2, H - 120);
  ctx.fillStyle = paleta.acento; ctx.font = 'bold 36px Arial';
  ctx.fillText('#shorts', W/2, H - 55);
  desenharVinheta(ctx, W, H, 0.4);
}

// ── LAYOUT F — Contraste Vertical ─────────────────────────────────────────
function layoutF(ctx, W, H, cfg) {
  const { paleta, texto, livro, canal } = cfg;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, paleta.fundo); bg.addColorStop(1, paleta.sombra ?? paleta.fundo);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  desenharGlow(ctx, W*0.75, H*0.22, 420, paleta.acento, 0.2);

  // Emoji grande
  ctx.textAlign = 'center'; ctx.font = '200px Arial';
  ctx.fillText('📚', W/2, H*0.28);

  // Texto principal em destaque
  ctx.shadowColor = paleta.acento; ctx.shadowBlur = 24;
  ctx.fillStyle = paleta.acento; ctx.font = 'bold 76px Arial';
  let ty = H*0.45;
  linhasTexto(ctx, texto.toUpperCase(), W*0.88).slice(0,3).forEach(l => { ctx.fillText(l, W/2, ty); ty += 86; });
  ctx.shadowBlur = 0;

  desenharLinhaAcento(ctx, W/2 - 130, ty + 10, 260, 3, paleta.acento);
  ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = '34px Arial';
  ctx.fillText('📚 ' + canal, W/2, ty + 55);
  ctx.fillStyle = paleta.acento; ctx.font = 'bold 38px Arial';
  ctx.fillText('#shorts', W/2, H - 48);
  desenharVinheta(ctx, W, H, 0.35);
}

// ── Dispatcher principal ───────────────────────────────────────────────────

const LAYOUTS_FN = { LAYOUT_A: layoutA, LAYOUT_B: layoutB, LAYOUT_C: layoutC, LAYOUT_D: layoutD, LAYOUT_E: layoutE, LAYOUT_F: layoutF };

export async function gerarThumbnailCanvas(instrucoes, outputPath) {
  const { width, height, layout } = instrucoes;
  const canvas = createCanvas(width, height);
  const ctx    = canvas.getContext('2d');

  const fn = LAYOUTS_FN[layout] ?? layoutC;
  fn(ctx, width, height, instrucoes);

  await writeFile(outputPath, await canvas.encode('png'));
  return outputPath;
}
