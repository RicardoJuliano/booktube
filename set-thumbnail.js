/**
 * Define a thumbnail de um vídeo já publicado no YouTube.
 *
 * Uso:
 *   node set-thumbnail.js <video_id> <caminho_da_imagem>
 *
 * Exemplo:
 *   node set-thumbnail.js fe-Tw92uZk8 "C:\Users\Ricardo\Downloads\dom_casmurro.jpg"
 */

import 'dotenv/config';
import { google }            from 'googleapis';
import { createReadStream, existsSync, statSync } from 'fs';
import chalk from 'chalk';
import { getAuth } from './src/youtube.js';

const [,, videoId, imagePath] = process.argv;

if (!videoId || !imagePath) {
  console.error(chalk.red('\nUso: node set-thumbnail.js <video_id> <caminho_da_imagem>\n'));
  console.error(chalk.yellow('Exemplo:'));
  console.error('  node set-thumbnail.js fe-Tw92uZk8 "C:\\Users\\Ricardo\\Downloads\\thumbnail.jpg"\n');
  process.exit(1);
}

if (!existsSync(imagePath)) {
  console.error(chalk.red(`\n❌ Arquivo não encontrado: ${imagePath}\n`));
  process.exit(1);
}

const tamanhoMB = (statSync(imagePath).size / (1024 * 1024)).toFixed(2);
console.log(chalk.bold.cyan(`\n🖼️  Enviando thumbnail para o vídeo ${videoId}...\n`));
console.log(chalk.gray(`   Arquivo: ${imagePath} (${tamanhoMB} MB)\n`));

try {
  const auth    = await getAuth();
  const youtube = google.youtube({ version: 'v3', auth });

  await youtube.thumbnails.set({
    videoId,
    media: {
      mimeType: imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
      body:     createReadStream(imagePath),
    },
  });

  console.log(chalk.bold.green('✅ Thumbnail atualizada com sucesso!'));
  console.log(chalk.cyan(`   https://studio.youtube.com/video/${videoId}/edit\n`));
} catch (e) {
  if (e.message?.includes('thumbnails')) {
    console.error(chalk.red('\n❌ Canal sem permissão para thumbnails personalizadas.'));
    console.error(chalk.yellow('   Verifique o canal em: https://www.youtube.com/verify\n'));
  } else {
    console.error(chalk.red(`\n❌ ${e.message}\n`));
  }
  process.exit(1);
}
