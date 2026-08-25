export type AnalysisResult = {
  scene: { title: string; detail: string; confidence: number };
  shot: Array<{ label: string; value: string }>;
};

export type GenerationRequest = {
  appearanceId: string;
  appearanceImage: string;
  appearanceParts?: Record<string, string>;
  referenceImage: string;
  preserveScene: boolean;
  intensity: number;
};

export type GenerationResult = { id: string; imageUrl: string };

export interface AnalyzerAdapter {
  analyze(image: string): Promise<AnalysisResult>;
}

export interface GeneratorAdapter {
  generate(request: GenerationRequest): Promise<GenerationResult>;
}
