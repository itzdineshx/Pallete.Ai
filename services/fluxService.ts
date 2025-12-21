import { StyleAnalysisResponse } from "../types";

// Default to a widely available open text-to-image model on HF Inference.
const DEFAULT_FLUX_MODEL_ID = "runwayml/stable-diffusion-v1-5";
const getFluxModelId = (): string => {
  const model = (import.meta as any).env?.VITE_HF_FLUX_MODEL as string | undefined;
  return model || DEFAULT_FLUX_MODEL_ID;
};

const HF_ENDPOINT = `/api/hf/models/${getFluxModelId()}`;

const HF_VLM_MODEL_ID = "Qwen/Qwen2.5-VL-7B-Instruct";
const HF_CHAT_COMPLETIONS_ENDPOINT = "/api/hf/chat/completions";
const HF_DEFAULT_EMBED_MODEL_ID = "openai/clip-vit-base-patch32";

const getVlmModelId = (): string => {
  const model = (import.meta as any).env?.VITE_HF_VLM_MODEL as string | undefined;
  return model || HF_VLM_MODEL_ID;
};

const getEmbedModelId = (): string => {
  const model = (import.meta as any).env?.VITE_HF_EMBED_MODEL as string | undefined;
  return model || HF_DEFAULT_EMBED_MODEL_ID;
};

const aspectToSize = (
  aspectRatio: "1:1" | "3:4" | "4:3" | "16:9",
  resolution: "1K" | "2K" | "4K"
): { width: number; height: number } => {
  // HF Inference may ignore width/height depending on the backend.
  // Keep sizes conservative to avoid 413/timeouts on shared endpoints.
  const base = resolution === "1K" ? 1024 : resolution === "2K" ? 1536 : 1536;
  switch (aspectRatio) {
    case "1:1":
      return { width: base, height: base };
    case "3:4":
      return { width: Math.round((base * 3) / 4), height: base };
    case "4:3":
      return { width: base, height: Math.round((base * 3) / 4) };
    case "16:9":
      return { width: base, height: Math.round((base * 9) / 16) };
  }
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;

const loadImageFromFile = async (file: File): Promise<HTMLImageElement> => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
};

const safeJsonParse = (text: string): any => {
  try {
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        return {};
      }
    }
    return {};
  }
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to create collage blob"));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
};

const createReferenceCollage = async (
  files: File[],
  opts?: { cellSize?: number; maxImages?: number }
): Promise<{ dataUrl: string; blob: Blob }> => {
  const cellSize = opts?.cellSize ?? 320;
  const maxImages = opts?.maxImages ?? 5;
  const selected = files.slice(0, maxImages);

  const imgs = await Promise.all(selected.map(loadImageFromFile));
  const n = imgs.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);

  const canvas = document.createElement("canvas");
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get canvas context");

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const drawCover = (img: HTMLImageElement, dx: number, dy: number, dw: number, dh: number) => {
    const sw = img.width;
    const sh = img.height;
    const sAspect = sw / sh;
    const dAspect = dw / dh;
    let sx = 0;
    let sy = 0;
    let ssw = sw;
    let ssh = sh;
    if (sAspect > dAspect) {
      // Crop left/right
      ssw = Math.round(sh * dAspect);
      sx = Math.round((sw - ssw) / 2);
    } else {
      // Crop top/bottom
      ssh = Math.round(sw / dAspect);
      sy = Math.round((sh - ssh) / 2);
    }
    ctx.drawImage(img, sx, sy, ssw, ssh, dx, dy, dw, dh);
  };

  imgs.forEach((img, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellSize;
    const y = row * cellSize;
    drawCover(img, x, y, cellSize, cellSize);
  });

  const dataUrl = canvas.toDataURL("image/png");
  const blob = await canvasToBlob(canvas, "image/png");
  return { dataUrl, blob };
};

const normalizeHex = (hex: string): string | null => {
  if (typeof hex !== "string") return null;
  const h = hex.trim().replace(/^0x/i, "").replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return `#${h.toLowerCase()}`;
};

const extractStyleWithVlm = async (imageDataUrl: string): Promise<Partial<StyleAnalysisResponse>> => {
  const model = getVlmModelId();
  const prompt =
    `Analyze the reference collage image and extract a concise style profile. ` +
    `Return ONLY a single valid JSON object with keys: ` +
    `artisticStyle (string), visualTechnique (string), colorPalette (array of 5 hex strings), ` +
    `moodKeywords (array of 3-5 strings), suggestedName (string), reasoning (string). ` +
    `No markdown, no extra text.`;

  const payload = {
    model,
    stream: false,
    max_tokens: 450,
    temperature: 0.3,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
  };

  const res = await fetch(HF_CHAT_COMPLETIONS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HF VLM error (${res.status}): ${text || res.statusText}`);
  }

  const data = (await res.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("HF VLM returned no content");
  }

  const parsed = safeJsonParse(content);

  const colorPalette = Array.isArray(parsed?.colorPalette)
    ? parsed.colorPalette.map(normalizeHex).filter(Boolean)
    : undefined;

  const moodKeywords = Array.isArray(parsed?.moodKeywords)
    ? parsed.moodKeywords.filter((x: any) => typeof x === "string").slice(0, 6)
    : undefined;

  return {
    artisticStyle: typeof parsed?.artisticStyle === "string" ? parsed.artisticStyle : undefined,
    visualTechnique: typeof parsed?.visualTechnique === "string" ? parsed.visualTechnique : undefined,
    colorPalette: colorPalette as any,
    moodKeywords: moodKeywords as any,
    suggestedName: typeof parsed?.suggestedName === "string" ? parsed.suggestedName : undefined,
    reasoning: typeof parsed?.reasoning === "string" ? parsed.reasoning : undefined,
  };
};

const extractImageEmbedding = async (imageBlob: Blob): Promise<number[] | undefined> => {
  const modelId = getEmbedModelId();
  const endpoint = `/api/hf/models/${modelId}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": imageBlob.type || "image/png",
    },
    body: imageBlob,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HF embed error (${res.status}): ${text || res.statusText}`);
  }

  const data = (await res.json()) as any;
  // Feature-extraction pipelines often return nested arrays.
  const vector = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : data;
  if (!Array.isArray(vector)) return undefined;
  return vector.filter((x: any) => typeof x === "number");
};

const extractDominantPalette = async (files: File[], count: number = 5): Promise<string[]> => {
  // Simple histogram quantization (fast, no deps): bucket RGB to 16 levels each.
  const histogram = new Map<number, number>();

  for (const file of files) {
    const img = await loadImageFromFile(file);
    const canvas = document.createElement("canvas");
    const maxDim = 96;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) continue;
    ctx.drawImage(img, 0, 0, w, h);

    const data = ctx.getImageData(0, 0, w, h).data;
    // Sample every ~3 pixels to reduce work
    const stride = 4 * 3;
    for (let i = 0; i < data.length; i += stride) {
      const a = data[i + 3];
      if (a < 220) continue;
      const r = data[i + 0];
      const g = data[i + 1];
      const b = data[i + 2];
      const rb = r >> 4;
      const gb = g >> 4;
      const bb = b >> 4;
      const key = (rb << 8) | (gb << 4) | bb;
      histogram.set(key, (histogram.get(key) || 0) + 1);
    }
  }

  const top = Array.from(histogram.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(count * 3, count));

  const colors: string[] = [];
  for (const [key] of top) {
    const rb = (key >> 8) & 0xf;
    const gb = (key >> 4) & 0xf;
    const bb = key & 0xf;
    // Center of bucket
    const r = rb * 16 + 8;
    const g = gb * 16 + 8;
    const b = bb * 16 + 8;
    const hex = rgbToHex(r, g, b);
    if (!colors.includes(hex)) colors.push(hex);
    if (colors.length >= count) break;
  }

  return colors;
};

const inferMoodKeywords = (palette: string[]): string[] => {
  // Very lightweight heuristic from palette brightness/saturation-ish.
  if (palette.length === 0) return ["balanced", "clean", "modern"];

  const rgb = palette.map((hex) => {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return { r, g, b };
  });

  const avg = rgb.reduce(
    (acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }),
    { r: 0, g: 0, b: 0 }
  );
  avg.r /= rgb.length;
  avg.g /= rgb.length;
  avg.b /= rgb.length;

  const brightness = (0.2126 * avg.r + 0.7152 * avg.g + 0.0722 * avg.b) / 255;
  const max = Math.max(avg.r, avg.g, avg.b);
  const min = Math.min(avg.r, avg.g, avg.b);
  const chroma = (max - min) / 255;

  const moods: string[] = [];
  moods.push(brightness < 0.35 ? "moody" : brightness > 0.7 ? "airy" : "balanced");
  moods.push(chroma > 0.35 ? "vibrant" : "muted");
  moods.push("stylized");
  return moods.slice(0, 3);
};

export const analyzeStyle = async (
  files: File[],
  onProgress?: (status: string) => void
): Promise<StyleAnalysisResponse> => {
  if (onProgress) onProgress("Pre-processing: Normalizing inputs...");
  const palette = await extractDominantPalette(files, 5);
  const moodFallback = inferMoodKeywords(palette);

  let collage: { dataUrl: string; blob: Blob } | null = null;
  try {
    collage = await createReferenceCollage(files);
  } catch (e) {
    collage = null;
  }

  if (onProgress) onProgress("Feature Extraction: Analyzing visual DNA...");

  let vlm: Partial<StyleAnalysisResponse> = {};
  try {
    if (collage) {
      vlm = await extractStyleWithVlm(collage.dataUrl);
    }
  } catch (e) {
    // VLM is best-effort; fall back to deterministic values
    vlm = {};
  }

  const colorPalette = (vlm.colorPalette && vlm.colorPalette.length ? vlm.colorPalette : palette) as string[];
  const moodKeywords = (vlm.moodKeywords && vlm.moodKeywords.length ? vlm.moodKeywords : moodFallback) as string[];
  const suggestedName = vlm.suggestedName || `Custom Style ${new Date().toLocaleDateString()}`;
  const artisticStyle = vlm.artisticStyle || "Custom";
  const visualTechnique = vlm.visualTechnique || "Reference-guided";
  const reasoning = vlm.reasoning || "Extracted a dominant palette and inferred basic mood from reference images.";

  if (onProgress) onProgress("Vectorization: Creating style embedding...");
  let embedding: number[] | undefined = undefined;
  try {
    if (collage) {
      embedding = await extractImageEmbedding(collage.blob);
    }
  } catch (e) {
    embedding = undefined;
  }

  return {
    artisticStyle,
    visualTechnique,
    colorPalette,
    moodKeywords,
    suggestedName,
    reasoning,
    embedding,
  };
};

export const performReasoning = async (
  userPrompt: string,
  styleData: any,
  intensity: number
): Promise<string> => {
  const safeIntensity = clamp(intensity, 0, 1);
  const palette = (styleData?.palette || styleData?.colorPalette || []) as string[];
  const moods = (styleData?.moods || styleData?.moodKeywords || []) as string[];
  const technique = (styleData?.visualTechnique || "") as string;

  if (safeIntensity < 0.15) return userPrompt;

  const styleHint = [
    technique ? `Technique: ${technique}.` : "",
    moods.length ? `Mood: ${moods.join(", ")}.` : "",
    palette.length ? `Palette: ${palette.slice(0, 5).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const strength = safeIntensity >= 0.8 ? "strict" : safeIntensity >= 0.4 ? "balanced" : "subtle";

  return `${userPrompt}\n\nStyle guidance (${strength}, ${Math.round(safeIntensity * 100)}%): ${styleHint}`.trim();
};

const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image result"));
    reader.readAsDataURL(blob);
  });
};

export const generateFromGraph = async (
  _userPrompt: string,
  fusedPrompt: string,
  _referenceImages: string[],
  _inputImages: string[] = [],
  aspectRatio: "1:1" | "3:4" | "4:3" | "16:9" = "1:1",
  resolution: "1K" | "2K" | "4K" = "1K"
): Promise<string> => {
  const { width, height } = aspectToSize(aspectRatio, resolution);
  const payload = {
    inputs: fusedPrompt,
    parameters: {
      width,
      height,
    },
    options: {
      wait_for_model: true,
    },
  };

  const res = await fetch(HF_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const hint = res.status === 404 || res.status === 403
      ? "(Check model access on Hugging Face or set VITE_HF_FLUX_MODEL to an accessible model such as black-forest-labs/FLUX.1-dev.)"
      : "";
    throw new Error(`HF Inference error (${res.status}): ${text || res.statusText} ${hint}`.trim());
  }

  const blob = await res.blob();
  return await blobToDataUrl(blob);
};
