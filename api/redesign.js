// /api/redesign.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { imageDataURL, mime, style, roomType, length, width, height, wishes, budget } = req.body || {};

    if (!imageDataURL) {
      return res.status(400).json({ error: 'imageDataURL is required' });
    }

    // извлекаем base64 из dataURL
    const base64 = imageDataURL.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');
    const fileType = (mime && typeof mime === 'string') ? mime : 'image/png';

    // формируем подсказку для редизайна
    const prompt =
      `Redesign this ${roomType || 'room'} in style "${style || 'Modern'}". ` +
      `Keep the layout and structure, change finishes/furniture/lighting to match the style. ` +
      (length && width && height ? `Room size: ${length}m x ${width}m x ${height}m. ` : '') +
      (budget ? `Budget tier: ${budget}. ` : '') +
      (wishes ? `Extra wishes: ${wishes}. ` : '') +
      `Output a photorealistic interior render.`

    // Используем OpenAI Images Edits как image-to-image
    // (в Node 18 на Vercel доступны глобальные FormData/Blob)
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('image', new Blob([buffer], { type: fileType }), 'input.png');
    // Можно дополнительно задать размер:
    form.append('size', '1024x1024');

    const r = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: form
    });

    if (!r.ok) {
      const txt = await r.text();
      return res.status(500).json({ error: 'OpenAI error', details: txt });
    }

    const data = await r.json();
    // ожидаем data.data[0].b64_json
    const out = data?.data?.[0]?.b64_json;
    if (!out) {
      return res.status(500).json({ error: 'No image returned from OpenAI' });
    }

    return res.status(200).json({ imageBase64: out });
  } catch (e) {
    console.error('API redesign error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
