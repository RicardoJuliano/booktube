import Anthropic from '@anthropic-ai/sdk';
import { PROMPTS_BASE, LAYOUTS } from './prompts.js';

/**
 * Claude analisa as tendências pesquisadas e gera um briefing completo de design.
 */
export async function analisarTendencias(tendencias, { livro, autor, roteiro, formato }) {
  const genero     = roteiro?.genero ?? 'default';
  const promptBase = PROMPTS_BASE[genero] ?? PROMPTS_BASE.default;
  const client     = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const isVertical = formato === 'vertical' || formato === 'youtube_short' || formato === 'tiktok';

  const prompt = `Você é um especialista em design de thumbnails virais para YouTube com 10 anos de experiência.

TENDÊNCIAS PESQUISADAS AGORA:
${JSON.stringify(tendencias, null, 2)}

CONTEXTO DO VÍDEO:
- Livro: "${livro}"
- Autor: ${autor}
- Gênero: ${genero}
- Gancho do vídeo: ${roteiro?.gancho_7s ?? roteiro?.gancho?.slice(0, 100) ?? 'Não disponível'}
- Lição principal: ${roteiro?.licao_principal ?? ''}
- Conceito visual sugerido: ${roteiro?.conceito_visual_sugerido ?? 'Não especificado'}
- Pergunta chave: ${roteiro?.pergunta_chave ?? 'Não especificado'}
- Canal: "Resumo Fácil" (PT-BR, dark mode, acento dourado #F5A623)
- Formato: ${formato} (${isVertical ? '1080x1920 vertical 9:16' : '1280x720 horizontal 16:9'})

PALETA BASE DO GÊNERO: ${JSON.stringify(promptBase.paleta_base)}
ESTILO DO GÊNERO: ${promptBase.estilo}
EVITAR: ${promptBase.evitar}
LAYOUTS PREFERIDOS PARA ESTE GÊNERO: ${promptBase.layouts_preferidos.join(', ')}

Layouts disponíveis:
- LAYOUT_A: Visual full bleed (100% fundo) + texto sobreposto no terço inferior — melhor quando a imagem é impactante sozinha
- LAYOUT_B: Divisão 60/40 esquerda/direita — visual left, texto right — equilíbrio entre visual e mensagem
- LAYOUT_C: Pergunta no topo + visual centro + rodapé discreto — quando a pergunta é o hook principal
- LAYOUT_D: Número grande central + descrição + título — ideal para listas/dicas/negócios
- LAYOUT_E: Vertical — pergunta topo + visual centro + título rodapé
- LAYOUT_F: Vertical — emoji grande + texto em destaque + hashtag

Gere um briefing de design completo retornando APENAS um JSON válido:
{
  "livro": "${livro}",
  "genero": "${genero}",
  "formato": "${formato}",
  "layout": "LAYOUT_X",
  "paleta": {
    "fundo": "#hex",
    "texto_principal": "#hex",
    "acento": "#hex",
    "sombra": "#hex",
    "justificativa": "por que estas cores convertem para este gênero"
  },
  "tipografia": {
    "estilo": "serifada | sans-serif | display",
    "peso": "bold | extrabold | black",
    "justificativa": "por que esta tipografia funciona aqui"
  },
  "elemento_central": {
    "tipo": "descrição do elemento visual principal",
    "descricao": "descrição detalhada e cinematográfica (30-50 palavras) para prompt de IA",
    "posicao": "onde na composição"
  },
  "texto_thumbnail": "máx 5 palavras impactantes",
  "tom_texto": "pergunta | afirmação | número | promessa",
  "mood_descricao": "descrição atmosférica do mood em inglês (para Higgsfield)",
  "lighting": "descrição de iluminação em inglês (para Higgsfield)",
  "composicao_descricao": "como os elementos se dispõem (para Higgsfield)",
  "zona_texto": "inferior | superior | direita | esquerda (área limpa para texto)",
  "referencia": "canal ou estética de referência",
  "evitar": ["lista", "de", "elementos", "a", "evitar"],
  "prompt_higgsfield": "prompt completo em inglês para geração de imagem via Higgsfield AI (150-200 palavras)",
  "justificativa_layout": "por que este layout foi escolhido sobre os outros"
}`;

  try {
    const msg = await client.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 2048,
      messages:   [{ role: 'user', content: prompt }],
    });

    const raw = msg.content[0].text.trim();
    const m   = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Sem JSON na resposta');
    return JSON.parse(m[0]);

  } catch (err) {
    console.warn(`   ⚠️  Análise Claude falhou: ${err.message} — usando briefing padrão`);
    return gerarBriefingFallback(livro, genero, formato, promptBase, roteiro);
  }
}

function gerarBriefingFallback(livro, genero, formato, promptBase, roteiro) {
  const isVertical = formato === 'vertical' || formato === 'tiktok';
  const layout = isVertical ? 'LAYOUT_F' : (promptBase.layouts_preferidos[0] ?? 'LAYOUT_C');
  const textoCurto = roteiro?.pergunta_chave ?? roteiro?.thumbnail?.frase_principal ?? livro.split(' ').slice(0, 3).join(' ');

  return {
    livro, genero, formato, layout,
    paleta: { ...promptBase.paleta_base, justificativa: `Paleta padrão do gênero ${genero}` },
    tipografia: { estilo: genero === 'literatura_classica' ? 'serifada' : 'sans-serif', peso: 'bold', justificativa: 'Padrão do gênero' },
    elemento_central: { tipo: 'visual_abstrato', descricao: `Dramatic cinematic image representing ${livro} by ${roteiro?.autor ?? ''}`, posicao: 'centro' },
    texto_thumbnail: textoCurto.slice(0, 40),
    tom_texto: 'pergunta',
    mood_descricao: promptBase.mood,
    lighting: promptBase.lighting,
    composicao_descricao: `Dramatic ${isVertical ? 'vertical 9:16' : 'horizontal 16:9'} composition`,
    zona_texto: isVertical ? 'inferior' : 'direita',
    referencia: 'Resumo Fácil channel aesthetic',
    evitar: promptBase.evitar.split(',').map(s => s.trim()),
    prompt_higgsfield: `Cinematic YouTube thumbnail for Brazilian book summary channel. ${promptBase.mood}. ${promptBase.lighting}. Dark background with ${promptBase.paleta_base.acento} accent. Photorealistic, high contrast, dramatic. No text or watermarks.`,
    justificativa_layout: 'Layout padrão para o gênero',
  };
}
