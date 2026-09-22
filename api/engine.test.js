const assert = require('node:assert/strict');
const test = require('node:test');
const { analyze } = require('./engine');
const { apply, initial, key, legal } = require('./rules');

test('红方落子后只筛选黑方合法候选', () => {
  const board = apply(initial(), { from: 54, to: 45 });
  const result = analyze(board, 'fast');
  const legalKeys = new Set(legal(board, 'b').map(key));
  assert.equal(result.depth, 2);
  assert.ok(result.candidates.length > 0 && result.candidates.length <= 6);
  assert.ok(result.candidates.every(candidate => legalKeys.has(key(candidate.move))));
});

test('深思模式增加搜索深度', () => {
  const board = apply(initial(), { from: 54, to: 45 });
  assert.equal(analyze(board, 'deep').depth, 3);
});

test('搜索优先选择没有立即代价的高价值吃子', () => {
  const board = Array(90).fill(null);
  board[4] = 'bK';
  board[49] = 'bP';
  board[0] = 'bR';
  board[9] = 'rR';
  board[85] = 'rK';
  const result = analyze(board, 'fast');
  assert.deepEqual(result.candidates[0].move, { from: 0, to: 9 });
});
