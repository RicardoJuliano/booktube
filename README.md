# BookNarrator

CLI em Node.js que transforma título e autor de um livro em um vídeo de resumo narrado e ilustrado para o YouTube. Projeto de automação pessoal, feito para um canal de resumos de livros.

Uma execução faz, em sequência:

1. Roteiro (Claude)
2. Narração (ElevenLabs)
3. Cenas ilustradas desenhadas em Canvas, uma por segmento
4. Animação das cenas (Higgsfield), opcional
5. Legendas sincronizadas (.ass)
6. Thumbnail
7. Metadados de SEO e capítulos (Claude)
8. Composição do vídeo (FFmpeg)
9. Upload no YouTube (Data API v3), opcional

Cada etapa grava o resultado em `output/<livro-autor>/`, então dá para refazer só uma parte do pipeline com as flags `--skip-*` sem pagar as APIs de novo.

## Como rodar

Requisitos: Node 20+ e FFmpeg no PATH.

```bash
npm install
cp .env.example .env   # preencha ANTHROPIC_API_KEY e ELEVENLABS_API_KEY

node index.js --livro "Dom Casmurro" --autor "Machado de Assis"
node index.js --help
```

O upload sai como privado por padrão. `--publicar` publica direto. Para habilitar o upload, rode uma vez `node setup-youtube.js` e autorize o canal.

## Estrutura

| Arquivo | Função |
|---|---|
| `index.js` | Orquestra as etapas |
| `src/roteiro.js`, `src/metadata.js` | Texto gerado pelo Claude |
| `src/narracao.js` | Voz via ElevenLabs |
| `src/cenas.js` | Ilustrações em Canvas |
| `src/legenda.js`, `src/video.js` | Legendas e montagem com FFmpeg |
| `src/youtube.js` | Upload |
| `server.js`, `studio.html` | Painel local (`npm run studio`) |

## Estado

Uso pessoal, sem testes automatizados. As chaves de API ficam no `.env`, que não vai para o repositório.
