require("dotenv").config();

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");

const { extractTextFromFile } = require("./src/textExtractor");
const { analyzeScript } = require("./src/soundtrackEngine");
const { generateTrack } = require("./src/sunoProvider");
const { verifyGoogleIdToken } = require("./src/googleAuth");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- armazenamento em memória (MVP — trocar por banco de dados real depois) ---
const sessions = new Map(); // sessionToken -> user

const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
});

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const user = token && sessions.get(token);
  if (!user) {
    return res.status(401).json({ error: "Não autenticado. Faça login para continuar." });
  }
  req.user = user;
  next();
}

// --- config pública para o front-end (id do client do Google, se houver) ---
app.get("/api/config", (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY),
  });
});

// --- autenticação ---
app.post("/api/auth/google", async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: "idToken ausente." });
    const profile = await verifyGoogleIdToken(idToken);
    const sessionToken = nanoid(32);
    const user = { id: profile.sub, name: profile.name, email: profile.email, picture: profile.picture, mode: "google" };
    sessions.set(sessionToken, user);
    res.json({ sessionToken, user });
  } catch (err) {
    console.error("[auth/google]", err.message);
    res.status(401).json({ error: "Falha ao validar login do Google: " + err.message });
  }
});

app.post("/api/auth/guest", (req, res) => {
  const sessionToken = nanoid(32);
  const name = (req.body && req.body.name) || "Convidado";
  const user = { id: "guest-" + nanoid(8), name, email: null, picture: null, mode: "guest" };
  sessions.set(sessionToken, user);
  res.json({ sessionToken, user });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.slice(7);
  sessions.delete(token);
  res.json({ ok: true });
});

// --- upload + análise do roteiro/storyboard ---
app.post(
  "/api/analyze",
  requireAuth,
  upload.fields([
    { name: "scriptFile", maxCount: 1 },
    { name: "storyboardImages", maxCount: 8 },
  ]),
  async (req, res) => {
    const filesToClean = [];
    try {
      const pastedText = (req.body.scriptText || "").trim();
      const caption = (req.body.storyboardCaption || "").trim();

      let extractedText = "";
      const scriptFile = req.files?.scriptFile?.[0];
      if (scriptFile) {
        filesToClean.push(scriptFile.path);
        extractedText = await extractTextFromFile(scriptFile.path, scriptFile.originalname);
      }

      const storyboardImages = req.files?.storyboardImages || [];
      storyboardImages.forEach((f) => filesToClean.push(f.path));

      const combinedText = [pastedText, extractedText, caption].filter(Boolean).join("\n\n");

      if (!combinedText || combinedText.trim().length < 10) {
        return res.status(400).json({
          error:
            "Não recebi texto suficiente para analisar. Cole o roteiro, envie um arquivo (.txt/.pdf/.docx) ou descreva o storyboard.",
        });
      }

      const result = await analyzeScript(combinedText);
      result.inputSummary = {
        charactersAnalyzed: combinedText.length,
        usedPastedText: Boolean(pastedText),
        usedFile: Boolean(scriptFile),
        usedStoryboardImages: storyboardImages.length,
        usedCaption: Boolean(caption),
      };
      res.json(result);
    } catch (err) {
      console.error("[analyze]", err);
      res.status(500).json({ error: "Erro ao analisar o roteiro: " + err.message });
    } finally {
      for (const f of filesToClean) {
        fs.unlink(f, () => {});
      }
    }
  }
);

// --- integração (mock/plugável) com Suno.ai ---
app.post("/api/suno/generate", requireAuth, async (req, res) => {
  try {
    const { prompt, moodLabel, userSunoToken } = req.body;
    if (!prompt) return res.status(400).json({ error: "prompt é obrigatório." });
    const result = await generateTrack({ prompt, moodLabel, userSunoToken });
    res.json(result);
  } catch (err) {
    console.error("[suno/generate]", err);
    res.status(500).json({ error: "Erro na geração via Suno: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Trilha Sonora Film Generator rodando em http://localhost:${PORT}`);
  if (!process.env.GOOGLE_CLIENT_ID) {
    console.log("  (GOOGLE_CLIENT_ID não configurado — login Google desabilitado, use 'Continuar como convidado')");
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("  (ANTHROPIC_API_KEY não configurada — usando motor heurístico local em vez de IA)");
  }
});
