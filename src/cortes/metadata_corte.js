import Anthropic from '@anthropic-ai/sdk';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function gerarMetadataCorte(corte, roteiro, outputDir) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const seg    = roteiro.segmentos.find(s => s.id === corte.segmento_id)
               ?? roteiro.segmentos[corte.segmento_id - 1];

  const prompt = `Você é especialista em SEO para TikTok e YouTube Shorts em Português Brasileiro.

Gere título e descrição otimizados para este corte curto:

Livro: "${roteiro.titulo}" de ${roteiro.autor}
Título do corte: ${corte.titulo}
Gancho: ${corte.gancho}
Conteúdo (trecho): ${seg?.texto_narrado?.slice(0, 400) ?? ''}

REGRAS YouTube Shorts:
- titulo_youtube_short: máx 60 chars, deve terminar com #shorts, use emoji
- descricao_short: máx 250 chars, mencione o livro, CTA para se inscrever
- hashtags_shorts: array de 5 strings, inclua "shorts" obrigatoriamente

REGRAS TikTok:
- titulo_tiktok: máx 150 chars, tom conversacional, emoji no final
- descricao_tiktok: máx 200 chars, 2-3 hashtags inline, CTA simples
- hashtags_tiktok: array de 6-8 strings sem #

Retorne APENAS JSON válido:
{
  "titulo_youtube_short": "...",
  "titulo_tiktok": "...",
  "descricao_short": "...",
  "descricao_tiktok": "...",
  "hashtags_shorts": ["shorts", "..."],
  "hashtags_tiktok": ["resumodelivros", "..."]
}`;

  let seoData;
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = msg.content[0].text.trim();
    const m   = raw.match(/\{[\s\S]*\}/);
    seoData   = JSON.parse(m ? m[0] : raw);
  } catch {
    // fallback direto sem API
    seoData = {
      titulo_youtube_short: `${corte.titulo.slice(0, 48)} #shorts`,
      titulo_tiktok:        `${corte.titulo} 📚`,
      descricao_short:      `${corte.gancho}\n\nResumo de "${roteiro.titulo}" — ${roteiro.autor}\n\n🔔 Inscreva-se para mais resumos!`,
      descricao_tiktok:     `${corte.gancho} 📖 #resumodelivros #${roteiro.titulo.replace(/\s+/g,'').toLowerCase()}`,
      hashtags_shorts:      ['shorts', 'resumodelivros', 'livros', 'autodesenvolvimento', 'aprender'],
      hashtags_tiktok:      ['resumodelivros', 'livros', 'autodesenvolvimento', 'aprender', 'tiktokbrasil', 'dicasdelivros'],
    };
  }

  const metadata = { ...seoData, titulo_corte: corte.titulo, gancho: corte.gancho, livro: roteiro.titulo, autor: roteiro.autor };
  await writeFile(join(outputDir, 'corte_metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');
  return metadata;
}
