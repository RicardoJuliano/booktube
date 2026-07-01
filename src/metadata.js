import Anthropic from '@anthropic-ai/sdk';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { calcularTimings } from './legenda.js';

function formatarTempo(segundos) {
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Reaproveita o mesmo timing real (duração medida do MP3 + distribuição por
// contagem de caracteres) usado em legenda.js, para os capítulos baterem
// com o vídeo de fato — duracao_segundos do roteiro é só uma estimativa.
function calcularTimestamps(roteiro, duracaoTotal) {
  const blocos = calcularTimings(roteiro, duracaoTotal);
  const capitulos = [{ tempo: '0:00', titulo: 'Introdução' }];

  for (const bloco of blocos) {
    if (bloco.tipo === 'segmento') {
      capitulos.push({ tempo: formatarTempo(bloco.inicio), titulo: roteiro.segmentos[bloco.segIndex].titulo_slide });
    } else if (bloco.tipo === 'conclusao') {
      capitulos.push({ tempo: formatarTempo(bloco.inicio), titulo: 'Conclusão' });
    }
  }

  return capitulos;
}

function formatarCapitulosTexto(capitulos) {
  return capitulos.map(c => `${c.tempo} - ${c.titulo}`).join('\n');
}

export async function gerarMetadata(roteiro, duracaoTotal, outputDir) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'sk-ant-SUA_CHAVE_AQUI') {
    throw new Error('❌ Chave da Anthropic inválida. Verifique seu .env');
  }

  const client = new Anthropic({ apiKey });
  const capitulos = calcularTimestamps(roteiro, duracaoTotal);
  const capitulosTexto = formatarCapitulosTexto(capitulos);

  const prompt = `Você é um especialista em SEO e marketing de conteúdo para YouTube em Português Brasileiro.
Crie metadata de alta conversão para este vídeo de resumo de livro:

Livro: "${roteiro.titulo}" de ${roteiro.autor}
Gênero: ${roteiro.genero ?? 'autodesenvolvimento'}
Gancho: ${roteiro.gancho_7s ?? roteiro.gancho?.slice(0, 100) ?? ''}
Lição principal: ${roteiro.licao_principal}
Segmentos: ${roteiro.segmentos.map(s => s.titulo_slide).join(', ')}

Gere 3 OPÇÕES DE TÍTULO usando fórmulas diferentes:
- Fórmula A: [NÚMERO] + [BENEFÍCIO] + nome do livro (ex: "3 Lições de '{livro}' Que Vão Mudar Como Você Pensa")
- Fórmula B: PERGUNTA que gera curiosidade + nome do livro (ex: "Por Que Pessoas Inteligentes Sabotam a Si Mesmas? | {livro}")
- Fórmula C: PROMESSA DIRETA + nome do livro (ex: "{livro} em 10 Minutos: O Que Realmente Importa")

Retorne APENAS um JSON válido (sem markdown):
{
  "opcoes_titulo": [
    { "titulo": "...(máx 70 chars)...", "formula": "A" },
    { "titulo": "...(máx 70 chars)...", "formula": "B" },
    { "titulo": "...(máx 70 chars)...", "formula": "C" }
  ],
  "titulo_youtube": "o título recomendado (copy de uma das opções acima)",
  "descricao": "primeira linha com curiosity gap (máx 120 chars antes do ver mais), depois 2 parágrafos de benefícios + CTA",
  "tags": ["array de 15 tags em PT-BR: específicas do livro + genéricas de autodesenvolvimento"]
}

REGRAS:
- Títulos: emocionalmente carregados, sem clickbait vazio — prometer algo que o vídeo entrega
- Descrição: PRIMEIRA LINHA deve criar curiosidade (não "Neste vídeo fazemos o resumo de...")
- Tags: mix de broad (livros, autodesenvolvimento) + mid (gênero) + long-tail (nome+autor)
- Tudo em Português Brasileiro`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1536,
    messages: [{ role: 'user', content: prompt }],
  });

  let seoData;
  try {
    const rawText = message.content[0].text.trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    seoData = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  } catch {
    seoData = {
      opcoes_titulo: [
        { titulo: `${roteiro.titulo} em 10 Minutos | O Que Realmente Importa`, formula: 'C' },
      ],
      titulo_youtube: `${roteiro.titulo} | Resumo Completo em 10 Minutos | ${roteiro.autor}`,
      descricao: `Você sabia que "${roteiro.titulo}" tem lições que mudam como você pensa?\n\n${roteiro.licao_principal}`,
      tags: ['resumo de livros', roteiro.titulo.toLowerCase(), roteiro.autor.toLowerCase(), 'autodesenvolvimento'],
    };
  }

  const descricaoComCapitulos = `${seoData.descricao}\n\n⏱️ CAPÍTULOS:\n${capitulosTexto}\n\n#resumodelivros #livros #autodesenvolvimento`;

  const metadata = {
    titulo_youtube:  seoData.titulo_youtube,
    opcoes_titulo:   seoData.opcoes_titulo ?? [],
    descricao:       descricaoComCapitulos,
    tags:            seoData.tags,
    categoria_youtube: '27',
    idioma:          process.env.CANAL_IDIOMA || 'pt-BR',
    capitulos,
  };

  await writeFile(join(outputDir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');
  return metadata;
}
