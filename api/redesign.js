// /api/redesign.js
import { promises as fs } from "fs";
import { formidable } from "formidable";

// В Next/Vercel-функции нужно отключить стандартный bodyParser,
// иначе multipart (FormData) не дойдёт до formidable.
export const config = {
  api: { bodyParser: false },
};

const STABILITY_ENDPOINT =
  "https://api.stability.ai/v1/generation/stable-image-core-v1-1/image-to-image";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }

  try {
    // 1) Парсим multipart из FormData
    const form = formidable({
      multiples: false,
      maxFileSize: 20 * 1024 * 1024, // 20MB
      uploadDir: "/tmp",             // безопасная директория на Vercel
      keepExtensions: true,
    });

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ fields, files });
      });
    });

    // 2) Достаём файл
    let file =
      files?.photo ||
      files?.image ||
      (files && Object.values(files)[0]); // подстраховка по любому ключу

    if (Array.isArray(file)) file = file[0];
    if (!file) {
      res.status(400).json({ ok: false, error: "No image uploaded" });
      return;
    }

    const filepath = file.filepath || file.path;
    const buffer = await fs.readFile(filepath);

    // 3) Собираем FormData для Stability (Node 18+/22 имеет встроенный FormData/Blob)
    const formData = new FormData();
    formData.append(
      "image",
      new Blob([buffer], { type: file.mimetype || "image/jpeg" }),
      file.originalFilename || "input.jpg"
    );

    // Полезно передать ваш текстовый промпт (поле "prompt" вы шлёте с фронта)
    formData.append("prompt", fields.prompt || "interior design, photorealistic");
    // Можно регулировать силу воздействия изображения (0–1)
    formData.append("image_strength", fields.image_strength || "0.35");

    // 4) Вызываем Stability
    const resp = await fetch(STABILITY_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
        Accept: "image/png", // чтобы пришла картинка
      },
      body: formData,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return res.status(500).json({
        ok: false,
        error: "stability_request_failed",
        details: errText.slice(0, 1000),
      });
    }

    const arrayBuf = await resp.arrayBuffer();
    const base64 = Buffer.from(arrayBuf).toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;

    // 5) Возвращаем dataURL (фронт его кладёт в <img>)
    res.status(200).json({ ok: true, image: dataUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "server_error", details: String(err) });
  }
}
