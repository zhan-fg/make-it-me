import { get } from "@vercel/blob";
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const signingSecret = process.env.GEMINI_API_KEY;
  if (!signingSecret) return NextResponse.json({ error: "图片签名服务尚未配置" }, { status: 503 });
  const requestUrl = new URL(request.url);
  const blobUrl = requestUrl.searchParams.get("url") || "";
  const expires = requestUrl.searchParams.get("expires") || "";
  const signature = requestUrl.searchParams.get("signature") || "";
  if (!blobUrl || !expires || !signature || Number(expires) < Date.now()) return NextResponse.json({ error: "图片链接已失效" }, { status: 403 });
  const expected = createHmac("sha256", signingSecret).update(`${blobUrl}\n${expires}`).digest("hex");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return NextResponse.json({ error: "图片签名无效" }, { status: 403 });
  const url = new URL(blobUrl);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".private.blob.vercel-storage.com")) return NextResponse.json({ error: "图片地址无效" }, { status: 400 });
  const blob = await get(blobUrl, { access: "private" });
  if (!blob || blob.statusCode !== 200) return NextResponse.json({ error: "图片不存在" }, { status: 404 });
  return new Response(blob.stream, { headers: { "Content-Type": blob.blob.contentType || "image/png", "Cache-Control": "private, max-age=3600", "Content-Disposition": "inline" } });
}

