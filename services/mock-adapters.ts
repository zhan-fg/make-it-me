import type { AnalyzerAdapter, GeneratorAdapter } from "./types";

const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

export const mockAnalyzer: AnalyzerAdapter = {
  async analyze() {
    await wait(1800);
    return {
      scene: { title: "海边日落", detail: "暖金色逆光 · 浅滩倒影 · 低饱和天空", confidence: 96 },
      shot: [
        { label: "Pose", value: "侧身回望" },
        { label: "Position", value: "画面右侧 1/3" },
        { label: "Composition", value: "中景 · 留白" },
        { label: "Camera", value: "50mm · 平视" },
        { label: "Expression", value: "自然微笑" },
      ],
    };
  },
};

export const mockGenerator: GeneratorAdapter = {
  async generate() {
    await wait(3600);
    return { id: "mock-001", imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1400&q=90" };
  },
};
