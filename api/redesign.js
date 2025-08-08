// pages/api/redesign.js
import formidable from 'formidable';
import * as fs from 'fs/promises';

export const config = {
  api: {
    bodyParser: false, // обязательно: мы сами парсим multipart
  },
};

// ===== НАСТРОЙКИ =====
const STABILITY_API_KEY = process.env.STABILITY_API_KEY;
// Модель SDXL (image-to-image)
const ENGINE_ID = 'stable-diffusion-xl-1024-v1-0';
const STABILITY_URL = `https://api.stability.ai/v1/generation/${ENGINE_ID}/image-to-image`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  if (!STABILITY_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: 'no_api_key',
      details: 'В переменных окружения не задан STABILITY_API_KEY',
    });
  }

  try {
    // 1) Разбираем multipart-форму
    const form = formidable({ multiples: false, keepExtensions: true });
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, flds, fls) => (err ? reject(err) : resolve({ fields: flds, files: fls })));
    });

    // 2) Достаём файл (ожидаем поле name="image")
    const fileAny = files.image || files.file || files.photo || files.upload;
    const fileObj = Array.isArray(fileAny) ? fileAny[0] : fileAny;

    if (!fileObj) {
      return res.status(400).json({
        ok: false,
        error: 'no_file',
        details: { filesKeys: Object.keys(files) },
      });
    }

    // В formidable v3 путь хранится в "filepath" (в старых версиях был "path")
    const filePath = fileObj.filepath || fileObj.path;
    if (!filePath) {
      return res.status(400).json({
        ok: false,
        error: 'no_filepath',
        details: fileObj,
      });
    }

    // 3) Читаем буфер и кодируем в base64
    const buffer = await fs.readFile(filePath);
    const initImageBase64 = buffer.toString('base64');

    // 4) Собираем prompt (можно прокидывать с фронта в поле "prompt")
    const userPrompt = (fields.prompt && String(fields.prompt)) || 'Interior redesign, modern cozy style, photorealistic, high quality';

    // 5) Запрос в Stability v1 image-to-image
    const payload = {
      init_image: initImageBase64,
      // сила воздействия промпта над исходником (0..1). 0.35—0.6 обычно нормально
      image_strength: 0.45,
      text_prompts: [{ text: userPrompt, weight: 1 }],
      cfg_scale: 7,  // «насколько слушаемся» промпт (1..35). 7–12 ок
      steps: 30,     // шаги диффузии (10..150)
      samples: 1,    // кол-во картинок
    };

    const resp = await fetch(STABILITY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STABILITY_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return res.status(502).json({
        ok: false,
        error: 'stability_request_failed',
        status: resp.status,
        details: text,
      });
    }

    const data = await resp.json();
    // Ответ v1: { artifacts: [ { base64, finishReason, seed, ... } ] }
    const artifact = data?.artifacts?.[0];
    if (!artifact?.base64) {
      return res.status(500).json({
        ok: false,
        error: 'no_artifact',
        details: data,
      });
    }

    const outDataUrl = `data:image/png;base64,${artifact.base64}`;

    // 6) Возвращаем JSON (фронт просто ставит картинку src=dataUrl)
    return res.status(200).json({ ok: true, image: outDataUrl });
  } catch (err) {
    console.error('redesign error:', err);
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      details: String(err?.message || err),
    });
  }
}
