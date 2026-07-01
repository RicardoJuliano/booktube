import { HiggsfieldClient } from '@higgsfield/client';
import { config, higgsfield as hfV2 } from '@higgsfield/client/v2';
import { writeFile } from 'fs/promises';
import { RESOLUCOES } from './prompts.js';

/**
 * Gera thumbnail cinematográfica via Higgsfield AI (text-to-image).
 * Usa a API v2 (flux-pro/kontext) para imagens de maior qualidade.
 * Fallback automático para null quando falha — gerador.js usa Canvas.
 */
export async function gerarThumbnailHiggsfield(promptHiggsfield, briefing, outputPath) {
  if (!process.env.HIGGSFIELD_API_KEY || !process.env.HIGGSFIELD_API_SECRET) return null;
  if (process.env.THUMBNAIL_USAR_HIGGSFIELD === 'false') return null;

  const isVertical = briefing.formato === 'vertical' || briefing.formato === 'tiktok';
  const resolucao  = RESOLUCOES[briefing.formato] ?? RESOLUCOES.youtube_horizontal;
  const aspectRatio = isVertical ? '9:16' : '16:9';

  // Monta prompt completo com instruções técnicas
  const promptFinal = buildPromptCompleto(promptHiggsfield, briefing, isVertical);

  try {
    console.log(`   🎨 Gerando imagem via Higgsfield AI (${aspectRatio})...`);

    // Configura cliente v2
    config({ credentials: `${process.env.HIGGSFIELD_API_KEY}:${process.env.HIGGSFIELD_API_SECRET}` });

    const jobSet = await hfV2.subscribe('flux-pro/kontext/max/text-to-image', {
      input: {
        prompt:          promptFinal,
        aspect_ratio:    aspectRatio,
        safety_tolerance: 2,
        seed:            Math.floor(Math.random() * 999999),
      },
      withPolling: true,
    });

    if (jobSet.isFailed || jobSet.isNsfw) throw new Error('Higgsfield recusou a geração');

    const imageUrl = jobSet?.jobs?.[0]?.results?.raw?.url
                  ?? jobSet?.jobs?.[0]?.results?.min?.url;
    if (!imageUrl) throw new Error('URL não retornada pelo Higgsfield');

    // Baixa a imagem
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Download falhou: ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());

    // Redimensiona para resolução exata via sharp
    const sharp = (await import('sharp')).default;
    await sharp(buffer)
      .resize(resolucao.width, resolucao.height, { fit: 'cover', position: 'centre' })
      .png({ quality: 95 })
      .toFile(outputPath);

    console.log(`   ✔ Imagem Higgsfield recebida e salva`);
    return outputPath;

  } catch (err) {
    console.warn(`   ⚠️  Higgsfield falhou: ${err.message} — usando Canvas`);
    return null;
  }
}

function buildPromptCompleto(promptBase, briefing, isVertical) {
  const dim = isVertical ? '1080x1920px vertical 9:16' : '1280x720px horizontal 16:9';

  return `
Cinematic YouTube thumbnail for "Resumo Fácil", a Brazilian book summary channel.

VISUAL CONCEPT:
${briefing.elemento_central?.descricao ?? promptBase}

MOOD & ATMOSPHERE:
${briefing.mood_descricao ?? 'dramatic, cinematic, high contrast'}

LIGHTING:
${briefing.lighting ?? 'chiaroscuro, dramatic shadows with warm accent light'}

COMPOSITION:
${briefing.composicao_descricao ?? 'strong visual hierarchy, subject centered'}
Leave the ${briefing.zona_texto ?? 'bottom third'} area darker and less detailed for text overlay.

COLOR PALETTE:
Background: ${briefing.paleta?.fundo ?? '#0D0D0D'}
Accent: ${briefing.paleta?.acento ?? '#F5A623'}
Overall: dark, cinematic, high contrast

TECHNICAL SPECS:
- Dimensions: ${dim}
- Style: photorealistic cinematic, NOT illustrated or cartoon
- Film grain: subtle, adds texture
- Depth of field: shallow, main subject sharp
- Quality: 4K equivalent sharpness

STYLE REFERENCE:
${briefing.referencia ?? 'EinzelgÃ¤nger channel aesthetic — dark, minimal, dramatic'}

STRICTLY NO: text, watermarks, logos, symbols, UI elements, letters, numbers in the image.
`.trim();
}
