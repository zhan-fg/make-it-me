type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function guardApiRequest(request: Request, scope: "analyze" | "generate") {
  const configuredCode = process.env.APP_ACCESS_CODE;
  if (!configuredCode) return { error: "服务端尚未配置 APP_ACCESS_CODE", status: 503 };
  if (request.headers.get("x-app-access-code") !== configuredCode) return { error: "体验访问码不正确", status: 401 };

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 8_000_000) return { error: "图片总大小超过限制，请压缩后重试", status: 413 };

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const limit = scope === "generate" ? 3 : 12;
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
