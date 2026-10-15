const state = {
  sessionToken: localStorage.getItem("tsfg_session") || null,
  user: JSON.parse(localStorage.getItem("tsfg_user") || "null"),
  config: null,
};

const el = (id) => document.getElementById(id);

async function loadConfig() {
  const res = await fetch("/api/config");
  state.config = await res.json();
}

function setSession(sessionToken, user) {
  state.sessionToken = sessionToken;
  state.user = user;
  localStorage.setItem("tsfg_session", sessionToken);
  localStorage.setItem("tsfg_user", JSON.stringify(user));
  renderAuthState();
}

function clearSession() {
  state.sessionToken = null;
  state.user = null;
  localStorage.removeItem("tsfg_session");
  localStorage.removeItem("tsfg_user");
  renderAuthState();
}

function renderAuthState() {
  const logged = Boolean(state.sessionToken && state.user);
  el("loginScreen").classList.toggle("hidden", logged);
  el("appScreen").classList.toggle("hidden", !logged);
  el("userBox").classList.toggle("hidden", !logged);
  if (logged) {
    el("userName").textContent = state.user.name || "Você";
    if (state.user.picture) {
      el("userPic").src = state.user.picture;
      el("userPic").classList.remove("hidden");
    } else {
      el("userPic").classList.add("hidden");
    }
  }
}

async function authFetch(url, options = {}) {
  const headers = Object.assign({}, options.headers, {
    Authorization: `Bearer ${state.sessionToken}`,
  });
  const res = await fetch(url, Object.assign({}, options, { headers }));
  if (res.status === 401) {
    clearSession();
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  return res;
}

// --- LOGIN GOOGLE ---
function initGoogleSignIn() {
  if (!state.config.googleClientId) {
    el("googleDisabledMsg").classList.remove("hidden");
    return;
  }
  if (!window.google || !window.google.accounts) {
    // biblioteca do Google ainda não carregou; tenta de novo em breve
    setTimeout(initGoogleSignIn, 300);
    return;
  }
  window.google.accounts.id.initialize({
    client_id: state.config.googleClientId,
    callback: onGoogleCredential,
  });
  window.google.accounts.id.renderButton(el("googleBtnContainer"), {
    theme: "filled_black",
    size: "large",
    shape: "pill",
    text: "continue_with",
  });
}

async function onGoogleCredential(response) {
  try {
    const res = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: response.credential }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Falha no login");
    setSession(data.sessionToken, data.user);
  } catch (err) {
    alert("Erro no login com Google: " + err.message);
  }
}

// --- LOGIN CONVIDADO ---
el("guestForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = el("guestName").value.trim();
  const res = await fetch("/api/auth/guest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  setSession(data.sessionToken, data.user);
});

el("logoutBtn").addEventListener("click", async () => {
  try {
    await authFetch("/api/auth/logout", { method: "POST" });
  } catch (e) {}
  clearSession();
});

// --- ANÁLISE DO ROTEIRO ---
el("analyzeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  el("analyzeError").classList.add("hidden");
  el("resultsCard").classList.add("hidden");

  const formData = new FormData();
  formData.append("scriptText", el("scriptText").value);
  formData.append("storyboardCaption", el("storyboardCaption").value);

  const fileInput = el("scriptFile");
  if (fileInput.files[0]) formData.append("scriptFile", fileInput.files[0]);

  const imgInput = el("storyboardImages");
  for (const f of imgInput.files) formData.append("storyboardImages", f);

  const btn = el("analyzeBtn");
  btn.disabled = true;
  btn.textContent = "Analisando...";

  try {
    const res = await authFetch("/api/analyze", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao analisar");
    renderResults(data);
  } catch (err) {
    el("analyzeError").textContent = err.message;
    el("analyzeError").classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Analisar e sugerir trilhas";
  }
});

function renderResults(data) {
  el("resultsCard").classList.remove("hidden");

  const engineLabel = data.engine === "claude"
    ? "Análise feita por IA (Claude)."
    : "Análise por motor heurístico local (defina ANTHROPIC_API_KEY no servidor para análise por IA).";
  el("engineNote").textContent = engineLabel + (data.aiError ? ` [aviso: ${data.aiError}]` : "");

  if (data.overallTheme) {
    el("overallTheme").textContent = "Tema geral identificado: " + data.overallTheme;
    el("overallTheme").classList.remove("hidden");
  } else {
    el("overallTheme").classList.add("hidden");
  }

  const list = el("suggestionsList");
  list.innerHTML = "";
  (data.suggestions || []).forEach((s) => {
    const div = document.createElement("div");
    div.className = "suggestion";
    const refs = (s.wellKnownReferences || [])
      .map((r) => {
        const link = r.youtubeUrl
          ? ` <a class="yt-link" href="${escapeHtml(r.youtubeUrl)}" target="_blank" rel="noopener">▶ ouvir no YouTube</a>`
          : "";
        return `<li><b>${escapeHtml(r.title)}</b> — ${escapeHtml(r.artist)}${link}<br><span style="color:var(--text-dim)">${escapeHtml(r.why || "")}</span></li>`;
      })
      .join("");
    const searchTags = (s.royaltyFreeSearch || []).map((t) => `<span class="tag">🔎 ${escapeHtml(t)}</span>`).join("");
    const genreTags = (s.genres || []).map((g) => `<span class="tag">${escapeHtml(g)}</span>`).join("");

    div.innerHTML = `
      <div class="suggestion-head">
        <h4>${escapeHtml(s.moodLabel || "Sugestão")}</h4>
        ${s.confidence != null ? `<span class="confidence">${s.confidence}% match</span>` : ""}
      </div>
      ${s.reasoning ? `<p class="hint">${escapeHtml(s.reasoning)}</p>` : ""}
      ${s.tempoBpm ? `<p class="hint">Tempo sugerido: ${escapeHtml(s.tempoBpm)} bpm</p>` : ""}
      <div class="tag-row">${genreTags}${searchTags}</div>
      ${refs ? `<h3 style="margin-top:12px;">Referências conhecidas</h3><ul class="ref-list">${refs}</ul>` : ""}
    `;
    list.appendChild(div);

    // pré-preenche o campo de prompt do Suno com a primeira sugestão
    if (!el("sunoPrompt").value && s.genres && s.genres.length) {
      el("sunoPrompt").value = `${s.moodLabel}, estilo ${s.genres.join(", ")}${s.tempoBpm ? ", " + s.tempoBpm + " bpm" : ""}`;
    }
  });

  const sourcesList = el("sourcesList");
  sourcesList.innerHTML = "";
  (data.royaltyFreeSources || []).forEach((src) => {
    const a = document.createElement("a");
    a.href = src.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = `${src.name} ↗`;
    a.title = src.license || "";
    sourcesList.appendChild(a);
  });
}

// --- SUNO (mock/plugável) ---
el("sunoForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = el("sunoPrompt").value.trim();
  if (!prompt) return;
  const resultBox = el("sunoResult");
  resultBox.classList.remove("hidden");
  resultBox.textContent = "Gerando (simulado)...";
  try {
    const res = await authFetch("/api/suno/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt,
        userSunoToken: el("sunoToken").value.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro na geração");
    resultBox.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    resultBox.textContent = "Erro: " + err.message;
  }
});

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// --- boot ---
(async function init() {
  await loadConfig();
  renderAuthState();
  initGoogleSignIn();
})();
