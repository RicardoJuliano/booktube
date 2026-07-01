import { statSync } from 'fs';
import { RESOLUCOES } from './prompts.js';

export async function validarThumbnail(imagePath, briefing) {
  if (process.env.THUMBNAIL_VALIDAR === 'false') return { ok: true, problemas: [] };

  const problemas = [];

  try {
    const sharp    = (await import('sharp')).default;
    const meta     = await sharp(imagePath).metadata();
    const esperado = RESOLUCOES[briefing.formato] ?? RESOLUCOES.youtube_horizontal;

    // Resolução correta?
    if (meta.width !== esperado.width || meta.height !== esperado.height) {
      problemas.push(`Resolução ${meta.width}x${meta.height} ≠ esperada ${esperado.width}x${esperado.height}`);
    }

    // Contraste mínimo (desvio padrão do canal de luminância)
    const stats = await sharp(imagePath).grayscale().stats();
    if (stats.channels[0].stdev < 30) {
      problemas.push('Contraste muito baixo — thumbnail pode não chamar atenção');
    }

    // Tamanho mínimo (evita imagens corrompidas)
    const { size } = statSync(imagePath);
    if (size < 30_000) {
      problemas.push(`Arquivo muito pequeno (${Math.round(size/1024)}KB) — possível problema de qualidade`);
    }

  } catch (err) {
    problemas.push(`Validação falhou: ${err.message}`);
  }

  return { ok: problemas.length === 0, problemas };
}
