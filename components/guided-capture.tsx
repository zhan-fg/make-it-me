"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconCamera, IconCheck, IconPhotoPlus, IconRefresh } from "@tabler/icons-react";
import { evaluateFrame, poseGuidance, poseMatchPercent, selectBestFrames } from "@/services/capture-quality";
import { detectVideo, getVideoLandmarkers, type VisionDetection } from "@/services/mediapipe-vision";
import { buildCaptureInstructions } from "@/services/requirement-planner";
import type { CaptureFrame, CaptureResult, IdentityRequirement } from "@/services/types";

type DetectedFace = { boundingBox: { width: number; height: number } };
type FaceDetectorInstance = { detect(source: HTMLVideoElement): Promise<DetectedFace[]> };
type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorInstance;

type Props = {
  requirement: IdentityRequirement;
  onComplete: (result: CaptureResult) => void;
  onCancel: () => void;
};

const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));

export function GuidedCapture({ requirement, onComplete, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const detectionRef = useRef<VisionDetection | undefined>(undefined);
  const detectingRef = useRef(false);
  const [cameraState, setCameraState] = useState<"loading" | "ready" | "denied">("loading");
  const [instructionIndex, setInstructionIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [frames, setFrames] = useState<CaptureFrame[]>([]);
  const [fullBodyImage, setFullBodyImage] = useState<string>();
  const [detector, setDetector] = useState<FaceDetectorInstance | undefined>(undefined);
  const [visionState, setVisionState] = useState<"loading" | "ready" | "fallback">("loading");
  const [liveDetection, setLiveDetection] = useState<VisionDetection>();
  const instructions = useMemo(() => buildCaptureInstructions(requirement), [requirement]);
  const instruction = instructions[instructionIndex] ?? instructions.at(-1)!;
  const livePoseMatch = poseMatchPercent(instruction.id, liveDetection?.yaw, requirement.poseTarget, liveDetection);
  const liveGuidance = poseGuidance(requirement.poseTarget, liveDetection);

  useEffect(() => {
    let active = true;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1440 } }, audio: false });
        if (!active) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const Detector = (window as typeof window & { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
        if (Detector) setDetector(new Detector({ fastMode: true, maxDetectedFaces: 2 }));
        try { await getVideoLandmarkers(); if (active) setVisionState("ready"); } catch { if (active) setVisionState("fallback"); }
        setCameraState("ready");
      } catch { if (active) setCameraState("denied"); }
    }
    startCamera();
    return () => { active = false; streamRef.current?.getTracks().forEach((track) => track.stop()); };
  }, []);

  useEffect(() => {
    if (cameraState !== "ready" || visionState !== "ready") return;
    let active = true; let frameId = 0; let lastRun = 0;
    const loop = async (timestamp: number) => {
      if (!active) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && timestamp - lastRun >= 150 && !detectingRef.current) {
        lastRun = timestamp; detectingRef.current = true;
        try { const result = await detectVideo(video, timestamp); detectionRef.current = result; setLiveDetection(result); } catch { setVisionState("fallback"); }
        finally { detectingRef.current = false; }
      }
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => { active = false; cancelAnimationFrame(frameId); };
  }, [cameraState, visionState]);

  const grabFrame = async (instructionId: string, requestedMouthState?: CaptureFrame["requestedMouthState"]) => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return undefined;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.translate(canvas.width, 0); context.scale(-1, 1); context.drawImage(video, 0, 0); context.setTransform(1, 0, 0, 1, 0, 0);
    let boxes: Array<{ width: number; height: number }> | undefined;
    if (detector) {
      try { boxes = (await detector.detect(video)).map((face) => face.boundingBox); } catch { boxes = undefined; }
    }
    const frame = await evaluateFrame(canvas, instructionId, boxes, detectionRef.current, requirement.poseTarget);
    return { ...frame, requestedMouthState };
  };

  const waitForTarget = async (instructionId: string, timeoutMs: number) => {
    if (visionState !== "ready") { await wait(Math.min(timeoutMs, 1400)); return; }
    const startedAt = Date.now(); let stableAt: number | undefined;
    while (Date.now() - startedAt < timeoutMs) {
      const detection = detectionRef.current;
      const match = poseMatchPercent(instructionId, detection?.yaw, requirement.poseTarget, detection);
      const valid = detection?.faceCount === 1 && (detection.visibility ?? 0) >= 0.7 && (match ?? 0) >= 75;
      if (valid) { stableAt ??= Date.now(); if (Date.now() - stableAt >= 450) return; } else stableAt = undefined;
      await wait(100);
    }
  };

  const runCapture = async () => {
    if (running || cameraState !== "ready") return;
    setRunning(true); setFrames([]);
    const candidates: CaptureFrame[] = [];
    for (let index = 0; index < instructions.length; index += 1) {
      setInstructionIndex(index);
      await waitForTarget(instructions[index].id, Math.max(3500, instructions[index].holdMs));
      const first = await grabFrame(instructions[index].id, instructions[index].mouthState);
      if (first) candidates.push(first);
      if (requirement.mode !== "simple") {
        await wait(220);
        const second = await grabFrame(instructions[index].id, instructions[index].mouthState);
        if (second) candidates.push(second);
      }
      setFrames([...candidates]);
    }
    setRunning(false);
    if (!requirement.needsFullBody || fullBodyImage) {
      onComplete({ mode: requirement.mode, candidates, selectedFrames: selectBestFrames(candidates, requirement.bestFrameCount), fullBodyImage, detector: visionState === "ready" ? "mediapipe" : detector ? "browser-face-detector" : "local-quality-only" });
    }
  };

  const useFallbackPhoto = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const fallback: CaptureFrame = {
        id: `upload-${Date.now()}`, dataUrl, capturedAt: Date.now(), instructionId: "uploaded",
        quality: {
          faceCount: { value: null, status: "unavailable" }, faceSize: { value: null, status: "unavailable" },
          sharpness: { value: null, status: "unavailable" }, brightness: { value: null, status: "unavailable" },
          poseMatch: { value: null, status: "unavailable" }, occlusion: { value: null, status: "unavailable" }, confidence: { value: null, status: "unavailable" }, score: 50,
        },
      };
      onComplete({ mode: requirement.mode, candidates: [fallback], selectedFrames: [fallback], fullBodyImage, detector: "local-quality-only" });
    };
    reader.readAsDataURL(file);
  };

  return <div className="mx-auto max-w-[1080px] px-4 pb-12 pt-4 sm:px-6 sm:pt-8">
    <div className="mb-4 flex items-center justify-between"><button onClick={onCancel} className="text-sm text-[#6f6f76]">← 返回</button><span className="rounded-full bg-[#f0eaff] px-3 py-1.5 text-xs text-[#6547bd]">仅用于本次生成</span></div>
    <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
      <section className="relative min-h-[570px] overflow-hidden rounded-[30px] bg-[#17171b] text-white shadow-xl">
        <video ref={videoRef} playsInline muted className={`absolute inset-0 h-full w-full scale-x-[-1] object-cover ${cameraState === "ready" ? "opacity-100" : "opacity-0"}`} />
        <canvas ref={canvasRef} className="hidden" />
        {cameraState !== "ready" && <div className="absolute inset-0 grid place-items-center px-8 text-center"><div><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/10"><IconCamera size={28}/></span><h2 className="mt-4 text-xl font-semibold">{cameraState === "loading" ? "正在打开相机…" : "没有获得相机权限"}</h2><p className="mt-2 text-sm text-white/55">{cameraState === "loading" ? "请允许浏览器使用摄像头" : "你仍然可以从相册选择一张清晰照片完成体验"}</p>{cameraState === "denied" && <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-medium text-black"><IconPhotoPlus size={18}/>从相册选择<input type="file" accept="image/*" className="hidden" onChange={(event) => useFallbackPhoto(event.target.files?.[0])}/></label>}</div></div>}
        {cameraState === "ready" && <>
          <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/65 to-transparent px-5 pb-20 pt-5"><div className="flex items-center justify-between"><p className="text-xs text-white/65">{requirement.mode === "simple" ? "自拍采集" : `${requirement.captureDurationSeconds} 秒引导采集`}</p><span className={`rounded-full px-2 py-1 text-[10px] ${visionState === "ready" ? "bg-[#d8ff70] text-black" : "bg-white/15 text-white/70"}`}>{visionState === "loading" ? "视觉模型加载中" : visionState === "ready" ? "MediaPipe 实时检测" : "基础检测模式"}</span></div><div className="mt-3 h-1 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-[#d8ff70] transition-all duration-500" style={{ width: `${running ? ((instructionIndex + 1) / instructions.length) * 100 : 0}%` }}/></div></div>
          <div className={`pointer-events-none absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 rounded-[48%] border-2 shadow-[0_0_0_999px_rgba(0,0,0,.18)] transition-all ${livePoseMatch !== null && livePoseMatch >= 75 ? "border-[#d8ff70]" : "border-white/75"}`} style={{ width: `${Math.max(180, Math.min(270, (requirement.poseTarget.faceRegion?.width || .22) * 920))}px`, height: `${Math.max(240, Math.min(360, (requirement.poseTarget.faceRegion?.height || .3) * 950))}px` }}><span className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-white/75">{livePoseMatch === null ? "正在检测目标姿势" : `姿势匹配 ${livePoseMatch}%`}</span></div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-6 pb-7 pt-28 text-center"><div className="mx-auto mb-4 flex w-fit gap-1.5">{instructions.map((item, index) => <span key={item.id} className={`h-1.5 rounded-full transition-all ${index === instructionIndex && running ? "w-6 bg-[#d8ff70]" : index < instructionIndex && running ? "w-1.5 bg-[#d8ff70]" : "w-1.5 bg-white/35"}`}/>)}</div><h2 className="text-[26px] font-semibold">{running ? instruction.label : "复刻参考人物姿势"}</h2><p className={`mt-1.5 text-sm ${livePoseMatch !== null && livePoseMatch >= 75 ? "text-[#d8ff70]" : "text-white/70"}`}>{running ? liveDetection?.faceCount === 0 ? "没有检测到人脸，请回到取景框内" : liveDetection && liveDetection.faceCount > 1 ? "请确保只有一人入镜" : liveGuidance : `${instruction.hint}；达到 75% 后自动抓拍`}</p><button onClick={runCapture} disabled={running || visionState === "loading"} className="mt-5 inline-flex min-w-[180px] items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-semibold text-black disabled:bg-white/20 disabled:text-white"><IconCamera size={18}/>{visionState === "loading" ? "正在准备检测" : running ? livePoseMatch !== null && livePoseMatch >= 75 ? "请保持，正在自动拍摄" : "正在匹配参考姿势" : "开始姿势匹配"}</button></div>
        </>}
      </section>
      <aside className="space-y-4">
        <div className="rounded-[24px] bg-white p-5"><p className="text-xs text-[#8065cb]">本次临时采集</p><h3 className="mt-2 text-xl font-semibold">这次只需要这些素材</h3><div className="mt-4 space-y-3">{requirement.materials.map((item, index) => <div key={item} className="flex items-center gap-3 rounded-2xl bg-[#f6f6f8] p-3.5"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#1d1d21] text-xs text-white">{index + 1}</span><span className="text-sm">{item}</span></div>)}</div></div>
        {requirement.needsFullBody && <div className="rounded-[24px] bg-white p-5"><div className="flex items-start justify-between"><div><b className="text-sm">全身参考</b><p className="mt-1 text-xs text-[#77777e]">正面站立、全身入镜即可</p></div>{fullBodyImage && <IconCheck className="text-[#7655d6]" size={20}/>}</div><label className="mt-4 flex cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-[#d5d5dc] bg-[#fafafa] py-6 text-sm">{fullBodyImage ? <><IconRefresh size={17}/>重新选择</> : <><IconPhotoPlus size={17}/>添加全身照片</>}<input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setFullBodyImage(String(reader.result)); reader.readAsDataURL(file); }}/></label>{!running && frames.length > 0 && fullBodyImage && <button onClick={() => onComplete({ mode: requirement.mode, candidates: frames, selectedFrames: selectBestFrames(frames, requirement.bestFrameCount), fullBodyImage, detector: visionState === "ready" ? "mediapipe" : detector ? "browser-face-detector" : "local-quality-only" })} className="mt-3 w-full rounded-2xl bg-[#1d1d21] py-3 text-sm text-white">继续查看</button>}</div>}
        <div className="rounded-[24px] border border-[#ddd7ef] bg-[#f6f1ff] p-5"><b className="text-sm">你的素材不会加入“我的形象”</b><p className="mt-2 text-xs leading-5 text-[#6f6880]">当前 Demo 仅在本次页面会话中使用这些画面。完成或重置流程时会清空本地临时状态。</p></div>
        <details className="rounded-[20px] bg-white p-4 text-xs text-[#77777e]"><summary className="cursor-pointer text-[#333338]">检测说明</summary><p className="mt-3 leading-5">亮度和清晰度通过 Canvas 本地计算。{visionState === "ready" ? "MediaPipe 在浏览器本地检测人脸、头部角度、可见度和人体姿态；达到目标角度并稳定后自动抓拍。" : detector ? "MediaPipe 不可用，已降级到浏览器人脸检测与定时抓拍。" : "视觉模型不可用，当前使用基础质量检测与定时抓拍。"}</p></details>
      </aside>
    </div>
  </div>;
}

