// /api/redesign.js
// Node.js Serverless Function for Vercel (CommonJS)

const { IncomingForm } = require("formidable");
const fs = require("fs/promises");

// В Next.js роутерах нужно отключить встроенный bodyParser для multipart.
// В обычной Vercel-функции это не обязательно, но не мешает.
module.exports.config = {
  api: { bodyParser: false },
};

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    const STABILITY_API_KEY =
      process.env.STABILITY_API_KEY || process.env.STABILITY_KEY;
    if (!STABILITY_API_KEY) {
      res.status(500).json({ ok: false, error: "missing_stability_api_key" });
      return;
    }

    // 1) Парсим multipart/form-data
    const { fields, file } = await parseMultipart(req);

    // 2) Готовим форму для Stability v1 image-to-image
    //    ВАЖНО: у v1 ключ картинки — "init_image"
    const buffer = await fs.readFile(file.filepath || file.path);

    const fd = new FormData();
    fd.append(
      "init_image",
      new Blob([buffer], { type: file.mimetype || "image/jpeg" }),
      file.originalFilename || "input.jpg"
    );

    // Настройки (можно править по вкусу)
    // image_strength: 0..1 (чем меньше — тем сильнее влияние prompt/генерации)
    fd.append("image_strength", String(fields.image_strength ?? "0.35"));

    // Текстовый запрос (если передаётся с фронта)
    if (fields.prompt) fd.append("prompt", String(fields.prompt));

    // Формат результата — сразу PNG
    fd.append("output_format", "png");

    // Доп. параметры по желанию
    if (fields.cfg_scale !== undefined)
      fd.append("cfg_scale", String(fields.cfg_scale));
    if (fields.seed !== undefined) fd.append("seed", String(fields.seed));

    // 3) Запрос в Stability API
    const endpoint =
      "https://api.stability.ai/v1/generation/stable-image-core-v1-1/image-to-image";

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STABILITY_API_KEY}`,
        // Не ставим Content-Type вручную — FormData сделает boundary сама
        Accept: "image/png",
      },
      body: fd,
    });

    if (!resp.ok) {
      const text = await resp.text();
      res
        .status(500)
        .json({ ok: false, error: "stability_request_failed", details: text });
      return;
    }

    // 4) Отдаём PNG как data URL (base64), чтобы фронт сразу показал картинку
    const arrayBuf = await resp.arrayBuffer();
    const base64 = Buffer.from(arrayBuf).toString("base64");
    res.status(200).json({ ok: true, image: `data:image/png;base64,${base64}` });
  } catch (e) {
    res
      .status(500)
      .json({ ok: false, error: "server_error", details: e?.message || String(e) });
  }
};

// ---- helpers ----

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    // Сохранять файл на диск (tmp) — стандартный путь для formidable,
    // нам это подходит: потом читаем его в буфер.
    const form = new IncomingForm({
      multiples: false,
      keepExtensions: true,
    });

    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);

      // Ищем файл в известных полях; если имя другое — берём первый
      const file =
        files.photo ||
        files.file ||
        files.image ||
        files.init_image ||
        (files && Object.values(files)[0]);

      if (!file) {
        return reject(new Error("no_file_uploaded"));
      }
      resolve({ fields, file });
    });
  });
}
