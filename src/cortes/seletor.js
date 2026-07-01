import Anthropic from '@anthropic-ai/sdk';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { calcularTimings } from '../legenda.js';
import { ensureDir } from '../utils.js';

export async function selecionarCortes(roteiro, duracaoTotal, outputDir) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Você é um especialista em conteúdo viral para TikTok e YouTube Shorts.

Analise este roteiro de "${roteiro.titulo}" (${roteiro.autor}) e selecione entre 3 e 5 momentos para virar cortes curtos de 45-90 segundos cada.

CRITÉRIOS para um bom corte:
- Começa com uma afirmação impactante ou pergunta que gera curiosidade
- Contém uma ideia completa e independente (não precisa ver o vídeo maior)
- Termina com uma conclusão ou insight claro
- Ideal: estatísticas, histórias, conceitos que "viram a cabeça"
- Evitar: introduções, transições, explicações de contexto

Segmentos disponíveis:
${roteiro.segmentos.map(s => `ID ${s.id}: "${s.titulo_slide}" — ${s.texto_narrado.slice(0, 200)}...`).join('\n')}

Para cada corte retorne:
- id: número sequencial (1, 2, 3...)
- segmento_id: id do segmento a usar
- titulo: título impactante para o Short/TikTok (máx 60 chars)
- gancho: frase de abertura nova e direta para o formato curto (máx 12 palavras)
- motivo_viral: por que este momento é viral (1 frase)

Retorne APENAS JSON válido:
{"cortes": [{"id": 1, "segmento_id": 2, "titulo": "...", "gancho": "...", "motivo_viral": "..."}]}`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  let selecao;
  try {
    const raw = msg.content[0].text.trim();
    const m   = raw.match(/\{[\s\S]*\}/);
    selecao   = JSON.parse(m ? m[0] : raw);
  } catch {
    throw new Error('Claude retornou JSON inválido na seleção de cortes.');
  }

  // Mapear segmento_id → timing real (mesma lógica usada em legenda.js e metadata.js)
  const blocos = calcularTimings(roteiro, duracaoTotal);
  for (const corte of selecao.cortes) {
    const segIdx = corte.segmento_id - 1;
    const bloco  = blocos.find(b => b.tipo === 'segmento' && b.segIndex === segIdx);
    if (bloco) {
      corte.inicio_real = bloco.inicio;
      corte.fim_real    = bloco.fim;
    } else {
      // fallback conservador se segmento_id for inválido
      corte.inicio_real = 20;
      corte.fim_real    = 80;
    }
    corte.duracao = corte.fim_real - corte.inicio_real;
  }

  // Manter apenas cortes com duração entre 30s e 120s
  selecao.cortes = selecao.cortes.filter(c => c.duracao >= 30 && c.duracao <= 120);

  const cortesDir = join(outputDir, 'cortes');
  ensureDir(cortesDir);
  await writeFile(join(cortesDir, 'selecao.json'), JSON.stringify(selecao, null, 2), 'utf-8');

  return selecao;
}
