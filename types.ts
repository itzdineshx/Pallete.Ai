export interface StyleSnapshot {
  version: number;
  timestamp: number;
  changeLog: string;
  data: Omit<StyleProfile, 'id' | 'createdAt' | 'history' | 'version'>;
}

export interface StyleProfile {
  id: string;
  name: string;
  description: string;
  visualTechnique: string;
  palette: string[];
  moods: string[];
  referenceImages: string[];
  createdAt: number;
  embedding?: number[]; // Vector embedding of the style
  reasoning?: string; // AI explanation of the style
  version: number;
  history: StyleSnapshot[];
}

export interface GeneratedImage {
  id: string;
  url: string; // Base64
  prompt: string;
  fusedPrompt: string;
  styleId: string;
  timestamp: number;
  aspectRatio: "1:1" | "3:4" | "4:3" | "16:9";
  resolution: "1K" | "2K" | "4K";
}

export interface StyleAnalysisResponse {
  artisticStyle: string;
  visualTechnique: string;
  colorPalette: string[];
  moodKeywords: string[];
  suggestedName: string;
  embedding?: number[];
  reasoning?: string;
}