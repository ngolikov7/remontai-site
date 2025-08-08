// /api/redesign.js  (CommonJS для Vercel Node.js functions)
const OpenAI = require("openai");
const formidable = require("formidable");
const fs = require("fs");

// Отключаем стандартный bodyParser, чтобы принять multipart/form-data
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const form = formidable({ multiples: false });

  try {
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const prompt =
      (Array.isArray(fields.prompt) ? fields.prompt[0] : fields.prompt) ||
      "Сделай редизайн комнаты в современном стиле";

    // В разных версиях formidable структура отличается
    const imgField =
      (files.image && (Array.isArray(files.image) ? files.image[0] : files.image)) ||
      null;

    if (!imgField || !imgField.filepath) {
      res.status(400).json({ error: "Не получен файл изображения (image)" });
      return;
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    if (!process.env.OPENAI_API_KEY) {
      res.status(500).json({ error: "OPENAI_API_KEY не задан в Vercel env" });
      return;
    }

    // Для edits нужно передать поток/файл
    const imageStream = fs.createReadStream(imgField.filepath);

    // Попытка image-to-image через edits
    // Если edits недоступно, ниже есть запасной вариант generate
    let outB64 = null;
    try {
      const resp = await openai.images.edits({
        model: "gpt-image-1",
        prompt,
        image: imageStream,
        size: "1024x1024",
      });
      outB64 = resp?.data?.[0]?.b64_json || null;
    } catch (e) {
      console.error("images.edits failed, fallback to generate:", e?.message);
    }

    // Fallback: если edits не сработал — просто сгенерируем по промпту
    if (!outB64) {
      const resp = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
      });
      outB64 = resp?.data?.[0]?.b64_json || null;
    }

    if (!outB64) {
      res.status(502).json({ error: "OpenAI не вернул изображение" });
      return;
    }

    res.status(200).json({ image_base64: outB64 });
  } catch (err) {
    console.error("Server error in /api/redesign:", err);
    res.status(500).json({
      error: "FUNCTION_INVOCATION_FAILED",
      detail: err?.message || String(err),
    });
  }
};
