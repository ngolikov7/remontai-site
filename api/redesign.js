// /api/redesign.js — Stability img2img (SDXL)
const fs = require("fs");
const formidable = require("formidable");

// для multipart
module.exports.config = { api: { bodyParser: false } };

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const API_KEY = process.env.STABILITY_API_KEY;
  if (!API_KEY) {
    res.status(500).json({ error: "missing_env", message: "STABILITY_API_KEY not set" });
    return;
  }

  try {
    const form = formidable({ multiples: false, maxFileSize: 20 * 1024 * 1024 });
    form.parse(req, async (err, fields, files) => {
      if (err) {
        res.status(400).json({ error: "parse_error", details: String(err) });
        return;
      }

      // поддержим несколько возможных имён
      const file = files.file || files.image || files.init_image;
      if (!file) {
        res.status(400).json({ error: "no_file", message: "Нет файла init image" });
        return;
      }

      const engine = (fields.engine || "stable-diffusion-xl-1024-v1-0").toString();
      const prompt = (fields.prompt || "interior design, photorealistic, high quality").toString();
      const strength = fields.strength ? Number(fields.strength) : 0.65;
      const steps = fields.steps ? Number(fields.steps) : 30;

      const filePath = file.filepath || file.path;
      const mime = file.mimetype || "image/png";
      const filename = file.originalFilename || "init.png";
      const buffer = await fs.promises.readFile(filePath);

      const formData = new FormData();
      formData.append("init_image", new Blob([buffer], { type: mime }), filename);
      formData.append("init_image_mode", "IMAGE_STRENGTH");
      formData.append("image_strength", String(strength));
      formData.append("samples", "1");
      formData.append("steps", String(steps));
      formData.append("cfg_scale", "7");
      formData.append("text_prompts[0][text]", prompt);
      formData.append("text_prompts[0][weight]", "1");

      const url = `https://api.stability.ai/v1/generation/${engine}/image-to-image`;

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "image/png",
        },
        body: formData,
      });

      if (!resp.ok) {
        const text = await resp.text();
        res.status(resp.status).json({ error: "stability_error", details: text });
        return;
      }

      const arr = await resp.arrayBuffer();
      res.setHeader("Content-Type", "image/png");
      res.send(Buffer.from(arr));
    });
  } catch (e) {
    res.status(500).json({ error: "server_error", details: String(e) });
  }
};
