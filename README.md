# Make it me · 一键仿拍

一款移动优先的消费级 AI 仿拍产品。通过 OpenAI 多模态与图像编辑 API 实现：上传参考素材、AI 解析场景与 Shot、选择个人形象、生成仿拍以及结果对比。

## 本地运行

```bash
npm install
npm run dev
```

复制 `.env.example` 为 `.env.local`，并配置自定义的 `APP_ACCESS_CODE`。通过 `AI_PROVIDER=openai` 使用 OpenAI，或通过 `AI_PROVIDER=wanx` 使用通义千问视觉分析与通义万相图像编辑。对应配置 `OPENAI_API_KEY` 或 `DASHSCOPE_API_KEY`。用户在首页输入访问码后才能调用付费接口。部署到 Vercel 时应在项目环境变量中配置这些值，不能把密钥提交到仓库。

## 架构

- `app/`：Next.js App Router 页面与全局视觉样式
- `services/types.ts`：Analyzer / Generator 服务契约
- `app/api/analyze/`：服务端多模态场景与 Shot 分析
- `app/api/generate/`：服务端多参考图生成接口
- `services/api-adapters.ts`：浏览器端 API adapter
- `services/mock-adapters.ts`：离线 Mock adapter，可用于开发回退

当前版本已接入真实 AI API；暂不包含登录、支付、数据库或云端用户资产存储。

通义万相推荐配置业务空间专属 `DASHSCOPE_BASE_URL`，例如北京地域的 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1`。API Key、模型与域名必须属于同一地域。
