// /api/redesign.js
// Vercel Serverless Function (CommonJS)

const { IncomingForm } = require("formidable");
const fs = require("fs/promises");
const path = require("path");

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

    if (!file) {
      res.status(400).json({ ok: false, error: "no_file_uploaded" });
      return;
    }

    // гарантированно получаем путь
    const filePath =
      file.filepath || file.path || file.tempFilePath || file.file || null;

    if (!filePath) {
      res.status(400).json({
        ok: false,
        error: "file_without_path",
        details: "Uploaded file has no path",
      });
      return;
    }

    const buffer = await fs.readFile(filePath);

    // 2) Сборка формы для Stability v1 image-to-image
    const fd = new FormData();
    fd.append(
      "init_image",
      new Blob([buffer], { type: file.mimetype || "image/jpeg" }),
      file.originalFilename || path.basename(filePath) || "input.jpg"
    );

    fd.append("image_strength", String(fields.image_strength ?? "0.35"));
    if (fields.prompt) fd.append("prompt", String(fields.prompt));
    fd.append("output_format", "png");

    if (fields.cfg_scale !== undefined)
      fd.append("cfg_scale", String(fields.cfg_scale));
    if (fields.seed !== undefined) fd.append("seed", String(fields.seed));

    // 3) Вызов Stability
    const endpoint =
      "https://api.stability.ai/v1/generation/stable-image-core-v1-1/image-to-image";

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STABILITY_API_KEY}`,
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

    // 4) PNG -> data URL
    const arrayBuf = await resp.arrayBuffer();
    const base64 = Buffer.from(arrayBuf).toString("base64");
    res.status(200).json({ ok: true, image: `data:image/png;base64,${base64}` });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: "server_error",
      details: e?.message || String(e),
    });
  }
};

// ---- helpers ----

function firstFileOf(obj) {
  if (!obj) return null;
  if (Array.isArray(obj)) return obj[0] || null;
  return obj;
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      multiples: false,
      keepExtensions: true,
      // важное добавление — сохраняем файл в /tmp
      uploadDir: "/tmp",
      allowEmptyFiles: false,
    });

    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);

      // пытаемся найти файл под разными именами
      let file =
        firstFileOf(files.photo) ||
        firstFileOf(files.file) ||
        firstFileOf(files.image) ||
        firstFileOf(files.init_image);

      if (!file) {
        // если ничего не нашли — берём вообще первый файл из объекта
        const all = files ? Object.values(files) : [];
        if (all.length) file = firstFileOf(all[0]);
      }

      resolve({ fields, file });
    });
  });
}
