// api/redesign.js
// Vercel Serverless Function (Node 18+)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }

  try {
    // Мы шлём JSON с base64-данными картинки
    const { imageBase64, prompt } = req.body || {};
    if (!imageBase64) {
      res.status(400).json({ error: 'imageBase64 is required' });
      return;
    }

    // Парсим data URL
    const m = imageBase64.match(/^data:(.+);base64,(.*)$/);
    if (!m) {
      res.status(400).json({ error: 'Invalid data URL' });
      return;
    }
    const mime = m[1];
    const buf = Buffer.from(m[2], 'base64');

    // Готовим multipart form для OpenAI Images Edit (image-to-image)
    // модель: gpt-image-1 (преемник DALL·E 3; поддерживает image[]).
    // Документация по Images API: platform.openai.com (см. цитату). :contentReference[oaicite:0]{index=0}
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('image[]', new Blob([buf], { type: mime }), 'input.png');
    form.append(
      'prompt',
      prompt ||
        'Redesign this room interior: fresh renovation, realistic photo render, keep layout, improve finishes and lighting.'
    );
    form.append('size', '1024x1024'); // можно 1024x1024 / 1024x1536 / 1536x1024

    const resp = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: form,
    });

    if (!resp.ok) {
      const text = await resp.text();
      res.status(resp.status).json({ error: 'OpenAI error', details: text });
      return;
    }

    const data = await resp.json();
    // Ответ содержит base64 картинки в data[0].b64_json
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      res.status(500).json({ error: 'No image returned' });
      return;
    }

    res.status(200).json({ imageBase64: `data:image/png;base64,${b64}` });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Server error' });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb', // чтобы влезали фото с телефона
    },
  },
};
