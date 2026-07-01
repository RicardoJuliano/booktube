/**
 * Delegado ao ThumbnailAgent — gera thumbnail vertical 1080×1920 para Shorts/TikTok.
 */
import { gerarThumbnailVertical } from '../agentes/thumbnail/index.js';

export async function gerarThumbnailCurta(corte, roteiro, outputDir) {
  const { thumbnailPath } = await gerarThumbnailVertical({
    livro:   roteiro.titulo,
    autor:   roteiro.autor,
    corte,
    roteiro,
    outputDir,
  });
  return thumbnailPath;
}
