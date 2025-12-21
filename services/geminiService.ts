// Compatibility shim: legacy imports may still reference this module.
// It re-exports the current Hugging Face based pipeline.

export {
  analyzeStyle,
  analyzeStyle as extractVisualFeatures,
  performReasoning,
  generateFromGraph,
} from "./fluxService";

export const editImage = async (base64Images: string[], prompt: string) => {
  const { generateFromGraph } = await import("./fluxService");
  return generateFromGraph(prompt, prompt, [], base64Images);
};

export const fusePrompt = async (userPrompt: string, styleData: any, intensity: number) => {
  const { performReasoning } = await import("./fluxService");
  return performReasoning(userPrompt, styleData, intensity);
};

export const generateStyledImage = async (prompt: string, fused: string, refs: string[], ar: any) => {
  const { generateFromGraph } = await import("./fluxService");
  return generateFromGraph(prompt, fused, refs, [], ar);
};
