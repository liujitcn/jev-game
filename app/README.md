# 弈境 Taro 跨端版

使用 Taro 4、React 和 TypeScript 重构的平面中国象棋人机对战。共享一套棋规、对局控制器和界面状态，同时构建微信小程序和 H5。

## 开发

```bash
pnpm install
pnpm test
pnpm build          # dist/h5
pnpm build:weapp    # dist/weapp
```

H5 开发：

```bash
pnpm dev
```

微信小程序开发：

```bash
pnpm dev:weapp
```

然后将 `dist/weapp/` 导入微信开发者工具。AppID 在 `project.config.json` 中，正式使用前应替换为目标账号的 AppID。

## 目录

- `src/game/rules.ts`：中国象棋规则、将军检测、棋谱回放。
- `src/game/controller.ts`：人机对局状态、悔棋、重开和 AI 结果校验。
- `src/game/network.ts`：微信 `Taro.request` 与浏览器 `fetch` 的网络适配，复用现有 CloudBase HTTPS API。
- `src/pages/index/`：平面棋盘、棋子、落子标记和跨端交互布局。
- `static/`：棋盘和棋子纹理；构建时分别复制到 `dist/h5/static/assets/` 和 `dist/weapp/static/assets/`。

## API 与 H5 注意事项

默认 API 根地址包含 CloudBase HTTP 路由 `/xq`：

```text
https://liujitcn-d1glvo3kn8aad94c1-1256748449.ap-shanghai.app.tcloudbase.com/xq
```

可通过 `TARO_APP_API_ORIGIN` 覆盖，值末尾不要添加 `/`，网络层会继续拼接 `/api/move`：

```bash
TARO_APP_API_ORIGIN=https://example.ap-shanghai.app.tcloudbase.com/xq pnpm build
```

H5 使用 `fetch` 读取 NDJSON 流式响应，CloudBase `/xq` 路由需要启用当前 H5 来源的跨域访问。微信小程序仍需在后台配置该 CloudBase 域名为 request 合法域名。

客户端不包含模型、数据库或 CloudBase 管理密钥。
