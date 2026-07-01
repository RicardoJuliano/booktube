import 'dotenv/config';
import minimist from 'minimist';
import chalk from 'chalk';
import ora from 'ora';
import { SingleBar, Presets } from 'cli-progress';
import { statSync, existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { exec } from 'child_process';

import { slugify, ensureDir, formatDuration, formatFileSize, verificarFFmpeg, resolverMusica } from './src/utils.js';
import { gerarRoteiro }                    from './src/roteiro.js';
import { gerarNarracao, exibirVozesDisponiveis } from './src/narracao.js';
import { gerarTodasCenas }                 from './src/cenas.js';
import { animarCenas, temHiggsfield }      from './src/animacao.js';
import { gerarLegenda }                    from './src/legenda.js';
import { gerarThumbnailYouTube }           from './src/agentes/thumbnail/index.js';
import { composarVideo, detectarDuracaoMP3 } from './src/video.js';
import { gerarMetadata }                   from './src/metadata.js';
import { uploadParaYoutube }               from './src/youtube.js';
import { selecionarCortes }               from './src/cortes/seletor.js';
import { recortarVertical }               from './src/cortes/recorte.js';
import { gerarThumbnailCurta }            from './src/cortes/thumbnail_curta.js';
import { gerarMetadataCorte }             from './src/cortes/metadata_corte.js';
import { uploadShort }                    from './src/cortes/shorts.js';
import { uploadTikTok }                   from './src/cortes/tiktok.js';

const HELP = `
${chalk.bold.cyan('BookNarrator')} — Resumos de livros para YouTube

${chalk.bold('Uso:')}
  node index.js --livro "O Poder do Hábito" --autor "Charles Duhigg"

${chalk.bold('Flags:')}
  --livro          Título do livro ${chalk.red('(obrigatório)')}
  --autor          Nome do autor ${chalk.red('(obrigatório)')}
  --voz            ID da voz ElevenLabs (padrão: pt-masculine-deep)
  --musica         Nome do arquivo em assets/musica/ sem .mp3 (auto-detectado por slug do livro se omitido)
  --cortes         Gera cortes verticais (9:16) para TikTok e YouTube Shorts após o vídeo longo
  --publicar       Publica o vídeo direto como Público (padrão: envia como Privado e abre YouTube Studio)
  --skip-roteiro   Reutiliza roteiro existente
  --skip-naracao   Reutiliza narração existente
  --skip-cenas     Reutiliza cenas existentes
  --skip-animacao  Pula animação das cenas via Higgsfield AI
  --skip-video     Pula composição de vídeo
  --skip-upload    Pula envio para o YouTube
  --listar-vozes   Lista vozes e sai
  --output         Diretório de saída (padrão: ./output)
`;

function step(n, t, e, l) { console.log(chalk.bold.cyan(`\n[${n}/${t}] ${e} ${l}...`)); }
function ok(m)   { console.log(chalk.green(`      ✔ ${m}`)); }
function warn(m) { console.log(chalk.yellow(`      ⚠  ${m}`)); }

function validarCredenciais() {
  const erros = [];
  if (!process.env.ANTHROPIC_API_KEY)  erros.push('ANTHROPIC_API_KEY não definida');
  if (!process.env.ELEVENLABS_API_KEY) erros.push('ELEVENLABS_API_KEY não definida');

  if (erros.length > 0) {
    console.error(chalk.red('\n❌ Credenciais faltando no .env:'));
    erros.forEach(e => console.error(chalk.red(`   • ${e}`)));
    console.error(chalk.yellow('\n💡 Copie .env.example para .env e preencha as chaves.\n'));
    process.exit(1);
  }
}

async function lerRoteiroExistente(dir) {
  const p = join(dir, 'roteiro.json');
  if (!existsSync(p)) throw new Error(`roteiro.json não encontrado em ${dir}. Remova --skip-roteiro.`);
  return JSON.parse(readFileSync(p, 'utf-8'));
}

async function main() {
  const args = minimist(process.argv.slice(2), {
    boolean: ['skip-roteiro','skip-naracao','skip-cenas','skip-animacao','skip-video','skip-upload','publicar','cortes','listar-vozes','help'],
    string:  ['livro','autor','voz','output','musica'],
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
  validarCredenciais();

  const inicio      = Date.now();
  const slug        = slugify(`${args.livro} ${args.autor}`);
  const outDir      = join(args.output, slug);
  // Música: --musica explícito tem prioridade; caso contrário auto-detecta por slug
  const musicaPath  = args.musica
    ? join('./assets/musica', `${args.musica}.mp3`)
    : resolverMusica(args.livro, args.autor);
  const temAnimacao = !args['skip-animacao'] && !args['skip-cenas'] && temHiggsfield();
  const temUpload   = !args['skip-upload'] && !args['skip-video'] && existsSync('./assets/yt_tokens.json');
  const temCortes   = args.cortes;

  // roteiro, narração, cenas, [animação], legenda, thumbnail, metadata, [vídeo], [upload], [seletor+cortes]
  const TOTAL = 6 + (temAnimacao ? 1 : 0) + (args['skip-video'] ? 0 : 1) + (temUpload ? 1 : 0) + (temCortes ? 2 : 0);
  let n = 0;

  console.log(chalk.bold.cyan('\n📚 BookNarrator iniciando...\n'));
  ensureDir(outDir);

  // ── ROTEIRO ──────────────────────────────────────────────────────────────
  let roteiro;
  step(++n, TOTAL, '📝', 'Gerando roteiro via Claude');
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

  // ── NARRAÇÃO ─────────────────────────────────────────────────────────────
  let narracao;
  step(++n, TOTAL, '🎙️', 'Gerando narração via ElevenLabs');
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

  // ── CENAS ILUSTRADAS ─────────────────────────────────────────────────────
  let cenas;
  const totalCenas = roteiro.segmentos.length + 4; // intro + abertura + segmentos + conclusão + CTA
  step(++n, TOTAL, '🌌', `Gerando ${totalCenas} cenas ilustradas`);

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

  // ── ANIMAÇÃO DAS CENAS (Higgsfield AI) ──────────────────────────────────────
  if (temAnimacao) {
    step(++n, TOTAL, '🎞️', `Animando ${cenas.length} cenas via Higgsfield AI`);
    warn('Isso consome créditos da sua conta Higgsfield');
    const bar = new SingleBar({
      format: `      ${chalk.cyan('{bar}')} {value}/{total} cenas`,
      barCompleteChar: '█', barIncompleteChar: '░',
    }, Presets.shades_classic);
    bar.start(cenas.length, 0);
    try {
      cenas = await animarCenas(cenas, outDir, () => bar.increment());
      bar.stop(); ok('Cenas animadas com movimento de câmera cinematográfico');
    } catch (e) { bar.stop(); warn(`Animação interrompida: ${e.message}. Seguindo com imagens estáticas.`); }
  } else if (!args['skip-animacao'] && !args['skip-cenas']) {
    warn('Animação Higgsfield desativada. Configure HIGGSFIELD_API_KEY e HIGGSFIELD_API_SECRET no .env');
  }

  // ── LEGENDAS SINCRONIZADAS ────────────────────────────────────────────────
  let assPath;
  let duracaoNarracao;
  step(++n, TOTAL, '💬', 'Sincronizando texto com a narração');
  const spLeg = ora('Calculando timings por contagem de caracteres...').start();
  try {
    duracaoNarracao = await detectarDuracaoMP3(narracao);
    const { assPath: ap, totalFrases } = await gerarLegenda(roteiro, duracaoNarracao, outDir);
    assPath = ap; spLeg.succeed();
    ok(`${totalFrases} frases sincronizadas`);
  } catch (e) { spLeg.fail(e.message); process.exit(1); }

  // ── THUMBNAIL ────────────────────────────────────────────────────────────
  step(++n, TOTAL, '🖼️', 'Gerando thumbnail via ThumbnailAgent');
  const spT = ora('Pesquisando tendências e projetando...').start();
  try {
    await gerarThumbnailYouTube({ livro: args.livro, autor: args.autor, roteiro, outputDir: outDir });
    spT.succeed(); ok('Thumbnail gerada com briefing de tendências');
  } catch (e) { spT.warn(`Aviso: ${e.message}`); }

  // ── METADATA ────────────────────────────────────────────────────────────────
  step(++n, TOTAL, '📋', 'Gerando metadata SEO para YouTube');
  const spM = ora('Consultando Claude para título e descrição otimizados...').start();
  let metadataPath;
  try {
    await gerarMetadata(roteiro, duracaoNarracao, outDir);
    metadataPath = join(outDir, 'metadata.json');
    spM.succeed(); ok('metadata.json — título SEO, descrição com capítulos e tags reais');
  } catch (e) { spM.warn(`Aviso: ${e.message}`); }

  // ── VÍDEO FINAL ──────────────────────────────────────────────────────────────
  let videoPath;
  if (!args['skip-video']) {
    step(++n, TOTAL, '🎬', 'Compondo vídeo final');

    if (!verificarFFmpeg()) {
      console.error(chalk.red('❌ FFmpeg não encontrado. Instale em https://ffmpeg.org/download.html'));
    } else {
      if (!musicaPath)
        warn('Nenhuma música encontrada em assets/musica/ — vídeo sem música de fundo.');

      const bar = new SingleBar({
        format: `      ${chalk.cyan('{bar}')} {percentage}%`,
        barCompleteChar: '█', barIncompleteChar: '░',
      }, Presets.shades_classic);
      bar.start(100, 0);

      try {
        videoPath = await composarVideo(
          cenas, assPath, narracao,
          musicaPath,
          outDir, roteiro,
          pct => bar.update(pct)
        );
        bar.update(100); bar.stop();
        ok(`${formatFileSize(statSync(videoPath).size)}`);
      } catch (e) { bar.stop(); console.error(chalk.red(`\n${e.message}`)); }
    }
  }

  // ── UPLOAD YOUTUBE ───────────────────────────────────────────────────────────
  let youtubeUrl;
  if (temUpload && videoPath && metadataPath) {
    step(++n, TOTAL, '🚀', 'Publicando no YouTube');
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
        pct => bar.update(pct),
        args.publicar
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

  // ── CORTES PARA TIKTOK / YOUTUBE SHORTS ─────────────────────────────────────
  const videoFinal = videoPath ?? (existsSync(join(outDir, 'video_final.mp4')) ? join(outDir, 'video_final.mp4') : null);

  if (temCortes) {
    if (!videoFinal) {
      warn('--cortes requer o video_final.mp4. Rode sem --skip-video primeiro.');
    } else if (!duracaoNarracao) {
      warn('--cortes requer a narração. Rode sem --skip-naracao primeiro.');
    } else {
      // ── Seleção dos melhores momentos ──────────────────────────────────────
      step(++n, TOTAL, '🧠', 'Selecionando melhores momentos para cortes curtos');
      const spSel = ora('Consultando Claude...').start();
      let selecao;
      try {
        selecao = await selecionarCortes(roteiro, duracaoNarracao, outDir);
        spSel.succeed(); ok(`${selecao.cortes.length} cortes selecionados`);
      } catch (e) { spSel.fail(e.message); selecao = null; }

      // ── Geração dos cortes verticais ───────────────────────────────────────
      if (selecao?.cortes?.length) {
        step(++n, TOTAL, '✂️', `Gerando ${selecao.cortes.length} cortes verticais (1080×1920)`);
        console.log(chalk.gray(`      ─────────────────────────────────────────`));

        for (const corte of selecao.cortes) {
          const id       = String(corte.id).padStart(2, '0');
          const corteDir = join(outDir, 'cortes', `corte_${id}`);
          ensureDir(corteDir);

          console.log(chalk.bold(`\n      Corte ${corte.id}/${selecao.cortes.length}: ${chalk.cyan(corte.titulo)} (${Math.round(corte.duracao)}s)`));

          // Recorte + conversão vertical
          const barCorte = new SingleBar({
            format: `      ${chalk.cyan('{bar}')} {percentage}%`,
            barCompleteChar: '█', barIncompleteChar: '░',
          }, Presets.shades_classic);
          barCorte.start(100, 0);
          let corteVideoPath;
          try {
            corteVideoPath = await recortarVertical(corte, videoFinal, corteDir, pct => barCorte.update(pct));
            barCorte.update(100); barCorte.stop();
            ok(`corte_${id}_vertical.mp4 · ${formatFileSize(statSync(corteVideoPath).size)}`);
          } catch (e) { barCorte.stop(); warn(`Falha no corte ${corte.id}: ${e.message}`); continue; }

          // Thumbnail vertical
          let corteThumbnailPath;
          try {
            corteThumbnailPath = await gerarThumbnailCurta(corte, roteiro, corteDir);
            ok(`corte_${id}_thumbnail.png`);
          } catch (e) { warn(`Thumbnail: ${e.message}`); }

          // Metadata SEO
          let corteMetadata;
          try {
            corteMetadata = await gerarMetadataCorte(corte, roteiro, corteDir);
            ok(`corte_${id}_metadata.json`);
          } catch (e) { warn(`Metadata: ${e.message}`); }

          // Upload YouTube Short (opcional)
          if (corteMetadata && existsSync('./assets/yt_tokens.json')) {
            try {
              const shortUrl = await uploadShort(corteVideoPath, corteThumbnailPath, corteMetadata);
              if (shortUrl) ok(`YouTube Short → ${shortUrl}`);
            } catch (e) { warn(`Short upload: ${e.message}`); }
          }

          // Upload TikTok (opcional)
          if (corteMetadata) {
            await uploadTikTok(corteVideoPath, corteMetadata);
          }
        }

        console.log(chalk.gray(`\n      ─────────────────────────────────────────`));
      }
    }
  }

  // ── RESUMO ──────────────────────────────────────────────────────────────────
  const elapsed = Math.round((Date.now() - inicio) / 1000);
  const videoOk = existsSync(join(outDir, 'video_final.mp4'));

  const cortesOk = temCortes && existsSync(join(outDir, 'cortes'));
  console.log(chalk.bold.cyan(`
─────────────────────────────────────────
✅ CONCLUÍDO em ${formatDuration(elapsed)}

📁 ${outDir}/
   ├── video_final.mp4 ${videoOk ? '' : chalk.red('(não gerado)')}
   ├── thumbnail.png
   ├── roteiro.md
   ├── metadata.json${cortesOk ? `
   └── cortes/          ← Short + TikTok` : ''}
${youtubeUrl ? `\n🎉 Publicado no YouTube:\n   ${youtubeUrl}` : '\n💡 Para publicar automaticamente:\n   node setup-youtube.js'}${temCortes ? '' : '\n💡 Adicione --cortes para gerar conteúdo para TikTok e Shorts'}
─────────────────────────────────────────`));

  if (videoOk && !args['skip-video']) {
    console.log(chalk.yellow('\n🎬 Abrindo vídeo...\n'));
    const abs = resolve(join(outDir, 'video_final.mp4'));
    exec(process.platform === 'win32' ? `start "" "${abs}"` : `open "${abs}"`);
  }
}

main().catch(e => { console.error(chalk.red(`\n❌ ${e.message}`)); process.exit(1); });
