/**
 * ThumbnailAgent — Agente autônomo de geração de thumbnails virais.
 *
 * Fluxo: Pesquisa → Análise → Projeto → Geração (Higgsfield ou Canvas) → Validação → Memória
 *
 * CLI standalone:
 *   node src/agentes/thumbnail/index.js --livro "Dom Casmurro" --autor "Machado de Assis" --formato youtube_horizontal
 *   node src/agentes/thumbnail/index.js --memoria
 *   node src/agentes/thumbnail/index.js --limpar-cache
 */

import 'dotenv/config';
import { join }               from 'path';
import { existsSync, rmSync, readdirSync } from 'fs';
import { pesquisarTendencias } from './pesquisador.js';
import { analisarTendencias }  from './analisador.js';
import { projetarThumbnail }   from './projetista.js';
import { gerarThumbnailCanvas } from './gerador.js';
import { gerarThumbnailHiggsfield } from './higgsfield.js';
import { validarThumbnail }    from './validar.js';
import { salvarMemoria, lerMemoriaCompleta } from './cache.js';
import { dirname }             from 'path';
import { fileURLToPath }       from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Interface pública ──────────────────────────────────────────────────────

/**
 * Gera thumbnail para vídeo longo YouTube (1280×720, 16:9)
 */
export async function gerarThumbnailYouTube({ livro, autor, roteiro, outputDir }) {
  return executarAgente({ livro, autor, roteiro, outputDir, formato: 'youtube_horizontal' });
}

/**
 * Gera thumbnail vertical para Shorts/TikTok (1080×1920, 9:16)
 */
export async function gerarThumbnailVertical({ livro, autor, corte, roteiro, outputDir }) {
  const roteiroEfetivo = roteiro ?? {
    titulo: livro, autor, gancho_7s: corte?.gancho, licao_principal: '', segmentos: [],
    genero: 'default', pergunta_chave: corte?.gancho,
  };
  return executarAgente({ livro, autor, roteiro: roteiroEfetivo, outputDir, formato: 'vertical' });
}

// ── Orquestrador interno ───────────────────────────────────────────────────

async function executarAgente({ livro, autor, roteiro, outputDir, formato }) {
  console.log(`\n🎨 ThumbnailAgent: "${livro}" [${formato}]`);

  const genero = roteiro?.genero ?? 'default';
  const outputFileName = formato === 'vertical' ? 'thumbnail_vertical.png' : 'thumbnail.png';
  const outputPath = join(outputDir, outputFileName);

  // 1. Pesquisa de tendências (com cache 72h)
  const tendencias = await pesquisarTendencias(genero);

  // 2. Análise e briefing via Claude
  console.log(`   🧠 Analisando tendências e gerando briefing...`);
  const briefing = await analisarTendencias(tendencias, { livro, autor, roteiro, formato });
  console.log(`   📐 Layout: ${briefing.layout} | Texto: "${briefing.texto_thumbnail}"`);

  // 3. Projeto técnico
  const instrucoes = projetarThumbnail({ ...briefing, livro, autor, canal: process.env.CANAL_NOME ?? 'Resumo Fácil' });

  // 4. Geração — tenta Higgsfield primeiro, fallback para Canvas
  let thumbnailPath = null;

  if (process.env.HIGGSFIELD_API_KEY && process.env.THUMBNAIL_USAR_HIGGSFIELD !== 'false') {
    thumbnailPath = await gerarThumbnailHiggsfield(briefing.prompt_higgsfield, briefing, outputPath);
  }

  if (!thumbnailPath) {
    console.log(`   🖼️  Gerando via Canvas...`);
    thumbnailPath = await gerarThumbnailCanvas(instrucoes, outputPath);
  }

  // 5. Validação
  const { ok, problemas } = await validarThumbnail(thumbnailPath, briefing);
  if (!ok) problemas.forEach(p => console.warn(`   ⚠️  ${p}`));

  // 6. Registra na memória do agente
  await salvarMemoria({ livro, autor, genero, formato, briefing, instrucoes, resultado: thumbnailPath, data: new Date().toISOString() });

  console.log(`   ✔ Thumbnail pronta: ${outputFileName}`);
  return { thumbnailPath, briefing };
}

// ── CLI standalone ─────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i+1] : null; };

  if (args.includes('--memoria')) {
    const mem = lerMemoriaCompleta();
    console.log(`\n📚 Memória do ThumbnailAgent\n`);
    console.log(`Thumbnails geradas: ${mem.thumbnails_geradas.length}`);
    mem.thumbnails_geradas.slice(-5).forEach(t => {
      console.log(`  • ${t.livro} [${t.formato}] — ${t.data?.slice(0,10)} — layout: ${t.briefing?.layout}`);
    });
    return;
  }

  if (args.includes('--limpar-cache')) {
    const cacheDir = join(__dirname, 'cache');
    if (existsSync(cacheDir)) {
      readdirSync(cacheDir).forEach(f => rmSync(join(cacheDir, f)));
      console.log('✔ Cache de tendências limpo.');
    }
    return;
  }

  const livro   = get('--livro');
  const autor   = get('--autor');
  const formato = get('--formato') ?? 'youtube_horizontal';
  const outDir  = get('--output') ?? './output/thumbnail_test';

  if (!livro || !autor) {
    console.error('\nUso: node src/agentes/thumbnail/index.js --livro "..." --autor "..." [--formato youtube_horizontal|vertical]\n');
    process.exit(1);
  }

  const { mkdirSync } = await import('fs');
  mkdirSync(outDir, { recursive: true });

  await executarAgente({ livro, autor, roteiro: { titulo: livro, autor, genero: get('--genero') ?? 'default' }, outputDir: outDir, formato });
}

// Executa como CLI se chamado diretamente
if (process.argv[1]?.includes('thumbnail/index') || process.argv[1]?.includes('thumbnail\\index')) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
