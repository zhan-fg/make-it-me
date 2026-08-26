import type { CaptureResult, GenerationResult, TargetShot } from "./types";

const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

export const generatorAdapter = {
  async generate(_reference: string | undefined, capture: CaptureResult, _target: TargetShot): Promise<GenerationResult> {
    await wait(2600);
    return { id: `mock-${Date.now()}`, imageUrl: capture.selectedFrames[0]?.dataUrl || "" };
  },
};
