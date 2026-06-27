import { google } from 'googleapis';
import { createReadStream, existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { createServer } from 'http';
import { exec } from 'child_process';
import { join } from 'path';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
];
const REDIRECT_URI  = 'http://localhost:8080/oauth2callback';
const TOKENS_FILE   = join('./assets', 'yt_tokens.json');

function oauth2Client() {
  const id     = process.env.YOUTUBE_CLIENT_ID;
  const secret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!id || !secret)
    throw new Error('Configure YOUTUBE_CLIENT_ID e YOUTUBE_CLIENT_SECRET no .env\nVeja: node setup-youtube.js');
  return new google.auth.OAuth2(id, secret, REDIRECT_URI);
}

async function getAuth() {
  const auth = oauth2Client();
  if (!existsSync(TOKENS_FILE))
    throw new Error('Canal não autenticado. Execute primeiro: node setup-youtube.js');

  const tokens = JSON.parse(readFileSync(TOKENS_FILE, 'utf-8'));
  auth.setCredentials(tokens);

  // Renova access_token automaticamente quando expirado
  auth.on('tokens', updated => {
    const saved = JSON.parse(readFileSync(TOKENS_FILE, 'utf-8'));
    writeFileSync(TOKENS_FILE, JSON.stringify({ ...saved, ...updated }, null, 2));
  });

  return auth;
}

// ── Setup OAuth (chamado por setup-youtube.js) ────────────────────────────
export async function autenticarCanal() {
  const auth = oauth2Client();
  const url  = auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });

  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const parsed = new URL(req.url, 'http://localhost:8080');
      const code   = parsed.searchParams.get('code');
      if (!code) { res.end('Parâmetro code ausente.'); return; }

      res.end(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h1>✅ Canal autorizado!</h1>
          <p>Pode fechar esta aba e voltar ao terminal.</p>
        </body></html>`);
      server.close();

      try {
        const { tokens } = await auth.getToken(code);
        writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
        resolve(tokens);
      } catch (e) { reject(e); }
    });

    server.listen(8080, () => {
      console.log('\n🌐 Abrindo navegador para autorizar o canal...\n');
      console.log('   Se não abrir automaticamente, acesse:\n  ', url, '\n');
      exec(process.platform === 'win32' ? `start "" "${url}"` : `open "${url}"`);
    });

    server.on('error', e => {
      if (e.code === 'EADDRINUSE')
        reject(new Error('Porta 8080 em uso. Feche outros programas e tente novamente.'));
      else reject(e);
    });
  });
}

// ── Atualizar descrição do canal ─────────────────────────────────────────
export async function atualizarDescricaoCanal(descricao) {
  const auth    = await getAuth();
  const youtube = google.youtube({ version: 'v3', auth });

  // Busca o ID do canal autenticado
  const me = await youtube.channels.list({ part: ['id', 'brandingSettings'], mine: true });
  const canal = me.data.items?.[0];
  if (!canal) throw new Error('Canal não encontrado. Verifique a autenticação.');

  const channelId = canal.id;
  const branding  = canal.brandingSettings ?? {};

  await youtube.channels.update({
    part: ['brandingSettings'],
    requestBody: {
      id: channelId,
      brandingSettings: {
        ...branding,
        channel: {
          ...(branding.channel ?? {}),
          description: descricao,
        },
      },
    },
  });

  return channelId;
}

// ── Upload do vídeo ──────────────────────────────────────────────────────
export async function uploadParaYoutube(videoPath, thumbnailPath, metadataPath, roteiro, onProgress) {
  const auth     = await getAuth();
  const youtube  = google.youtube({ version: 'v3', auth });
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));

  const titulo     = metadata.titulo_youtube ?? `${roteiro.titulo} | Resumo Completo | ${roteiro.autor}`;
  const descricao  = buildDescricao(metadata, roteiro);
  const tags       = metadata.tags ?? [];
  const tamanho    = statSync(videoPath).size;

  // ── 1. Upload do vídeo ─────────────────────────────────────────────────
  const videoRes = await youtube.videos.insert(
    {
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title:               titulo,
          description:         descricao,
          tags,
          categoryId:          metadata.categoria_youtube ?? '27',
          defaultLanguage:     'pt',
          defaultAudioLanguage:'pt',
        },
        status: {
          privacyStatus:            'public',
          selfDeclaredMadeForKids:  false,
          madeForKids:              false,
        },
      },
      media: { body: createReadStream(videoPath) },
    },
    {
      onUploadProgress: evt => {
        if (onProgress) onProgress(Math.min(Math.round((evt.bytesRead / tamanho) * 95), 95));
      },
    }
  );

  const videoId = videoRes.data.id;

  // ── 2. Thumbnail personalizada ─────────────────────────────────────────
  if (thumbnailPath && existsSync(thumbnailPath)) {
    try {
      await youtube.thumbnails.set({
        videoId,
        media: { body: createReadStream(thumbnailPath) },
      });
    } catch (e) {
      // Canal sem verificação de telefone não pode usar thumbnails personalizadas
      console.warn('\n      ⚠  Thumbnail não enviada: canal precisa de verificação de telefone.');
      console.warn('         Acesse: youtube.com/verify para habilitar.');
    }
  }

  if (onProgress) onProgress(100);
  return `https://youtu.be/${videoId}`;
}

// ── Monta descrição completa otimizada para algoritmo ────────────────────
function buildDescricao(metadata, roteiro) {
  const linhas = [];

  // Corpo principal da descrição gerada pelo Claude
  if (metadata.descricao) {
    linhas.push(metadata.descricao);
  } else {
    linhas.push(`📖 Resumo completo e animado de "${roteiro.titulo}" — ${roteiro.autor}`);
    linhas.push('');
    linhas.push(`💡 Lição principal: ${roteiro.licao_principal}`);
  }

  // Capítulos (formato exigido pelo YouTube para aparecer na timeline)
  if (metadata.capitulos?.length) {
    linhas.push('');
    linhas.push('⏱️ CAPÍTULOS:');
    for (const cap of metadata.capitulos) {
      linhas.push(`${cap.tempo} - ${cap.titulo}`);
    }
  }

  // CTAs e links
  linhas.push('');
  linhas.push('─────────────────────────────────────');
  linhas.push('🔔 Inscreva-se e ative o sino para novos resumos toda semana!');
  linhas.push('👍 Deixe seu like se o conteúdo te ajudou!');
  linhas.push('💬 Comente: qual foi sua maior lição do livro?');
  linhas.push('');
  linhas.push('📚 Quer ler o livro? Busque em qualquer livraria online.');
  linhas.push('');

  // Hashtags no final (boost de descoberta)
  const hashtags = buildHashtags(roteiro, metadata.tags);
  linhas.push(hashtags);

  return linhas.join('\n');
}

function buildHashtags(roteiro, tags = []) {
  const base = [
    roteiro.titulo.replace(/\s+/g, ''),
    roteiro.autor.split(' ').join(''),
    'resumodelivros',
    'livros',
    'autodesenvolvimento',
    'desenvolvimento',
    'leitura',
    'educacao',
  ];
  const extra = tags.slice(0, 5).map(t => t.replace(/\s+/g, ''));
  const all   = [...new Set([...base, ...extra])].slice(0, 13);
  return all.map(h => `#${h}`).join(' ');
}
