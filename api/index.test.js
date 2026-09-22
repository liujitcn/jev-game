const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { createServer } = require('./index');
const { key, legal, replay } = require('./rules');

function postJson(origin, path, body) {
  const url = new URL(path, origin);
  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.on('error', reject);
    request.end(JSON.stringify(body));
  });
}

test('move 接口只把搜索后的黑方候选交给 Jev', async t => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.JEV_API_KEY;
  process.env.JEV_API_KEY = 'test-key';
  let jevRequest;
  global.fetch = async (_url, options) => {
    jevRequest = JSON.parse(options.body);
    const choice = Object.keys(jevRequest.questions.move.criteria)[0];
    return { ok: true, json: async () => ({ answers: { move: { choice } } }) };
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.JEV_API_KEY;
    else process.env.JEV_API_KEY = originalApiKey;
  });

  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = server.address();
  const response = await postJson(`http://127.0.0.1:${address.port}`, '/xq/api/move', {
    history: [{ from: 54, to: 45 }],
    mode: 'deep'
  });

  assert.equal(response.statusCode, 200);
  const criteria = Object.keys(jevRequest.questions.move.criteria);
  assert.ok(criteria.length > 0 && criteria.length <= 6);
  assert.match(jevRequest.questions.move.instructions, /三层搜索和强制交换延伸/);
  const events = response.body.trim().split('\n').map(line => JSON.parse(line));
  const result = events.find(event => event.type === 'result').data;
  const state = replay([{ from: 54, to: 45 }]);
  assert.ok(legal(state.board, 'b').some(move => key(move) === key(result.move)));
  assert.deepEqual(result.search, { depth: 3, shortlisted: criteria.length });
});
