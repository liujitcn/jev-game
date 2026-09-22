const http = require('node:http');
const { URL } = require('node:url');
const { analyze, candidateDescription } = require('./engine');
const { key, replay } = require('./rules');

const PORT = Number(process.env.PORT || 9000);
const MAX_BODY_BYTES = 1024 * 1024;
const MANAGE_CORS = process.env.MANAGE_CORS === 'true';
const ROUTE_PREFIX = `/${String(process.env.API_ROUTE_PREFIX || 'xq').replace(/^\/+|\/+$/g, '')}`;
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || 'http://localhost:10086')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
);


function setCors(req, res) {
  if (!MANAGE_CORS) return;
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function sendJson(req, res, statusCode, data, cookie) {
  setCors(req, res);
  if (cookie) res.setHeader('Set-Cookie', `${cookie}; Path=/; HttpOnly; SameSite=None; Secure`);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendError(req, res, statusCode, message) {
  sendJson(req, res, statusCode, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function writeLine(res, value) {
  res.write(`${JSON.stringify(value)}\n`);
}

function sendStreamError(req, res, message) {
  setCors(req, res);
  res.writeHead(502, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
  writeLine(res, { type: 'error', error: message });
  res.end();
}

async function requestJev(history, mode, res, req) {
  const baseUrl = process.env.JEV_API_BASE_URL || 'https://api.typesafe.ai';
  const apiKey = process.env.JEV_API_KEY;
  if (!apiKey) throw new Error('缺少 JEV_API_KEY');
  const path = process.env.JEV_API_PATH || '/v1/systemone';
  const model = process.env.JEV_MODEL || 'jev-latest';
  const target = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  const state = replay(history);
  const started = Date.now();
  setCors(req, res);
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' });
  writeLine(res, { type: 'progress', phase: 'search' });
  const analysis = analyze(state.board, mode);
  const candidates = analysis.candidates;
  if (!candidates.length) throw new Error('当前局面没有可用的黑方走法');
  const criteria = Object.fromEntries(candidates.map(candidate => [
    key(candidate.move), candidateDescription(state.board, candidate)
  ]));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.JEV_TIMEOUT_MS || 60000));
  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        state: {
          board: state.board,
          history,
          mode,
          turn: state.turn,
          boardFormat: '90 格棋盘，索引为行乘 9 加列，0 为黑方底线左侧'
        },
        model,
        questions: {
          move: {
            type: 'choice',
            instructions: mode === 'deep'
              ? '你是中国象棋棋手。候选着法已经过三层搜索和强制交换延伸，请重点比较将军、兑子、预计应手和后续攻防，只能从候选中选择。'
              : '你是中国象棋棋手。候选着法已经过两层搜索和强制交换延伸，请结合评分、吃子、将军和预计应手选择稳健着法，只能从候选中选择。',
            criteria
          }
        }
      })
    });
    if (!response.ok) throw new Error(`JEV 请求失败：HTTP ${response.status}`);
    const body = await response.json();
    const choice = body?.answers?.move?.choice;
    const selected = candidates.find(candidate => key(candidate.move) === choice);
    if (!selected) throw new Error('JEV 返回了不在候选列表中的走法');
    writeLine(res, {
      type: 'result',
      data: {
        move: selected.move,
        source: 'Jev',
        model,
        duration: Date.now() - started,
        search: { depth: analysis.depth, shortlisted: candidates.length },
        probabilities: body?.answers?.move?.probabilities || undefined
      }
    });
    res.end();
  } finally {
    clearTimeout(timer);
  }
}

async function handle(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname === ROUTE_PREFIX
    ? '/'
    : url.pathname.startsWith(`${ROUTE_PREFIX}/`) ? url.pathname.slice(ROUTE_PREFIX.length) : url.pathname;
  if (req.method === 'OPTIONS') {
    setCors(req, res);
    res.writeHead(204);
    res.end();
    return;
  }
  if (pathname === '/api/move' && req.method === 'POST') {
    const body = await readBody(req);
    if (!Array.isArray(body.history)) {
      sendError(req, res, 400, 'history 必须是数组');
      return;
    }
    let state;
    try {
      state = replay(body.history);
    } catch (error) {
      sendError(req, res, 400, error instanceof Error ? error.message : '棋谱不合法');
      return;
    }
    if (state.turn !== 'b' || state.result) {
      sendError(req, res, 400, '当前棋局不是等待黑方落子的状态');
      return;
    }
    try {
      await requestJev(body.history, body.mode === 'deep' ? 'deep' : 'fast', res, req);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'JEV 请求失败';
      if (!res.headersSent) sendStreamError(req, res, message);
      else {
        writeLine(res, { type: 'error', error: message });
        res.end();
      }
    }
    return;
  }
  sendError(req, res, 404, '接口不存在');
}

function createServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch(error => {
      if (!res.headersSent) sendError(req, res, 500, error instanceof Error ? error.message : '服务异常');
      else res.end();
    });
  });
}

if (require.main === module) createServer().listen(PORT, '0.0.0.0');

module.exports = { createServer, handle };
