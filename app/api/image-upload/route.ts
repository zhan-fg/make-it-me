import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api-security";

export const runtime = "nodejs";
export const maxDuration = 60;

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    const guard = guardApiRequest(request, "image-upload");
    if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "服务端尚未配置 Vercel Blob" }, { status: 503 });
    const contentType = request.headers.get("content-type")?.split(";")[0] || "";
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (!allowedTypes.has(contentType)) return NextResponse.json({ error: "仅支持 JPEG、PNG 或 WebP 图片" }, { status: 415 });
    if (!contentLength || contentLength > 2_100_000) return NextResponse.json({ error: "上传图片不能超过 2MB" }, { status: 413 });
    const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const blob = await put(`selfies/${crypto.randomUUID()}.${extension}`, request.body, { access: "private", addRandomSuffix: true, contentType });
    return NextResponse.json({ url: blob.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "自拍上传失败";
    console.error("portrait_selfie_upload_error", message);
    return NextResponse.json({ error: `自拍上传失败：${message}` }, { status: 500 });
  }
}

