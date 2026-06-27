import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ensureDir } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VOZES_CACHE = join(__dirname, '..', 'assets', 'vozes.json');

const VOZ_MAP = {
  'pt-masculine-deep': { nome: 'Rafael', keywords: ['deep', 'grave', 'male', 'masculine'] },
  'pt-masculine-young': { nome: 'Lucas', keywords: ['young', 'jovem', 'male', 'masculine'] },
  'pt-feminine-warm': { nome: 'Ana', keywords: ['warm', 'female', 'feminine'] },
  'pt-feminine-clear': { nome: 'Beatriz', keywords: ['clear', 'female', 'feminine'] },
};

const VOICE_SETTINGS = {
  stability: 0.65,
  similarity_boost: 0.80,
  style: 0.35,
  use_speaker_boost: true,
};

function getHeaders(apiKey) {
  return {
    'xi-api-key': apiKey,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

export async function listarVozes() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || apiKey === 'SUA_CHAVE_AQUI') {
    throw new Error('❌ Chave do ElevenLabs inválida. Verifique seu .env');
  }

  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: getHeaders(apiKey),
  });

  if (!res.ok) {
    throw new Error(`❌ Erro ao buscar vozes: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const vozes = data.voices || [];

  const vozesAssociadas = {};
  for (const [idAmigavel, info] of Object.entries(VOZ_MAP)) {
    const candidatos = vozes.filter(v => {
      const label = (v.name + ' ' + (v.labels ? Object.values(v.labels).join(' ') : '')).toLowerCase();
      return info.keywords.some(k => label.includes(k));
    });
    if (candidatos.length > 0) {
      vozesAssociadas[idAmigavel] = { id: candidatos[0].voice_id, nome: candidatos[0].name };
    }
  }

  if (vozes.length > 0 && Object.keys(vozesAssociadas).length === 0) {
    const primeiraVoz = vozes[0];
    vozesAssociadas['pt-masculine-deep'] = { id: primeiraVoz.voice_id, nome: primeiraVoz.name };
  }

  ensureDir(join(__dirname, '..', 'assets'));
  await writeFile(VOZES_CACHE, JSON.stringify({ vozes: vozesAssociadas, todas: vozes.map(v => ({ id: v.voice_id, nome: v.name })) }, null, 2));

  return vozesAssociadas;
}

async function resolverVozId(vozAmigavel) {
  let cache = null;

  if (existsSync(VOZES_CACHE)) {
    try {
      cache = JSON.parse(await readFile(VOZES_CACHE, 'utf-8'));
    } catch { /* ignora cache corrompido */ }
  }

  if (!cache) {
    cache = { vozes: await listarVozes() };
  }

  if (cache.vozes[vozAmigavel]) {
    return cache.vozes[vozAmigavel].id;
  }

  const todasVozes = cache.todas || [];
  const direto = todasVozes.find(v => v.id === vozAmigavel || v.nome === vozAmigavel);
  if (direto) return direto.id;

  const primeira = Object.values(cache.vozes)[0];
  if (primeira) return primeira.id;

  throw new Error(`❌ Voz "${vozAmigavel}" não encontrada. Use --listar-vozes para ver as disponíveis.`);
}

function construirTextoNarracao(roteiro) {
  const partes = [];

  partes.push(roteiro.gancho);
  partes.push('<break time="1.5s"/>');

  for (let i = 0; i < roteiro.segmentos.length; i++) {
    partes.push(roteiro.segmentos[i].texto_narrado);
    if (i < roteiro.segmentos.length - 1) {
      partes.push('<break time="1.0s"/>');
    }
  }

  partes.push('<break time="1.5s"/>');
  partes.push(roteiro.conclusao);

  return partes.join('\n\n');
}

export async function gerarNarracao(roteiro, vozAmigavel, outputDir) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || apiKey === 'SUA_CHAVE_AQUI') {
    throw new Error('❌ Chave do ElevenLabs inválida. Verifique seu .env');
  }

  const voiceId = await resolverVozId(vozAmigavel);
  const textoCompleto = construirTextoNarracao(roteiro);

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: textoCompleto,
      model_id: 'eleven_multilingual_v2',
      voice_settings: VOICE_SETTINGS,
    }),
  });

  if (res.status === 401) throw new Error('❌ Chave do ElevenLabs inválida. Verifique seu .env');
  if (res.status === 429) throw new Error('❌ Sem caracteres disponíveis no ElevenLabs. Atualize seu plano.');
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`❌ Erro ElevenLabs ${res.status}: ${err}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const outputPath = join(outputDir, 'naracao.mp3');
  await writeFile(outputPath, buffer);

  return outputPath;
}

export async function exibirVozesDisponiveis() {
  const vozes = await listarVozes();
  console.log('\nVozes disponíveis:\n');
  for (const [id, info] of Object.entries(vozes)) {
    console.log(`  ${id.padEnd(25)} → ${info.nome} (${info.id})`);
  }
  console.log('');
}
