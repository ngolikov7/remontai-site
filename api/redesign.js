// api/redesign.js
import Busboy from 'busboy';
import fetch from 'node-fetch';
import FormData from 'form-data';

export const config = {
  api: {
    bodyParser: false, // важно: сами парсим multipart
  },
};

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    let prompt = '';
    let fileBuffer = Buffer.alloc(0);
    let fileName = 'room.png';
    let fileMime = 'image/png';

    busboy.on('file', (_fieldname, file, info) => {
      fileName = info.filename || fileName;
      fileMime = info.mimeType || fileMime;
      file.on('data', d => (fileBuffer = Buffer.concat([fileBuffer, d])));
    });

    busboy.on('field', (fieldname, val) => {
      if (fieldname === 'prompt') prompt = val;
    });

    busboy.on('finish', () => resolve({ prompt, fileBuffer, fileName, fileMime }));
    busboy.on('error', reject);

    req.pipe(busboy);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt, fileBuffer, fileName, fileMime } = await parseMultipart(req);
    if (!fileBuffer?.length) return res.status(400).json({ error: 'No image uploaded' });

    const fd = new FormData();
    fd.append('model', 'gpt-image-1');
    fd.append('prompt', prompt || 'Redesign this room in modern style, realistic, same layout');
    fd.append('image[]', fileBuffer, { filename: fileName, contentType: fileMime });
    fd.append('size', '1024x1024');

    const resp = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: fd,
    });

    if (!resp.ok) {
      const err = await resp.text();
      return res.status(resp.status).json({ error: err });
    }

    const data = await resp.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return res.status(500).json({ error: 'No image in response' });

    res.status(200).json({ image: `data:image/png;base64,${b64}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
}
