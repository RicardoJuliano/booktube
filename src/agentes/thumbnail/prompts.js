/**
 * Biblioteca de prompts por gênero — usada pelo projetista e pelo Higgsfield.
 * Cada entrada define o DNA visual do gênero para thumbnails de alta conversão.
 */

export const PROMPTS_BASE = {

  literatura_classica: {
    mood: 'psychologically intense, mysterious, 19th century dramatic atmosphere, psychological tension',
    lighting: 'chiaroscuro, candlelight warmth contrasting with cold shadows, Rembrandt lighting',
    elementos_visuais: [
      'dramatic close-up of enigmatic character face with deep expressive eyes',
      'period architecture in shadow with single light source',
      'stormy dark sky or candlelit interior',
      'torn letter, old manuscript, or quill pen',
      'split composition showing two characters with opposing lighting',
    ],
    estilo: 'cinematic period drama, Baroque painting aesthetic, film noir, 19th century Brazil',
    evitar: 'bright modern colors, emojis, flat design, cartoonish elements, sans-serif fonts',
    fonte_ideal: 'Playfair Display Bold',
    paleta_base: { fundo: '#0D1020', acento: '#C9A84C', texto: '#F0EAD6', sombra: '#6B1A2A' },
    layouts_preferidos: ['LAYOUT_C', 'LAYOUT_B', 'LAYOUT_A'],
  },

  autodesenvolvimento: {
    mood: 'energetic, aspirational, transformation, breakthrough moment',
    lighting: 'bright high-key with dramatic accent light, golden hour warmth',
    elementos_visuais: [
      'person in confident power pose silhouette against bright sky',
      'mountain peak emerging from clouds with sunrise',
      'brain with glowing neural connections and energy',
      'upward trajectory — stairs, arrow, rocket launch',
    ],
    estilo: 'modern, bold, motivational, TED Talk aesthetic, premium self-help',
    evitar: 'dark depressing tones, complex cluttered imagery, period aesthetics, pessimistic elements',
    fonte_ideal: 'Montserrat ExtraBold',
    paleta_base: { fundo: '#0A0A1A', acento: '#F5A623', texto: '#FFFFFF', sombra: '#1A1A3E' },
    layouts_preferidos: ['LAYOUT_D', 'LAYOUT_C', 'LAYOUT_B'],
  },

  negocios: {
    mood: 'authoritative, professional, strategic, premium success',
    lighting: 'clean dramatic corporate lighting with strong accent shadows',
    elementos_visuais: [
      'city skyline at night from penthouse perspective',
      'chess king piece isolated on dark surface',
      'ascending graph with dramatic upward curve',
      'boardroom with city view, power perspective',
    ],
    estilo: 'premium corporate, Wall Street, Forbes/Bloomberg magazine cover aesthetic',
    evitar: 'casual tones, playful colors, unprofessional elements, clip art',
    fonte_ideal: 'Inter Black',
    paleta_base: { fundo: '#0A1520', acento: '#00D4AA', texto: '#FFFFFF', sombra: '#001830' },
    layouts_preferidos: ['LAYOUT_D', 'LAYOUT_B', 'LAYOUT_C'],
  },

  psicologia: {
    mood: 'introspective, mind-bending, curious, psychological depth',
    lighting: 'split lighting with blue/red duality, symbolic color temperature contrast',
    elementos_visuais: [
      'human silhouette with galaxy or ocean inside the mind',
      'mirror reflection showing different emotional states',
      'eye with depth and complexity — window to the soul',
      'abstract maze or labyrinth from bird\'s eye view',
    ],
    estilo: 'surreal but photorealistic, National Geographic + dark academia',
    evitar: 'medical clinical aesthetics, overly literal symbols, overly saturated',
    fonte_ideal: 'Playfair Display Bold',
    paleta_base: { fundo: '#1A0A2E', acento: '#E94560', texto: '#FFFFFF', sombra: '#0A0518' },
    layouts_preferidos: ['LAYOUT_A', 'LAYOUT_C', 'LAYOUT_B'],
  },

  filosofia: {
    mood: 'contemplative, timeless, vast, intellectual weight',
    lighting: 'golden hour, starry night sky, profound natural light',
    elementos_visuais: [
      'single figure contemplating vast landscape or cosmos',
      'ancient architecture silhouette against dramatic sky',
      'single candle flame in absolute darkness',
      'open book with ethereal light emanating from pages',
    ],
    estilo: 'classical painting meets modern minimalism, Caspar David Friedrich aesthetic',
    evitar: 'busy compositions, neon colors, rushed or commercial feel',
    fonte_ideal: 'Playfair Display SemiBold',
    paleta_base: { fundo: '#050510', acento: '#C0C0C0', texto: '#F0F0E8', sombra: '#0A0A20' },
    layouts_preferidos: ['LAYOUT_A', 'LAYOUT_C', 'LAYOUT_B'],
  },

  ciencia: {
    mood: 'awe-inspiring, discovery, cosmic scale, breakthrough revelation',
    lighting: 'deep space glow, bioluminescent, laboratory light on dark background',
    elementos_visuais: [
      'galaxy or nebula with stunning color detail',
      'DNA double helix glowing in dark void',
      'microscopic world revealed as macro landscape',
      'scientist silhouette against vast universe backdrop',
    ],
    estilo: 'National Geographic meets sci-fi, Carl Sagan Cosmos aesthetic',
    evitar: 'whiteboard aesthetics, boring laboratory imagery, clipart science symbols',
    fonte_ideal: 'Inter Bold',
    paleta_base: { fundo: '#000A1F', acento: '#7FDBFF', texto: '#FFFFFF', sombra: '#001040' },
    layouts_preferidos: ['LAYOUT_A', 'LAYOUT_B', 'LAYOUT_D'],
  },

  financas: {
    mood: 'aspirational wealth, strategic achievement, luxury success',
    lighting: 'golden hour luxury, warm premium ambient, penthouse view',
    elementos_visuais: [
      'gold coins or abstract wealth flowing upward',
      'city skyline from extreme height at golden hour',
      'stock chart with dramatic upward trajectory',
      'symbolic key unlocking vault of golden light',
    ],
    estilo: 'luxury brand meets financial media, Forbes/Bloomberg cover',
    evitar: 'tacky get-rich imagery, dollar signs everywhere, cheap aesthetic',
    fonte_ideal: 'Montserrat Bold',
    paleta_base: { fundo: '#0B200B', acento: '#2ECC40', texto: '#FFFFFF', sombra: '#061006' },
    layouts_preferidos: ['LAYOUT_D', 'LAYOUT_B', 'LAYOUT_A'],
  },

  default: {
    mood: 'engaging, educational, high quality, trustworthy',
    lighting: 'clean dramatic with warm accent',
    elementos_visuais: ['open glowing book', 'abstract knowledge symbols', 'light breakthrough'],
    estilo: 'modern educational, premium feel, Resumo Fácil dark aesthetic',
    evitar: 'generic stock photo feel, cliché imagery',
    fonte_ideal: 'Montserrat Bold',
    paleta_base: { fundo: '#0D0D0D', acento: '#F5A623', texto: '#FFFFFF', sombra: '#1A1A2E' },
    layouts_preferidos: ['LAYOUT_C', 'LAYOUT_B', 'LAYOUT_A'],
  },
};

export const LAYOUTS = {
  LAYOUT_A: 'imersao_total',        // visual full bleed + texto sobreposto no terço inferior
  LAYOUT_B: 'divisao_60_40',        // visual 60% esquerda + texto 40% direita
  LAYOUT_C: 'pergunta_visual',      // pergunta topo + visual centro + rodapé
  LAYOUT_D: 'numero_impacto',       // número enorme + descrição + título
  LAYOUT_E: 'rosto_emocao_vertical', // vertical: pergunta + rosto/visual + título
  LAYOUT_F: 'contraste_vertical',   // vertical: emoji + texto destaque + hashtag
};

export const RESOLUCOES = {
  youtube_horizontal: { width: 1280, height: 720  },
  youtube_short:      { width: 1080, height: 1920 },
  vertical:           { width: 1080, height: 1920 },
  tiktok:             { width: 1080, height: 1920 },
};
