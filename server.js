/**
 * BookNarrator Studio — Servidor local
 * Rode: node server.js
 * Acesse: http://localhost:3000
 */

import 'dotenv/config';
import http    from 'http';
import { readFileSync } from 'fs';
import { spawn }       from 'child_process';
import { exec }        from 'child_process';

const PORT = 3000;

// Clientes SSE conectados (para streaming de output em tempo real)
const clients = new Set();

// Processo ativo do pipeline
let activeProcess = null;
let activeJob     = null;

// Remove escape codes ANSI (cores chalk) para exibir no browser
function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;?]*[mGKHF]/g, '')
            .replace(/\x1B\][^\x07]*\x07/g, '')
            .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
}

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(msg); } catch {}
  }
}

// Extrai o número do step atual do output: [3/9] → {step:3, total:9}
function parseStep(line) {
  const m = line.match(/\[(\d+)\/(\d+)\]/);
  return m ? { step: parseInt(m[1]), total: parseInt(m[2]) } : null;
}

const server = http.createServer((req, res) => {
  const url    = req.url.split('?')[0];
  const method = req.method;

  // ── CORS para desenvolvimento ─────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── Servir o Studio HTML ──────────────────────────────────────────────────
  if (url === '/' || url === '/studio') {
    try {
      const html = readFileSync('./studio.html', 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(500); res.end('studio.html não encontrado');
    }
    return;
  }

  // ── SSE: stream de progresso em tempo real ────────────────────────────────
  if (url === '/api/stream') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'connected', job: activeJob })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // ── Status do processo atual ──────────────────────────────────────────────
  if (url === '/api/status' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ running: !!activeProcess, job: activeJob }));
    return;
  }

  // ── Iniciar pipeline ──────────────────────────────────────────────────────
  if (url === '/api/run' && method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      if (activeProcess) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Pipeline já em execução' }));
        return;
      }

      const job = JSON.parse(body);
      const { livro, autor, voz = 'pt-masculine-deep', cortes = false } = job;

      if (!livro || !autor) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'livro e autor são obrigatórios' }));
        return;
      }

      activeJob = { livro, autor, startedAt: Date.now() };

      const args = ['index.js', '--livro', livro, '--autor', autor, '--voz', voz];
      if (cortes) args.push('--cortes');

      activeProcess = spawn('node', args, {
        cwd:   process.cwd(),
        env:   { ...process.env },
        shell: false,
      });

      broadcast({ type: 'start', job: activeJob });

      const handleOutput = (data) => {
        const raw  = data.toString();
        const text = stripAnsi(raw);
        const step = parseStep(text);
        broadcast({ type: 'output', text, step });
      };

      activeProcess.stdout.on('data', handleOutput);
      activeProcess.stderr.on('data', handleOutput);

      activeProcess.on('close', (code) => {
        broadcast({ type: 'done', code, job: activeJob });
        activeProcess = null;
        activeJob     = null;
      });

      activeProcess.on('error', (err) => {
        broadcast({ type: 'error', message: err.message });
        activeProcess = null;
        activeJob     = null;
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, job: activeJob }));
    });
    return;
  }

  // ── Parar pipeline ────────────────────────────────────────────────────────
  if (url === '/api/stop' && method === 'POST') {
    if (activeProcess) {
      activeProcess.kill('SIGTERM');
      activeProcess = null;
      activeJob     = null;
      broadcast({ type: 'stopped' });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n📚 BookNarrator Studio\n   ${url}\n`);
  exec(process.platform === 'win32' ? `start "" "${url}"` : `open "${url}"`);
});
