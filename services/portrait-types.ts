export type PortraitTemplate = {
  id: string;
  title: string;
  category: "professional" | "korean" | "new_chinese" | "hong_kong";
  coverImage: string;
  prompt: string;
  selfieRequirements: string[];
  tags: string[];
  aspectRatio: "3:4";
  rights: { source: "ai-original"; commercialUse: true; modelReleaseRequired: false };
};

export type PortraitGenerationRequest = {
  templateId: string;
  templateImage: string;
  selfieImage: string;
};

export type PortraitGenerationResult = {
  id: string;
  imageUrl: string;
  provider: "gemini";
  model: string;
  elapsedMs: number;
  requestId?: string;
};

