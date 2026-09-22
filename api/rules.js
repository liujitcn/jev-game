const names = {
  r: { K: '帅', A: '仕', E: '相', H: '马', R: '车', C: '炮', P: '兵' },
  b: { K: '将', A: '士', E: '象', H: '馬', R: '車', C: '砲', P: '卒' }
};

function side(piece) {
  return piece == null ? undefined : piece[0];
}

function opposite(current) {
  return current === 'r' ? 'b' : 'r';
}

function initial() {
  const board = Array(90).fill(null);
  const row = ['R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R'];
  row.forEach((piece, x) => {
    board[x] = `b${piece}`;
    board[81 + x] = `r${piece}`;
  });
  for (const x of [1, 7]) {
    board[18 + x] = 'bC';
    board[63 + x] = 'rC';
  }
  for (const x of [0, 2, 4, 6, 8]) {
    board[27 + x] = 'bP';
    board[54 + x] = 'rP';
  }
  return board;
}

function apply(board, move) {
  const next = board.slice();
  next[move.to] = next[move.from];
  next[move.from] = null;
  return next;
}

function pseudo(board, from, to) {
  if (from === to || !board[from] || side(board[from]) === side(board[to])) return false;
  const currentSide = side(board[from]);
  const piece = board[from][1];
  const x = from % 9;
  const y = Math.floor(from / 9);
  const u = to % 9;
  const v = Math.floor(to / 9);
  const dx = u - x;
  const dy = v - y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const palace = u >= 3 && u <= 5 && (currentSide === 'r' ? v >= 7 : v <= 2);
  let count = 0;
  if (dx === 0 || dy === 0) {
    const step = dx === 0 ? Math.sign(dy) * 9 : Math.sign(dx);
    for (let index = from + step; index !== to; index += step) {
      if (board[index]) count += 1;
    }
  }
  switch (piece) {
    case 'R': return (dx === 0 || dy === 0) && count === 0;
    case 'C': return (dx === 0 || dy === 0) && count === (board[to] ? 1 : 0);
    case 'H': return ax === 2 && ay === 1
      ? !board[from + Math.sign(dx)]
      : ax === 1 && ay === 2 ? !board[from + Math.sign(dy) * 9] : false;
    case 'E': return ax === 2 && ay === 2
      && (currentSide === 'r' ? v >= 5 : v <= 4)
      && !board[from + (dy / 2) * 9 + dx / 2];
    case 'A': return ax === 1 && ay === 1 && palace;
    case 'K': return (board[to]?.[1] === 'K' && dx === 0 && count === 0) || (ax + ay === 1 && palace);
    case 'P': return (dx === 0 && dy === (currentSide === 'r' ? -1 : 1))
      || (ay === 0 && ax === 1 && (currentSide === 'r' ? y <= 4 : y >= 5));
    default: return false;
  }
}

function check(board, currentSide) {
  const king = board.indexOf(`${currentSide}K`);
  return king < 0 || board.some((piece, index) => piece && side(piece) !== currentSide && pseudo(board, index, king));
}

function legal(board, currentSide) {
  const moves = [];
  board.forEach((piece, from) => {
    if (side(piece) !== currentSide) return;
    for (let to = 0; to < 90; to += 1) {
      const move = { from, to };
      if (pseudo(board, from, to) && !check(apply(board, move), currentSide)) moves.push(move);
    }
  });
  return moves;
}

function outcome(board, currentSide) {
  const moves = legal(board, currentSide);
  if (moves.length) return null;
  const winner = currentSide === 'r' ? '黑方胜' : '红方胜';
  return `${winner} · ${check(board, currentSide) ? '将死' : '死局'}`;
}

function key(move) {
  return `${move.from}-${move.to}`;
}

function replay(history) {
  let board = initial();
  let turn = 'r';
  let quiet = 0;
  const seen = new Map([[JSON.stringify(board) + turn, 1]]);
  let result = null;
  for (const move of history) {
    if (result || !Number.isInteger(move?.from) || !Number.isInteger(move?.to)
      || !legal(board, turn).some(item => key(item) === key(move))) {
      throw new Error('棋谱包含非法步骤');
    }
    quiet = board[move.to] ? 0 : quiet + 1;
    board = apply(board, move);
    turn = opposite(turn);
    const positionKey = JSON.stringify(board) + turn;
    seen.set(positionKey, (seen.get(positionKey) || 0) + 1);
    const terminal = outcome(board, turn);
    if (terminal) result = terminal;
    else if (seen.get(positionKey) >= 3) result = '三次重复局面 · 和棋';
    else if (quiet >= 120) result = '连续 120 步未吃子 · 和棋';
  }
  return { board, turn, result };
}

module.exports = { apply, check, initial, legal, key, names, outcome, replay, side };
