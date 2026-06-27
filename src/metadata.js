import Anthropic from '@anthropic-ai/sdk';
import { writeFile } from 'fs/promises';
import { join } from 'path';

function calcularTimestamps(roteiro) {
  const capitulos = [{ tempo: '0:00', titulo: 'Introdução' }];
  let segundosAcumulados = 20;

  for (const seg of roteiro.segmentos) {
    const m = Math.floor(segundosAcumulados / 60);
    const s = Math.round(segundosAcumulados % 60);
    capitulos.push({
      tempo: `${m}:${s.toString().padStart(2, '0')}`,
      titulo: seg.titulo_slide,
    });
    segundosAcumulados += seg.duracao_segundos + 1;
  }

  const mConc = Math.floor(segundosAcumulados / 60);
  const sConc = Math.round(segundosAcumulados % 60);
  capitulos.push({
    tempo: `${mConc}:${sConc.toString().padStart(2, '0')}`,
    titulo: 'Conclusão',
  });

  return capitulos;
}

function formatarCapitulosTexto(capitulos) {
  return capitulos.map(c => `${c.tempo} - ${c.titulo}`).join('\n');
}

export async function gerarMetadata(roteiro, outputDir) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'sk-ant-SUA_CHAVE_AQUI') {
    throw new Error('❌ Chave da Anthropic inválida. Verifique seu .env');
  }

  const client = new Anthropic({ apiKey });
  const capitulos = calcularTimestamps(roteiro);
  const capitulosTexto = formatarCapitulosTexto(capitulos);

  const prompt = `Você é um especialista em SEO para YouTube em Português Brasileiro.
Crie metadata otimizada para o seguinte vídeo de resumo de livro:

Livro: "${roteiro.titulo}" de ${roteiro.autor}
Lição principal: ${roteiro.licao_principal}
Segmentos: ${roteiro.segmentos.map(s => s.titulo_slide).join(', ')}

Retorne APENAS um JSON válido (sem markdown) com esta estrutura exata:
{
  "titulo_youtube": "título otimizado de até 70 chars com | separador",
  "descricao": "descrição completa com emojis, benefícios e call-to-action",
  "tags": ["array", "de", "15", "tags", "relevantes"]
}

REGRAS:
- Título: inclua o nome do livro + "Resumo" + tempo + autor
- Descrição: 3 parágrafos (o que vai aprender, capítulos, CTA para inscrever)
- Tags: mix de específicas (nome do livro, autor) e genéricas (resumo de livros, autodesenvolvimento)
- Tudo em Português Brasileiro`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  let seoData;
  try {
    const rawText = message.content[0].text.trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    seoData = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  } catch {
    seoData = {
      titulo_youtube: `${roteiro.titulo} | Resumo Completo em 10 Minutos | ${roteiro.autor}`,
      descricao: `Resumo completo de "${roteiro.titulo}" de ${roteiro.autor}.\n\n${roteiro.licao_principal}`,
      tags: ['resumo de livros', roteiro.titulo.toLowerCase(), roteiro.autor.toLowerCase(), 'autodesenvolvimento'],
    };
  }

  const descricaoComCapitulos = `${seoData.descricao}\n\n⏱️ CAPÍTULOS:\n${capitulosTexto}\n\n#resumodelivros #livros #autodesenvolvimento`;

  const metadata = {
    titulo_youtube: seoData.titulo_youtube,
    descricao: descricaoComCapitulos,
    tags: seoData.tags,
    categoria_youtube: '27',
    idioma: process.env.CANAL_IDIOMA || 'pt-BR',
    capitulos,
  };

  await writeFile(join(outputDir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');
  return metadata;
}
