"use client";

import { useRef, useState } from "react";
import { IconCamera, IconCompass, IconDownload, IconShare3, IconSparkles } from "@tabler/icons-react";

type View = "discover" | "prepare" | "appearance" | "result";
const templates = [
  ["巴黎窗边咖啡", "自然侧光 · 半身坐姿", "照片", "from-[#ebb899] to-[#7a423d]"],
  ["东京便利店夜拍", "直闪 · 夜景 · 全身", "照片", "from-[#2e3866] to-[#c7576b]"],
  ["海边黄昏回头", "逆光 · 风感 · 电影感", "视频", "from-[#f5b080] to-[#6b94c2]"],
  ["酒店镜前自拍", "室内暖光 · 松弛感", "照片", "from-[#c2b2a6] to-[#574d52]"],
  ["街头跟拍转身", "移动镜头 · 自然动作", "视频", "from-[#526185] to-[#ba9e85]"],
];

export default function Home() {
  const [view, setView] = useState<View>("discover");
  const [reference, setReference] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const pick = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => { setReference(String(reader.result)); setView("prepare"); }; reader.readAsDataURL(file); };
  return <main className="min-h-screen bg-[#d9d9d9] text-[#1e1e1e]">
    <input ref={fileInput} className="hidden" type="file" accept="image/*,video/*" onChange={(event) => pick(event.target.files?.[0])} />
    <Header view={view} go={setView} />
    {view === "discover" && <Discover upload={() => fileInput.current?.click()} select={() => setView("prepare")} />}
    {view === "prepare" && <Prepare image={reference} create={() => setView("appearance")} generate={() => setView("result")} />}
    {view === "appearance" && <Appearance create={() => fileInput.current?.click()} />}
    {view === "result" && <Result image={reference} again={() => setView("prepare")} />}
  </main>;
}

function Header({ view, go }: { view: View; go: (view: View) => void }) {
  return <header className="mx-auto flex h-[82px] max-w-[1280px] items-center gap-7 px-5 lg:px-0"><button onClick={() => go("discover")} className="flex items-center gap-2.5"><span className="h-7 w-7 rounded-full bg-[#1a1a1f]" /><b className="text-lg">Make it me</b></button><div className="flex-1" /><nav className="flex items-center gap-7 text-sm"><button className={view === "discover" ? "font-medium" : "text-[#757575]"} onClick={() => go("discover")}>发现</button><button className={view === "result" ? "font-medium" : "text-[#757575]"} onClick={() => go("result")}>我的作品</button><button className={view === "appearance" ? "font-medium" : "text-[#757575]"} onClick={() => go("appearance")}>我的形象</button><span className="h-[34px] w-[34px] rounded-full bg-[#ddccff]" /></nav></header>;
}

function Discover({ upload, select }: { upload: () => void; select: () => void }) {
  return <div className="mx-auto max-w-[1280px] px-5 pb-16 lg:px-0"><section className="grid min-h-[250px] gap-8 pt-9 lg:grid-cols-[1.25fr_.95fr]"><div><h1 className="text-[46px] font-bold leading-[1.18] tracking-[-.04em]">看到喜欢的，<br />换你来拍。</h1><p className="mt-3 text-base text-[#757575]">从一张照片或一段视频出发，进入同一个场景，拍成你的版本。</p><div className="mt-5 flex gap-3"><button onClick={upload} className="rounded-[14px] bg-[#1a1a1f] px-[22px] py-[13px] text-[15px] text-white">＋ 选择参考照片或视频</button><button className="rounded-full bg-[#f5f5f7] px-4 py-2 text-[13px]">粘贴链接</button></div></div><div className="flex min-h-[200px] justify-between rounded-[28px] bg-gradient-to-r from-[#ebe0ff] to-[#d1e8ff] p-[22px]"><div><h2 className="max-w-[300px] text-2xl font-bold leading-[1.3]">把世界变成你的摄影棚<br />看到喜欢的照片或视频，换你来拍。</h2><div className="mt-3 flex gap-2.5">{[IconCamera, IconSparkles, IconCompass].map((Icon, i) => <span key={i} className="grid h-8 w-8 place-items-center rounded-2xl border border-white/80 bg-white/50"><Icon size={18} /></span>)}</div></div><div className="hidden h-[140px] w-[140px] rounded-[20px] bg-[linear-gradient(145deg,#d9c9bd,#88a8a1)] sm:block" /></div></section><div className="flex flex-wrap gap-2">{["为你推荐", "咖啡馆", "旅行感", "夜景", "街拍", "氛围视频"].map((x, i) => <button key={x} className={`rounded-full px-3.5 py-2 text-[13px] ${i ? "bg-[#f5f5f7]" : "bg-[#1a1a1f] text-white"}`}>{x}</button>)}</div><div className="flex h-[70px] items-center justify-between"><div><h2 className="text-2xl font-bold">热门模板</h2><p className="mt-1 text-sm text-[#757575]">先从大家都想拍的内容开始</p></div><button className="text-sm">查看全部 →</button></div><div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">{templates.map(([title, detail, type, colors]) => <button key={title} onClick={select} className="overflow-hidden rounded-[20px] border border-[#e5e5eb] bg-white text-left transition hover:-translate-y-1"><div className={`relative h-[258px] overflow-hidden bg-gradient-to-r ${colors}`}><span className="absolute left-3.5 top-3.5 rounded-full bg-white/85 px-2.5 py-1 text-[11px]">{type}</span><div className="absolute left-[31%] top-[28%] h-[64%] w-[30%] rounded-[38px] bg-[#241f29]/75" /><div className="absolute -right-6 top-8 h-44 w-44 rounded-full bg-white/20" /></div><div className="p-3.5"><b className="text-[15px] font-medium">{title}</b><p className="mt-1 text-xs text-[#757575]">{detail}</p></div></button>)}</div></div>;
}

function Prepare({ image, create, generate }: { image?: string; create: () => void; generate: () => void }) {
  return <PageTitle title="这张，换你来拍" subtitle="场景和拍摄方式已经识别好，你只需要选择自己的形象。"><div className="mt-7 grid gap-8 lg:grid-cols-[1.14fr_1fr]"><div><Scene image={image} className="h-[540px] rounded-[26px]" /><div className="mt-3 flex gap-2 text-[13px]"><Pill dark>原场景保留</Pill><Pill dark>原 Shot 沿用</Pill><Pill>照片</Pill></div></div><div className="space-y-[18px]"><div className="w-fit rounded-[20px] border border-[#e5e5eb] bg-white p-5"><b>我的形象</b><p className="mt-2 text-sm text-[#757575]">暂未创建形象资产</p><button onClick={create} className="mt-3 rounded-xl bg-[#f5f5f7] px-4 py-3 text-sm">＋ 创建我的形象</button></div><div className="w-fit min-w-[188px] rounded-[20px] bg-white p-5"><b>这次怎么拍</b><ul className="mt-3 space-y-3 text-sm">{["坐在窗边，身体微侧", "半身构图 · 平视机位", "右侧自然光", "自然看向镜头"].map(x => <li key={x} className="flex items-center gap-2"><span className="h-[7px] w-[7px] rounded-full bg-[#7655d6]" />{x}</li>)}</ul></div><button className="flex w-full justify-between rounded-2xl bg-[#f5f5f7] px-5 py-3.5 text-sm"><span>高级设置</span><span className="text-[#757575]">场景 / 动作 / 构图 / 表情 ›</span></button><button onClick={generate} className="h-[58px] w-full rounded-2xl bg-[#1a1a1f] text-[17px] font-bold text-white">✨ 换我来拍</button></div></div></PageTitle>;
}

function Appearance({ create }: { create: () => void }) {
  const hints = [["发型", "保存喜欢的发型"], ["妆容", "管理你的妆容 Look"], ["穿搭", "收藏或上传穿搭"], ["配饰", "眼镜、帽子与首饰"]];
  return <PageTitle title="我的形象" subtitle="这是你在所有照片和视频里的长期形象资产。"><section className="mt-7 grid min-h-[510px] place-items-center rounded-[28px] bg-white text-center"><div><div className="mx-auto h-[88px] w-[88px] rounded-full bg-gradient-to-br from-[#9edcff] to-[#e2c4ff]" /><h2 className="mt-4 text-xl font-bold">先创建一个属于你的 个人形象</h2><p className="mt-3 text-sm text-[#757575]">上传几张清晰照片。以后换发型、妆容、穿搭，都在这里管理。</p><button onClick={create} className="mt-4 rounded-[14px] bg-[#1a1a1f] px-[22px] py-[13px] text-white">＋ 创建我的形象</button></div></section><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{hints.map(([a,b]) => <div key={a} className="h-[130px] rounded-2xl bg-[#f5f5f7] p-[18px]"><b>{a}</b><p className="mt-2 text-[13px] text-[#757575]">{b}</p></div>)}</div></PageTitle>;
}

function Result({ image, again }: { image?: string; again: () => void }) {
  return <PageTitle title="这张，是你的版本" subtitle="原场景保留 · Shot 沿用 · 你的形象"><div className="mt-4 grid gap-[18px] lg:grid-cols-2"><div><Scene image={image} className="h-[540px] rounded-[26px]" /><p className="mt-2 text-sm">参考照片</p></div><div><Scene image={image} result className="h-[540px] rounded-[26px]" /><div className="mt-2 flex items-center gap-2 text-sm">我的版本 <Pill>融合自然 92%</Pill></div></div></div><div className="mt-6 flex flex-wrap items-center gap-2.5 text-[13px]"><button className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2"><IconDownload size={15} />保存高清</button><button className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2"><IconShare3 size={15} />分享对比图</button><button onClick={again} className="rounded-full bg-[#1a1a1f] px-3.5 py-2 text-white">再拍一张</button><span className="ml-auto text-[#757575]">不满意？ <button onClick={again}>重新生成</button></span></div></PageTitle>;
}

function PageTitle({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <div className="mx-auto max-w-[1280px] px-5 pb-16 pt-8 lg:px-0"><h1 className="text-[34px] font-bold">{title}</h1><p className="mt-2 text-[15px] text-[#757575]">{subtitle}</p>{children}</div>; }
function Pill({ children, dark }: { children: React.ReactNode; dark?: boolean }) { return <span className={`rounded-full px-3.5 py-2 text-[13px] ${dark ? "bg-[#1a1a1f] text-white" : "bg-[#f5f5f7]"}`}>{children}</span>; }
function Scene({ image, result, className }: { image?: string; result?: boolean; className: string }) { return <div className={`relative overflow-hidden bg-gradient-to-r ${result ? "from-[#e5b99c] to-[#465272]" : "from-[#e5b094] to-[#4d384d]"} ${className}`}>{image ? <img src={image} alt="参考内容" className={`h-full w-full object-cover ${result ? "hue-rotate-[8deg] saturate-75" : ""}`} /> : <><div className="absolute left-[37%] top-[27%] h-[59%] w-[23%] rounded-[70px] bg-[#241f29]/80" /><div className="absolute right-[8%] top-[10%] h-56 w-56 rounded-full bg-white/10" /></>}</div>; }

