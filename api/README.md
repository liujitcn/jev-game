# yijing-api

CloudBase Node.js HTTP 云函数上传包，运行端口为 `9000`。

## 环境变量

```text
JEV_API_BASE_URL=https://api.typesafe.ai
JEV_API_PATH=/v1/systemone
JEV_API_KEY=模型 API Key
JEV_MODEL=jev-latest
ALLOWED_ORIGINS=http://localhost:10086
```

Jev 使用 TypeSafe 的 System One Choice API，函数会把当前所有合法黑方走法作为候选项发送给 Jev，并读取 `answers.move.choice`。

当前统计使用函数内存，适合先验证接口。正式多实例运行前，应改为 CloudBase 数据库集合持久化统计数据。

## 接口

- `GET /api/stats`
- `POST /api/analytics`，body: `{ "kind": "visit" | "play" }`
- `POST /api/move`，body: `{ "history": [], "mode": "fast" | "deep" }`
