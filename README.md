# Jev Game

Jev 中国象棋跨端项目，包含 Taro H5/微信小程序前端和 CloudBase HTTP 云函数。

## 目录

- `app/`：Taro React + TypeScript 前端。
- `api/`：`yijing-api` HTTP 云函数，通过公网路由 `/xq/api/move` 提供黑方 AI 下棋接口。

## 前端开发

```bash
cd app
pnpm install --frozen-lockfile
pnpm dev
```

构建：

```bash
pnpm build
pnpm build:weapp
```

H5 构建产物位于 `app/dist/h5/`，微信小程序构建产物位于 `app/dist/weapp/`。

前端默认 API 根地址为：

```text
https://liujitcn-d1glvo3kn8aad94c1-1256748449.ap-shanghai.app.tcloudbase.com/xq
```

需要覆盖时，在构建前设置完整根地址，末尾不要添加 `/`：

```bash
TARO_APP_API_ORIGIN=https://example.ap-shanghai.app.tcloudbase.com/xq pnpm build
```

## 云函数

1. 将 `api/` 目录中的内容上传到 CloudBase HTTP 云函数，云函数根目录应直接包含 `index.js`、`engine.js`、`rules.js`、`package.json` 和 `scf_bootstrap`。
2. HTTP 访问服务路由设置为 `/xq`，资源对象选择该云函数。
3. 路由已启用跨域时设置 `MANAGE_CORS=false`，避免重复 CORS 响应头。
4. 云函数执行超时设置为至少 `30` 秒，建议 `60` 秒。
5. 按 [api/README.md](api/README.md) 配置 Jev 环境变量并重新部署函数。

当前项目不包含访问统计或数据库依赖。公网接口为：

```text
POST https://liujitcn-d1glvo3kn8aad94c1-1256748449.ap-shanghai.app.tcloudbase.com/xq/api/move
```

部署云函数后，再重新构建并部署前端，确保两端同时使用 `/xq` 路由。
