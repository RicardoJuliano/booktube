/**
 * Autenticação única do TikTok.
 * Rode UMA vez: node setup-tiktok.js
 *
 * Fluxo:
 *  1. Abre o navegador para autorizar
 *  2. TikTok redireciona para https://ricardojuliano.github.io/resumo-facil/
 *  3. A página exibe o código — você copia e cola aqui no terminal
 *  4. O token é salvo em assets/tiktok_tokens.json
 */

import 'dotenv/config';
import { createInterface } from 'readline';
import { exec }            from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import chalk from 'chalk';

const REDIRECT_URI  = 'https://ricardojuliano.github.io/resumo-facil/';
const TOKENS_FILE   = './assets/tiktok_tokens.json';
const SCOPES        = 'user.info.basic,video.publish,video.upload';

const CLIENT_KEY    = process.env.TIKTOK_CLIENT_KEY;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;

console.log(chalk.bold.cyan('\n🎵 Setup TikTok — Autorização do canal\n'));

if (!CLIENT_KEY || !CLIENT_SECRET) {
  console.error(chalk.red('❌ TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET não definidos no .env'));
  process.exit(1);
}

if (existsSync(TOKENS_FILE)) {
  console.log(chalk.green('✔ TikTok já autenticado (assets/tiktok_tokens.json existe)'));
  console.log(chalk.gray('  Para re-autorizar, delete o arquivo e rode novamente.\n'));
  process.exit(0);
}

const state   = Math.random().toString(36).slice(2);
const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
authUrl.searchParams.set('client_key',    CLIENT_KEY);
authUrl.searchParams.set('scope',         SCOPES);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('redirect_uri',  REDIRECT_URI);
authUrl.searchParams.set('state',         state);

console.log('🌐 Abrindo navegador para autorizar...\n');
console.log(chalk.gray('   Se não abrir automaticamente, acesse:'));
console.log(chalk.cyan(`   ${authUrl}\n`));
exec(process.platform === 'win32' ? `start "" "${authUrl}"` : `open "${authUrl}"`);

console.log(chalk.yellow('📋 Após autorizar, a página vai exibir um código.'));
console.log(chalk.yellow('   Copie-o e cole aqui:\n'));

const rl   = createInterface({ input: process.stdin, output: process.stdout });
const code = await new Promise(res => rl.question(chalk.bold('   Código: '), ans => {
  rl.close();
  rl.removeAllListeners();
  res(ans.trim());
}));

if (!code) { console.error(chalk.red('\n❌ Nenhum código informado.\n')); process.exit(1); }

console.log(chalk.gray('\n   Trocando código por token...'));

try {
  const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key:    CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      code,
      grant_type:    'authorization_code',
      redirect_uri:  REDIRECT_URI,
    }),
  });

  const data = await tokenRes.json();

  if (!data.access_token) {
    throw new Error(data.error_description ?? data.error ?? JSON.stringify(data));
  }

  writeFileSync(TOKENS_FILE, JSON.stringify({
    access_token:       data.access_token,
    refresh_token:      data.refresh_token,
    open_id:            data.open_id,
    scope:              data.scope,
    expires_in:         data.expires_in,
    refresh_expires_in: data.refresh_expires_in,
    token_type:         data.token_type,
    saved_at:           Date.now(),
  }, null, 2));

  console.log(chalk.bold.green('\n✅ TikTok autorizado com sucesso!'));
  console.log(chalk.gray('   Token salvo em assets/tiktok_tokens.json'));
  console.log(chalk.cyan('\n   Agora rode com --cortes:'));
  console.log(chalk.white('   node index.js --livro "Título" --autor "Autor" --cortes\n'));
} catch (e) {
  console.error(chalk.red(`\n❌ ${e.message}\n`));
  process.exit(1);
}
