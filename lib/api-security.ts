type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function guardApiRequest(request: Request, scope: "analyze" | "generate" | "portrait-generate") {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 8_000_000) return { error: "图片总大小超过限制，请压缩后重试", status: 413 };

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const limit = scope === "analyze" ? 12 : 3;
  const windowMs = 10 * 60 * 1000;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (bucket.count >= limit) return { error: "请求过于频繁，请十分钟后再试", status: 429 };
  bucket.count += 1;
  return null;
}

