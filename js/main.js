// 부팅·게임 루프·입력 처리
import {
  MAP_W, MAP_H, MIN_PER_SEC, DAY_MIN, SPEED_MULT, BUILDS, PAWN_DEFS,
} from './config.js';
import {
  createWorld, mulberry32, idx, ix, iy, isWalkable, isBuildableAt,
  addItem, totalRes, dailyRegrowth,
} from './world.js';
import { createPawn, updatePawn } from './pawns.js';
import { createRenderer } from './render.js';
import { createUI } from './ui.js';
import { saveGame, loadSaveData, clearSave } from './save.js';

// ── 월드 준비 (저장본 있으면 복원) ──
var world, pawns;
var saved = loadSaveData();

if (saved) {
  world = createWorld(saved.seed);
  world.terrain = Uint8Array.from(saved.terrain);
  world.objects = saved.objects;
  world.built = saved.built;
  world.blueprints = saved.blueprints;
  world.items = saved.items;
  world.stockpile = saved.stockpile;
  world.designations = saved.designations;
  world.reserved = {};
  world.timeMin = saved.timeMin;
  world.day = saved.day;
  pawns = saved.pawns.map(function (p) {
    var pw = createPawn(p.id, { name: p.name, char: p.char }, p.x, p.y);
    pw.hunger = p.hunger; pw.energy = p.energy; pw.hp = p.hp;
    pw.carry = p.carry || null;
    if (p.dead) pw.state = 'dead';
    return pw;
  });
} else {
  world = createWorld((Math.random() * 1e9) | 0);
  var cx = MAP_W / 2, cy = MAP_H / 2;
  pawns = PAWN_DEFS.map(function (def, n) {
    return createPawn(n, def, cx - 1 + n, cy);
  });
}

var ambientRng = mulberry32(world.seed ^ 0x5eed);

// ── 렌더러·UI ──
var R = createRenderer(world);
var speed = 1;
var lastSpeed = 1;
var selectedPawn = null;

var UI = createUI({
  onToolChange: function () { R.showDrag(null); },
  onSpeed: setSpeed,
  onSave: function () {
    UI.toast(saveGame(world, pawns) ? '💾 저장되었습니다' : '⚠️ 저장 실패', false);
  },
  onLoad: function () {
    if (!loadSaveData()) { UI.toast('⚠️ 저장된 게임이 없습니다', true); return; }
    location.reload();
  },
  onNew: function () {
    if (!confirm('새 게임을 시작할까요? 저장본이 삭제됩니다.')) return;
    clearSave();
    location.reload();
  },
});

pawns.forEach(function (p) { R.addPawn(p); });

function setSpeed(s) {
  if (s === 0 && speed !== 0) lastSpeed = speed;
  speed = s;
  UI.setSpeedUI(s);
}

// ── 정착민 컨텍스트 콜백 ──
var starveToastCd = {};
var ctx = {
  rng: ambientRng,
  onWorldChange: function (i) { R.refreshTile(i); R.refreshZones(); },
  onItemChange: function (i) { R.refreshItem(i); },
  onDeath: function (pawn) {
    UI.toast('💀 ' + pawn.name + ' 이(가) 굶주림으로 사망했습니다...', true);
    R.updatePawnSprite(pawn);
  },
  onStarving: function (pawn) {
    var now = world.timeMin;
    if (!starveToastCd[pawn.id] || now - starveToastCd[pawn.id] > 240) {
      starveToastCd[pawn.id] = now;
      UI.toast('⚠️ ' + pawn.name + ' 이(가) 굶주리고 있습니다! 식량이 필요합니다', true);
    }
  },
  onWallBuilt: function (i) {
    // 벽이 완성된 칸에 서 있는 정착민을 인접 칸으로 밀어냄
    pawns.forEach(function (p) {
      if (p.x === ix(i) && p.y === iy(i)) {
        var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (var d = 0; d < 4; d++) {
          var nx = p.x + dirs[d][0], ny = p.y + dirs[d][1];
          if (isWalkable(world, nx, ny)) {
            p.x = nx; p.y = ny; p.px = nx; p.py = ny;
            p.path = null;
            break;
          }
        }
      }
    });
  },
};

// ── 도구 적용 ──
function forRect(a, b, fn) {
  var x0 = Math.max(0, Math.min(a.x, b.x)), x1 = Math.min(MAP_W - 1, Math.max(a.x, b.x));
  var y0 = Math.max(0, Math.min(a.y, b.y)), y1 = Math.min(MAP_H - 1, Math.max(a.y, b.y));
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) fn(idx(x, y), x, y);
  }
}

function applyTool(tool, a, b) {
  var count = 0;
  var res = totalRes(world);

  if (tool === 'chop' || tool === 'mine' || tool === 'forage') {
    var want = { chop: 'tree', mine: 'rock', forage: 'berry' }[tool];
    forRect(a, b, function (i) {
      var o = world.objects[i];
      if (!o) return;
      var kind = (o.kind === 'treeO' || o.kind === 'pine') ? 'tree' : o.kind;
      if (kind === want && !world.designations[i]) {
        world.designations[i] = tool;
        count++;
      }
    });
    if (count) UI.toast({ chop: '🪓 벌목', mine: '⛏️ 채굴', forage: '🧺 채집' }[tool] + ' ' + count + '건 지시');
  }

  else if (tool === 'cancel') {
    forRect(a, b, function (i) {
      if (world.designations[i]) { delete world.designations[i]; count++; }
      var bp = world.blueprints[i];
      if (bp) {
        for (var t in bp.delivered) {
          if (bp.delivered[t] > 0) addItem(world, i, t, bp.delivered[t]);
        }
        delete world.blueprints[i];
        R.refreshTile(i); R.refreshItem(i);
        count++;
      }
    });
    if (count) UI.toast('✖️ ' + count + '건 취소');
  }

  else if (tool === 'stockpile') {
    forRect(a, b, function (i, x, y) {
      if (!world.stockpile[i] && isWalkable(world, x, y) && !world.blueprints[i]) {
        world.stockpile[i] = true;
        count++;
      }
    });
    if (count) UI.toast('📦 비축 구역 ' + count + '칸 지정');
  }

  else if (tool === 'demolish') {
    forRect(a, b, function (i) {
      if (world.stockpile[i]) { delete world.stockpile[i]; count++; }
      var bd = world.built[i];
      if (bd) {
        var cost = BUILDS[bd.kind].cost;
        for (var t in cost) {
          var back = Math.floor(cost[t] / 2);
          if (back > 0) addItem(world, i, t, back);
        }
        delete world.built[i];
        R.refreshTile(i); R.refreshItem(i);
        count++;
      }
    });
    if (count) UI.toast('🔨 ' + count + '건 철거 (자재 일부 회수)');
  }

  else if (BUILDS[tool]) {
    // 침대는 1개씩만 배치
    if (tool === 'bed') { b = a; }
    var totalNeeded = {};
    forRect(a, b, function (i, x, y) {
      if (!isBuildableAt(world, i)) return;
      if (!isWalkable(world, x, y)) return;
      world.blueprints[i] = { kind: tool, delivered: {}, work: 0 };
      R.refreshTile(i);
      count++;
      var cost = BUILDS[tool].cost;
      for (var t in cost) totalNeeded[t] = (totalNeeded[t] || 0) + cost[t];
    });
    if (count) {
      var needStr = Object.keys(totalNeeded).map(function (t) {
        var name = { wood: '목재', stone: '석재' }[t] || t;
        var lack = totalNeeded[t] > (res[t] || 0) ? ' (부족!)' : '';
        return name + ' ' + totalNeeded[t] + lack;
      }).join(', ');
      UI.toast('📐 ' + BUILDS[tool].name + ' ' + count + '칸 설계 — ' + needStr);
    }
  }

  R.refreshZones();
}

// ── 입력 (마우스) ──
var canvas = R.app.view;
var panning = false;
var panStart = null;
var dragStart = null;   // 좌클릭 드래그 시작 타일

canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

canvas.addEventListener('mousedown', function (e) {
  if (e.button === 2 || e.button === 1) {
    panning = true;
    panStart = { mx: e.clientX, my: e.clientY, cx: R.cam.x, cy: R.cam.y };
    return;
  }
  if (e.button === 0) {
    var t = R.screenToTile(e.clientX, e.clientY);
    var tool = UI.getTool();
    if (tool === 'select') {
      // 클릭 지점 근처 정착민 선택
      var hit = null;
      pawns.forEach(function (p) {
        if (Math.abs(p.px - t.x) <= 1 && Math.abs(p.py - t.y) <= 1) {
          var d = Math.hypot(p.px + 0.5 - (t.x + 0.5), p.py + 0.5 - (t.y + 0.5));
          if (d < 0.9 && (!hit || d < hit.d)) hit = { p: p, d: d };
        }
      });
      selectedPawn = hit ? hit.p : null;
      R.setSelected(selectedPawn);
      if (selectedPawn) UI.showPawn(selectedPawn);
      else UI.hidePawn();
    } else {
      dragStart = t;
    }
  }
});

window.addEventListener('mousemove', function (e) {
  if (panning && panStart) {
    R.cam.x = panStart.cx + (e.clientX - panStart.mx);
    R.cam.y = panStart.cy + (e.clientY - panStart.my);
    R.applyCamera();
    return;
  }
  if (dragStart) {
    var t = R.screenToTile(e.clientX, e.clientY);
    R.showDrag(dragStart.x, dragStart.y, t.x, t.y, 0x8ab6ff);
  }
});

window.addEventListener('mouseup', function (e) {
  if (panning && (e.button === 2 || e.button === 1)) {
    panning = false;
    panStart = null;
    return;
  }
  if (e.button === 0 && dragStart) {
    var t = R.screenToTile(e.clientX, e.clientY);
    applyTool(UI.getTool(), dragStart, t);
    dragStart = null;
    R.showDrag(null);
  }
});

canvas.addEventListener('wheel', function (e) {
  e.preventDefault();
  var t = R.screenToTile(e.clientX, e.clientY);
  var factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  R.cam.zoom *= factor;
  R.applyCamera();
  // 커서 위치 고정 줌
  var t2 = R.screenToTile(e.clientX, e.clientY);
  R.cam.x += (t2.x - t.x) * 16 * R.cam.zoom;
  R.cam.y += (t2.y - t.y) * 16 * R.cam.zoom;
  R.applyCamera();
}, { passive: false });

// ── 입력 (키보드) ──
var keys = {};
window.addEventListener('keydown', function (e) {
  keys[e.code] = true;
  if (e.code === 'Space') {
    e.preventDefault();
    setSpeed(speed === 0 ? lastSpeed : 0);
  }
  if (e.code === 'Digit1') setSpeed(1);
  if (e.code === 'Digit2') setSpeed(2);
  if (e.code === 'Digit3') setSpeed(3);
});
window.addEventListener('keyup', function (e) { keys[e.code] = false; });

// ── 밤 어둡기 ──
function darknessFor(timeMin) {
  var h = (timeMin % DAY_MIN) / 60;
  if (h >= 21 && h < 23) return 0.55 * (h - 21) / 2;
  if (h >= 23 || h < 4) return 0.55;
  if (h >= 4 && h < 6) return 0.55 * (1 - (h - 4) / 2);
  return 0;
}

// ── 게임 루프 ──
var hudTimer = 0;
R.app.ticker.add(function () {
  var realSec = R.app.ticker.deltaMS / 1000;

  // 카메라 키 이동
  var panSpd = 900 * realSec;
  if (keys.KeyW || keys.ArrowUp) { R.cam.y += panSpd; R.applyCamera(); }
  if (keys.KeyS || keys.ArrowDown) { R.cam.y -= panSpd; R.applyCamera(); }
  if (keys.KeyA || keys.ArrowLeft) { R.cam.x += panSpd; R.applyCamera(); }
  if (keys.KeyD || keys.ArrowRight) { R.cam.x -= panSpd; R.applyCamera(); }

  // 시뮬레이션
  var gameMin = Math.min(30, realSec * MIN_PER_SEC * SPEED_MULT[speed]);
  var prevDay = world.day;
  while (gameMin > 0) {
    var dt = Math.min(1, gameMin);
    gameMin -= dt;
    world.timeMin += dt;
    world.day = 1 + Math.floor(world.timeMin / DAY_MIN) - Math.floor((8 * 60) / DAY_MIN);
    for (var n = 0; n < pawns.length; n++) updatePawn(world, pawns[n], dt, ctx);
  }
  if (world.day !== prevDay) {
    UI.toast('🌅 ' + world.day + '일차 아침이 밝았습니다');
    var regrown = dailyRegrowth(world, mulberry32(world.seed + world.day));
    regrown.forEach(function (i) { R.refreshTile(i); });
  }

  // 렌더 동기화
  for (var m = 0; m < pawns.length; m++) R.updatePawnSprite(pawns[m]);
  R.tickSelection();
  R.setDarkness(darknessFor(world.timeMin));

  // HUD 갱신 (0.25초마다)
  hudTimer += realSec;
  if (hudTimer > 0.25) {
    hudTimer = 0;
    UI.updateClock(world.day, world.timeMin);
    var alive = pawns.filter(function (p) { return p.state !== 'dead'; }).length;
    UI.updateRes(totalRes(world), alive);
    if (selectedPawn) UI.updatePawnPanel(selectedPawn);
  }
});

// 첫 안내
if (!saved) {
  setTimeout(function () {
    UI.toast('🏕️ 정착민 3명이 도착했습니다. 나무를 벌목하고 비축 구역을 지정해 보세요!');
  }, 600);
}

// 디버그 훅 (개발용)
window.game = { world: world, pawns: pawns, R: R, applyTool: applyTool, setSpeed: setSpeed };
