import type { AnalyzerAdapter, GeneratorAdapter } from "./types";

async function request<T>(url: string, body: unknown): Promise<T> {
  const accessCode = window.sessionStorage.getItem("make-it-me-access-code") || "";
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-App-Access-Code": accessCode },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "请求失败，请稍后重试");
  return payload;
}

export const apiAnalyzer: AnalyzerAdapter = {
  analyze(image) {
    return request("/api/analyze", { image });
  },
};

export const apiGenerator: GeneratorAdapter = {
  generate(input) {
    return request("/api/generate", input);
  },
};
