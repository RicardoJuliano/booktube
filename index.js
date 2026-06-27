import 'dotenv/config';
import minimist from 'minimist';
import chalk from 'chalk';
import ora from 'ora';
import { SingleBar, Presets } from 'cli-progress';
import { statSync, existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { exec } from 'child_process';

import { slugify, ensureDir, formatDuration, formatFileSize, verificarFFmpeg } from './src/utils.js';
import { gerarRoteiro }                    from './src/roteiro.js';
import { gerarNarracao, exibirVozesDisponiveis } from './src/narracao.js';
import { gerarTodasCenas }                 from './src/cenas.js';
import { gerarLegenda }                    from './src/legenda.js';
import { gerarThumbnail }                  from './src/thumbnail.js';
import { composarVideo, detectarDuracaoMP3 } from './src/video.js';
import { gerarMetadata }                   from './src/metadata.js';
import { uploadParaYoutube }               from './src/youtube.js';

const HELP = `
${chalk.bold.cyan('BookNarrator')} — Resumos de livros para YouTube

${chalk.bold('Uso:')}
  node index.js --livro "O Poder do Hábito" --autor "Charles Duhigg"

${chalk.bold('Flags:')}
  --livro          Título do livro ${chalk.red('(obrigatório)')}
  --autor          Nome do autor ${chalk.red('(obrigatório)')}
  --voz            ID da voz ElevenLabs (padrão: pt-masculine-deep)
  --skip-roteiro   Reutiliza roteiro existente
  --skip-naracao   Reutiliza narração existente
  --skip-cenas     Reutiliza cenas existentes
  --skip-video     Pula composição de vídeo
  --skip-upload    Pula envio para o YouTube
  --listar-vozes   Lista vozes e sai
  --output         Diretório de saída (padrão: ./output)
`;

function step(n, t, e, l) { console.log(chalk.bold.cyan(`\n[${n}/${t}] ${e} ${l}...`)); }
function ok(m)   { console.log(chalk.green(`      ✔ ${m}`)); }
function warn(m) { console.log(chalk.yellow(`      ⚠  ${m}`)); }

async function lerRoteiroExistente(dir) {
  const p = join(dir, 'roteiro.json');
  if (!existsSync(p)) throw new Error(`roteiro.json não encontrado em ${dir}. Remova --skip-roteiro.`);
  return JSON.parse(readFileSync(p, 'utf-8'));
}

async function main() {
  const args = minimist(process.argv.slice(2), {
    boolean: ['skip-roteiro','skip-naracao','skip-cenas','skip-video','skip-upload','listar-vozes','help'],
    string:  ['livro','autor','voz','output'],
    default: { voz: 'pt-masculine-deep', output: './output' },
  });

  if (args.help)            { console.log(HELP); process.exit(0); }
  if (args['listar-vozes']) {
    const sp = ora('Buscando vozes...').start();
    try { sp.stop(); await exibirVozesDisponiveis(); } catch (e) { sp.fail(e.message); }
    process.exit(0);
  }
  if (!args.livro || !args.autor) {
    console.error(chalk.red('\n❌ --livro e --autor são obrigatórios.\n'));
    console.log(HELP); process.exit(1);
  }

  const inicio     = Date.now();
  const slug       = slugify(args.livro);
  const outDir     = join(args.output, slug);
  const musicaPath = join('./assets/musica/background.mp3');
  const temUpload  = !args['skip-upload'] && !args['skip-video'] && existsSync('./assets/yt_tokens.json');
  const TOTAL      = args['skip-video'] ? 5 : temUpload ? 7 : 6;

  console.log(chalk.bold.cyan('\n📚 BookNarrator iniciando...\n'));
  ensureDir(outDir);

  // ── 1. ROTEIRO ──────────────────────────────────────────────────────────────
  let roteiro;
  step(1, TOTAL, '📝', 'Gerando roteiro via Claude');
  if (args['skip-roteiro']) {
    const sp = ora('Carregando roteiro...').start();
    roteiro = await lerRoteiroExistente(outDir); sp.succeed();
    ok(`${roteiro.segmentos.length} segmentos carregados`);
  } else {
    const sp = ora('Consultando Claude...').start();
    try { roteiro = await gerarRoteiro(args.livro, args.autor, outDir); sp.succeed();
      ok(`${roteiro.segmentos.length} segmentos, ~${roteiro.duracao_estimada_minutos} min`);
    } catch (e) { sp.fail(e.message); process.exit(1); }
  }

  // ── 2. NARRAÇÃO ─────────────────────────────────────────────────────────────
  let narracao;
  step(2, TOTAL, '🎙️', 'Gerando narração via ElevenLabs');
  if (args['skip-naracao']) {
    const p = join(outDir, 'naracao.mp3');
    if (!existsSync(p)) { console.error(chalk.red('❌ naracao.mp3 não encontrado')); process.exit(1); }
    narracao = p; ok('Narração existente carregada');
  } else {
    const sp = ora('Gerando áudio...').start();
    try {
      narracao = await gerarNarracao(roteiro, args.voz, outDir); sp.succeed();
      const dur = await detectarDuracaoMP3(narracao).catch(() => null);
      ok(`${dur ? formatDuration(dur) : '?'} · ${formatFileSize(statSync(narracao).size)}`);
    } catch (e) { sp.fail(e.message); process.exit(1); }
  }

  // ── 3. CENAS ILUSTRADAS ─────────────────────────────────────────────────────
  let cenas;
  const totalCenas = roteiro.segmentos.length + 2; // abertura + segmentos + conclusão
  step(3, TOTAL, '🌌', `Gerando ${totalCenas} cenas ilustradas`);

  if (args['skip-cenas']) {
    const cenasDir = join(outDir, 'cenas');
    if (!existsSync(cenasDir)) { console.error(chalk.red('❌ Pasta cenas não encontrada')); process.exit(1); }
    const { readdirSync } = await import('fs');
    cenas = readdirSync(cenasDir).filter(f => f.endsWith('.png')).sort().map(f => join(cenasDir, f));
    ok(`${cenas.length} cenas carregadas`);
  } else {
    const bar = new SingleBar({
      format: `      ${chalk.cyan('{bar}')} {value}/{total} cenas`,
      barCompleteChar: '█', barIncompleteChar: '░',
    }, Presets.shades_classic);
    bar.start(totalCenas, 0);
    try {
      cenas = await gerarTodasCenas(roteiro, outDir, () => bar.increment());
      bar.stop(); ok(`${cenas.length} cenas geradas com ilustrações e paletas únicas`);
    } catch (e) { bar.stop(); console.error(chalk.red(`❌ ${e.message}`)); process.exit(1); }
  }

  // ── 4. LEGENDAS SINCRONIZADAS ────────────────────────────────────────────────
  let assPath;
  step(4, TOTAL, '💬', 'Sincronizando texto com a narração');
  const spLeg = ora('Calculando timings por contagem de caracteres...').start();
  try {
    const dur = await detectarDuracaoMP3(narracao);
    const { assPath: ap, totalFrases } = await gerarLegenda(roteiro, dur, outDir);
    assPath = ap; spLeg.succeed();
    ok(`${totalFrases} frases sincronizadas`);
  } catch (e) { spLeg.fail(e.message); process.exit(1); }

  // ── 5. THUMBNAIL ────────────────────────────────────────────────────────────
  step(5, TOTAL, '🖼️', 'Gerando thumbnail');
  const spT = ora('Renderizando...').start();
  try { await gerarThumbnail(roteiro, outDir); spT.succeed(); ok('Thumbnail salva'); }
  catch (e) { spT.warn(`Aviso: ${e.message}`); }

  // ── 6. VÍDEO FINAL ──────────────────────────────────────────────────────────
  let videoPath;
  if (!args['skip-video']) {
    step(6, TOTAL, '🎬', 'Compondo vídeo final');

    if (!verificarFFmpeg()) {
      console.error(chalk.red('❌ FFmpeg não encontrado. Instale em https://ffmpeg.org/download.html'));
    } else {
      if (!existsSync(musicaPath))
        warn('Sem música de fundo. Adicione um MP3 em assets/musica/background.mp3');

      const bar = new SingleBar({
        format: `      ${chalk.cyan('{bar}')} {percentage}%`,
        barCompleteChar: '█', barIncompleteChar: '░',
      }, Presets.shades_classic);
      bar.start(100, 0);

      try {
        videoPath = await composarVideo(
          cenas, assPath, narracao,
          existsSync(musicaPath) ? musicaPath : null,
          outDir, roteiro,
          pct => bar.update(pct)
        );
        bar.update(100); bar.stop();
        ok(`${formatFileSize(statSync(videoPath).size)}`);
      } catch (e) { bar.stop(); console.error(chalk.red(`\n${e.message}`)); }
    }
  }

  // ── METADATA ────────────────────────────────────────────────────────────────
  const stepMeta = args['skip-video'] ? 5 : temUpload ? 6 : 6;
  step(stepMeta, TOTAL, '📋', 'Gerando metadata SEO para YouTube');
  const spM = ora('Consultando Claude para título e descrição otimizados...').start();
  let metadataPath;
  try {
    await gerarMetadata(roteiro, outDir);
    metadataPath = join(outDir, 'metadata.json');
    spM.succeed(); ok('metadata.json — título SEO, descrição com capítulos e tags');
  } catch (e) { spM.warn(`Aviso: ${e.message}`); }

  // ── UPLOAD YOUTUBE ───────────────────────────────────────────────────────────
  let youtubeUrl;
  if (temUpload && videoPath && metadataPath) {
    step(7, TOTAL, '🚀', 'Publicando no YouTube');
    const bar = new SingleBar({
      format: `      ${chalk.cyan('{bar}')} {percentage}%`,
      barCompleteChar: '█', barIncompleteChar: '░',
    }, Presets.shades_classic);
    bar.start(100, 0);
    try {
      youtubeUrl = await uploadParaYoutube(
        videoPath,
        join(outDir, 'thumbnail.png'),
        metadataPath,
        roteiro,
        pct => bar.update(pct)
      );
      bar.update(100); bar.stop();
      ok(`Publicado → ${youtubeUrl}`);
    } catch (e) {
      bar.stop();
      console.error(chalk.red(`\n      ❌ ${e.message}`));
    }
  } else if (!args['skip-upload'] && !args['skip-video'] && !temUpload) {
    warn('Upload YouTube desativado. Para ativar: node setup-youtube.js');
  }

  // ── RESUMO ──────────────────────────────────────────────────────────────────
  const elapsed = Math.round((Date.now() - inicio) / 1000);
  const videoOk = existsSync(join(outDir, 'video_final.mp4'));

  console.log(chalk.bold.cyan(`
─────────────────────────────────────────
✅ CONCLUÍDO em ${formatDuration(elapsed)}

📁 ${outDir}/
   ├── video_final.mp4 ${videoOk ? '' : chalk.red('(não gerado)')}
   ├── thumbnail.png
   ├── roteiro.md
   └── metadata.json
${youtubeUrl ? `\n🎉 Publicado no YouTube:\n   ${youtubeUrl}` : '\n💡 Para publicar automaticamente:\n   node setup-youtube.js'}
─────────────────────────────────────────`));

  if (videoOk && !args['skip-video']) {
    console.log(chalk.yellow('\n🎬 Abrindo vídeo...\n'));
    const abs = resolve(join(outDir, 'video_final.mp4'));
    exec(process.platform === 'win32' ? `start "" "${abs}"` : `open "${abs}"`);
  }
}

main().catch(e => { console.error(chalk.red(`\n❌ ${e.message}`)); process.exit(1); });
