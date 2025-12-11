import { GoogleGenAI, Type } from "@google/genai";
import { StyleAnalysisResponse } from "../types";

// --- INFRASTRUCTURE: Pre-processing ---

// Helper: Resize image to reduce payload size (Diagram Node: Pre-processing)
const resizeImage = (file: File, maxDimension: number = 512): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
           reject(new Error("Could not get canvas context"));
           return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  const base64DataUrl = await resizeImage(file);
  const base64Data = base64DataUrl.split(',')[1];
  return {
    inlineData: {
      data: base64Data,
      mimeType: 'image/jpeg',
    },
  };
};

const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const safeJsonParse = (jsonString: string): any => {
  try {
    const cleaned = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    // Basic recovery for demo purposes
    console.warn("JSON Parse warning, attempting loose parse");
    const match = jsonString.match(/\{[\s\S]*\}/);
    if (match) {
        try { return JSON.parse(match[0]); } catch (e2) { return {}; }
    }
    return {};
  }
};

// --- WORKFLOW STEP 1: Feature Extraction (DB/Vector Creation) ---

export const extractVisualFeatures = async (
  files: File[],
  onProgress?: (status: string) => void
): Promise<StyleAnalysisResponse> => {
  const ai = getAi();
  
  // 1. Pre-processing (Normalization)
  if (onProgress) onProgress("Pre-processing: Normalizing inputs...");
  const images = await Promise.all(files.map(fileToGenerativePart));

  // 2. Feature Extraction (Diagram Node: Feature Extraction)
  if (onProgress) onProgress("Feature Extraction: Analyzing visual DNA...");
  
  const prompt = `
    Analyze these reference images to extract their visual features for a style database.
    Return a single valid JSON object.
    
    Extract:
    1. 'artisticStyle': The movement or broad category.
    2. 'visualTechnique': Specific tools/brushwork/rendering methods used.
    3. 'colorPalette': 5 hex codes.
    4. 'moodKeywords': 3-5 atmospheric descriptors.
    5. 'suggestedName': A creative name for this style profile.
    6. 'reasoning': Why this style is unique.
  `;

  let parsed: any = {};

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [...images, { text: prompt }]
      },
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 4000,
      }
    });

    if (response.text) {
        parsed = safeJsonParse(response.text);
    }
  } catch (e) {
    console.error("Feature extraction failed", e);
    // Fallback data
    parsed = {
        artisticStyle: "Abstract",
        visualTechnique: "Mixed Media",
        colorPalette: [],
        moodKeywords: [],
        suggestedName: "New Style",
        reasoning: "Extraction failed, using defaults."
    };
  }

  // 3. Vector Embedding (Diagram Node: Embed + Diffusion / VectorDB)
  // We create a vector representation of the style description to act as the "VectorDB" entry
  let embedding: number[] | undefined = undefined;
  try {
    if (onProgress) onProgress("Vectorization: Creating style embedding...");
    
    const styleDescription = `${parsed.suggestedName}. ${parsed.artisticStyle}. ${parsed.visualTechnique}. ${parsed.moodKeywords?.join(', ')}`;
    
    const embedResponse = await ai.models.embedContent({
      model: 'text-embedding-004', 
      contents: { parts: [{ text: styleDescription }] }
    });
    
    // Handle SDK response structure variations
    embedding = (embedResponse as any).embeddings?.[0]?.values || (embedResponse as any).embedding?.values;
  } catch (e) {
    console.warn("Embedding skipped");
  }

  return {
    artisticStyle: parsed.artisticStyle || "Unknown",
    visualTechnique: parsed.visualTechnique || "Digital",
    colorPalette: parsed.colorPalette || [],
    moodKeywords: parsed.moodKeywords || [],
    suggestedName: parsed.suggestedName || "Custom Style",
    reasoning: parsed.reasoning || "",
    embedding: embedding
  };
};

// --- WORKFLOW STEP 2: Reason-Fusion (Diagram Node: Reason-fusion) ---

export const performReasoning = async (
  userPrompt: string, 
  styleData: any, 
  intensity: number
): Promise<string> => {
  const ai = getAi();
  
  // This acts as the "Reasoning" node in the diagram.
  // It fuses the User's Intent with the Style Database (styleData).
  
  const systemInstruction = `
    You are a Style Fusion Engine.
    Task: Rewrite the User Prompt to strictly adhere to the provided Style Profile.
    
    Style Profile:
    - Technique: ${styleData.visualTechnique}
    - Mood: ${styleData.moods?.join(', ')}
    - Intensity: ${intensity} (0.0 to 1.0)
    
    Instructions:
    - If intensity is high (0.8+), override user descriptive terms with style terms.
    - If intensity is low (<0.4), only subtlely hint at the style.
    - Return ONLY the optimized prompt string.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', 
      contents: { parts: [{ text: userPrompt }] },
      config: { systemInstruction }
    });
    return response.text?.trim() || userPrompt;
  } catch (e) {
      return userPrompt;
  }
};

// --- WORKFLOW STEP 3: Generation (Diagram Node: Generation) ---

export const generateFromGraph = async (
  userPrompt: string,
  fusedPrompt: string,
  referenceImages: string[], // The "Multi-Style" input
  inputImages: string[] = [], // The "User Insert Photo" input
  aspectRatio: "1:1" | "3:4" | "4:3" | "16:9" = "1:1",
  resolution: "1K" | "2K" | "4K" = "1K"
): Promise<string> => {
  const ai = getAi();
  const parts: any[] = [];

  // A. Ingest Multi-Style Reference Images
  referenceImages.forEach(img => {
      const base64Data = img.replace(/^data:image\/(png|jpeg|webp);base64,/, "");
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64Data } });
  });

  // B. Ingest User Input Images (if any) - Diagram Node: User Insert Photo
  if (inputImages.length > 0) {
      inputImages.forEach(img => {
          const base64Data = img.replace(/^data:image\/(png|jpeg|webp);base64,/, "");
          parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64Data } });
      });
  }

  // C. Ingest Prompt (from Reason-fusion)
  const finalPrompt = `
    Context:
    - The first ${referenceImages.length} images are STYLE REFERENCES.
    - ${inputImages.length > 0 ? `The subsequent ${inputImages.length} images are INPUT CONTENT to be transformed.` : 'There are no input content images, generate from scratch.'}
    
    Task:
    ${fusedPrompt}
    
    Constraint:
    Apply the visual style of the REFERENCE images strictly.
  `;
  parts.push({ text: finalPrompt });

  // D. Execute Generation (Diagram Node: Gemini / SD-XL)
  // Logic: Use Flash for 1K (Fast), Pro for 2K/4K (High Quality)
  const model = resolution === '1K' ? 'gemini-2.5-flash-image' : 'gemini-3-pro-image-preview';
  
  const config: any = {
    imageConfig: { aspectRatio }
  };
  
  // Only apply imageSize for resolutions supported by Pro model
  if (resolution !== '1K') {
      config.imageConfig.imageSize = resolution;
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config
    });

    const outputParts = response.candidates?.[0]?.content?.parts;
    if (outputParts) {
        for (const part of outputParts) {
            if (part.inlineData?.data) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
    }
    throw new Error("No image generated");
  } catch (error) {
    console.error("Generation node failed:", error);
    throw new Error("Generation failed.");
  }
};

// Legacy shim for existing components if they strictly call 'editImage'
// In the new graph, editing is just generation with input images.
export const editImage = async (base64Images: string[], prompt: string) => {
    return generateFromGraph(prompt, prompt, [], base64Images);
};

// Aliases to maintain component compatibility while switching logic
export const analyzeStyle = extractVisualFeatures;
export const fusePrompt = performReasoning;
export const generateStyledImage = (
    prompt: string, 
    fused: string, 
    refs: string[], 
    ar: any
) => generateFromGraph(prompt, fused, refs, [], ar);
