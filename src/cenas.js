import { createCanvas } from '@napi-rs/canvas';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { ensureDir } from './utils.js';

const W = 1920, H = 1080;
const BAND = 280;
const AH   = H - BAND;

// ── Paletas cinematográficas ────────────────────────────────────────────
const PALETAS = [
  { a:'#0D0400', b:'#2A0E00', c:'#6B3200', acc:'#F5A623', txt:'#FFF8F0' },
  { a:'#00060F', b:'#001432', c:'#003080', acc:'#4FC3F7', txt:'#E8F4FD' },
  { a:'#010A03', b:'#022B0A', c:'#065A18', acc:'#69F0AE', txt:'#EDFFF4' },
  { a:'#0B0014', b:'#200040', c:'#46008C', acc:'#D084F5', txt:'#FAF0FF' },
  { a:'#001414', b:'#003232', c:'#005E5E', acc:'#26C6DA', txt:'#E0FFFD' },
  { a:'#150002', b:'#360005', c:'#780010', acc:'#FF5252', txt:'#FFF0F2' },
  { a:'#100B00', b:'#2A1E00', c:'#5C3E00', acc:'#FFD54F', txt:'#FFFBF0' },
  { a:'#02030E', b:'#060A28', c:'#0E1660', acc:'#7986CB', txt:'#F0F2FF' },
];

// ── Mapa de cena por palavras-chave ─────────────────────────────────────
const KEYWORD_SCENE = [
  { cena:'loop',    keys:['hábito','habito','rotina','ciclo','loop','automático','trigger','gatilho','recompensa'] },
  { cena:'mind',    keys:['mente','cérebro','cerebro','psicol','conscien','pensa','cognit','emocao','emoção'] },
  { cena:'climb',   keys:['cresci','desenvolv','aprend','evolui','muda','transform','melhora','esfor','superar'] },
  { cena:'network', keys:['social','relação','relacao','comuni','grupo','equipe','pessoas','conexão','conexao'] },
  { cena:'office',  keys:['trabalh','produtiv','foco','disciplin','método','metodo','estratégi','planejar'] },
  { cena:'city',    keys:['mercado','empres','negóci','negoci','finanç','dinheiro','econom','carreira'] },
  { cena:'forest',  keys:['nature','natural','flor','vida','tempo','equilíb','bem-estar','calma'] },
  { cena:'light',   keys:['descoberta','ideia','solução','criativ','inovaç','insight','revelaç'] },
];

function detectarCena(segmento, fallbackIndex) {
  const txt = `${segmento.titulo_slide ?? segmento.titulo ?? ''} ${segmento.ponto_chave ?? ''} ${segmento.texto_narrado ?? ''}`.toLowerCase();
  for (const { cena, keys } of KEYWORD_SCENE) {
    if (keys.some(k => txt.includes(k))) return cena;
  }
  const fb = ['city','forest','climb','office','mind','loop','network','light'];
  return fb[fallbackIndex % fb.length];
}

function rng(seed) {
  let s = ((seed * 1664525 + 1013904223) >>> 0);
  return () => { s = ((s * 1664525 + 1013904223) >>> 0); return s / 4294967295; };
}

function hexToRgb(hex) {
  const h = hex.replace('#','');
  return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`;
}

// ── Primitivos ───────────────────────────────────────────────────────────

function gradSky(ctx, p, h = AH) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, p.a); g.addColorStop(0.45, p.b); g.addColorStop(1, p.c);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, h);
}

function drawStars(ctx, r, n = 220, maxY = AH * 0.65) {
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * maxY, sz = r() * 2.2 + 0.3;
    ctx.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.75})`;
    ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI * 2); ctx.fill();
  }
}

function drawGround(ctx, gndY, color = 'rgba(0,0,0,0.92)') {
  ctx.fillStyle = color; ctx.fillRect(0, gndY, W, AH - gndY);
}

function drawGlow(ctx, cx, cy, radius, rgbColor, alpha = 0.5) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0,   `rgba(${rgbColor},${alpha})`);
  g.addColorStop(0.4, `rgba(${rgbColor},${alpha * 0.5})`);
  g.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
}

function drawLightRays(ctx, cx, cy, hexColor, n = 14, len = 600) {
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, sp = 0.018;
    const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    g.addColorStop(0, hexColor + '55'); g.addColorStop(1, hexColor + '00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a - sp) * len, cy + Math.sin(a - sp) * len);
    ctx.lineTo(cx + Math.cos(a + sp) * len, cy + Math.sin(a + sp) * len);
    ctx.fill();
  }
  ctx.restore();
}

function drawBuildings(ctx, gndY, r, color = 'rgba(0,0,0,0.78)') {
  const n = 18 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) {
    const bw = (W / n) * (0.55 + r() * 0.65);
    const bh = gndY * (0.22 + r() * 0.65);
    const bx = (i / n) * W * 1.08 - W * 0.04;
    const by = gndY - bh;
    ctx.fillStyle = color; ctx.fillRect(bx, by, bw, bh + 1);
    const wc = Math.floor(bw / 16), wr = Math.floor(bh / 24);
    for (let row = 0; row < wr; row++) {
      for (let col = 0; col < wc; col++) {
        if (r() > 0.52) {
          ctx.fillStyle = `rgba(255,240,150,${0.12 + r() * 0.4})`;
          ctx.fillRect(bx + col * 16 + 3, by + row * 24 + 5, 9, 13);
        }
      }
    }
  }
}

function drawHills(ctx, gndY, r, layers = 3) {
  for (let l = 0; l < layers; l++) {
    ctx.fillStyle = `rgba(0,0,0,${0.32 + l * 0.22})`;
    ctx.beginPath(); ctx.moveTo(0, gndY);
    for (let x = 0; x <= W; x += 40) {
      const y = gndY - (gndY * (0.16 + l * 0.12)) * (0.4 + 0.6 * Math.sin(x * 0.003 + l * 2.1));
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.lineTo(W, gndY); ctx.closePath(); ctx.fill();
  }
}

function drawTrees(ctx, gndY, r, color = 'rgba(0,0,0,0.85)', n = 28) {
  for (let i = 0; i < n; i++) {
    const x = r() * W, trH = 70 + r() * 130, trW = trH * 0.45;
    ctx.fillStyle = color;
    ctx.fillRect(x - trW * 0.07, gndY - trH * 0.32, trW * 0.14, trH * 0.32);
    ctx.beginPath();
    ctx.moveTo(x, gndY - trH); ctx.lineTo(x - trW * 0.5, gndY - trH * 0.42); ctx.lineTo(x + trW * 0.5, gndY - trH * 0.42);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, gndY - trH * 0.72); ctx.lineTo(x - trW * 0.42, gndY - trH * 0.22); ctx.lineTo(x + trW * 0.42, gndY - trH * 0.22);
    ctx.fill();
  }
}

// Silhueta humana proporcional
function drawPerson(ctx, cx, botY, h, color, pose = 'standing') {
  ctx.fillStyle = color;
  const hR = h * 0.1, sW = h * 0.18, hipW = h * 0.13, torsoH = h * 0.28;
  const headY  = botY - h + hR;
  const shldrY = headY + hR * 1.6;
  const hipY   = shldrY + torsoH;

  ctx.beginPath(); ctx.arc(cx, headY, hR, 0, Math.PI * 2); ctx.fill();

  if (pose === 'standing') {
    ctx.beginPath();
    ctx.moveTo(cx-sW,shldrY); ctx.lineTo(cx+sW,shldrY); ctx.lineTo(cx+hipW,hipY); ctx.lineTo(cx-hipW,hipY); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx-sW,shldrY); ctx.lineTo(cx-sW*1.55,hipY); ctx.lineTo(cx-sW*1.25,hipY+h*0.03); ctx.lineTo(cx-sW*0.7,shldrY+h*0.04); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx+sW*0.7,shldrY+h*0.04); ctx.lineTo(cx+sW*1.25,hipY+h*0.03); ctx.lineTo(cx+sW*1.55,hipY); ctx.lineTo(cx+sW,shldrY); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx-hipW,hipY); ctx.lineTo(cx-h*0.02,hipY); ctx.lineTo(cx-h*0.04,botY); ctx.lineTo(cx-hipW*1.1,botY); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx+h*0.02,hipY); ctx.lineTo(cx+hipW,hipY); ctx.lineTo(cx+hipW*1.1,botY); ctx.lineTo(cx+h*0.04,botY); ctx.fill();

  } else if (pose === 'arms-up') {
    ctx.beginPath();
    ctx.moveTo(cx-sW,shldrY); ctx.lineTo(cx+sW,shldrY); ctx.lineTo(cx+hipW,hipY); ctx.lineTo(cx-hipW,hipY); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx-sW,shldrY); ctx.lineTo(cx-sW*1.8,shldrY-h*0.32); ctx.lineTo(cx-sW*1.5,shldrY-h*0.35); ctx.lineTo(cx-sW*0.7,shldrY+h*0.02); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx+sW*0.7,shldrY+h*0.02); ctx.lineTo(cx+sW*1.5,shldrY-h*0.35); ctx.lineTo(cx+sW*1.8,shldrY-h*0.32); ctx.lineTo(cx+sW,shldrY); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx-hipW,hipY); ctx.lineTo(cx-h*0.02,hipY); ctx.lineTo(cx-h*0.04,botY); ctx.lineTo(cx-hipW*1.1,botY); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx+h*0.02,hipY); ctx.lineTo(cx+hipW,hipY); ctx.lineTo(cx+hipW*1.1,botY); ctx.lineTo(cx+h*0.04,botY); ctx.fill();

  } else if (pose === 'walking') {
    ctx.beginPath();
    ctx.moveTo(cx-sW,shldrY); ctx.lineTo(cx+sW,shldrY); ctx.lineTo(cx+hipW,hipY); ctx.lineTo(cx-hipW,hipY); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx+sW,shldrY); ctx.lineTo(cx+sW*1.7,hipY-h*0.04); ctx.lineTo(cx+sW*1.4,hipY); ctx.lineTo(cx+sW*0.7,shldrY+h*0.04); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx-sW*0.7,shldrY+h*0.04); ctx.lineTo(cx-sW*1.4,hipY); ctx.lineTo(cx-sW*1.7,hipY-h*0.04); ctx.lineTo(cx-sW,shldrY); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx-hipW,hipY); ctx.lineTo(cx+h*0.02,hipY); ctx.lineTo(cx+h*0.06,botY); ctx.lineTo(cx-hipW*0.8,botY); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx-h*0.02,hipY); ctx.lineTo(cx+hipW,hipY); ctx.lineTo(cx+hipW*0.9,botY-h*0.14); ctx.lineTo(cx-h*0.06,botY-h*0.14); ctx.fill();

  } else if (pose === 'sitting') {
    const seatY = botY - h * 0.35;
    ctx.beginPath();
    ctx.moveTo(cx-sW,shldrY); ctx.lineTo(cx+sW,shldrY); ctx.lineTo(cx+hipW,seatY); ctx.lineTo(cx-hipW,seatY); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx-sW,shldrY); ctx.lineTo(cx-sW*1.5,seatY+h*0.02); ctx.lineTo(cx-sW*1.2,seatY+h*0.05); ctx.lineTo(cx-sW*0.7,shldrY+h*0.04); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx+sW*0.7,shldrY+h*0.04); ctx.lineTo(cx+sW*1.2,seatY+h*0.05); ctx.lineTo(cx+sW*1.5,seatY+h*0.02); ctx.lineTo(cx+sW,shldrY); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx-hipW,seatY); ctx.lineTo(cx+hipW,seatY); ctx.lineTo(cx+hipW+h*0.12,seatY+h*0.06); ctx.lineTo(cx-hipW-h*0.12,seatY+h*0.06); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx+hipW+h*0.08,seatY+h*0.06); ctx.lineTo(cx+hipW+h*0.14,seatY+h*0.06); ctx.lineTo(cx+hipW+h*0.14,botY); ctx.lineTo(cx+hipW+h*0.04,botY); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx-hipW-h*0.08,seatY+h*0.06); ctx.lineTo(cx-hipW-h*0.14,seatY+h*0.06); ctx.lineTo(cx-hipW-h*0.14,botY); ctx.lineTo(cx-hipW-h*0.04,botY); ctx.fill();
  }
}

// ── Faixa de texto inferior ──────────────────────────────────────────────
function drawTextBand(ctx, p, titulo, pontoChave, index, total) {
  const y0 = AH;
  const g  = ctx.createLinearGradient(0, y0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0.97)'); g.addColorStop(1, 'rgba(0,0,0,0.88)');
  ctx.fillStyle = g; ctx.fillRect(0, y0, W, BAND);
  ctx.fillStyle = p.acc; ctx.fillRect(0, y0, W, 4);

  ctx.fillStyle = p.acc + 'AA';
  ctx.font = 'bold 22px Arial'; ctx.textAlign = 'left';
  ctx.fillText(`PARTE ${index + 1} DE ${total}`, 80, y0 + 48);

  ctx.fillStyle = p.acc;
  ctx.font = 'bold 52px Arial';
  ctx.fillText(titulo.length > 55 ? titulo.slice(0,52)+'…' : titulo, 80, y0 + 106);

  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = '36px Arial';
  const pk = pontoChave.length > 110 ? pontoChave.slice(0,107)+'…' : pontoChave;
  ctx.fillText(pk, 80, y0 + 162);

  const bx = 80, by2 = y0 + BAND - 44, bw = W - 160;
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx, by2, bw, 6);
  ctx.fillStyle = p.acc; ctx.fillRect(bx, by2, bw * ((index + 1) / total), 6);
}

// ── Scene Painters ───────────────────────────────────────────────────────

function paintCity(ctx, p, r) {
  gradSky(ctx, p);
  drawStars(ctx, r, 160);
  const moonX = W * 0.72, moonY = AH * 0.24;
  drawGlow(ctx, moonX, moonY, 260, hexToRgb(p.acc), 0.22);
  ctx.fillStyle = p.acc + 'CC';
  ctx.beginPath(); ctx.arc(moonX, moonY, 55, 0, Math.PI * 2); ctx.fill();
  const gndY = AH * 0.72;
  drawGround(ctx, gndY);
  drawBuildings(ctx, gndY, r);
  drawPerson(ctx, W * 0.25, gndY, 140, 'rgba(0,0,0,0.95)', 'standing');
}

function paintForest(ctx, p, r) {
  gradSky(ctx, p);
  drawStars(ctx, r, 100);
  drawGlow(ctx, W * 0.5, AH * 0.2, 200, hexToRgb(p.acc), 0.18);
  ctx.fillStyle = p.acc + '88';
  ctx.beginPath(); ctx.arc(W * 0.5, AH * 0.2, 48, 0, Math.PI * 2); ctx.fill();
  const gndY = AH * 0.78;
  drawGround(ctx, gndY);
  drawTrees(ctx, gndY, r, 'rgba(0,0,0,0.9)', 35);
  ctx.save();
  const pg = ctx.createLinearGradient(W*0.4, AH*0.3, W*0.5, gndY);
  pg.addColorStop(0, p.acc+'22'); pg.addColorStop(1, p.acc+'00');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.moveTo(W*0.5,AH*0.3); ctx.lineTo(W*0.38,gndY); ctx.lineTo(W*0.62,gndY); ctx.fill();
  ctx.restore();
  drawPerson(ctx, W * 0.5, gndY, 150, 'rgba(0,0,0,0.95)', 'walking');
}

function paintClimb(ctx, p, r) {
  gradSky(ctx, p);
  drawStars(ctx, r, 250, AH * 0.55);
  const gndY = AH * 0.74;
  drawGround(ctx, gndY);
  drawHills(ctx, gndY, r, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.beginPath();
  ctx.moveTo(W*0.5, AH*0.08); ctx.lineTo(W*0.22, gndY); ctx.lineTo(W*0.78, gndY); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(W*0.5, AH*0.08); ctx.lineTo(W*0.43, AH*0.22); ctx.lineTo(W*0.57, AH*0.22); ctx.fill();
  drawGlow(ctx, W*0.5, AH*0.08, 180, hexToRgb(p.acc), 0.35);
  drawPerson(ctx, W*0.5, AH*0.18, 130, p.acc+'EE', 'arms-up');
}

function paintMind(ctx, p, r) {
  gradSky(ctx, p);
  const cx = W*0.5, cy = AH*0.42;
  const nodes = Array.from({length:18}, (_,i) => {
    const a = (i/18)*Math.PI*2 + r()*0.3, d = 120 + r()*220;
    return { x: cx+Math.cos(a)*d, y: cy+Math.sin(a)*d };
  });
  ctx.strokeStyle = p.acc+'44'; ctx.lineWidth = 1.5;
  for (let i = 0; i < nodes.length; i++)
    for (let j = i+1; j < nodes.length; j++)
      if (r()>0.65) { ctx.beginPath(); ctx.moveTo(nodes[i].x,nodes[i].y); ctx.lineTo(nodes[j].x,nodes[j].y); ctx.stroke(); }
  for (const n of nodes) {
    drawGlow(ctx, n.x, n.y, 35, hexToRgb(p.acc), 0.28);
    ctx.fillStyle = p.acc+'CC';
    ctx.beginPath(); ctx.arc(n.x, n.y, 8+r()*8, 0, Math.PI*2); ctx.fill();
  }
  drawGlow(ctx, cx, cy, 280, hexToRgb(p.acc), 0.45);
  drawLightRays(ctx, cx, cy, p.acc, 12, 400);
  ctx.fillStyle = p.acc;
  ctx.beginPath(); ctx.arc(cx, cy, 52, 0, Math.PI*2); ctx.fill();
  const gndY = AH*0.84;
  drawGround(ctx, gndY, 'rgba(0,0,0,0.95)');
  drawPerson(ctx, cx, gndY, 120, 'rgba(255,255,255,0.14)', 'sitting');
}

function paintLoop(ctx, p, r) {
  gradSky(ctx, p);
  const cx = W*0.5, cy = AH*0.42, R = 200;
  ctx.strokeStyle = p.acc+'CC'; ctx.lineWidth = 14; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI*0.6, Math.PI*1.6); ctx.stroke();
  const aa = Math.PI*1.6;
  const ax = cx+Math.cos(aa)*R, ay = cy+Math.sin(aa)*R;
  ctx.fillStyle = p.acc; ctx.beginPath();
  ctx.moveTo(ax+Math.cos(aa+Math.PI*0.5)*18, ay+Math.sin(aa+Math.PI*0.5)*18);
  ctx.lineTo(ax+Math.cos(aa)*28,             ay+Math.sin(aa)*28);
  ctx.lineTo(ax+Math.cos(aa-Math.PI*0.5)*18, ay+Math.sin(aa-Math.PI*0.5)*18);
  ctx.fill();
  const labels = ['GATILHO','ROTINA','RECOMPENSA'];
  const angles = [-Math.PI*0.5, Math.PI*0.6, Math.PI*1.7];
  for (let i = 0; i < 3; i++) {
    const px = cx+Math.cos(angles[i])*R, py = cy+Math.sin(angles[i])*R;
    drawGlow(ctx, px, py, 70, hexToRgb(p.acc), 0.4);
    ctx.fillStyle = p.acc;
    ctx.beginPath(); ctx.arc(px, py, 28, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center';
    ctx.fillText(labels[i], px, cy+Math.sin(angles[i])*(R+56)+6);
  }
  drawGlow(ctx, cx, cy, 120, hexToRgb(p.acc), 0.15);
  const gndY = AH*0.84;
  drawGround(ctx, gndY, 'rgba(0,0,0,0.95)');
  drawPerson(ctx, cx, gndY, 115, 'rgba(255,255,255,0.16)', 'standing');
}

function paintOffice(ctx, p, r) {
  // parede de fundo
  ctx.fillStyle = p.b; ctx.fillRect(0, 0, W, AH);
  // janela com paisagem noturna
  const wx=W*0.55, wy=AH*0.08, ww=W*0.38, wh=AH*0.62;
  const skyG = ctx.createLinearGradient(0, wy, 0, wy+wh);
  skyG.addColorStop(0,'#000810'); skyG.addColorStop(1,'#001840');
  ctx.fillStyle = skyG; ctx.fillRect(wx, wy, ww, wh);
  ctx.save(); ctx.rect(wx, wy, ww, wh); ctx.clip();
  const tr = rng(42);
  drawBuildings(ctx, wy+wh, tr, 'rgba(10,20,40,0.95)');
  drawGlow(ctx, wx+ww*0.6, wy+wh*0.1, 100, '255,200,100', 0.2);
  ctx.restore();
  ctx.strokeStyle = p.acc+'55'; ctx.lineWidth = 6;
  ctx.strokeRect(wx, wy, ww, wh);
  // mesa
  const dy = AH*0.68;
  ctx.fillStyle = 'rgba(55,28,8,0.92)'; ctx.fillRect(W*0.04, dy, W*0.52, 26);
  ctx.fillStyle = 'rgba(75,38,12,0.8)'; ctx.fillRect(W*0.04, dy+26, W*0.52, AH-dy-26);
  // candeeiro
  const lx = W*0.34, lb = dy;
  ctx.strokeStyle = p.acc+'BB'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(lx,lb); ctx.lineTo(lx,lb-95); ctx.lineTo(lx+60,lb-135); ctx.stroke();
  drawGlow(ctx, lx+70, lb-135, 160, '255,220,120', 0.32);
  ctx.fillStyle = p.acc;
  ctx.beginPath(); ctx.ellipse(lx+60, lb-130, 32, 18, 0.5, 0, Math.PI*2); ctx.fill();
  // livros
  const bc = ['#8B0000','#004080','#006B3C'];
  for (let i = 0; i < 3; i++) { ctx.fillStyle = bc[i]; ctx.fillRect(W*0.06+i*28, dy-55, 22, 55); }
  drawPerson(ctx, W*0.22, dy, 160, 'rgba(0,0,0,0.92)', 'sitting');
}

function paintNetwork(ctx, p, r) {
  gradSky(ctx, p);
  const people = [
    { x:W*0.5, y:AH*0.28, h:150 }, { x:W*0.22, y:AH*0.52, h:120 },
    { x:W*0.78, y:AH*0.52, h:120 }, { x:W*0.35, y:AH*0.70, h:100 }, { x:W*0.65, y:AH*0.70, h:100 },
  ];
  ctx.strokeStyle = p.acc+'55'; ctx.lineWidth = 3;
  for (let i = 0; i < people.length; i++)
    for (let j = i+1; j < people.length; j++) {
      const pi=people[i], pj=people[j];
      ctx.beginPath(); ctx.moveTo(pi.x,pi.y-pi.h*0.5); ctx.lineTo(pj.x,pj.y-pj.h*0.5); ctx.stroke();
      const mx=(pi.x+pj.x)/2, my=(pi.y-pi.h*0.5+pj.y-pj.h*0.5)/2;
      ctx.fillStyle=p.acc+'88'; ctx.beginPath(); ctx.arc(mx,my,5,0,Math.PI*2); ctx.fill();
    }
  drawGlow(ctx, W*0.5, AH*0.5, 300, hexToRgb(p.acc), 0.12);
  for (const { x, y, h } of people) {
    drawGlow(ctx, x, y-h*0.1, 60, hexToRgb(p.acc), 0.28);
    drawPerson(ctx, x, y, h, p.acc+'DD', 'standing');
  }
  drawGround(ctx, AH*0.86, 'rgba(0,0,0,0.95)');
}

function paintLight(ctx, p, r) {
  gradSky(ctx, p);
  const cx = W*0.5, cy = AH*0.28;
  drawGlow(ctx, cx, cy, 380, hexToRgb(p.acc), 0.5);
  drawLightRays(ctx, cx, cy, p.acc, 20, 700);
  ctx.fillStyle = p.acc+'EE';
  ctx.beginPath(); ctx.arc(cx, cy, 90, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI*2); ctx.fill();
  const gndY = AH*0.80;
  drawGround(ctx, gndY, 'rgba(0,0,0,0.95)');
  drawPerson(ctx, cx, gndY, 160, 'rgba(0,0,0,0.95)', 'arms-up');
}

const PAINTERS = { city:paintCity, forest:paintForest, climb:paintClimb,
  mind:paintMind, loop:paintLoop, office:paintOffice,
  network:paintNetwork, light:paintLight };

// ── Abertura ─────────────────────────────────────────────────────────────
async function gerarCenaAbertura(roteiro, outputDir) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  const p      = PALETAS[0];
  const r      = rng(0);

  gradSky(ctx, p);
  drawStars(ctx, r, 200);
  drawGlow(ctx, W*0.5, AH*0.65, 500, hexToRgb(p.acc), 0.28);
  drawLightRays(ctx, W*0.5, AH*0.65, p.acc, 18, 700);

  const gndY = AH*0.72;
  drawGround(ctx, gndY);
  drawHills(ctx, gndY, r, 3);

  // livro aberto
  const bx = W*0.5, by = AH*0.58;
  drawGlow(ctx, bx, by, 200, hexToRgb(p.acc), 0.5);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.moveTo(bx,by-60); ctx.lineTo(bx-130,by+40); ctx.lineTo(bx,by+30); ctx.fill();
  ctx.fillStyle = 'rgba(230,230,230,0.9)';
  ctx.beginPath(); ctx.moveTo(bx,by-60); ctx.lineTo(bx+130,by+40); ctx.lineTo(bx,by+30); ctx.fill();
  ctx.fillStyle = p.acc; ctx.fillRect(bx-3, by-60, 6, 90);

  // faixa
  const y0 = AH;
  const g2 = ctx.createLinearGradient(0, y0, 0, H);
  g2.addColorStop(0,'rgba(0,0,0,0.97)'); g2.addColorStop(1,'rgba(0,0,0,0.88)');
  ctx.fillStyle = g2; ctx.fillRect(0, y0, W, BAND);
  ctx.fillStyle = p.acc; ctx.fillRect(0, y0, W, 4);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = 'bold 24px Arial';
  ctx.fillText('HISTÓRIA ILUSTRADA', W/2, y0+50);
  ctx.fillStyle = p.acc;
  ctx.font = `bold ${roteiro.titulo.length > 22 ? 60 : 74}px Arial`;
  ctx.fillText((roteiro.titulo.length>36?roteiro.titulo.slice(0,33)+'…':roteiro.titulo).toUpperCase(), W/2, y0+118);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '38px Arial';
  ctx.fillText(`por ${roteiro.autor}`, W/2, y0+174);

  const out = join(outputDir, 'cenas', 'cena_00_abertura.png');
  await writeFile(out, await canvas.encode('png'));
  return out;
}

// ── Conclusão ─────────────────────────────────────────────────────────────
async function gerarCenaConclusao(roteiro, outputDir) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  const p      = PALETAS[6];
  const r      = rng(99);

  const bg = ctx.createLinearGradient(0,0,0,AH);
  bg.addColorStop(0,'#000000'); bg.addColorStop(0.4,'#150800'); bg.addColorStop(1,'#3D1500');
  ctx.fillStyle = bg; ctx.fillRect(0,0,W,AH);
  drawStars(ctx, r, 300);
  drawGlow(ctx, W*0.74, AH*0.22, 280, '255,220,150', 0.32);
  ctx.fillStyle = '#FFE08ACC';
  ctx.beginPath(); ctx.arc(W*0.74, AH*0.22, 78, 0, Math.PI*2); ctx.fill();

  const gndY = AH*0.74;
  drawGround(ctx, gndY);
  drawHills(ctx, gndY, r, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.beginPath();
  ctx.moveTo(W*0.38,gndY); ctx.quadraticCurveTo(W*0.5,AH*0.44,W*0.62,gndY); ctx.fill();
  drawGlow(ctx, W*0.5, AH*0.5, 160, '255,220,100', 0.22);
  drawPerson(ctx, W*0.5, AH*0.58, 140, '#FFE08AEE', 'arms-up');

  const y0 = AH;
  const g2 = ctx.createLinearGradient(0,y0,0,H);
  g2.addColorStop(0,'rgba(0,0,0,0.97)'); g2.addColorStop(1,'rgba(0,0,0,0.88)');
  ctx.fillStyle = g2; ctx.fillRect(0,y0,W,BAND);
  ctx.fillStyle = '#FFD700'; ctx.fillRect(0,y0,W,4);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD700'; ctx.font = 'bold 44px Arial';
  ctx.fillText('LIÇÃO PRINCIPAL', W/2, y0+66);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '38px Arial';
  const lic = (roteiro.licao_principal ?? '').length > 90
    ? roteiro.licao_principal.slice(0,87)+'…' : (roteiro.licao_principal ?? '');
  ctx.fillText(`"${lic}"`, W/2, y0+130);
  ctx.fillStyle = 'rgba(255,215,0,0.6)'; ctx.font = 'bold 28px Arial';
  ctx.fillText('▶  INSCREVA-SE PARA MAIS HISTÓRIAS', W/2, y0+200);

  const idx = roteiro.segmentos.length + 1;
  const out = join(outputDir, 'cenas', `cena_${String(idx).padStart(2,'0')}_conclusao.png`);
  await writeFile(out, await canvas.encode('png'));
  return out;
}

// ── Segmento ─────────────────────────────────────────────────────────────
async function gerarCenaSegmento(seg, index, total, outputDir) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  const p      = PALETAS[index % PALETAS.length];
  const r      = rng(index * 31 + 7);
  const tipo   = detectarCena(seg, index);
  const paint  = PAINTERS[tipo] ?? paintCity;
  paint(ctx, p, r);
  const titulo    = seg.titulo_slide ?? seg.titulo ?? `Parte ${index + 1}`;
  const pontoChave = seg.ponto_chave ?? '';
  drawTextBand(ctx, p, titulo, pontoChave, index, total);
  const fname = `cena_${String(index+1).padStart(2,'0')}_seg${index}.png`;
  const out   = join(outputDir, 'cenas', fname);
  await writeFile(out, await canvas.encode('png'));
  return out;
}

// ── Export principal ──────────────────────────────────────────────────────
export async function gerarTodasCenas(roteiro, outputDir, onProgress) {
  const cenasDir = join(outputDir, 'cenas');
  await ensureDir(cenasDir);
  const cenas = [];
  const total = roteiro.segmentos.length;

  cenas.push(await gerarCenaAbertura(roteiro, outputDir));
  if (onProgress) onProgress();

  for (let i = 0; i < total; i++) {
    cenas.push(await gerarCenaSegmento(roteiro.segmentos[i], i, total, outputDir));
    if (onProgress) onProgress();
  }

  cenas.push(await gerarCenaConclusao(roteiro, outputDir));
  if (onProgress) onProgress();

  return cenas;
}
