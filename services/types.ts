export type AnalysisResult = {
  scene: { title: string; detail: string; confidence: number };
  shot: Array<{ label: string; value: string }>;
};

export type GenerationRequest = {
  appearanceId: string;
  preserveScene: boolean;
  intensity: number;
};

export type GenerationResult = { id: string; imageUrl: string };

export interface AnalyzerAdapter {
  analyze(file?: File): Promise<AnalysisResult>;
}

export interface GeneratorAdapter {
  generate(request: GenerationRequest): Promise<GenerationResult>;
}
