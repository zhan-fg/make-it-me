"use client";

import { useEffect, useRef, useState } from "react";
import { IconArrowRight, IconCamera, IconCheck, IconChevronRight, IconDownload, IconLock, IconRefresh, IconShare3, IconSparkles } from "@tabler/icons-react";
import { GuidedCapture } from "@/components/guided-capture";
import { generatorAdapter } from "@/services/generator-adapter";
import { deriveTargetShot, referenceAnalyzer } from "@/services/reference-analyzer";
import { planIdentityRequirement } from "@/services/requirement-planner";
import type { CaptureResult, EphemeralIdentitySession, IdentityRequirement, ReferenceAnalysis, TargetShot } from "@/services/types";

type View = "discover" | "analyzing" | "requirements" | "capture" | "review" | "generating" | "result" | "appearance";
type Reference = { id: string; title: string; detail: string; mediaType: "image" | "video"; source?: string; colors: string };

const templates: Reference[] = [
  { id: "cafe", title: "巴黎窗边咖啡", detail: "自然侧光 · 半身坐姿", mediaType: "image", colors: "from-[#ebb899] to-[#7a423d]" },
  { id: "tokyo", title: "东京便利店夜拍", detail: "直闪 · 夜景 · 全身", mediaType: "image", colors: "from-[#2e3866] to-[#c7576b]" },
  { id: "beach", title: "海边黄昏回头", detail: "逆光 · 风感 · 电影感", mediaType: "video", colors: "from-[#f5b080] to-[#6b94c2]" },
  { id: "mirror", title: "酒店镜前自拍", detail: "室内暖光 · 松弛感", mediaType: "image", colors: "from-[#c2b2a6] to-[#574d52]" },
  { id: "street", title: "街头跟拍转身", detail: "移动镜头 · 自然动作", mediaType: "video", colors: "from-[#526185] to-[#ba9e85]" },
];

const modeNames = { simple: "Simple", standard: "Standard", advanced: "Advanced" };
const modeLabels = { simple: "轻量采集", standard: "引导采集", advanced: "多角度采集" };

export default function Home() {
  const [view, setView] = useState<View>("discover");
  const [reference, setReference] = useState<Reference>();
  const [referenceAnalysis, setReferenceAnalysis] = useState<ReferenceAnalysis>();
  const [targetShot, setTargetShot] = useState<TargetShot>();
  const [requirement, setRequirement] = useState<IdentityRequirement>();
  const [session, setSession] = useState<EphemeralIdentitySession>();
  const [capture, setCapture] = useState<CaptureResult>();
  const [resultImage, setResultImage] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  const analyzeReference = async (nextReference: Reference) => {
    setReference(nextReference); setView("analyzing");
    const analysis = await referenceAnalyzer.analyze({ id: nextReference.id, source: nextReference.source, mediaType: nextReference.mediaType });
    const shot = deriveTargetShot(analysis);
    const planned = planIdentityRequirement(analysis);
    setReferenceAnalysis(analysis);
    setTargetShot(shot); setRequirement(planned);
    setSession({ id: `ephemeral-${Date.now()}`, createdAt: Date.now(), referenceAnalysis: analysis, targetShot: shot, requirement: planned, scope: "session" });
    setView("requirements");
  };

  const pick = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => analyzeReference({ id: "uploaded", title: file.name, detail: "你上传的参考素材", mediaType: file.type.startsWith("video/") ? "video" : "image", source: String(reader.result), colors: "from-[#e5b094] to-[#4d384d]" });
    reader.readAsDataURL(file);
  };

  const completeCapture = (nextCapture: CaptureResult) => {
    setCapture(nextCapture); setSession((current) => current ? { ...current, capture: nextCapture } : current); setView("review");
  };

  const generate = async () => {
    if (!capture || !targetShot) return;
    setView("generating");
    const generated = await generatorAdapter.generate(reference?.source, capture, targetShot);
    setResultImage(generated.imageUrl); setView("result");
  };

  const reset = () => {
    setReference(undefined); setReferenceAnalysis(undefined); setTargetShot(undefined); setRequirement(undefined); setSession(undefined); setCapture(undefined); setResultImage(undefined); setView("discover");
    if (fileInput.current) fileInput.current.value = "";
  };

  return <main className="min-h-screen bg-[#e3e3e3] text-[#1e1e1e]">
    <input ref={fileInput} className="hidden" type="file" accept="image/*,video/*" onChange={(event) => pick(event.target.files?.[0])} />
    <Header view={view} home={reset} appearance={() => setView("appearance")} />
    {view === "discover" && <Discover upload={() => fileInput.current?.click()} select={analyzeReference} />}
    {view === "analyzing" && <Analyzing reference={reference} />}
    {view === "requirements" && referenceAnalysis && targetShot && requirement && <Requirements reference={reference} analysis={referenceAnalysis} target={targetShot} requirement={requirement} start={() => setView("capture")} appearance={() => setView("appearance")} />}
    {view === "capture" && requirement && <GuidedCapture requirement={requirement} onComplete={completeCapture} onCancel={() => setView("requirements")} />}
    {view === "review" && capture && requirement && <CaptureReview capture={capture} requirement={requirement} retake={() => setView("capture")} continueFlow={generate} />}
    {view === "generating" && <Generating reference={reference} />}
    {view === "result" && <Result reference={reference} resultImage={resultImage} again={() => { setCapture(undefined); setSession((current) => current ? { ...current, capture: undefined } : current); setView("capture"); }} reset={reset} />}
    {view === "appearance" && <Appearance back={() => setView(reference ? "requirements" : "discover")} />}
    {session && view !== "discover" && view !== "appearance" && <div className="fixed bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/70 bg-white/90 px-3 py-2 text-[10px] text-[#66666d] shadow-lg backdrop-blur sm:hidden"><IconLock size={11} className="mr-1 inline"/>本次会话临时素材</div>}
  </main>;
}

function Header({ view, home, appearance }: { view: View; home: () => void; appearance: () => void }) {
  return <header className="mx-auto flex h-[70px] max-w-[1280px] items-center gap-4 px-4 sm:h-[82px] sm:px-6 lg:px-0"><button onClick={home} className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#1a1a1f] text-white"><IconSparkles size={15}/></span><b className="whitespace-nowrap text-base sm:text-lg">Make it me</b></button><div className="flex-1"/><nav className="flex items-center gap-4 text-xs sm:gap-7 sm:text-sm"><button className={view === "discover" ? "font-medium" : "text-[#757575]"} onClick={home}>发现</button><button className={view === "result" ? "font-medium" : "hidden text-[#757575] sm:block"}>我的作品</button><button className={view === "appearance" ? "font-medium" : "text-[#757575]"} onClick={appearance}>我的形象</button><span className="h-[32px] w-[32px] rounded-full bg-[#ddccff]"/></nav></header>;
}

function AccessCodeField() {
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(window.sessionStorage.getItem("make-it-me-access-code") || "");
  }, []);

  const update = (nextValue: string) => {
    setValue(nextValue);
    window.sessionStorage.setItem("make-it-me-access-code", nextValue);
  };

  return <label className="mt-3 block max-w-xs text-left">
    <span className="sr-only">体验访问码</span>
    <input type="password" value={value} onChange={(event) => update(event.target.value)} placeholder="输入体验访问码" autoComplete="current-password" className="w-full rounded-[14px] border border-white/80 bg-white/65 px-4 py-3 text-sm outline-none placeholder:text-[#929299] focus:border-[#7655d6]"/>
    <span className="mt-1.5 block text-[10px] text-[#85858d]">仅保存在当前浏览器会话，用于授权 AI 分析请求</span>
  </label>;
}

function Discover({ upload, select }: { upload: () => void; select: (reference: Reference) => void }) {
  return <div className="mx-auto max-w-[1280px] px-4 pb-16 sm:px-6 lg:px-0"><section className="grid gap-5 pt-5 sm:pt-9 lg:min-h-[270px] lg:grid-cols-[1.25fr_.95fr] lg:gap-8"><div><span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-xs text-[#6d589e]"><IconSparkles size={13}/>现在无需先创建长期形象</span><h1 className="mt-4 text-[40px] font-bold leading-[1.12] tracking-[-.045em] sm:text-[50px]">看到喜欢的，<br/>换你来拍。</h1><p className="mt-3 max-w-lg text-[15px] leading-6 text-[#757575]">AI 会先看懂这次镜头，再只向你索取真正需要的素材。用完本次流程即可清空。</p><button onClick={upload} className="mt-5 flex w-full items-center justify-center gap-2 rounded-[16px] bg-[#1a1a1f] px-[22px] py-[14px] text-[15px] text-white sm:w-auto"><IconCamera size={18}/>选择参考照片或视频</button><AccessCodeField/></div><div className="relative min-h-[210px] overflow-hidden rounded-[28px] bg-gradient-to-br from-[#eee4ff] to-[#cce6ff] p-[22px]"><p className="text-xs text-[#7157bd]">SMART CAPTURE</p><h2 className="mt-2 max-w-[330px] text-2xl font-bold leading-[1.3]">每个镜头，都有刚刚好的采集方式。</h2><div className="absolute bottom-5 left-5 right-5 grid grid-cols-3 gap-2">{[["1 张", "正脸自拍"], ["3–5 秒", "轻转头"], ["8–10 秒", "多角度"]].map(([a,b]) => <div key={a} className="rounded-2xl bg-white/55 p-3 backdrop-blur"><b className="text-sm">{a}</b><p className="mt-1 text-[10px] text-[#6c6c75]">{b}</p></div>)}</div></div></section><div className="mt-8 flex h-[58px] items-center justify-between"><div><h2 className="text-2xl font-bold">热门模板</h2><p className="mt-1 text-sm text-[#757575]">点一个，看看它需要怎么采集</p></div><button className="hidden text-sm sm:block">查看全部 →</button></div><div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">{templates.map((item) => <button key={item.id} onClick={() => select(item)} className="overflow-hidden rounded-[20px] border border-[#e5e5eb] bg-white text-left transition hover:-translate-y-1"><div className={`relative h-[220px] overflow-hidden bg-gradient-to-r sm:h-[258px] ${item.colors}`}><span className="absolute left-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-[10px]">{item.mediaType === "video" ? "视频" : "照片"}</span><div className="absolute left-[31%] top-[28%] h-[64%] w-[30%] rounded-[38px] bg-[#241f29]/75"/><div className="absolute -right-6 top-8 h-44 w-44 rounded-full bg-white/20"/></div><div className="p-3.5"><b className="text-[14px] font-medium">{item.title}</b><p className="mt-1 truncate text-[11px] text-[#757575]">{item.detail}</p></div></button>)}</div></div>;
}

function Analyzing({ reference }: { reference?: Reference }) {
  return <Page>
    <div className="grid min-h-[620px] place-items-center">
      <div className="w-full max-w-lg text-center">
        <ReferenceView reference={reference} className="mx-auto h-[330px] w-[250px] rounded-[28px]"/>
        <div className="mx-auto mt-7 h-1.5 w-48 overflow-hidden rounded-full bg-white"><div className="h-full w-1/2 animate-pulse rounded-full bg-[#7655d6]"/></div>
        <h1 className="mt-5 text-2xl font-semibold">正在看懂这个镜头</h1>
        <p className="mt-2 text-sm text-[#757575]">读取画面几何，并分析场景、构图和动作语义…</p>
        <p className="mt-5 text-[11px] text-[#8b8b91]">检测能力不可用时会明确降级，不会把 Mock 当作真实识别</p>
      </div>
    </div>
  </Page>;
}

function sourceLabel(source: ReferenceAnalysis["provenance"][string]["source"]) {
  return {
    "browser-metadata": "真实媒体信息",
    "browser-face-detector": "真实浏览器 CV",
    "mediapipe-face-landmarker": "MediaPipe 人脸 CV",
    "mediapipe-pose-landmarker": "MediaPipe 姿态 CV",
    "geometry-heuristic": "几何启发式",
    vlm: "VLM",
    mock: "Mock",
    unavailable: "不可用",
  }[source];
}

function bodyOrientationLabel(orientation: ReferenceAnalysis["shot"]["body"]["orientation"]) {
  return { front: "人物正向", side: "人物侧向", back_three_quarter: "人物回头", back: "人物背向" }[orientation];
}

function analysisStatus(analysis: ReferenceAnalysis) {
  const semantic = analysis.provenance["scene.summary"];
  const face = analysis.provenance["geometry.faceBoundingBox"];
  const pose = analysis.provenance["geometry.bodyKeypointsAvailable"];
  return [
    {
      label: "语义分析",
      value: semantic?.source === "vlm" ? "DashScope 成功" : semantic?.source === "mock" ? "Mock 降级" : "不可用",
      good: semantic?.source === "vlm",
      detail: semantic?.source === "vlm" ? `置信度 ${Math.round((semantic.confidence ?? analysis.confidence) * 100)}%` : semantic?.note ?? "未取得真实 VLM 结果",
    },
    {
      label: "人脸几何",
      value: face?.source === "mediapipe-face-landmarker" ? "MediaPipe 成功" : face?.source === "browser-face-detector" ? "浏览器 CV 成功" : "未检测到",
      good: Boolean(face?.available),
      detail: face?.available
        ? `${analysis.geometry.faceCount ?? 0} 张脸 · yaw ${analysis.shot.face.yaw === null ? "—" : `${analysis.shot.face.yaw.toFixed(1)}°`}`
        : face?.note ?? "没有可靠的人脸几何数据",
    },
    {
      label: "人体姿态",
      value: pose?.source === "mediapipe-pose-landmarker" ? "MediaPipe 成功" : "未检测到",
      good: Boolean(pose?.available),
      detail: pose?.available ? `${bodyOrientationLabel(analysis.shot.body.orientation)} · ${analysis.shot.body.poseSummary}` : pose?.note ?? "没有可靠的人体关键点",
    },
  ];
}

function Requirements({ reference, analysis, target, requirement, start, appearance }: { reference?: Reference; analysis: ReferenceAnalysis; target: TargetShot; requirement: IdentityRequirement; start: () => void; appearance: () => void }) {
  const detailRows = Object.entries(analysis.provenance).sort(([left], [right]) => left.localeCompare(right));
  const statuses = analysisStatus(analysis);
  return <Page>
    <div className="mb-6">
      <span className="text-xs text-[#7655d6]">镜头分析完成</span>
      <h1 className="mt-2 text-[32px] font-bold tracking-[-.03em] sm:text-[38px]">这次，只需要这些。</h1>
      <p className="mt-2 text-[15px] text-[#757575]">我们根据镜头自动选择了最低成本的采集方式。</p>
    </div>
    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      {statuses.map((status) => <div key={status.label} className="rounded-[20px] bg-white p-4">
        <div className="flex items-center justify-between gap-3"><span className="text-xs text-[#77777e]">{status.label}</span><span className={`h-2.5 w-2.5 rounded-full ${status.good ? "bg-[#6fc447]" : "bg-[#e6a23c]"}`}/></div>
        <p className="mt-2 text-sm font-semibold">{status.value}</p><p className="mt-1 truncate text-[11px] text-[#85858d]">{status.detail}</p>
      </div>)}
    </div>
    <div className="grid gap-6 lg:grid-cols-[1fr_1.05fr]">
      <div>
        <ReferenceView reference={reference} className="h-[460px] rounded-[28px]"/>
        <div className="mt-3 flex flex-wrap gap-2">
          {target.consumerSummary.map((item) => <Pill key={item}>{item}</Pill>)}
          {analysis.scene.preserveRecommended && <Pill>原场景建议保留</Pill>}
        </div>
        <div className="mt-4 rounded-[20px] bg-white/65 p-4">
          <p className="text-[11px] uppercase tracking-[.12em] text-[#8065cb]">REFERENCE SUMMARY</p>
          <p className="mt-2 text-sm leading-6 text-[#4f4f56]">{analysis.scene.summary}</p>
          {analysis.scene.lightingContext && <p className="mt-1 text-xs text-[#7a7a82]">{analysis.scene.lightingContext}</p>}
        </div>
      </div>
      <div className="space-y-4">
        <div className="rounded-[26px] bg-white p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-[11px] uppercase tracking-[.14em] text-[#8065cb]">{modeNames[requirement.mode]}</p><h2 className="mt-2 text-2xl font-semibold">{modeLabels[requirement.mode]}</h2></div>
            <span className="rounded-full bg-[#ecffe1] px-3 py-1.5 text-xs text-[#477329]">已为你选择</span>
          </div>
          <p className="mt-4 text-sm leading-6 text-[#6f6f76]">{requirement.reason}</p>
          <p className={`mt-3 rounded-xl px-3 py-2 text-xs ${requirement.basis === "cv" ? "bg-[#ecffe1] text-[#477329]" : requirement.basis === "vlm" ? "bg-[#f0eaff] text-[#6547bd]" : "bg-[#fff1df] text-[#9a5d16]"}`}>{requirement.basisSummary}</p>
          <div className="mt-5 space-y-2.5">{requirement.materials.map((item) => <div key={item} className="flex items-center gap-3 rounded-2xl bg-[#f5f5f7] p-4"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#1d1d21] text-white"><IconCheck size={14}/></span><span className="text-sm font-medium">{item}</span></div>)}</div>
          <div className="mt-5 flex items-start gap-3 rounded-2xl bg-[#f4efff] p-4"><IconLock size={18} className="mt-0.5 shrink-0 text-[#7655d6]"/><div><b className="text-sm">仅用于本次生成</b><p className="mt-1 text-xs leading-5 text-[#6f6880]">不会自动保存到“我的形象”。当前 Demo 在完成或重置流程时清空页面会话中的临时素材。</p></div></div>
          <button onClick={start} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1d1d21] py-4 text-[15px] font-semibold text-white">开始采集 <IconArrowRight size={18}/></button>
        </div>
        <button onClick={appearance} className="flex w-full items-center justify-between rounded-[20px] bg-white/65 p-4 text-left"><span><b className="text-sm">已有“我的形象”？</b><span className="ml-2 text-xs text-[#77777e]">可选复用，不是必需</span></span><IconChevronRight size={18}/></button>
        <details className="rounded-[20px] bg-white/65 p-4 text-xs">
          <summary className="cursor-pointer font-medium">分析详情 / 开发信息</summary>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {detailRows.map(([field, meta]) => <div key={field} className="rounded-xl bg-white p-3"><div className="flex items-center justify-between gap-2"><code className="truncate text-[10px] text-[#5d5d65]">{field}</code><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] ${meta.source === "mock" || meta.source === "unavailable" ? "bg-[#fff1df] text-[#9a5d16]" : "bg-[#ecffe1] text-[#477329]"}`}>{sourceLabel(meta.source)}</span></div><p className="mt-2 text-[10px] text-[#85858d]">{meta.capability}{meta.note ? ` · ${meta.note}` : ""}</p></div>)}
          </div>
          {analysis.warnings.length > 0 && <div className="mt-3 rounded-xl bg-[#fff7e8] p-3 text-[10px] leading-5 text-[#8a641e]">{analysis.warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>}
          <pre className="mt-4 max-h-72 overflow-auto rounded-2xl bg-[#202024] p-4 text-[10px] leading-5 text-[#d8ff70]">{JSON.stringify({ referenceAnalysis: analysis, targetShot: target, identityRequirement: requirement }, null, 2)}</pre>
        </details>
      </div>
    </div>
  </Page>;
}

function CaptureReview({ capture, requirement, retake, continueFlow }: { capture: CaptureResult; requirement: IdentityRequirement; retake: () => void; continueFlow: () => void }) {
  return <Page><div className="mx-auto max-w-4xl"><span className="text-xs text-[#7655d6]">采集完成</span><h1 className="mt-2 text-[34px] font-bold">这些画面可以用</h1><p className="mt-2 text-sm text-[#757575]">已在本地从 {capture.candidates.length} 个候选画面中挑出最合适的 {capture.selectedFrames.length} 张。</p><div className={`mt-7 grid gap-3 ${capture.selectedFrames.length === 1 ? "mx-auto max-w-sm" : "grid-cols-2 sm:grid-cols-3"}`}>{capture.selectedFrames.map((frame, index) => <div key={frame.id} className="overflow-hidden rounded-[24px] bg-white"><div className="relative aspect-[3/4]"><img src={frame.dataUrl} alt={`关键帧 ${index + 1}`} className="h-full w-full object-cover"/><span className="absolute left-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-[10px]">{frame.instructionId}</span><span className="absolute bottom-3 right-3 rounded-full bg-[#d8ff70] px-2.5 py-1 text-[10px] font-medium">质量 {frame.quality.score}</span></div><div className="grid grid-cols-2 gap-1 p-3 text-[11px] text-[#77777e]"><span>亮度 {frame.quality.brightness.value ?? "—"}</span><span>清晰度 {frame.quality.sharpness.value ?? "—"}</span><span>姿态 {frame.quality.poseMatch.value ?? "—"}</span><span>可见度 {frame.quality.confidence.value ?? "—"}</span></div></div>)}</div>{capture.fullBodyImage && <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-3"><img src={capture.fullBodyImage} alt="全身参考" className="h-16 w-12 rounded-lg object-cover"/><div><b className="text-sm">全身参考已加入</b><p className="mt-1 text-xs text-[#77777e]">只在本次生成中使用</p></div><IconCheck size={18} className="ml-auto text-[#7655d6]"/></div>}<details className="mt-4 rounded-2xl bg-white/65 p-4 text-xs"><summary className="cursor-pointer">质量检测详情</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><span>亮度：真实 Canvas 像素统计</span><span>清晰度：真实局部边缘估计</span><span>人脸数量/大小：{capture.detector === "mediapipe" ? "MediaPipe Face Landmarker" : capture.detector === "browser-face-detector" ? "浏览器 FaceDetector" : "不可用"}</span><span>姿态/可见度：{capture.detector === "mediapipe" ? "MediaPipe 实时检测" : "不可用"}</span></div></details><div className="mt-6 flex gap-3"><button onClick={retake} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white py-4 text-sm"><IconRefresh size={17}/>重拍</button><button onClick={continueFlow} className="flex-[2] rounded-2xl bg-[#1d1d21] py-4 text-sm font-semibold text-white">继续生成</button></div><p className="mt-4 text-center text-[11px] text-[#8b8b91]">{modeLabels[requirement.mode]} · 不上传整段视频</p></div></Page>;
}

function Generating({ reference }: { reference?: Reference }) {
  return <Page><div className="grid min-h-[620px] place-items-center text-center"><div><div className="relative mx-auto"><ReferenceView reference={reference} className="h-[330px] w-[250px] rounded-[28px] opacity-70"/><span className="absolute inset-0 grid place-items-center"><span className="grid h-16 w-16 animate-pulse place-items-center rounded-full bg-white/85 shadow-xl"><IconSparkles className="text-[#7655d6]"/></span></span></div><h1 className="mt-6 text-2xl font-semibold">正在生成你的版本</h1><p className="mt-2 text-sm text-[#757575]">保留原镜头的场景、动作和氛围…</p><p className="mt-4 text-[11px] text-[#8b8b91]">当前 Generator Adapter 为 Mock</p></div></div></Page>;
}

function Result({ reference, resultImage, again, reset }: { reference?: Reference; resultImage?: string; again: () => void; reset: () => void }) {
  return <Page><h1 className="text-[34px] font-bold">这张，是你的版本</h1><p className="mt-2 text-[15px] text-[#757575]">原场景保留 · Shot 沿用 · 本次临时形象</p><div className="mt-5 grid gap-4 lg:grid-cols-2"><div><ReferenceView reference={reference} className="h-[500px] rounded-[26px]"/><p className="mt-2 text-sm">参考素材</p></div><div><div className="h-[500px] overflow-hidden rounded-[26px] bg-gradient-to-br from-[#e5b99c] to-[#465272]">{resultImage ? <img src={resultImage} alt="生成结果" className="h-full w-full object-cover saturate-75"/> : null}</div><div className="mt-2 flex items-center gap-2 text-sm">我的版本 <Pill>Mock 预览</Pill></div></div></div><div className="mt-6 flex flex-wrap items-center gap-2.5 text-[13px]"><button className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2"><IconDownload size={15}/>保存高清</button><button className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2"><IconShare3 size={15}/>分享对比图</button><button onClick={again} className="rounded-full bg-[#1a1a1f] px-3.5 py-2 text-white">再拍一次</button><button onClick={reset} className="ml-auto text-[#757575]">完成并清空本次素材</button></div><div className="mt-5 flex items-start gap-3 rounded-2xl bg-[#f4efff] p-4 text-xs text-[#6f6880]"><IconLock size={16} className="shrink-0"/>点击“完成并清空”会清除当前页面会话内的采集状态。Demo 不声称服务器永久删除。</div></Page>;
}

function Appearance({ back }: { back: () => void }) {
  return <Page><button onClick={back} className="text-sm text-[#707078]">← 返回当前流程</button><h1 className="mt-5 text-[34px] font-bold">我的形象</h1><p className="mt-2 text-[15px] text-[#757575]">可选的长期便利功能，不影响你使用一次性采集。</p><section className="mt-7 grid min-h-[480px] place-items-center rounded-[28px] bg-white px-6 text-center"><div><div className="mx-auto h-[88px] w-[88px] rounded-full bg-gradient-to-br from-[#9edcff] to-[#e2c4ff]"/><h2 className="mt-4 text-xl font-bold">还没有保存的形象</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#757575]">如果你经常使用，可以创建可复用形象；第一次体验完全不需要。</p><button className="mt-4 rounded-[14px] bg-[#1a1a1f] px-[22px] py-[13px] text-white">创建我的形象</button><button onClick={back} className="mt-3 block w-full text-sm text-[#7655d6]">继续使用本次临时采集</button></div></section></Page>;
}

function Page({ children }: { children: React.ReactNode }) { return <div className="mx-auto max-w-[1280px] px-4 pb-16 pt-5 sm:px-6 sm:pt-8 lg:px-0">{children}</div>; }
function Pill({ children }: { children: React.ReactNode }) { return <span className="rounded-full bg-[#f5f5f7] px-3.5 py-2 text-[12px]">{children}</span>; }
function ReferenceView({ reference, className }: { reference?: Reference; className: string }) { return <div className={`relative overflow-hidden bg-gradient-to-br ${reference?.colors || "from-[#e5b094] to-[#4d384d]"} ${className}`}>{reference?.source ? reference.mediaType === "video" ? <video src={reference.source} muted loop autoPlay playsInline className="h-full w-full object-cover"/> : <img src={reference.source} alt="参考素材" className="h-full w-full object-cover"/> : <><div className="absolute left-[36%] top-[27%] h-[59%] w-[25%] rounded-[70px] bg-[#241f29]/80"/><div className="absolute right-[8%] top-[10%] h-56 w-56 rounded-full bg-white/10"/></>}</div>; }
