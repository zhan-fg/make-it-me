export type PortraitTemplate = {
  id: string;
  title: string;
  category: "professional" | "korean" | "new_chinese" | "hong_kong" | "french" | "outdoor" | "art" | "seasonal" | "travel" | "mens";
  coverImage: string;
  prompt: string;
  selfieRequirements: string[];
  tags: string[];
  aspectRatio: "3:4";
  rights: { source: "ai-original"; commercialUse: true; modelReleaseRequired: false };
};

export type PortraitGenerationRequest = {
  templateId: string;
  selfieImage: string;
};

export type PortraitGenerationResult = {
  id: string;
  imageUrl: string;
  provider: "gemini";
  model: string;
  elapsedMs: number;
  timings: {
    requestParseMs: number;
    templateLoadMs: number;
    geminiMs: number;
    responseParseMs: number;
    serverTotalMs: number;
    clientRoundTripMs?: number;
  };
  requestId?: string;
  providerRequestId?: string;
};

