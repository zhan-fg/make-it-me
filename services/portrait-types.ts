export type PortraitTemplate = {
  id: string;
  title: string;
  category: "professional" | "korean" | "japanese" | "retro" | "bridal" | "new_chinese" | "hong_kong" | "french" | "outdoor" | "art" | "seasonal" | "travel" | "mens" | "id_photo";
  audience: "female" | "male" | "unisex";
  coverImage: string;
  prompt: string;
  selfieRequirements: string[];
  tags: string[];
  aspectRatio: "3:4";
  rights: { source: "ai-original"; commercialUse: true; modelReleaseRequired: false };
};

export type PortraitGenerationRequest = {
  templateId: string;
  selfieImageUrl: string;
  beautyLevel?: number;
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
    resultStorageMs: number;
    selfieUploadMs?: number;
    clientRoundTripMs?: number;
  };
  requestId?: string;
  providerRequestId?: string;
};
