# Jev Game

Jev 中国象棋跨端项目，包含 Taro H5/微信小程序前端和 CloudBase HTTP 云函数。

## 目录

- `app/`：Taro React + TypeScript 前端。
- `api/`：`yijing-api` HTTP 云函数，提供 `/api/stats`、`/api/analytics` 和 `/api/move`。

## 前端开发

```bash
cd app
pnpm install
pnpm dev:h5
```

构建：

```bash
pnpm build:h5
pnpm build:weapp
```

## 云函数

将 `api/` 上传到 CloudBase HTTP 云函数，并配置 `JEV_API_BASE_URL`、`JEV_API_PATH`、`JEV_API_KEY`、`JEV_MODEL` 和 `ALLOWED_ORIGINS` 环境变量。
