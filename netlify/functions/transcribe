const { OpenAI } = require("openai");
const { toFile } = require("openai/uploads");
const Busboy = require("busboy");

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MIN_AUDIO_BYTES = 2000;
const OPENAI_TIMEOUT_MS = 15000;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers["content-type"] || event.headers["Content-Type"];

    if (!contentType || !contentType.includes("multipart/form-data")) {
      return reject(new Error("Expected multipart/form-data"));
    }

    const busboy = Busboy({ headers: { "content-type": contentType } });
    const chunks = [];
    let filename = "audio.webm";
    let mimeType = "audio/webm";

    busboy.on("file", (_field, stream, info) => {
      filename = info.filename || filename;
      mimeType = info.mimeType || mimeType;
      stream.on("data", (d) => chunks.push(d));
    });

    busboy.on("finish", () => {
      resolve({ filename, mimeType, buffer: Buffer.concat(chunks) });
    });

    busboy.on("error", reject);

    const body = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "");

    busboy.write(body);
    busboy.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("[transcribe] OPENAI_API_KEY is not set");
    return json(500, { error: "Missing API key" });
  }

  let file;
  try {
    file = await parseMultipart(event);
  } catch (err) {
    console.error("[transcribe] Failed to parse form data:", err.message);
    return json(400, { error: "Could not parse audio upload" });
  }

  if (!file.buffer || file.buffer.length < MIN_AUDIO_BYTES) {
    return json(400, { error: "Audio too short" });
  }

  if (file.buffer.length > MAX_AUDIO_BYTES) {
    return json(413, { error: "Audio too large" });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const audioFile = await toFile(file.buffer, file.filename || "audio.webm", {
      type: file.mimeType || "audio/webm",
    });

    const response = await openai.audio.transcriptions.create(
      {
        model: "gpt-4o-mini-transcribe",
        file: audioFile,
        language: "en",
      },
      {
        signal: controller.signal,
      }
    );

    const text = (response.text || "").trim();

    if (!text) {
      return json(422, { error: "No speech detected" });
    }

    return json(200, { text });
  } catch (err) {
    console.error("[transcribe] OpenAI error:", err.message);

    if (err.name === "AbortError") {
      return json(504, { error: "Transcription timeout" });
    }

    if (typeof err.message === "string" && /audio|speech|empty|decode/i.test(err.message)) {
      return json(422, { error: "No speech detected" });
    }

    return json(502, { error: "Transcription failed" });
  } finally {
    clearTimeout(timer);
  }
};
