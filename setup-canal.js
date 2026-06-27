/**
 * Configura a descrição do canal YouTube.
 * Rode: node setup-canal.js
 */

import 'dotenv/config';
import chalk from 'chalk';
import { atualizarDescricaoCanal } from './src/youtube.js';

const DESCRICAO = `📚 Resumos de livros animados em poucos minutos!

Aqui você aprende as principais ideias dos melhores livros de autodesenvolvimento, negócios, psicologia e ciência — sem perder horas lendo.

Cada vídeo traz:
✅ O conceito central do livro
✅ As lições mais importantes
✅ Exemplos práticos para aplicar na sua vida

Novo resumo toda semana. Se inscreve e ativa o sino pra não perder nenhum! 🔔

💬 Tem algum livro que você quer que a gente resuma? Deixa nos comentários!`;

console.log(chalk.bold.cyan('\n📺 Configurando descrição do canal YouTube...\n'));
console.log(chalk.gray(DESCRICAO));
console.log();

try {
  const channelId = await atualizarDescricaoCanal(DESCRICAO);
  console.log(chalk.bold.green(`\n✅ Descrição atualizada com sucesso!`));
  console.log(chalk.gray(`   Canal ID: ${channelId}`));
  console.log(chalk.cyan(`   Veja em: https://www.youtube.com/channel/${channelId}/about\n`));
} catch (e) {
  console.error(chalk.red(`\n❌ ${e.message}\n`));
  process.exit(1);
}
