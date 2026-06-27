/**
 * Autenticação única do canal YouTube.
 * Rode UMA vez: node setup-youtube.js
 * Depois o upload será automático em todo vídeo gerado.
 */

import 'dotenv/config';
import chalk from 'chalk';
import { autenticarCanal } from './src/youtube.js';
import { existsSync } from 'fs';

console.log(chalk.bold.cyan('\n🔐 Setup YouTube — Autorização do canal\n'));

if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) {
  console.log(chalk.red('❌ Credenciais não encontradas no .env\n'));
  console.log(chalk.bold('Siga estes passos:\n'));
  console.log('  1. Acesse: https://console.cloud.google.com/');
  console.log('  2. Crie um projeto (ou use um existente)');
  console.log('  3. Ative a API: "YouTube Data API v3"');
  console.log('  4. Vá em "Credenciais" → "Criar credencial" → "ID do cliente OAuth 2.0"');
  console.log('  5. Tipo: "Aplicativo da área de trabalho"');
  console.log('  6. Baixe o JSON e copie client_id e client_secret para seu .env:\n');
  console.log(chalk.yellow('     YOUTUBE_CLIENT_ID=seu_client_id'));
  console.log(chalk.yellow('     YOUTUBE_CLIENT_SECRET=seu_client_secret\n'));
  console.log('  7. Em "Tela de consentimento OAuth", adicione seu e-mail como usuário de teste');
  console.log('  8. Rode novamente: node setup-youtube.js\n');
  process.exit(1);
}

if (existsSync('./assets/yt_tokens.json')) {
  console.log(chalk.green('✔ Canal já autenticado (assets/yt_tokens.json existe)'));
  console.log(chalk.gray('  Para reutorizar, delete o arquivo e rode novamente.\n'));
  process.exit(0);
}

try {
  await autenticarCanal();
  console.log(chalk.bold.green('\n✅ Canal autorizado com sucesso!'));
  console.log(chalk.gray('   Token salvo em assets/yt_tokens.json'));
  console.log(chalk.cyan('\n   Agora rode normalmente:'));
  console.log(chalk.white('   node index.js --livro "Título" --autor "Autor"\n'));
} catch (e) {
  console.error(chalk.red(`\n❌ ${e.message}\n`));
  process.exit(1);
}
