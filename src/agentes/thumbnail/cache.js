import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR  = join(__dirname, 'cache');
const MEMORIA_PATH = join(__dirname, 'memoria.json');

function garantirDirs() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function dataHoje() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

// ── Cache de tendências ────────────────────────────────────────────────────

export function cacheKey(genero) {
  return join(CACHE_DIR, `tendencias_${genero}_${dataHoje()}.json`);
}

export function lerCache(genero) {
  const path = cacheKey(genero);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

export function salvarCache(genero, dados) {
  garantirDirs();
  writeFileSync(cacheKey(genero), JSON.stringify({ ...dados, salvo_em: new Date().toISOString() }, null, 2));
}

export function cacheExpirado(dados, horasValidade = 72) {
  if (!dados.salvo_em) return true;
  const diff = (Date.now() - new Date(dados.salvo_em).getTime()) / (1000 * 60 * 60);
  return diff > horasValidade;
}

// ── Memória do agente ──────────────────────────────────────────────────────

function lerMemoria() {
  if (!existsSync(MEMORIA_PATH)) return { thumbnails_geradas: [], tendencias_cache: {}, padroes_aprendidos: {} };
  try { return JSON.parse(readFileSync(MEMORIA_PATH, 'utf-8')); } catch { return { thumbnails_geradas: [], tendencias_cache: {}, padroes_aprendidos: {} }; }
}

export async function salvarMemoria(entrada) {
  if (process.env.THUMBNAIL_SALVAR_MEMORIA === 'false') return;
  garantirDirs();
  const mem = lerMemoria();
  mem.thumbnails_geradas.push({ id: `${Date.now()}`, ...entrada });
  // Manter apenas os últimos 100 registros
  if (mem.thumbnails_geradas.length > 100) mem.thumbnails_geradas = mem.thumbnails_geradas.slice(-100);
  // Atualizar padrões aprendidos por gênero
  const g = entrada.genero || 'default';
  if (!mem.padroes_aprendidos[g]) mem.padroes_aprendidos[g] = { layouts: {}, acentos: [] };
  const layout = entrada.briefing?.layout;
  if (layout) mem.padroes_aprendidos[g].layouts[layout] = (mem.padroes_aprendidos[g].layouts[layout] || 0) + 1;
  writeFileSync(MEMORIA_PATH, JSON.stringify(mem, null, 2));
}

export function lerMemoriaCompleta() {
  return lerMemoria();
}
