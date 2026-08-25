"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconAdjustmentsHorizontal, IconArrowLeft, IconArrowRight, IconCheck, IconChevronDown,
  IconDownload, IconInfoCircle, IconPhoto, IconPlus, IconRefresh,
  IconShare3, IconSparkles, IconUpload, IconVideo,
} from "@tabler/icons-react";
import { analyzerService, generatorService } from "@/services";
import type { AnalysisResult } from "@/services/types";
import { AppearanceManager, type Appearance } from "@/components/appearance-manager";

type Stage = "upload" | "analyzing" | "compose" | "generating" | "result";

const referenceImage = "https://images.unsplash.com/photo-1499046940600-0c73ea8b03de?auto=format&fit=crop&w=1400&q=90";
const defaultAppearances: Appearance[] = [
  { id: "soft", name: "日常的我", tag: "常用", image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=85" },
  { id: "city", name: "都市感", tag: "", image: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=500&q=85" },
  { id: "vacation", name: "度假妆", tag: "", image: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=500&q=85" },
];

export default function Home() {
  const [stage, setStage] = useState<Stage>("upload");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [appearance, setAppearance] = useState("soft");
  const [appearances, setAppearances] = useState<Appearance[]>(defaultAppearances);
  const [appearanceManager, setAppearanceManager] = useState(false);
  const [referenceSrc, setReferenceSrc] = useState(referenceImage);
  const [resultSrc, setResultSrc] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [intensity, setIntensity] = useState(86);
  const [toast, setToast] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const progress = useMemo(() => ({ upload: 1, analyzing: 1, compose: 2, generating: 3, result: 3 }[stage]), [stage]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("make-it-me-appearances");
      if (saved) setAppearances([...defaultAppearances, ...JSON.parse(saved)]);
      setAccessCode(window.sessionStorage.getItem("make-it-me-access-code") || "");
    } catch {}
  }, []);

  const persistAppearances = (next: Appearance[]) => {
    setAppearances(next);
    try {
      window.localStorage.setItem("make-it-me-appearances", JSON.stringify(next.filter((item) => item.id.startsWith("custom-"))));
    } catch {
      notify("图片过大，形象仅在本次访问中保留");
    }
  };

  const start = async (image = referenceSrc) => {
    setStage("analyzing");
    try {
      const result = await analyzerService.analyze(image);
      setAnalysis(result);
      setStage("compose");
    } catch (error) {
      setStage("upload");
      notify(error instanceof Error ? error.message : "图片解析失败");
    }
  };

  const handleReference = (file?: File) => {
    if (!file) return;
    if (!accessCode.trim()) { notify("请先输入体验访问码"); return; }
    window.sessionStorage.setItem("make-it-me-access-code", accessCode.trim());
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => { const image = String(reader.result); setReferenceSrc(image); void start(image); };
      reader.readAsDataURL(file);
      return;
    }
    setReferenceSrc(referenceImage);
    notify("当前真实 API 版本请先上传照片，视频解析即将支持");
  };

  const generate = async () => {
    setStage("generating");
    try {
      const selected = appearances.find((item) => item.id === appearance);
      if (!selected) throw new Error("请先选择我的形象");
      if (!selected.image.startsWith("data:image/")) throw new Error("预设形象仅供演示，请先在“我的形象”中上传本人照片");
      const result = await generatorService.generate({
        appearanceId: appearance,
        appearanceImage: selected.image,
        appearanceParts: selected.parts,
        referenceImage: referenceSrc,
        preserveScene: true,
        intensity,
      });
      setResultSrc(result.imageUrl);
      setStage("result");
    } catch (error) {
      setStage("compose");
      notify(error instanceof Error ? error.message : "生成失败，请稍后重试");
    }
  };

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#0b0b0c] selection:bg-lime-300 selection:text-black">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(203,255,90,.12),transparent_36%)]" />
      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 md:px-8">
        <button onClick={() => setStage("upload")} className="flex items-center gap-2.5 text-left">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#d8ff65] text-black"><IconSparkles size={19} stroke={2.4}/></span>
          <span><b className="block text-[15px] tracking-tight">Make it me</b><span className="block text-[10px] tracking-[.2em] text-white/35">一键仿拍</span></span>
        </button>
        <div className="hidden items-center gap-2 md:flex">
          {["上传参考", "定制仿拍", "查看结果"].map((label, index) => (
            <div key={label} className={`flex items-center gap-2 text-xs ${progress >= index + 1 ? "text-white" : "text-white/30"}`}>
              <span className={`grid h-6 w-6 place-items-center rounded-full border ${progress > index + 1 ? "border-lime-300 bg-lime-300 text-black" : progress === index + 1 ? "border-white" : "border-white/15"}`}>{progress > index + 1 ? <IconCheck size={13}/> : index + 1}</span>
              {label}{index < 2 && <span className="mx-2 h-px w-8 bg-white/10" />}
            </div>
          ))}
        </div>
        <button onClick={() => setAppearanceManager(true)} className="rounded-full border border-white/10 px-3.5 py-2 text-xs text-white/60 transition hover:bg-white/5">我的形象</button>
      </header>

      {(stage === "upload" || stage === "analyzing") && (
        <section className="relative z-10 mx-auto flex min-h-[calc(100vh-90px)] max-w-5xl flex-col items-center justify-center px-5 pb-16 text-center">
          {stage === "upload" ? <>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/5 px-3 py-1.5 text-[11px] text-lime-200"><span className="h-1.5 w-1.5 rounded-full bg-lime-300"/>你的灵感，主角换成你</div>
            <h1 className="max-w-3xl text-4xl font-medium leading-[1.05] tracking-[-.05em] sm:text-6xl md:text-7xl">喜欢这张？<br/><span className="text-white/35">换我来拍。</span></h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-white/45 md:text-base">上传一张照片或视频。AI 会读懂场景、镜头和动作，再用你的形象重新演绎。</p>
            <div className="mt-7 w-full max-w-xl text-left"><label className="ml-1 text-[10px] uppercase tracking-[.16em] text-white/30">体验访问码</label><input type="password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} placeholder="用于保护 API 额度" className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[.035] px-4 py-3 text-sm outline-none transition focus:border-lime-300/40"/></div>
            <input ref={fileRef} className="hidden" type="file" accept="image/*,video/*" onChange={(event) => handleReference(event.target.files?.[0])}/>
            <button onClick={() => fileRef.current?.click()} className="group relative mt-4 w-full max-w-xl overflow-hidden rounded-[28px] border border-dashed border-white/20 bg-white/[.035] p-10 transition hover:border-lime-300/50 hover:bg-lime-300/[.03] sm:p-14">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-black transition group-hover:scale-105"><IconUpload size={23}/></span>
              <b className="mt-5 block text-base">选择参考照片或视频</b>
              <span className="mt-2 block text-xs text-white/35">支持 JPG、PNG、WEBP、MP4 · 最大 50MB</span>
              <span className="mt-5 inline-flex items-center gap-1.5 text-[11px] text-white/30"><IconPhoto size={14}/> 照片 <span className="mx-1">·</span><IconVideo size={14}/> 短视频</span>
            </button>
            <div className="mt-5 flex items-center gap-2 text-[11px] text-white/25"><IconInfoCircle size={13}/> V1 演示模式：素材仅用于当前页面，不会上传</div>
          </> : <Analyzing image={referenceSrc} />}
        </section>
      )}

      {stage === "compose" && analysis && (
        <section className="relative z-10 mx-auto max-w-6xl px-5 pb-24 pt-5 md:px-8 md:pt-9">
          <div className="mb-7"><p className="text-xs uppercase tracking-[.2em] text-lime-200/70">Reference decoded</p><h1 className="mt-2 text-3xl font-medium tracking-[-.04em] md:text-4xl">已经读懂这张照片</h1><p className="mt-2 text-sm text-white/40">场景和镜头已就绪，现在选择你想成为的样子。</p></div>
          <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
            <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#141416]">
              <div className="relative aspect-[4/5] overflow-hidden sm:aspect-[5/4]"><img src={referenceSrc} alt="参考照片" className="h-full w-full object-cover"/><div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent"/><span className="absolute left-4 top-4 rounded-full bg-black/45 px-3 py-1.5 text-[10px] backdrop-blur-md">参考原图</span><div className="absolute bottom-5 left-5 right-5"><p className="text-xs text-white/55">AI 识别场景</p><h3 className="mt-1 text-xl">{analysis.scene.title}</h3><p className="mt-1 text-xs text-white/55">{analysis.scene.detail}</p></div></div>
              <div className="p-5"><div className="flex items-center justify-between"><div><b className="text-sm">原场景</b><p className="mt-1 text-xs text-white/35">默认保留光线、环境与氛围</p></div><span className="flex items-center gap-1.5 rounded-full bg-lime-300/10 px-2.5 py-1 text-[10px] text-lime-200"><IconCheck size={12}/> 已保留</span></div>
                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">{analysis.shot.map((item) => <div key={item.label} className="rounded-xl bg-white/[.035] p-3"><p className="text-[9px] uppercase tracking-wider text-white/25">{item.label}</p><p className="mt-1.5 text-[11px] text-white/75">{item.value}</p></div>)}</div>
              </div>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-[#141416] p-5 sm:p-6">
              <div className="flex items-center justify-between"><div><p className="text-xs text-white/35">User Appearance</p><h2 className="mt-1 text-xl font-medium">选择“我的形象”</h2></div><button onClick={() => setAppearanceManager(true)} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 hover:bg-white/5"><IconPlus size={17}/></button></div>
              <div className="no-scrollbar mt-5 flex gap-3 overflow-x-auto pb-1">{appearances.map((item) => <button key={item.id} onClick={() => setAppearance(item.id)} className={`min-w-[128px] overflow-hidden rounded-2xl border text-left transition ${appearance === item.id ? "border-lime-300 bg-lime-300/5" : "border-white/10 bg-white/[.025]"}`}><div className="relative aspect-[4/5]"><img src={item.image} alt={item.name} className="h-full w-full object-cover"/>{appearance === item.id && <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-lime-300 text-black"><IconCheck size={14}/></span>}</div><div className="p-3"><b className="text-xs">{item.name}</b>{item.tag && <span className="ml-2 text-[9px] text-lime-200">{item.tag}</span>}</div></button>)}</div>
              <div className="mt-5 grid grid-cols-5 gap-1.5">{["Identity", "Hair", "Makeup", "Outfit", "Accessories"].map((label, i) => <div key={label} className="rounded-lg bg-white/[.035] p-2 text-center"><span className={`mx-auto block h-1.5 w-1.5 rounded-full ${i < 4 ? "bg-lime-300" : "bg-white/20"}`}/><p className="mt-2 truncate text-[9px] text-white/40">{label}</p></div>)}</div>
              <button onClick={() => setAdvanced(!advanced)} className="mt-5 flex w-full items-center justify-between border-t border-white/10 pt-5 text-left"><span className="flex items-center gap-2 text-xs text-white/55"><IconAdjustmentsHorizontal size={16}/> 高级设置</span><IconChevronDown size={16} className={`transition ${advanced ? "rotate-180" : ""}`}/></button>
              {advanced && <div className="mt-4 rounded-2xl bg-white/[.035] p-4"><div className="flex justify-between text-xs"><span>镜头还原强度</span><span className="text-lime-200">{intensity}%</span></div><input aria-label="镜头还原强度" type="range" min="40" max="100" value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="mt-4 w-full accent-lime-300"/><div className="mt-3 flex justify-between text-[10px] text-white/25"><span>更多自由发挥</span><span>严格还原</span></div></div>}
              <div className="mt-6 rounded-2xl border border-lime-300/15 bg-lime-300/[.045] p-4"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-lime-300 text-black"><IconSparkles size={16}/></span><div><b className="text-sm">准备仿拍</b><p className="mt-1 text-xs leading-5 text-white/40">保留海边日落场景与侧身回望镜头，替换为「{appearances.find((item) => item.id === appearance)?.name}」。</p></div></div></div>
              <button onClick={generate} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#d8ff65] px-5 py-4 text-sm font-semibold text-black transition hover:bg-[#e5ff96]">换我来拍 <IconArrowRight size={17}/></button>
            </div>
          </div>
        </section>
      )}

      {stage === "generating" && <Generating image={referenceSrc} />}
      {stage === "result" && <Result reference={referenceSrc} result={resultSrc} onAgain={() => setStage("compose")} notify={notify}/>}
      <AppearanceManager open={appearanceManager} appearances={appearances} selectedId={appearance} onClose={() => setAppearanceManager(false)} onSelect={setAppearance} onCreate={(item) => { persistAppearances([...appearances, item]); setAppearance(item.id); }} onDelete={(id) => { const next = appearances.filter((item) => item.id !== id); persistAppearances(next); if (appearance === id) setAppearance("soft"); }}/>
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-white px-4 py-2.5 text-xs text-black shadow-2xl">{toast}</div>}
    </main>
  );
}

function Analyzing({ image }: { image: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setStep((value) => Math.min(value + 1, 4)), 370); return () => window.clearInterval(timer); }, []);
  const steps = ["读取画面语义", "分离人物与场景", "提取动作和机位", "匹配光线与构图", "完成解析"];
  return <div className="w-full max-w-md"><div className="relative mx-auto h-44 w-36 overflow-hidden rounded-[24px] shadow-2xl"><img src={image} alt="正在解析" className="h-full w-full object-cover opacity-70"/><div className="shimmer absolute inset-0 overflow-hidden"/></div><div className="breathe mx-auto -mt-4 grid h-12 w-12 place-items-center rounded-2xl bg-lime-300 text-black shadow-[0_0_40px_rgba(216,255,101,.4)]"><IconSparkles size={20}/></div><h2 className="mt-7 text-2xl font-medium tracking-tight">AI 正在读懂这张照片</h2><p className="mt-2 text-xs text-white/35">把复杂的视觉信息，变成可以复刻的拍摄方法</p><div className="mt-7 space-y-2 text-left">{steps.map((label, index) => <div key={label} className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs transition ${index <= step ? "bg-white/[.05] text-white" : "text-white/20"}`}><span className={`grid h-5 w-5 place-items-center rounded-full ${index < step ? "bg-lime-300 text-black" : index === step ? "border border-lime-300" : "border border-white/10"}`}>{index < step ? <IconCheck size={12}/> : index + 1}</span>{label}</div>)}</div></div>;
}

function Generating({ image }: { image: string }) {
  const [value, setValue] = useState(8);
  useEffect(() => { const timer = window.setInterval(() => setValue((current) => Math.min(94, current + Math.ceil(Math.random() * 7))), 280); return () => window.clearInterval(timer); }, []);
  return <section className="relative z-10 mx-auto flex min-h-[calc(100vh-90px)] max-w-3xl flex-col items-center justify-center px-5 pb-20 text-center"><div className="relative h-[360px] w-[270px] overflow-hidden rounded-[32px] border border-white/10 bg-white/5 sm:h-[440px] sm:w-[330px]"><img src={image} alt="正在生成" className="h-full w-full scale-110 object-cover opacity-30 blur-xl"/><div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/10"/><div className="absolute inset-0 grid place-items-center"><div className="breathe grid h-16 w-16 place-items-center rounded-3xl bg-lime-300 text-black"><IconSparkles size={25}/></div></div><div className="absolute bottom-0 left-0 h-1 bg-lime-300 transition-all duration-500" style={{width:`${value}%`}}/></div><p className="mt-7 text-xs uppercase tracking-[.2em] text-lime-200">Creating your shot · {value}%</p><h1 className="mt-3 text-3xl font-medium tracking-[-.04em]">正在让你走进画面</h1><p className="mt-3 text-sm text-white/35">重建场景光线 · 对齐人物姿态 · 融合你的形象</p></section>;
}

function Result({ reference, result, onAgain, notify }: { reference: string; result: string; onAgain: () => void; notify: (message: string) => void }) {
  const [compare, setCompare] = useState(58);
  return <section className="relative z-10 mx-auto max-w-6xl px-5 pb-20 pt-5 md:px-8 md:pt-9"><button onClick={onAgain} className="mb-5 flex items-center gap-2 text-xs text-white/45 hover:text-white"><IconArrowLeft size={15}/> 返回调整</button><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs uppercase tracking-[.2em] text-lime-200/70">Your remake is ready</p><h1 className="mt-2 text-3xl font-medium tracking-[-.04em] md:text-4xl">这次，主角是你。</h1></div><span className="w-fit rounded-full bg-lime-300/10 px-3 py-1.5 text-[10px] text-lime-200">AI 生成完成</span></div><div className="grid gap-5 lg:grid-cols-[1fr_300px]"><div className="relative aspect-[4/5] overflow-hidden rounded-[28px] border border-white/10 sm:aspect-[16/10]"><img src={result} alt="仿拍结果" className="absolute inset-0 h-full w-full object-cover"/><div className="absolute inset-y-0 left-0 overflow-hidden border-r border-white/80" style={{width:`${compare}%`}}><img src={reference} alt="参考原图" className="h-full max-w-none object-cover" style={{width:"min(1100px, calc(100vw - 40px))"}}/></div><div className="absolute left-0 top-0 h-full w-full"><input aria-label="原图和结果对比" className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" type="range" min="2" max="98" value={compare} onChange={(e)=>setCompare(Number(e.target.value))}/><div className="pointer-events-none absolute top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-black shadow-xl" style={{left:`${compare}%`}}><span className="text-xs">↔</span></div></div><span className="absolute left-4 top-4 rounded-full bg-black/45 px-3 py-1.5 text-[10px] backdrop-blur">原图</span><span className="absolute right-4 top-4 rounded-full bg-lime-300 px-3 py-1.5 text-[10px] text-black">我的版本</span></div><aside className="rounded-[28px] border border-white/10 bg-[#141416] p-5"><h2 className="text-lg font-medium">保存这次灵感</h2><p className="mt-2 text-xs leading-5 text-white/35">高清图片已准备好，也可以分享给朋友看看。</p><a href={result} download={`make-it-me-${Date.now()}.jpg`} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5 text-xs font-semibold text-black"><IconDownload size={16}/> 保存高清图</a><button onClick={async()=>{ if (navigator.share) await navigator.share({title:"Make it me",url:location.href}); else { await navigator.clipboard.writeText(location.href); notify("分享链接已复制"); } }} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-3.5 text-xs hover:bg-white/5"><IconShare3 size={16}/> 分享作品</button><div className="my-5 h-px bg-white/10"/><div className="space-y-3 text-xs"><div className="flex justify-between"><span className="text-white/35">场景</span><span>AI 已解析</span></div><div className="flex justify-between"><span className="text-white/35">形象</span><span>已融合</span></div><div className="flex justify-between"><span className="text-white/35">还原度</span><span className="text-lime-200">真实生成</span></div></div><button onClick={onAgain} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-lime-300/20 bg-lime-300/5 px-4 py-3.5 text-xs text-lime-100 hover:bg-lime-300/10"><IconRefresh size={16}/> 再仿一张</button></aside></div></section>;
}
