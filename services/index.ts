import { apiGenerator } from "./api-adapters";
import { referenceAnalyzer } from "./reference-analyzer";

export const analyzerService = referenceAnalyzer;
export const generatorService = apiGenerator;
