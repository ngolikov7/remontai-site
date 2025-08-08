// /api/redesign.js
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: { bodyParser: false }, // важно: сами парсим multipart
};

const STABILITY_URL = 'https://api.stability.ai/v2beta/stable-image/edit/image-to-image';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  if (!process.env.STABILITY_API_KEY) {
    return res.status(500).json({ ok: false, error: 'no_api_key' });
  }

  // 1) Парсим multipart из фронта
  const form = formidable({ multiples: false, keepExtensions: true });
  const { fields, files } = await new Promise((resolve, reject) => {
    form.parse(req, (err, flds, fls) => (err ? reject(err) : resolve({ fields: flds, files: fls })));
  });

  const file = files?.image; // имя поля ДОЛЖНО быть "image"
  if (!file) return res.status(400).json({ ok: false, error: 'no_image' });

  const prompt = (fields.prompt ?? '').toString();
  if (!prompt) return res.status(400).json({ ok: false, error: 'no_prompt' });

  const outputFormat = (fields.output_format ?? 'png').toString(); // png|jpeg|webp|gif
  const strength = fields.strength ? Number(fields.strength) : 0.35; // 0..1
  const negative = fields.negative_prompt ? fields.negative_prompt.toString() : '';

  // 2) Готовим форму для Stability
  const fd = new FormData();
  fd.append('image', new Blob([fs.readFileSync(file.filepath)], { type: file.mimetype || 'image/jpeg' }), file.originalFilename || 'image.jpg');
  fd.append('prompt', prompt);
  fd.append('output_format', outputFormat);
  fd.append('strength', String(strength));               // опционально
  if (negative) fd.append('negative_prompt', negative);  // опционально
  fd.append('model', 'stable-image-core');               // модель Stable Image Core

  // 3) Запрос к Stability: принимаем бинарный ответ (картинка)
  const resp = await fetch(STABILITY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
      Accept: 'image/*', // ОБЯЗАТЕЛЬНО: вернет изображение
    },
    body: fd,
  });

  // Если пришла ошибка — считаем как текст и пробрасываем
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return res.status(500).json({ ok: false, error: 'stability_request_failed', details: text });
  }

  // 4) Отдаем картинку фронту как data URL (base64), чтобы просто показать <img>
  const arrayBuf = await resp.arrayBuffer();
  const base64 = Buffer.from(arrayBuf).toString('base64');
  const mime = resp.headers.get('content-type') || 'image/png';

  return res.status(200).json({ ok: true, imageBase64: `data:${mime};base64,${base64}` });
}
