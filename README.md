# Make it me · 一键仿拍

一款移动优先的消费级 AI 仿拍产品 Demo。通过 Mock 流程演示：上传参考素材、AI 解析场景与 Shot、选择个人形象、生成仿拍以及结果对比。

## 本地运行

```bash
npm install
npm run dev
```

## 架构

- `app/`：Next.js App Router 页面与全局视觉样式
- `services/types.ts`：Analyzer / Generator 服务契约
- `services/mock-adapters.ts`：V1 Mock 实现
- `services/index.ts`：服务注入出口，后续可替换为真实 API adapter

当前版本不包含真实 AI API、登录、支付、数据库或用户资产存储。
