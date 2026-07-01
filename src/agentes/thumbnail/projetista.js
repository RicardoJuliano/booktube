import { RESOLUCOES } from './prompts.js';

/**
 * Traduz o briefing em instruções técnicas concretas para o gerador Canvas.
 */
export function projetarThumbnail(briefing) {
  const formato = briefing.formato ?? 'youtube_horizontal';
  const { width, height } = RESOLUCOES[formato] ?? RESOLUCOES.youtube_horizontal;

  return {
    width,
    height,
    layout:    briefing.layout ?? 'LAYOUT_C',
    paleta:    briefing.paleta,
    texto:     briefing.texto_thumbnail ?? '',
    tom:       briefing.tom_texto ?? 'pergunta',
    tipografia: briefing.tipografia,
    livro:     briefing.livro ?? '',
    autor:     briefing.autor ?? '',
    canal:     process.env.CANAL_NOME ?? 'Resumo Fácil',
    numero:    extrairNumero(briefing.texto_thumbnail),
    elemento:  briefing.elemento_central,
    zona_texto: briefing.zona_texto ?? 'inferior',
    genero:    briefing.genero ?? 'default',
  };
}

function extrairNumero(texto) {
  if (!texto) return null;
  const m = texto.match(/\d+/);
  return m ? parseInt(m[0]) : null;
}
