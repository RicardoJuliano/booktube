import Anthropic from '@anthropic-ai/sdk';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { ensureDir } from './utils.js';

const SCHEMA = {
  titulo: 'string',
  autor:  'string',
  genero: 'autodesenvolvimento | negocios | psicologia | filosofia | ciencia | financas | outro',
  duracao_estimada_minutos: 'number',
  gancho_7s: 'string (máx 15 palavras — afirmação ou pergunta de impacto imediato)',
  gancho:    'string (expansão do gancho, ~20 segundos narrados)',
  segmentos: [
    {
      id:                      'number',
      titulo_slide:            'string',
      texto_narrado:           'string (60-120 segundos de narração)',
      ponto_chave:             'string (1 frase memorável)',
      duracao_segundos:        'number',
      transicao_para_proximo:  'string (1 frase que cria curiosidade para o próximo segmento — "open loop")',
    },
  ],
  conclusao:       'string (CTA duplo: inscrição + pergunta para comentários)',
  licao_principal: 'string (frase única e memorável que resume o livro)',
  thumbnail: {
    layout:          'A | B | C',
    frase_principal: 'string (máx 6 palavras, impactante)',
    emoji:           'string (1 emoji temático)',
    numero_destaque: 'number | null (para layout B)',
  },
};

function buildPrompt(titulo, autor) {
  return `Você é um roteirista especialista em conteúdo viral para YouTube — canal de resumos de livros.
Crie um roteiro de exatamente 10 minutos para o livro "${titulo}" de ${autor}.

REGRAS DE CONTEÚDO:
- Tom: educativo mas conversacional, nunca acadêmico
- Idioma: Português brasileiro natural e fluido
- NÃO transcreva trechos do livro — parafraseie, analise e contextualize
- Foque nos conceitos mais transformadores e aplicáveis no cotidiano
- Inclua exemplos práticos e referências brasileiras quando possível
- 6 a 8 segmentos + gancho + conclusão

GANCHO DE 7 SEGUNDOS (gancho_7s):
- MÁXIMO 15 palavras
- Deve ser uma afirmação surpreendente OU uma pergunta que gera ansiedade/curiosidade
- Estruturas que funcionam:
  ✓ "Você sabia que [dado surpreendente]? [implicação]."
  ✓ "Por que [coisa comum] falha? A ciência explica."
  ✓ "[Número] de [categoria] fazem isso sem perceber."
- EVITAR: "Olá, bem-vindo ao Resumo Fácil...", "O livro de hoje é..."

OPEN LOOPS (transicao_para_proximo):
- Cada segmento termina com 1 frase que cria curiosidade para o próximo
- Exemplo: "Mas aqui está o que a maioria das pessoas ignora completamente..."
- Isso mantém o espectador assistindo até o final

CONCLUSÃO COM CTA DUPLO:
1. CTA de inscrição: mencione próximo livro relacionado + "se inscreva"
2. CTA de comentário: faça uma pergunta aberta sobre a vida do espectador

THUMBNAIL (classificar o livro e sugerir):
- Layout A: livros de autodesenvolvimento/psicologia (usa pergunta ou afirmação de impacto)
- Layout B: livros de negócios/produtividade (usa número grande como elemento central)
- Layout C: livros de filosofia/ciência/ficção científica (divisão visual emoji | título)

Retorne APENAS um JSON válido (sem markdown, sem texto extra) seguindo exatamente este schema:
${JSON.stringify(SCHEMA, null, 2)}`;
}

function roteiroParaMarkdown(roteiro) {
  let md = `# ${roteiro.titulo}\n**Autor:** ${roteiro.autor}\n**Gênero:** ${roteiro.genero ?? 'outro'}\n**Duração estimada:** ${roteiro.duracao_estimada_minutos} minutos\n\n---\n\n`;
  md += `## Gancho (7s)\n${roteiro.gancho_7s ?? ''}\n\n`;
  md += `## Gancho (expansão)\n${roteiro.gancho}\n\n---\n\n`;

  for (const seg of roteiro.segmentos) {
    md += `## Segmento ${seg.id}: ${seg.titulo_slide}\n`;
    md += `**Ponto-chave:** ${seg.ponto_chave}\n`;
    md += `**Duração:** ${seg.duracao_segundos}s\n\n`;
    md += `${seg.texto_narrado}\n\n`;
    if (seg.transicao_para_proximo) md += `*Open loop: ${seg.transicao_para_proximo}*\n\n`;
    md += `---\n\n`;
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
    max_tokens: 5120,
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
  await writeFile(join(outputDir, 'roteiro.md'),   roteiroParaMarkdown(roteiro), 'utf-8');

  return roteiro;
}
