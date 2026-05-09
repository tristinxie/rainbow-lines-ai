const GRID = 9;
const COLORS = ['red','blue','green','yellow','purple','cyan','orange'];
const MIN_LINE = 5;

let grid = [];       // 2D array: null or color string
let selected = null; // {r, c} or null
let score = 0;
let best = parseInt(localStorage.getItem('rainbowlinesai-best') || '0');
let nextColors = [];
let animating = false;

const boardEl = document.getElementById('board');
const scoreEl = document.getElementById('score');
const bestEl  = document.getElementById('best');
const msgEl   = document.getElementById('message');
const overlay = document.getElementById('overlay');

bestEl.textContent = best;

// ── DOM ──────────────────────────────────────────────────────────────

function buildBoard() {
  boardEl.innerHTML = '';
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.addEventListener('click', onCellClick);
      boardEl.appendChild(cell);
    }
  }
}

function cellEl(r, c) {
  return boardEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
}

function renderBall(r, c, animate = false) {
  const cell = cellEl(r, c);
  cell.innerHTML = '';
  const color = grid[r][c];
  if (color) {
    const ball = document.createElement('div');
    ball.className = `ball color-${color}`;
    if (animate) {
      ball.classList.add('appearing');
      ball.addEventListener('animationend', () => ball.classList.remove('appearing'), { once: true });
    }
    cell.appendChild(ball);
  }
}

function renderAll() {
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++)
      renderBall(r, c);
}

function updatePreview() {
  nextColors.forEach((col, i) => {
    const el = document.getElementById(`prev${i}`);
    el.className = `preview-ball color-${col}`;
  });
}

// ── Game logic ────────────────────────────────────────────────────────

function startGame() {
  stopAI();
  grid = Array.from({length: GRID}, () => Array(GRID).fill(null));
  score = 0;
  selected = null;
  animating = false;
  scoreEl.textContent = 0;
  msgEl.textContent = '';
  overlay.classList.remove('show');
  buildBoard();
  nextColors = randomColors();
  updatePreview();
  spawnBalls(3, true);
  nextColors = randomColors();
  updatePreview();
}

function randomColors() {
  return Array.from({length: 3}, () => COLORS[Math.floor(Math.random() * COLORS.length)]);
}

function emptyCells() {
  const cells = [];
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++)
      if (!grid[r][c]) cells.push({r, c});
  return cells;
}

function spawnBalls(count, initial = false) {
  const empty = emptyCells();
  if (!empty.length) return false;

  const colorsToPlace = nextColors.slice(0, Math.min(count, empty.length));
  // shuffle empty positions
  for (let i = empty.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [empty[i], empty[j]] = [empty[j], empty[i]];
  }

  colorsToPlace.forEach((col, i) => {
    const {r, c} = empty[i];
    grid[r][c] = col;
    renderBall(r, c, !initial);
  });

  return true;
}

// ── Pathfinding (BFS) ────────────────────────────────────────────────

function findPath(sr, sc, er, ec) {
  if (sr === er && sc === ec) return [];
  const visited = Array.from({length: GRID}, () => Array(GRID).fill(false));
  const prev    = Array.from({length: GRID}, () => Array(GRID).fill(null));
  const queue   = [{r: sr, c: sc}];
  visited[sr][sc] = true;

  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  while (queue.length) {
    const {r, c} = queue.shift();
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) continue;
      if (visited[nr][nc]) continue;
      if (grid[nr][nc] && !(nr === er && nc === ec)) continue;
      visited[nr][nc] = true;
      prev[nr][nc] = {r, c};
      if (nr === er && nc === ec) {
        // reconstruct
        const path = [];
        let cur = {r: nr, c: nc};
        while (cur.r !== sr || cur.c !== sc) {
          path.unshift(cur);
          cur = prev[cur.r][cur.c];
        }
        return path;
      }
      queue.push({r: nr, c: nc});
    }
  }
  return null;
}

// ── Line detection ───────────────────────────────────────────────────

function findLines(r, c) {
  const color = grid[r][c];
  const dirs = [[0,1],[1,0],[1,1],[1,-1]]; // horiz, vert, diag, anti-diag
  const toRemove = new Set();

  for (const [dr, dc] of dirs) {
    const line = [{r, c}];
    for (let s = 1; ; s++) {
      const nr = r + s*dr, nc = c + s*dc;
      if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID || grid[nr][nc] !== color) break;
      line.push({r: nr, c: nc});
    }
    for (let s = 1; ; s++) {
      const nr = r - s*dr, nc = c - s*dc;
      if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID || grid[nr][nc] !== color) break;
      line.push({r: nr, c: nc});
    }
    if (line.length >= MIN_LINE)
      line.forEach(p => toRemove.add(`${p.r},${p.c}`));
  }

  return [...toRemove].map(k => {
    const [pr, pc] = k.split(',').map(Number);
    return {r: pr, c: pc};
  });
}

// Scoring: more cells = bigger bonus
function calcScore(count) {
  return count * count * 2;
}

// ── Animation helpers ────────────────────────────────────────────────

// Color map for particle fill
const COLOR_MAP = {
  red: '#dd2222', blue: '#2255ee', green: '#22bb44',
  yellow: '#ddaa00', purple: '#9922cc', cyan: '#00aabb', orange: '#dd6600'
};

function animatePop(cells) {
  return new Promise(resolve => {
    // Collect ball info before hiding
    const particles = cells.map(({r, c}) => {
      const cell = cellEl(r, c);
      const ball = cell.querySelector('.ball');
      const rect = cell.getBoundingClientRect();
      const color = grid[r][c];
      if (ball) ball.classList.add('popping');
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, color };
    });

    // Full-screen canvas overlay
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:100';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // Spawn particles for each cell
    const PARTICLE_COUNT = 7;
    const allParticles = [];
    particles.forEach(({x, y, color}) => {
      const fill = COLOR_MAP[color] || '#ffffff';
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const angle = (Math.PI * 2 * i) / PARTICLE_COUNT + Math.random() * 0.5;
        const speed = 1 + Math.random() * 2;
        allParticles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: 2 + Math.random() * 2.5,
          alpha: 1,
          fill,
        });
      }
    });

    const duration = 420;
    const start = performance.now();

    function frame(now) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      allParticles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12; // gravity
        p.alpha = 1 - t;
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.fill;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1 - t * 0.5), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        canvas.remove();
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

function animateMove(path, color) {
  return new Promise(resolve => {
    if (!path.length) { resolve(); return; }
    // visually step through the path quickly
    let i = 0;
    const step = () => {
      if (i < path.length) {
        const {r, c} = path[i];
        const prev = i === 0 ? null : path[i-1];
        if (prev) {
          grid[prev.r][prev.c] = null;
          renderBall(prev.r, prev.c);
        }
        grid[r][c] = color;
        renderBall(r, c);
        i++;
        setTimeout(step, 28);
      } else {
        resolve();
      }
    };
    step();
  });
}

// ── Click handler ────────────────────────────────────────────────────

async function onCellClick(e) {
  if (animating) return;
  const r = parseInt(e.currentTarget.dataset.r);
  const c = parseInt(e.currentTarget.dataset.c);

  if (grid[r][c]) {
    if (selected && selected.r === r && selected.c === c) {
      // Clicking the active ball deselects it
      clearSelection();
      return;
    }
    clearSelection();
    selected = {r, c};
    cellEl(r, c).classList.add('selected');
    msgEl.textContent = '';
    return;
  }

  if (!selected) return;

  // Attempt move
  const {r: sr, c: sc} = selected;
  const color = grid[sr][sc];
  const path = findPath(sr, sc, r, c);

  if (!path) {
    msgEl.textContent = 'No path!';
    setTimeout(() => { msgEl.textContent = ''; }, 1200);
    return;
  }

  clearSelection();
  animating = true;

  // Move
  grid[sr][sc] = null;
  renderBall(sr, sc);
  await animateMove(path, color);

  // Check lines at destination
  const matched = findLines(r, c);
  let spawned = false;

  if (matched.length) {
    await animatePop(matched);
    matched.forEach(({r: mr, c: mc}) => {
      grid[mr][mc] = null;
      renderBall(mr, mc);
    });
    const pts = calcScore(matched.length);
    score += pts;
    scoreEl.textContent = score;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      localStorage.setItem('rainbowlinesai-best', best);
    }
    showMessage(`+${pts}`, 900);
    // Don't spawn new balls when lines cleared
  } else {
    // Spawn 3 new balls, then check lines for each
    const placed = placeNextBalls();
    spawned = true;
    // After spawn, check if any new ball completed a line
    let extraPts = 0;
    const spawnsToCheck = [...placed];
    for (const {r: nr, c: nc} of spawnsToCheck) {
      if (!grid[nr][nc]) continue;
      const m2 = findLines(nr, nc);
      if (m2.length) {
        await animatePop(m2);
        m2.forEach(({r: mr, c: mc}) => {
          grid[mr][mc] = null;
          renderBall(mr, mc);
        });
        extraPts += calcScore(m2.length);
      }
    }
    if (extraPts) {
      score += extraPts;
      scoreEl.textContent = score;
      showMessage(`+${extraPts}`, 900);
    }
  }

  animating = false;

  // Check game over
  if (emptyCells().length === 0) {
    document.getElementById('final-score').textContent = score;
    overlay.classList.add('show');
    return;
  }

  if (!spawned) {
    // Prepare next batch
    nextColors = randomColors();
    updatePreview();
  }
}

function placeNextBalls() {
  const empty = emptyCells();
  if (!empty.length) return [];
  for (let i = empty.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [empty[i], empty[j]] = [empty[j], empty[i]];
  }
  const toPlace = nextColors.slice(0, Math.min(3, empty.length));
  const placed = [];
  toPlace.forEach((col, i) => {
    const {r, c} = empty[i];
    grid[r][c] = col;
    renderBall(r, c, true);
    placed.push({r, c});
  });
  nextColors = randomColors();
  updatePreview();
  return placed;
}

function clearSelection() {
  if (selected) {
    cellEl(selected.r, selected.c).classList.remove('selected');
    selected = null;
  }
}

let msgTimer;
function showMessage(text, duration) {
  msgEl.textContent = text;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { msgEl.textContent = ''; }, duration);
}

document.getElementById('btn-new').addEventListener('click', () => {
  if (confirm('Start a new game? Current progress will be lost.')) startGame();
});

// ── AI ────────────────────────────────────────────────────────────────

let aiActive = false;
let aiTimer  = null;
let aiFast   = false;

function cloneGrid(g) {
  return g.map(row => row.slice());
}

function findPathOnGrid(g, sr, sc, er, ec) {
  if (sr === er && sc === ec) return [];
  const visited = Array.from({length: GRID}, () => Array(GRID).fill(false));
  const prev    = Array.from({length: GRID}, () => Array(GRID).fill(null));
  const queue   = [{r: sr, c: sc}];
  visited[sr][sc] = true;
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  while (queue.length) {
    const {r, c} = queue.shift();
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) continue;
      if (visited[nr][nc]) continue;
      if (g[nr][nc] && !(nr === er && nc === ec)) continue;
      visited[nr][nc] = true;
      prev[nr][nc] = {r, c};
      if (nr === er && nc === ec) {
        const path = [];
        let cur = {r: nr, c: nc};
        while (cur.r !== sr || cur.c !== sc) {
          path.unshift(cur);
          cur = prev[cur.r][cur.c];
        }
        return path;
      }
      queue.push({r: nr, c: nc});
    }
  }
  return null;
}

function findLinesOnGrid(g, r, c) {
  const color = g[r][c];
  if (!color) return [];
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  const toRemove = new Set();
  for (const [dr, dc] of dirs) {
    const line = [{r, c}];
    for (let s = 1; ; s++) {
      const nr = r + s*dr, nc = c + s*dc;
      if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID || g[nr][nc] !== color) break;
      line.push({r: nr, c: nc});
    }
    for (let s = 1; ; s++) {
      const nr = r - s*dr, nc = c - s*dc;
      if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID || g[nr][nc] !== color) break;
      line.push({r: nr, c: nc});
    }
    if (line.length >= MIN_LINE) line.forEach(p => toRemove.add(`${p.r},${p.c}`));
  }
  return [...toRemove].map(k => { const [pr,pc] = k.split(',').map(Number); return {r:pr,c:pc}; });
}

function evaluateGrid(g) {
  let score = 0, empty = 0;
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];

  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++)
      if (!g[r][c]) empty++;

  // Sliding 5-cell windows in 4 directions. Each window scores by potential
  // to form a 5-line: blocked (mixed colors) = 0, single-color with N balls
  // pays out per N. Directly measures progress toward the win condition.
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      for (const [dr, dc] of dirs) {
        const er = r + 4*dr, ec = c + 4*dc;
        if (er < 0 || er >= GRID || ec < 0 || ec >= GRID) continue;

        let color = null, count = 0, blocked = false;
        for (let i = 0; i < 5; i++) {
          const cell = g[r + i*dr][c + i*dc];
          if (!cell) continue;
          if (color === null) { color = cell; count = 1; }
          else if (cell === color) count++;
          else { blocked = true; break; }
        }
        if (blocked || count === 0) continue;

        if (count === 4) score += 200;
        else if (count === 3) score += 30;
        else if (count === 2) score += 5;
      }
    }
  }
  return score + empty * 3;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function monteCarloEval(g, colors, samples = 25) {
  const empties = [];
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++)
      if (!g[r][c]) empties.push({r, c});
  if (empties.length === 0) return evaluateGrid(g);

  let total = 0;
  for (let s = 0; s < samples; s++) {
    const clone = cloneGrid(g);
    const positions = shuffleArray(empties.slice()).slice(0, colors.length);
    positions.forEach(({r, c}, i) => { clone[r][c] = colors[i]; });

    // Simulate any line clears the spawn would trigger so we don't
    // overvalue boards where a random 5-line forms and stays "frozen"
    let clearBonus = 0;
    for (const {r, c} of positions) {
      if (!clone[r][c]) continue;
      const m = findLinesOnGrid(clone, r, c);
      if (m.length) {
        clearBonus += calcScore(m.length) * 5;
        m.forEach(({r: mr, c: mc}) => { clone[mr][mc] = null; });
      }
    }

    total += evaluateGrid(clone) + clearBonus;
  }
  return total / samples;
}

function findBestMove() {
  let bestScore = -Infinity;
  let bestMove  = null;

  for (let sr = 0; sr < GRID; sr++) {
    for (let sc = 0; sc < GRID; sc++) {
      if (!grid[sr][sc]) continue;
      const color = grid[sr][sc];

      for (let er = 0; er < GRID; er++) {
        for (let ec = 0; ec < GRID; ec++) {
          if (grid[er][ec]) continue;
          const path = findPath(sr, sc, er, ec);
          if (!path) continue;

          const sim = cloneGrid(grid);
          sim[sr][sc] = null;
          sim[er][ec] = color;

          const matched = findLinesOnGrid(sim, er, ec);
          let moveScore;

          if (matched.length) {
            // Scoring move: heavily preferred
            const afterClear = cloneGrid(sim);
            matched.forEach(({r, c}) => { afterClear[r][c] = null; });
            moveScore = 10000 + calcScore(matched.length) * 100 + evaluateGrid(afterClear);
          } else {
            // Non-scoring: use Monte Carlo to account for spawn impact
            moveScore = monteCarloEval(sim, nextColors);
          }

          // Prefer longer paths as tiebreaker (distributes balls more)
          if (moveScore > bestScore || (moveScore === bestScore && path.length > (bestMove?.path.length ?? 0))) {
            bestScore = moveScore;
            bestMove  = {sr, sc, er, ec, color, path};
          }
        }
      }
    }
  }
  return bestMove;
}

async function aiStep() {
  if (!aiActive || animating) return;

  const move = findBestMove();
  if (!move) { stopAI(); return; }

  const {sr, sc, er, ec, color, path} = move;
  clearSelection();
  animating = true;

  grid[sr][sc] = null;
  renderBall(sr, sc);
  await animateMove(path, color);

  const matched = findLines(er, ec);
  let spawned = false;

  if (matched.length) {
    await animatePop(matched);
    matched.forEach(({r, c}) => { grid[r][c] = null; renderBall(r, c); });
    const pts = calcScore(matched.length);
    score += pts;
    scoreEl.textContent = score;
    if (score > best) { best = score; bestEl.textContent = best; localStorage.setItem('rainbowlinesai-best', best); }
    showMessage(`+${pts}`, 700);
  } else {
    const placed = placeNextBalls();
    spawned = true;
    let extraPts = 0;
    for (const {r: nr, c: nc} of placed) {
      if (!grid[nr][nc]) continue;
      const m2 = findLines(nr, nc);
      if (m2.length) {
        await animatePop(m2);
        m2.forEach(({r, c}) => { grid[r][c] = null; renderBall(r, c); });
        extraPts += calcScore(m2.length);
      }
    }
    if (extraPts) {
      score += extraPts;
      scoreEl.textContent = score;
      if (score > best) { best = score; bestEl.textContent = best; localStorage.setItem('rainbowlinesai-best', best); }
      showMessage(`+${extraPts}`, 700);
    }
  }

  animating = false;

  if (emptyCells().length === 0) {
    document.getElementById('final-score').textContent = score;
    overlay.classList.add('show');
    stopAI();
    return;
  }

  if (!spawned) { nextColors = randomColors(); updatePreview(); }

  if (aiActive) aiTimer = setTimeout(aiStep, aiFast ? 0 : 380);
}

function startAI() {
  aiActive = true;
  const btn = document.getElementById('btn-ai');
  btn.textContent = 'Stop AI';
  btn.classList.add('active');
  clearSelection();
  aiStep();
}

function stopAI() {
  aiActive = false;
  clearTimeout(aiTimer);
  aiTimer = null;
  const btn = document.getElementById('btn-ai');
  if (btn) { btn.textContent = 'AI Play'; btn.classList.remove('active'); }
}

document.getElementById('btn-ai').addEventListener('click', () => {
  aiActive ? stopAI() : startAI();
});

document.getElementById('btn-speed').addEventListener('click', () => {
  aiFast = !aiFast;
  const btn = document.getElementById('btn-speed');
  btn.textContent = aiFast ? 'Fast Mode' : 'Fast Mode';
  btn.classList.toggle('active', aiFast);
});

// ── Init ──────────────────────────────────────────────────────────────
startGame();
