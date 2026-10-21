import {
    engineInit, setCanvasClearColor, rgb, vec2, WHITE,
    keyWasPressed, mouseWasPressed, mousePosScreen, isTouchDevice,
    mainCanvasSize, timeDelta, time,
    setCameraScale, setCameraPos,
    drawRect, drawText, drawTextScreen,
} from 'littlejsengine';
// ZIGZAG FIREFIGHTER - LittleJS prototype
const COLS = 18, ROWS = 14;
const ACCEL = 45;          // tiles/s^2 pushing the player
const DRAG = 0.14;         // air resistance (quadratic): top speed = sqrt(ACCEL/DRAG) ~ 18 tiles/s
const VIEW_TILES = 4.5;     // how many tiles fit on the shorter screen side (smaller = closer camera)
const CAM_SMOOTH = 7;      // camera follow speed
const CAM_LAG_MAX = 1.2;   // camera can trail the player by at most this many tiles
const TIME_LIMIT = 60;     // seconds

// ---------- hand-made map (from the sketch) ----------
// Written with row 0 at the TOP and col 0 at the left; converted to y-up below.
// Floor rectangles: [col0, col1, row0, row1] inclusive. Everything else is wall.
const FLOORS = [
    [1, 9, 8, 8],     // spawn corridor
    [10, 10, 5, 12],  // vertical connector (Tut 1)
    [5, 14, 5, 5],    // upper corridor (Tut 2)
    [15, 15, 1, 9],   // right-hand shaft (P2)
    [3, 9, 12, 12],   // bottom corridor (P1)
];
const flipY = (r) => ROWS - 1 - r;
const SPAWN = {x: 1, y: flipY(8)};
const PEOPLE_DEF = [{x: 3, y: flipY(12)}, {x: 15, y: flipY(8)}];   // P1, P2
const PEOPLE_COUNT = PEOPLE_DEF.length;

let grid, wallEdge, people, player, timeLeft, state, rescued;
let cam = {x: 0, y: 0};

const solid = (x, y) => x < 0 || y < 0 || x >= COLS || y >= ROWS || grid[y][x];

// input is -1 / +1. On floor/ceiling (H) it is LEFT / RIGHT; on a side wall (L / R) it is DOWN / UP.
function dirFor(mode, input) {
    if (mode === 'H') return {dx: input, dy: 0};
    return {dx: 0, dy: input};
}
const modeAfterHit = (dx) => dx < 0 ? 'L' : dx > 0 ? 'R' : 'H';

function buildMap() {
    grid = Array.from({length: ROWS}, () => Array(COLS).fill(true));
    for (const [c0, c1, r0, r1] of FLOORS)
        for (let r = r0; r <= r1; r++)
            for (let c = c0; c <= c1; c++) grid[flipY(r)][c] = false;
    // only walls touching a floor tile are drawn white; solid rock stays black
    wallEdge = grid.map((row, y) => row.map((w, x) => {
        if (!w) return false;
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
                if (!solid(x + dx, y + dy)) return true;
        return false;
    }));
    return PEOPLE_DEF.map(p => ({x: p.x, y: p.y, saved: false}));
}

function newGame() {
    people = buildMap();
    rescued = 0;
    timeLeft = TIME_LIMIT;
    state = 'play';
    teleport();
    snapCamera();
}

function teleport() {
    player = {x: SPAWN.x, y: SPAWN.y, mode: 'H', moving: false, dx: 0, dy: 0, v: 0, stopX: SPAWN.x, stopY: SPAWN.y};
}

function launch(input) {
    if (player.moving) return;
    const {dx, dy} = dirFor(player.mode, input);
    player.dx = dx; player.dy = dy;
    // find where the slide will end (last free tile before a wall)
    let x = Math.round(player.x), y = Math.round(player.y);
    while (!solid(x + dx, y + dy)) { x += dx; y += dy; }
    if (x === Math.round(player.x) && y === Math.round(player.y)) return;   // blocked: nothing happens (dead end)
    player.stopX = x; player.stopY = y;
    player.moving = true; player.v = 0;
}

function checkPeople() {
    const tx = Math.round(player.x), ty = Math.round(player.y);
    for (const p of people)
        if (!p.saved && p.x === tx && p.y === ty) { p.saved = true; rescued++; }
    if (rescued === PEOPLE_COUNT) state = 'win';
}

function updatePlayer() {
    if (!player.moving) return;
    // acceleration minus air resistance
    player.v += (ACCEL - DRAG * player.v * player.v) * timeDelta;
    const remaining = Math.abs(player.stopX - player.x) + Math.abs(player.stopY - player.y);
    const step = player.v * timeDelta;
    if (step >= remaining) {
        player.x = player.stopX; player.y = player.stopY;
        player.moving = false; player.v = 0;
        player.mode = modeAfterHit(player.dx);   // wall hit: remap controls
    } else {
        player.x += player.dx * step; player.y += player.dy * step;
    }
    checkPeople();
}

// ---------- camera ----------
function viewScale() { return Math.min(mainCanvasSize.x, mainCanvasSize.y) / VIEW_TILES; }

function clampCamera() {
    const s = viewScale();
    const hw = mainCanvasSize.x / s / 2, hh = mainCanvasSize.y / s / 2;
    const minX = -0.5 + hw, maxX = COLS - 0.5 - hw, minY = -0.5 + hh, maxY = ROWS - 0.5 - hh;
    cam.x = minX > maxX ? (COLS - 1) / 2 : Math.min(maxX, Math.max(minX, cam.x));
    cam.y = minY > maxY ? (ROWS - 1) / 2 : Math.min(maxY, Math.max(minY, cam.y));
}

function snapCamera() { cam.x = player.x; cam.y = player.y; applyCamera(); }

function applyCamera() {
    setCameraScale(viewScale());
    clampCamera();
    setCameraPos(vec2(cam.x, cam.y));
}

function updateCamera() {
    // smooth follow, but never trail more than CAM_LAG_MAX tiles behind the player
    const k = 1 - Math.exp(-CAM_SMOOTH * timeDelta);
    cam.x += (player.x - cam.x) * k;
    cam.y += (player.y - cam.y) * k;
    cam.x = Math.min(player.x + CAM_LAG_MAX, Math.max(player.x - CAM_LAG_MAX, cam.x));
    cam.y = Math.min(player.y + CAM_LAG_MAX, Math.max(player.y - CAM_LAG_MAX, cam.y));
    applyCamera();
}

// ---------- LittleJS callbacks ----------
function gameInit() {
    setCanvasClearColor(rgb(0, 0, 0));
    // don't depend on the page's CSS: black background, no scrollbars, no margins
    for (const el of [document.documentElement, document.body]) {
        el.style.background = '#000'; el.style.margin = '0'; el.style.overflow = 'hidden';
    }
    newGame();
}

function gameUpdate() {
    const tap = isTouchDevice && mouseWasPressed(0);
    const sideMode = player.mode !== 'H';
    // tap: left/right half on floor/ceiling, bottom/top half on a side wall
    const tapNeg = tap && (sideMode ? mousePosScreen.y >= mainCanvasSize.y / 2 : mousePosScreen.x < mainCanvasSize.x / 2);
    const tapPos = tap && !tapNeg;

    const resetKey = keyWasPressed('KeyR') || keyWasPressed('ShiftLeft') || keyWasPressed('ShiftRight') || keyWasPressed('Space');
    if (state !== 'play') {
        if (keyWasPressed('Enter') || resetKey || mouseWasPressed(0)) newGame();
        return;
    }
    timeLeft -= timeDelta;
    if (timeLeft <= 0) { timeLeft = 0; state = 'lose'; return; }

    if (sideMode) {
        if (keyWasPressed('ArrowDown') || keyWasPressed('KeyS') || tapNeg) launch(-1);
        if (keyWasPressed('ArrowUp') || keyWasPressed('KeyW') || tapPos) launch(1);
    } else {
        if (keyWasPressed('ArrowLeft') || keyWasPressed('KeyA') || tapNeg) launch(-1);
        if (keyWasPressed('ArrowRight') || keyWasPressed('KeyD') || tapPos) launch(1);
    }
    if (resetKey) teleport();
    updatePlayer();
}

function gameUpdatePost() { updateCamera(); }

function gameRender() {
    // solid black backdrop (white walls would vanish against a white page otherwise)
    drawRect(vec2((COLS - 1) / 2, (ROWS - 1) / 2), vec2(COLS + 60, ROWS + 60), rgb(0, 0, 0));
    const WALL = rgb(1, 1, 1), FLOOR = rgb(.1, .1, .1);
    for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
            if (grid[y][x]) { if (wallEdge[y][x]) drawRect(vec2(x, y), vec2(1), WALL); }
            else drawRect(vec2(x, y), vec2(.96), FLOOR);
        }
    const ink = rgb(1, .9, .4), outline = rgb(0, 0, 0);
    const note = (t, c, r, size = .3) => drawText(t, vec2(c, flipY(r)), size, ink, .06, outline, 'center');
    note('TUT 2', 2.3, 4.6, .4); note('hit a floor/ceiling,', 2.3, 5.4); note('then use ← →', 2.3, 5.9);
    note('TUT 1', 12.5, 7.6, .4); note('hit a side wall,', 12.5, 8.4); note('then use ↑ ↓', 12.5, 8.9);
    const pulse = .5 + Math.sin(time * 6) * .06;
    for (const p of people)
        if (!p.saved) drawRect(vec2(p.x, p.y), vec2(pulse), rgb(1, 0, 0));
    drawRect(vec2(player.x, player.y), vec2(.78), rgb(.2, .45, 1));
}

function isStuck() {
    if (player.moving) return false;
    return [-1, 1].every(i => { const d = dirFor(player.mode, i); return solid(Math.round(player.x) + d.dx, Math.round(player.y) + d.dy); });
}

function gameRenderPost() {
    const W = mainCanvasSize.x, H = mainCanvasSize.y;
    const fs = Math.max(14, Math.min(W / 28, 28));
    const hint = player.mode === 'H' ? '← LEFT   → RIGHT' : '↑ UP   ↓ DOWN';
    drawTextScreen(`Saved ${rescued}/${PEOPLE_COUNT}`, vec2(W * .15, fs * 1.3), fs, WHITE, 3);
    drawTextScreen(`Time ${Math.ceil(timeLeft)}`, vec2(W * .85, fs * 1.3), fs,
        timeLeft < 15 ? rgb(1, .3, .3) : WHITE, 3);
    drawTextScreen(hint, vec2(W / 2, H - fs * 1.3), fs, rgb(.5, .75, 1), 3);
    drawTextScreen('R = back to spawn', vec2(W / 2, H - fs * 2.6), fs * .7, rgb(.7, .7, .7), 3);
    if (state === 'play' && isStuck())
        drawTextScreen('STUCK! Press R', vec2(W / 2, H * .3), fs * 1.5, rgb(1, .75, .2), 5);
    if (state !== 'play') {
        drawTextScreen(state === 'win' ? 'EVERYONE RESCUED!' : "TIME'S UP", vec2(W / 2, H / 2 - fs), fs * 2,
            state === 'win' ? rgb(.4, 1, .5) : rgb(1, .3, .3), 6);
        drawTextScreen('Enter / R / tap to restart', vec2(W / 2, H / 2 + fs), fs, WHITE, 4);
    }
}

engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);
