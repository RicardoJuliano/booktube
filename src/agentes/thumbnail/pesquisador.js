import Anthropic from '@anthropic-ai/sdk';
import { lerCache, salvarCache, cacheExpirado } from './cache.js';

const HORAS_CACHE = parseInt(process.env.THUMBNAIL_CACHE_HORAS || '72');

function buildQueries(genero, anoAtual) {
  return [
    `YouTube thumbnails "resumo de livros" virais ${anoAtual} design tendências`,
    `thumbnails YouTube "${genero}" books channel viral CTR high click rate ${anoAtual}`,
    `best book summary YouTube channel thumbnail design ${anoAtual}`,
    `YouTube thumbnail color typography trends ${anoAtual} high CTR education channel`,
    `TikTok Shorts thumbnail cover book summary viral ${anoAtual} vertical`,
  ];
}

/**
 * Pesquisa tendências de thumbnails usando a ferramenta web_search do Claude.
 * Resultados são cacheados por 72h para evitar buscas repetidas.
 */
export async function pesquisarTendencias(genero) {
  // Tenta o cache primeiro
  const cached = lerCache(genero);
  if (cached && !cacheExpirado(cached, HORAS_CACHE)) {
    console.log(`   📦 Cache de tendências válido para "${genero}" (${HORAS_CACHE}h)`);
    return cached;
  }

  console.log(`   🔍 Pesquisando tendências para "${genero}"...`);

  const client  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const anoAtual = new Date().getFullYear();
  const queries  = buildQueries(genero, anoAtual);

  const prompt = `Você é um especialista em design de thumbnails virais para YouTube e TikTok.

Pesquise as tendências atuais de thumbnails para canais de resumo de livros, especialmente para o gênero "${genero}".

Execute buscas sobre:
${queries.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Após pesquisar, extraia e retorne um JSON com:
{
  "genero": "${genero}",
  "insights": [
    "insight 1 sobre o que está funcionando",
    "insight 2 sobre paletas de cores dominantes",
    "insight 3 sobre tipografia",
    "insight 4 sobre elementos visuais que convertem",
    "insight 5 sobre o que está saturado/evitar"
  ],
  "resumo_executivo": "1-2 frases resumindo o padrão vencedor para este gênero",
  "exemplos_canais": ["canal1", "canal2"],
  "paleta_tendencia": { "fundo": "#hex", "acento": "#hex" },
  "elemento_visual_dominante": "descrição do elemento mais comum nos tops"
}

Retorne APENAS o JSON válido.`;

  try {
    const response = await client.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 2048,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: prompt }],
    });

    // Extrai o JSON da resposta final (após uso das ferramentas)
    let resultado;
    for (const block of response.content) {
      if (block.type === 'text') {
        const m = block.text.match(/\{[\s\S]*\}/);
        if (m) { resultado = JSON.parse(m[0]); break; }
      }
    }

    if (!resultado) throw new Error('Resposta sem JSON válido');

    salvarCache(genero, resultado);
    console.log(`   ✔ ${resultado.insights?.length ?? 0} insights extraídos`);
    return resultado;

  } catch (err) {
    console.warn(`   ⚠️  Pesquisa web falhou (${err.message}) — usando fallback interno`);
    return gerarFallbackTendencias(genero);
  }
}

// Fallback quando a pesquisa web não está disponível
function gerarFallbackTendencias(genero) {
  const fallbacks = {
    literatura_classica: {
      insights: [
        'Thumbnails com personagens dramáticos e expressivos dominam literatura clássica',
        'Contraste extremo fundo escuro + texto claro performa melhor',
        'Perguntas provocadoras ("Capitu traiu?") geram 2x mais cliques que afirmações',
        'Tipografia serifada aumenta percepção de qualidade para literatura clássica',
        'Emojis reduzem credibilidade neste gênero — evitar',
      ],
      resumo_executivo: 'Thumbnails dramáticos com pergunta provocadora e personagem expressivo lideram CTR em literatura clássica.',
      elemento_visual_dominante: 'close dramático de personagem com lighting chiaroscuro',
      paleta_tendencia: { fundo: '#0D1020', acento: '#C9A84C' },
    },
    autodesenvolvimento: {
      insights: [
        'Silhueta humana em posição de poder com luz atrás performa muito bem',
        'Números grandes (3, 5, 7) no thumbnail aumentam CTR significativamente',
        'Cores vibrantes (laranja, amarelo) contra fundo escuro dominam o nicho',
        'Texto curto e impactante (máx 4 palavras) supera textos longos',
        'Faces sorridentes e olhar direto para câmera funcionam muito bem',
      ],
      resumo_executivo: 'Thumbnails com número grande, silhueta poderosa e texto curto impactante lideram autodesenvolvimento.',
      elemento_visual_dominante: 'silhueta humana de poder com destaque de luz',
      paleta_tendencia: { fundo: '#0A0A1A', acento: '#F5A623' },
    },
  };

  return fallbacks[genero] ?? {
    insights: [
      'Contraste alto entre fundo e texto melhora visibilidade',
      'Imagens emocionalmente impactantes superam imagens informativas',
      'Texto curto e legível mesmo em miniatura é essencial',
      'Cores quentes contra fundo escuro têm alto CTR educacional',
      'Consistência visual entre vídeos aumenta reconhecimento do canal',
    ],
    resumo_executivo: 'Thumbnails com alto contraste, texto curto e elemento emocional central performam melhor.',
    elemento_visual_dominante: 'elemento central forte com texto sobreposto',
    paleta_tendencia: { fundo: '#0D0D0D', acento: '#F5A623' },
  };
}
