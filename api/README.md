# yijing-api

CloudBase Node.js HTTP 云函数上传包，运行端口为 `9000`，仅提供 Jev 中国象棋走法服务。

## 环境变量

```text
JEV_API_BASE_URL=https://api.typesafe.ai
JEV_API_PATH=/v1/systemone
JEV_API_KEY=模型 API Key
JEV_MODEL=jev-latest
JEV_TIMEOUT_MS=60000
MANAGE_CORS=false
ALLOWED_ORIGINS=http://localhost:10086
```

CloudBase HTTP 访问服务已启用跨域时保持 `MANAGE_CORS=false`，避免网关和应用重复生成 `Access-Control-Allow-Origin`。只有本地直接运行 API 且没有网关处理跨域时才设置 `MANAGE_CORS=true`，并通过 `ALLOWED_ORIGINS` 配置允许来源。

CloudBase HTTP 云函数的执行超时必须在控制台设置为至少 `30` 秒；`JEV_TIMEOUT_MS` 只控制对模型服务的请求，不能替代云函数自身的执行超时配置。

服务端先对黑方合法着法执行本地 alpha-beta 搜索：快速模式搜索 2 层，深思模式搜索 3 层，并继续延伸强制吃子和将军序列，降低短线交换误判。排名前 6 的候选会附带中文棋子、坐标、吃子信息和预计应手，再交给 TypeSafe System One Choice API 的 `JEV_MODEL`（默认 `jev-latest`）做最终选择。服务端只接受候选列表中的返回值。

本地验证：

```bash
npm test
```

## CloudBase 部署

上传 `api/` 目录中的内容，云函数根目录应直接看到：

```text
index.js
engine.js
rules.js
package.json
scf_bootstrap
```

不需要上传 `node_modules`。HTTP 访问服务配置：

```text
路由：/api/game
路径透传：开启
资源类型：云函数 HTTP
资源对象：当前云函数
跨域：开启
```

部署后可使用合法的红方首步验证：

```bash
curl -X POST \
  'https://liujitcn-d1glvo3kn8aad94c1-1256748449.ap-shanghai.app.tcloudbase.com/api/game/move' \
  -H 'Content-Type: application/json' \
  --data '{"history":[{"from":54,"to":45}],"mode":"fast"}'
```

## 接口

- 公网与云函数内部：`POST /api/game/move`
- body：`{ "history": [], "mode": "fast" | "deep" }`
