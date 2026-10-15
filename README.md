# Trilha Sonora Film Generator 🎬🎧

MVP funcional da ideia: uma plataforma onde você envia o roteiro (ou storyboard) de um
vídeo e recebe sugestões de trilha sonora — de bancos de música livres de direitos
autorais, ou de músicas conhecidas que combinariam com a ideia — com um ponto de
integração já preparado para o Suno.ai.

Este protótipo já **roda de verdade** (não é só um mockup visual): tem login, upload,
um motor de análise real (heurístico, funciona sem nenhuma chave de API — e opcionalmente
por IA via Claude, se você configurar uma chave) e uma simulação do fluxo com o Suno.

## Como rodar

```bash
npm install
npm start
```

Abra http://localhost:3000 — o app já funciona nesse ponto, com:
- **Login:** clique em "Continuar como convidado" (login com Google é opcional, veja abaixo)
- **Análise:** cole um roteiro, ou envie um `.txt`/`.pdf`/`.docx`, ou descreva um storyboard
- **Sugestões:** moods, gêneros, bpm, termos de busca para bancos de música e referências de músicas conhecidas
- **Suno:** botão que simula a geração de uma faixa (veja por quê, abaixo)

Nenhuma das integrações abaixo é obrigatória — o app funciona 100% sem `.env`.

## Configuração opcional

Copie `.env.example` para `.env` e preencha o que quiser habilitar:

### Login com Google (opcional)
Sem isso, só o botão "Continuar como convidado" aparece — o que já é suficiente pra testar
o produto. Para habilitar o login real:
1. Crie um projeto em https://console.cloud.google.com/
2. Vá em **APIs & Services > Credentials > Create Credentials > OAuth Client ID**
3. Tipo **Web application**, e em "Authorized JavaScript origins" adicione `http://localhost:3000`
   (e depois o domínio real do site quando for pro ar)
4. Copie o **Client ID** para `GOOGLE_CLIENT_ID` no `.env`

### Análise por IA (opcional)
Sem chave, o app usa um **motor heurístico local** (dicionário de palavras-chave por
clima/mood — em `data/music-library.json`) que já funciona bem para um MVP e não custa nada.

Para uma análise mais rica (entendendo contexto, não só palavras-chave), configure:
```
ANTHROPIC_API_KEY=sk-ant-...
```
Gerada em https://console.anthropic.com/. Nesse modo, o roteiro é enviado para o Claude,
que devolve tema geral, clima por trecho e sugestões mais específicas.

### Integração com Suno.ai
**Importante, verificado em setembro/2026:** a Suno não tem uma API pública oficial para
desenvolvedores — hoje só dá pra gerar música pelo site/app deles, ou via parcerias
empresariais fechadas. O que existe no mercado são "wrappers" não-oficiais de terceiros,
que automatizam a conta do usuário por fora e correm risco de violar os Termos de Uso da
Suno (podem parar de funcionar sem aviso).

Por isso, a seção "Gerar com Suno" deste MVP roda em **modo simulado** (`SUNO_PROVIDER=mock`)
— dá pra validar o fluxo de produto (usuário conecta a conta, escreve um prompt, recebe uma
resposta) sem depender de nada instável. O código já está organizado como um *adapter*
plugável (`src/sunoProvider.js`): quando a Suno abrir uma API oficial (ou vocês decidirem
usar um wrapper terceiro por conta e risco), basta implementar essa mesma função com a
chamada real.

## Estrutura do projeto

```
server.js                 → servidor Express, rotas da API
src/textExtractor.js      → extrai texto de .txt/.pdf/.docx
src/soundtrackEngine.js   → motor de sugestão (heurístico + IA opcional)
src/sunoProvider.js       → adapter plugável pra integração Suno
src/googleAuth.js         → verificação do login Google
data/music-library.json   → catálogo de moods, gêneros, bancos royalty-free e referências
public/                   → front-end (HTML/CSS/JS puro, sem build step)
```

## Limitações conhecidas deste MVP (próximos passos)

- **Sessões em memória:** login/sessão somem se o servidor reiniciar. Para produção,
  trocar `Map()` em `server.js` por um banco (Postgres, Redis, etc).
- **Storyboard (imagens):** hoje o app não faz OCR/visão computacional nas imagens — você
  descreve o storyboard em texto ao lado das imagens. Dá pra evoluir isso usando a API de
  visão da Anthropic (Claude já lê imagem, é só mandar o `base64` junto no prompt) ou Google
  Vision.
- **"Músicas conhecidas"** são sugestões de referência (título + artista + por quê), não
  áudio embutido — usar uma música famosa de verdade no vídeo final exige licenciamento
  (sync license) à parte, isso não está automatizado aqui.
- **Suno:** ver seção acima — integração real depende da Suno abrir API, ou de decisão
  consciente de usar um wrapper terceiro.
- **Deploy:** hoje só roda local. Pra colocar no ar, dá pra usar Render/Railway/Fly.io
  (backend Node) — é rodar `npm start` com as variáveis de ambiente configuradas lá.
