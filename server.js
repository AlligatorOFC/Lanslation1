const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const SUPPORT_EMAIL = "lanslation.support.com@gmail.com";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 12_000) {
        reject(new Error("Mensagem muito grande."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function localPauloAnswer(message) {
  const q = String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (q.includes("pagina") || q.includes("inicio") || q.includes("sobre") || q.includes("tradu")) {
    return "O Lanslation tem três páginas: Início, Sobre Nós e Traduções. A página Traduções é onde você usa a IA de tradução.";
  }
  if (q.includes("idioma") || q.includes("lingua") || q.includes("ingles") || q.includes("espanhol") || q.includes("portugues")) {
    return "O site pode aparecer em 5 idiomas: Português BR, Português PT, Espanhol, Inglês UK e Inglês US. Isso é diferente das mais de 50 línguas usadas para traduzir textos.";
  }
  if (q.includes("paulo") || q.includes("assistente") || q.includes("ia")) {
    return "Eu sou Paulo, o assistente do site. Respondo apenas sobre o Lanslation. A IA de tradução fica na página Traduções.";
  }
  if (q.includes("email") || q.includes("suporte") || q.includes("contato")) {
    return `Para suporte, envie um e-mail para ${SUPPORT_EMAIL}.`;
  }
  if (q.includes("tempo") || q.includes("demora") || q.includes("segundo")) {
    return "No conceito original, a IA de tradução demora entre 10 e 30 segundos para pesquisar termos e montar a melhor tradução.";
  }

  return `Só posso responder sobre o Lanslation. Se sua dúvida for diferente ou eu não souber responder, envie um e-mail para ${SUPPORT_EMAIL}.`;
}

async function askGroq(message) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return localPauloAnswer(message);
  }

  const systemPrompt = `
Você é Paulo, assistente oficial do site Lanslation.
Responda sempre em português brasileiro.
Você só pode responder sobre:
- páginas do site: Início, Sobre Nós e Traduções;
- idiomas dos textos do site: Português BR, Português PT, Espanhol, Inglês UK e Inglês US;
- idiomas de tradução: mais de 50 línguas, incluindo Latim;
- funcionamento da IA de tradução;
- diferença entre Paulo e a IA de tradução;
- suporte por e-mail: ${SUPPORT_EMAIL}.

Se a pergunta fugir do assunto do Lanslation, responda exatamente:
"Eu só posso responder sobre o Lanslation. Para outras dúvidas, envie um e-mail para ${SUPPORT_EMAIL}."

Não invente recursos que o site não tem.
`.trim();

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: String(message || "").slice(0, 1200) }
      ],
      temperature: 0.2,
      max_tokens: 220
    })
  });

  if (!response.ok) {
    throw new Error(`Groq HTTP ${response.status}`);
  }

  const data = await response.json();
  const answer = data?.choices?.[0]?.message?.content?.trim();
  return answer || localPauloAnswer(message);
}

async function handlePaulo(req, res) {
  try {
    const raw = await readBody(req);
    const data = JSON.parse(raw || "{}");
    const message = String(data.message || "").trim();

    if (!message) {
      return sendJson(res, 400, { error: "Mensagem vazia." });
    }

    const answer = await askGroq(message);
    return sendJson(res, 200, { answer });
  } catch (error) {
    return sendJson(res, 200, {
      answer: localPauloAnswer(""),
      fallback: true
    });
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const requested = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.normalize(path.join(ROOT, requested));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream"
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/paulo") {
    return handlePaulo(req, res);
  }
  if (req.method === "GET" || req.method === "HEAD") {
    return serveStatic(req, res);
  }
  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Lanslation server running on port ${PORT}`);
});
