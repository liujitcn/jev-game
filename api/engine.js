const { apply, check, key, legal, names, side } = require('./rules');

const VALUES = { K: 100000, R: 900, C: 450, H: 400, E: 200, A: 200, P: 100 };
const MATE_SCORE = 1000000;
const SHORTLIST_SIZE = 6;

function positionalValue(piece, index) {
  const currentSide = side(piece);
  const type = piece[1];
  const row = Math.floor(index / 9);
  const column = index % 9;
  const center = 4 - Math.abs(4 - column);
  if (type === 'P') {
    const advance = currentSide === 'b' ? row : 9 - row;
    return advance * 12 + (advance >= 5 ? center * 5 : 0);
  }
  if (type === 'H' || type === 'C') return center * 5;
  if (type === 'R') return center * 2;
  return 0;
}

function evaluate(board) {
  let score = 0;
  board.forEach((piece, index) => {
    if (!piece) return;
    const value = VALUES[piece[1]] + positionalValue(piece, index);
    score += side(piece) === 'b' ? value : -value;
  });
  if (check(board, 'r')) score += 55;
  if (check(board, 'b')) score -= 55;
  return score;
}

function movePriority(board, move, currentSide) {
  const captured = board[move.to];
  const next = apply(board, move);
  let score = captured ? VALUES[captured[1]] * 10 - VALUES[board[move.from][1]] : 0;
  if (check(next, currentSide === 'b' ? 'r' : 'b')) score += 500;
  return score;
}

function orderedMoves(board, currentSide, limit) {
  return legal(board, currentSide)
    .map(move => ({ move, priority: movePriority(board, move, currentSide) }))
    .sort((left, right) => right.priority - left.priority)
    .slice(0, limit)
    .map(item => item.move);
}

function quiescence(board, currentSide, alpha, beta, branchLimit, remainingDepth, ply) {
  const standPat = evaluate(board);
  if (remainingDepth === 0) return { score: standPat, line: [] };
  const inCheck = check(board, currentSide);
  const ordered = orderedMoves(board, currentSide, branchLimit);
  if (inCheck && !ordered.length) {
    const score = currentSide === 'b' ? -MATE_SCORE + ply : MATE_SCORE - ply;
    return { score, line: [] };
  }
  const moves = ordered.filter(move => {
    if (inCheck || board[move.to]) return true;
    return check(apply(board, move), currentSide === 'b' ? 'r' : 'b');
  });
  if (!moves.length) return { score: standPat, line: [] };

  let best = { score: standPat, line: [] };
  for (const move of moves) {
    const result = quiescence(
      apply(board, move),
      currentSide === 'b' ? 'r' : 'b',
      alpha,
      beta,
      branchLimit,
      remainingDepth - 1,
      ply + 1
    );
    const better = currentSide === 'b' ? result.score > best.score : result.score < best.score;
    if (better) best = { score: result.score, line: [move, ...result.line] };
    if (currentSide === 'b') alpha = Math.max(alpha, best.score);
    else beta = Math.min(beta, best.score);
    if (beta <= alpha) break;
  }
  return best;
}

function search(board, currentSide, remainingDepth, alpha, beta, branchLimit, ply) {
  if (remainingDepth === 0) return quiescence(board, currentSide, alpha, beta, 8, 2, ply);
  const moves = orderedMoves(board, currentSide, branchLimit);
  if (!moves.length) {
    const score = currentSide === 'b' ? -MATE_SCORE + ply : MATE_SCORE - ply;
    return { score, line: [] };
  }

  let best = { score: currentSide === 'b' ? -Infinity : Infinity, line: [] };
  for (const move of moves) {
    const result = search(
      apply(board, move),
      currentSide === 'b' ? 'r' : 'b',
      remainingDepth - 1,
      alpha,
      beta,
      branchLimit,
      ply + 1
    );
    const better = currentSide === 'b' ? result.score > best.score : result.score < best.score;
    if (better) best = { score: result.score, line: [move, ...result.line] };
    if (currentSide === 'b') alpha = Math.max(alpha, best.score);
    else beta = Math.min(beta, best.score);
    if (beta <= alpha) break;
  }
  return best;
}

function square(index) {
  return `${Math.floor(index / 9)}行${index % 9}列`;
}

function describeMove(board, move) {
  const piece = board[move.from];
  const captured = board[move.to];
  const pieceName = names[side(piece)][piece[1]];
  const capturedName = captured ? names[side(captured)][captured[1]] : '';
  return `${pieceName}：${square(move.from)}到${square(move.to)}${captured ? `，吃${capturedName}` : ''}`;
}

function analyze(board, mode) {
  const depth = mode === 'deep' ? 3 : 2;
  const branchLimit = mode === 'deep' ? 14 : 12;
  const candidates = legal(board, 'b').map(move => {
    const next = apply(board, move);
    const result = search(next, 'r', depth - 1, -Infinity, Infinity, branchLimit, 1);
    return {
      move,
      score: result.score,
      reply: result.line[0],
      givesCheck: check(next, 'r'),
      captures: board[move.to] ? names.r[board[move.to][1]] : null
    };
  });
  candidates.sort((left, right) => right.score - left.score);
  return { depth, candidates: candidates.slice(0, SHORTLIST_SIZE) };
}

function candidateDescription(board, candidate) {
  const details = [describeMove(board, candidate.move), `搜索评分 ${candidate.score}`];
  if (candidate.givesCheck) details.push('形成将军');
  if (candidate.reply) {
    const next = apply(board, candidate.move);
    details.push(`预计红方最佳应手：${describeMove(next, candidate.reply)}`);
  }
  return details.join('；');
}

module.exports = { analyze, candidateDescription, evaluate, key };
