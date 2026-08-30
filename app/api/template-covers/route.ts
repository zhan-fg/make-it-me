import { list } from "@vercel/blob";
import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function signedCoverUrl(request: Request, blobUrl: string, secret: string) {
  const expires = Date.now() + 60 * 60 * 1000;
  const signature = createHmac("sha256", secret).update(`${blobUrl}\n${expires}`).digest("hex");
  const url = new URL("/api/portrait-image", request.url);
  url.searchParams.set("url", blobUrl);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature);
  return url.toString();
}

export async function GET(request: Request) {
  const signingSecret = process.env.GEMINI_API_KEY;
  if (!signingSecret) return NextResponse.json({ covers: {} });
  try {
    const result = await list({ prefix: "template-published/", limit: 1000 });
    const latest = new Map<string, (typeof result.blobs)[number]>();
    for (const blob of result.blobs) {
      const templateId = blob.pathname.split("/")[1];
      if (!templateId) continue;
      const current = latest.get(templateId);
      if (!current || blob.uploadedAt > current.uploadedAt) latest.set(templateId, blob);
    }
    const covers = Object.fromEntries([...latest].map(([templateId, blob]) => [templateId, signedCoverUrl(request, blob.url, signingSecret)]));
    return NextResponse.json({ covers }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("template_cover_list_error", error instanceof Error ? error.message : error);
    return NextResponse.json({ covers: {} });
  }
}
