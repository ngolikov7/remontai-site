// api/redesign.js
// Vercel serverless function (Node 18+)
// Принимает multipart/form-data от фронта: image (файл), а также опционально
// image_strength, cfg_scale, seed, steps, style_preset.
// Проксирует в Stability image-to-image (stable-image-core-v1.1) и возвращает PNG.

export const config = {
  api: {
    bodyParser: false, // важнo: мы сами читаем form-data через Busboy-like API FormData
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    // Получаем form-data из входящего запроса
    // Для Node на Vercel удобно прочитать сырое тело и собрать FormData вручную,
    // но современный runtime позволяет использовать web FormData из Request.
    // Оборачиваем req в Request, чтобы получить formData().
    const url = `http://localhost${req.url || "/api/redesign"}`;
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: req,
      duplex: "half",
    });

    const incoming = await request.formData();

    const imageFile = incoming.get("image");
    if (!imageFile || typeof imageFile === "string") {
      return res.status(400).json({ ok: false, error: "no_image_file" });
    }

    // Доп. поля
    const fields = {
      image_strength: incoming.get("image_strength"),
      cfg_scale: incoming.get("cfg_scale"),
      seed: incoming.get("seed"),
      steps: incoming.get("steps"),
      style_preset: incoming.get("style_preset"),
    };

    // Собираем form-data для Stability
    const fd = new FormData();

    // Обязательно передаём файл: имя возьмём из входящего, тип — из blob.type
    const fileName =
      (imageFile.name && String(imageFile.name)) || "upload.jpg";
    fd.append("image", imageFile, fileName);

    // Разрешённые поля (prompt и output_format — НЕ отправляем!)
    if (fields.image_strength !== null && fields.image_strength !== undefined) {
      fd.append("image_strength", String(fields.image_strength));
    }
    if (fields.cfg_scale !== null && fields.cfg_scale !== undefined) {
      fd.append("cfg_scale", String(fields.cfg_scale));
    }
    if (fields.seed !== null && fields.seed !== undefined) {
      fd.append("seed", String(fields.seed));
    }
    if (fields.steps !== null && fields.steps !== undefined) {
      fd.append("steps", String(fields.steps));
    }
    if (fields.style_preset) {
      fd.append("style_preset", String(fields.style_preset));
    }

    // Запрос к Stability
    const stabilityUrl =
      "https://api.stability.ai/v2beta/stable-image/edit/image-to-image?model=stable-image-core-v1.1";

    const resp = await fetch(stabilityUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
        Accept: "image/png", // формат ответа задаём заголовком
      },
      body: fd,
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.error("Stability error:", resp.status, txt);
      return res
        .status(500)
        .json({ ok: false, error: "stability_request_failed", details: txt });
    }

    // Ответ — бинарный PNG
    const arrayBuf = await resp.arrayBuffer();
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(Buffer.from(arrayBuf));
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ ok: false, error: "server_error", details: String(err) });
  }
}
