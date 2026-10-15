const fs = require("fs");
const path = require("path");

const library = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "music-library.json"), "utf8")
);

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // remove acentos para matching mais tolerante
}

/**
 * Gera um link de busca no YouTube para uma referência musical (título + artista).
 * Não usamos a API do YouTube (exigiria chave própria) — um link de busca é
 * suficiente para o usuário ouvir a referência com um clique, e nunca quebra.
 */
function youtubeSearchUrl(title, artist) {
  const query = [title, artist].filter(Boolean).join(" ");
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

/**
 * Adiciona o link do YouTube em cada referência musical de uma lista de sugestões,
 * sem exigir que o motor (heurístico ou IA) saiba gerar esse link.
 */
function withYoutubeLinks(suggestions) {
  return (suggestions || []).map((s) => ({
    ...s,
    wellKnownReferences: (s.wellKnownReferences || []).map((ref) => ({
      ...ref,
      youtubeUrl: youtubeSearchUrl(ref.title, ref.artist),
    })),
  }));
}

/**
 * Motor heurístico local (funciona sem nenhuma chave de API).
 * Faz contagem de palavras-chave por mood e retorna os moods
 * mais relevantes com sugestões do catálogo.
 */
function analyzeHeuristic(scriptText) {
  const normalizedText = normalize(scriptText);
  const scored = library.moods.map((mood) => {
    let score = 0;
    const matched = [];
    for (const kw of mood.keywords) {
      const nkw = normalize(kw);
      const regex = new RegExp(nkw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      const matches = normalizedText.match(regex);
      if (matches) {
        score += matches.length;
        matched.push(kw);
      }
    }
    return { mood, score, matched };
  });

  scored.sort((a, b) => b.score - a.score);

  const totalScore = scored.reduce((sum, s) => sum + s.score, 0);
  const top = scored.filter((s) => s.score > 0).slice(0, 3);

  // fallback: se nada bateu (texto muito curto/genérico), usa moods "neutros" populares
  const chosen = top.length > 0
    ? top
    : [scored.find((s) => s.mood.id === "nostalgico"), scored.find((s) => s.mood.id === "corporativo_inspirador")].filter(Boolean);

  return {
    engine: "heuristic",
    suggestions: chosen.map((s) => ({
      moodId: s.mood.id,
      moodLabel: s.mood.label,
      confidence: totalScore > 0 ? Math.round((s.score / totalScore) * 100) : null,
      matchedKeywords: s.matched,
      genres: s.mood.genres,
      tempoBpm: s.mood.tempoBpm,
      instrumentation: s.mood.instrumentation,
      royaltyFreeSearch: s.mood.royaltyFreeSearch,
      wellKnownReferences: s.mood.wellKnownReferences,
    })),
    royaltyFreeSources: library.royaltyFreeSources,
  };
}

/**
 * Motor por IA (Claude), usado somente se ANTHROPIC_API_KEY estiver
 * configurada no .env. Envia o roteiro e pede uma análise mais fina
 * (tema, arco emocional cena a cena, e sugestões específicas),
 * além de reaproveitar o catálogo local para os links de bancos
 * royalty-free.
 */
async function analyzeWithClaude(scriptText, apiKey) {
  const moodCatalog = library.moods.map((m) => ({ id: m.id, label: m.label, genres: m.genres }));

  const prompt = `Você é um supervisor musical de cinema/publicidade. Leia o roteiro ou descrição de storyboard abaixo e sugira trilha sonora.

Roteiro/descrição:
"""
${scriptText.slice(0, 12000)}
"""

Catálogo de moods disponíveis (use os "id" quando aplicável, mas pode sugerir um mood novo se nenhum encaixar bem):
${JSON.stringify(moodCatalog)}

Responda SOMENTE em JSON válido, no formato:
{
  "overallTheme": "resumo curto do tema/tom geral do vídeo",
  "suggestions": [
    {
      "moodId": "id do catálogo ou null se for um mood novo",
      "moodLabel": "nome do clima sugerido",
      "reasoning": "por que esse clima combina com o roteiro (1-2 frases)",
      "genres": ["gênero 1", "gênero 2"],
      "tempoBpm": "faixa de bpm sugerida",
      "royaltyFreeSearch": ["termo de busca 1", "termo de busca 2"],
      "wellKnownReferences": [{"title": "...", "artist": "...", "why": "..."}]
    }
  ]
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("Resposta da IA sem conteúdo de texto.");

  let parsed;
  try {
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : textBlock.text);
  } catch (e) {
    throw new Error("Não foi possível interpretar a resposta da IA como JSON.");
  }

  return {
    engine: "claude",
    overallTheme: parsed.overallTheme,
    suggestions: parsed.suggestions || [],
    royaltyFreeSources: library.royaltyFreeSources,
  };
}

async function analyzeScript(scriptText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  let result;
  if (apiKey) {
    try {
      result = await analyzeWithClaude(scriptText, apiKey);
    } catch (err) {
      console.error("[soundtrackEngine] Falha na análise via IA, usando heurística local:", err.message);
      result = analyzeHeuristic(scriptText);
      result.aiError = err.message;
    }
  } else {
    result = analyzeHeuristic(scriptText);
  }
  result.suggestions = withYoutubeLinks(result.suggestions);
  return result;
}

module.exports = { analyzeScript, analyzeHeuristic, library };
