import Anthropic from '@anthropic-ai/sdk';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { ensureDir } from './utils.js';

const SCHEMA = {
  titulo: 'string',
  autor: 'string',
  duracao_estimada_minutos: 'number',
  gancho: 'string',
  segmentos: [
    {
      id: 'number',
      titulo_slide: 'string',
      texto_narrado: 'string',
      ponto_chave: 'string',
      duracao_segundos: 'number',
    },
  ],
  conclusao: 'string',
  licao_principal: 'string',
};

function buildPrompt(titulo, autor) {
  return `Você é um roteirista especialista em resumos de livros para YouTube.
Crie um roteiro envolvente de exatamente 10 minutos para o livro "${titulo}" de ${autor}.

REGRAS:
- Tom: educativo mas conversacional, nunca acadêmico
- Idioma: Português brasileiro natural
- NÃO transcreva trechos do livro — parafraseie e analise
- Foque nos conceitos mais transformadores e aplicáveis
- Inclua exemplos práticos do cotidiano brasileiro quando possível
- Cada segmento deve ter entre 60-120 segundos de narração
- Total: 6 a 8 segmentos + gancho + conclusão

Retorne APENAS um JSON válido (sem markdown, sem texto extra) seguindo exatamente este schema:
${JSON.stringify(SCHEMA, null, 2)}

O campo "gancho" deve ser um texto de abertura impactante de 15-20 segundos.
O campo "conclusao" deve ter um call-to-action para curtir e se inscrever.
O campo "licao_principal" deve ser uma frase memorável que resume o livro.`;
}

function roteiroParaMarkdown(roteiro) {
  let md = `# ${roteiro.titulo}\n**Autor:** ${roteiro.autor}\n**Duração estimada:** ${roteiro.duracao_estimada_minutos} minutos\n\n---\n\n`;
  md += `## Gancho\n${roteiro.gancho}\n\n---\n\n`;

  for (const seg of roteiro.segmentos) {
    md += `## Segmento ${seg.id}: ${seg.titulo_slide}\n`;
    md += `**Ponto-chave:** ${seg.ponto_chave}\n`;
    md += `**Duração:** ${seg.duracao_segundos}s\n\n`;
    md += `${seg.texto_narrado}\n\n---\n\n`;
  }

  md += `## Conclusão\n${roteiro.conclusao}\n\n`;
  md += `---\n\n**Lição principal:** *${roteiro.licao_principal}*\n`;
  return md;
}

export async function gerarRoteiro(titulo, autor, outputDir) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'sk-ant-SUA_CHAVE_AQUI') {
    throw new Error('❌ Chave da Anthropic inválida. Verifique seu .env');
  }

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: buildPrompt(titulo, autor) }],
  });

  const rawText = message.content[0].text.trim();

  let roteiro;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    roteiro = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  } catch {
    throw new Error('❌ Claude retornou JSON inválido. Tente novamente.');
  }

  ensureDir(outputDir);

  await writeFile(join(outputDir, 'roteiro.json'), JSON.stringify(roteiro, null, 2), 'utf-8');
  await writeFile(join(outputDir, 'roteiro.md'), roteiroParaMarkdown(roteiro), 'utf-8');

  return roteiro;
}
