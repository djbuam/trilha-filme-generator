/**
 * Camada de integração com o Suno.ai.
 *
 * IMPORTANTE (checado em setembro/2026): a Suno não oferece uma API
 * pública oficial para desenvolvedores terceiros — só existe geração
 * via app/site da Suno, ou parcerias empresariais fechadas. O que
 * existe no mercado são "wrappers" não-oficiais de terceiros
 * (ex.: sunoapi.org, aimusicapi.ai) que automatizam a conta do
 * usuário — o que tem risco de violar os Termos de Uso da Suno e
 * pode parar de funcionar sem aviso.
 *
 * Por isso, este módulo é um ADAPTER plugável: hoje ele roda em modo
 * "mock" (simula uma geração, para você validar o fluxo de produto),
 * mas a interface (generateTrack) já é a que você vai chamar de
 * verdade assim que:
 *   a) a Suno lançar uma API oficial para parceiros, ou
 *   b) vocês decidirem usar um wrapper terceiro por conta e risco.
 *
 * Para trocar de provedor no futuro, basta implementar essa mesma
 * assinatura de função em um novo arquivo (ex: sunoProviderReal.js)
 * e apontar SUNO_PROVIDER=real no .env.
 */

async function generateTrackMock({ prompt, moodLabel, userSunoToken }) {
  // Simula latência de geração de uma faixa
  await new Promise((r) => setTimeout(r, 800));

  return {
    provider: "mock",
    status: "simulated",
    message:
      "Integração real com a Suno ainda não está disponível (a Suno não tem API pública em 2026). " +
      "Isto é uma simulação para você validar o fluxo do produto.",
    requestedPrompt: prompt,
    moodLabel,
    hasUserToken: Boolean(userSunoToken),
    // Quando a integração real existir, aqui viria: audioUrl, trackId, duration, etc.
  };
}

async function generateTrack(params) {
  const provider = process.env.SUNO_PROVIDER || "mock";
  if (provider === "mock") {
    return generateTrackMock(params);
  }
  throw new Error(
    `Provedor Suno "${provider}" não implementado. Implemente src/sunoProvider${provider}.js e ajuste este arquivo.`
  );
}

module.exports = { generateTrack };
