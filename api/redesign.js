// api/redesign.js
import OpenAI from "openai";
import formidable from "formidable";
import fs from "fs";

// Отключаем стандартный bodyParser, чтобы работать с FormData
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const form = formidable({ multiples: false });

  try {
    // Парсим загруженный файл и prompt
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const prompt = fields.prompt || "Сделай редизайн комнаты в современном стиле";
    const imageFile = files.image?.[0] || files.image; // Vercel/Node разные версии formidable
    if (!imageFile) {
      return res.status(400).json({ error: "Файл изображения не получен" });
    }

    const imageData = fs.readFileSync(imageFile.filepath);

    // Запрос к OpenAI для генерации картинки
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      image: [
        {
          name: "input_image",
          buffer: imageData,
        },
      ],
    });

    // Проверяем ответ
    if (!response.data || !response.data[0]?.b64_json) {
      return res.status(500).json({ error: "OpenAI не вернул картинку" });
    }

    const imageBase64 = response.data[0].b64_json;

    res.status(200).json({ image_base64: imageBase64 });
  } catch (err) {
    console.error("Ошибка в redesign.js:", err);
    res.status(500).json({ error: err.message || "Ошибка на сервере" });
  }
}
