// v0.3 부팅·게임 루프·입력
import {
  MAP_W, MAP_H, MIN_PER_SEC, DAY_MIN, SPEED_MULT, BUILDS, PAWN_DEFS,
} from './config.js';
import {
  createWorld, mulberry32, idx, ix, iy, isWalkable, footprintClear,
  addBuilding, removeBuilding, buildingDef, addItem, totalRes, dailyRegrowth,
  updateSheep, tickResearch, tickCrops,
} from './world.js';
import { createPawn, updatePawn, manualInteract, equipWeapon } from './pawns.js';
import { RESEARCH, WEAPONS } from './config.js';
import { releaseAllOf } from './jobs.js';
import { createRenderer } from './render.js';
import { createUI } from './ui.js';
import { saveGame, loadSaveData, clearSave } from './save.js';

// ── 월드 준비 ──
var world, pawns;
var saved = loadSaveData();

if (saved) {
  world = createWorld(saved.seed);
  world.terrain = Uint8Array.from(saved.terrain);
  world.objects = saved.objects;
  world.buildings = saved.buildings;
  world.occupancy = saved.occupancy;
  world.nextBid = saved.nextBid;
  world.items = saved.items;
  world.stockpile = saved.stockpile;
  world.designations = saved.designations;
  world.mineDesig = saved.mineDesig || {};
  world.sheep = saved.sheep || [];
  world.reserved = {};
  world.timeMin = saved.timeMin;
  world.day = saved.day;
  world.research = saved.research || { points: 0, unlocked: {} };
  world.farmZone = saved.farmZone || {};
  world.crops = saved.crops || {};
  world.craftQueue = saved.craftQueue || [];
  pawns = saved.pawns.map(function (p) {
    var pw = createPawn(p.id, { name: p.name, look: p.look, color: p.color, trait: p.trait, equipped: p.equipped }, p.x, p.y);
    pw.hunger = p.hunger; pw.energy = p.energy; pw.hp = p.hp;
    pw.mood = p.mood === undefined ? 70 : p.mood;
    pw.carry = p.carry || null;
    if (p.dead) pw.state = 'dead';
    return pw;
  });
} else {
  world = createWorld((Math.random() * 1e9) | 0);
  var cx = MAP_W / 2, cy = MAP_H / 2;
  pawns = PAWN_DEFS.map(function (def, n) {
    return createPawn(n, def, cx - 1 + n, cy + 1);
  });
}

var ambientRng = mulberry32(world.seed ^ 0x5eed);

// ── 렌더러·UI ──
var R = createRenderer(world);
var speed = 1;
var lastSpeed = 1;
var selectedPawn = null;
var controlled = null; // 직접 조종 중인 정착민

function enterControl(pawn) {
  if (pawn.state === 'dead') return;
  exitControl();
  releaseAllOf(world, pawn.id);
  pawn.job = null;
  pawn.path = null;
  if (pawn.state !== 'working') pawn.state = 'idle';
  pawn.manual = true;
  controlled = pawn;
  UI.toast('🎮 ' + pawn.name + ' 직접 조종 — WASD 이동 · Space 작업 · ESC 해제');
}

function exitControl() {
  if (!controlled) return;
  controlled.manual = false;
  controlled.manualMoving = false;
  if (controlled.state === 'working' && controlled.job && controlled.job.manual) {
    controlled.job = null;
    controlled.state = 'idle';
  }
  controlled = null;
}

var UI = createUI({
  world: world,
  onToolChange: function () { R.showDrag(null); },
  onSpeed: setSpeed,
  onEditPawn: function () {
    if (!selectedPawn || selectedPawn.state === 'dead') return;
    var wasSpeed = speed;
    setSpeed(0);
    UI.showCustomize([selectedPawn], '✏️ ' + selectedPawn.name + ' 편집', function () {
      setSpeed(wasSpeed || 1);
      UI.updatePawnPanel(selectedPawn);
      UI.toast('✅ 변경되었습니다');
    });
  },
  onUnlockResearch: function (key) {
    var def = RESEARCH[key];
    if (!def || world.research.unlocked[key] || world.research.points < def.cost) return;
    world.research.points -= def.cost;
    world.research.unlocked[key] = true;
    UI.toast('📚 "' + def.name + '" 연구 완료!');
    UI.addEvent('📚 ' + def.name + ' 기술 습득');
  },
  onQueueCraft: function (type) {
    world.craftQueue.push({ type: type });
    UI.toast('⚒️ ' + WEAPONS[type].name + ' 제작 주문 접수');
  },
  onEquip: function (pawn, type) {
    var msg = equipWeapon(world, pawn, type);
    if (msg) UI.toast(msg);
    R.updatePawnSprite(pawn);
    UI.updatePawnPanel(pawn);
  },
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

// ── 콜백 ──
var starveToastCd = {};
var ctx = {
  rng: ambientRng,
  onWorldChange: function (i) { R.refreshTile(i); R.refreshZones(); },
  onItemChange: function (i) { R.refreshItem(i); },
  onCropChange: function (i) { R.refreshCrop(i); },
  onBuildingChange: function (b) { R.refreshBuilding(b); },
  onBuildingBuilt: function (b) {
    // 완공된 건물 풋프린트에 서 있던 정착민 밀어내기
    var def = buildingDef(b.kind);
    if (!def.solid) return;
    pawns.forEach(function (p) {
      if (p.x >= b.x && p.x < b.x + def.fw && p.y >= b.y && p.y < b.y + def.fh) {
        for (var r = 1; r <= 3; r++) {
          for (var dy = -r; dy <= r; dy++) {
            for (var dx = -r; dx <= r; dx++) {
              if (isWalkable(world, p.x + dx, p.y + dy)) {
                p.x += dx; p.y += dy; p.px = p.x; p.py = p.y;
                p.path = null;
                return;
              }
            }
          }
        }
      }
    });
  },
  onEvent: function (msg) { UI.addEvent(msg); },
  onDeath: function (pawn) {
    UI.toast('💀 ' + pawn.name + ' 이(가) 굶주림으로 사망했습니다...', true);
    UI.addEvent('💀 ' + pawn.name + ' 사망');
    R.updatePawnSprite(pawn);
  },
  onStarving: function (pawn) {
    var now = world.timeMin;
    if (!starveToastCd[pawn.id] || now - starveToastCd[pawn.id] > 240) {
      starveToastCd[pawn.id] = now;
      UI.toast('⚠️ ' + pawn.name + ' 이(가) 굶주리고 있습니다! 식량이 필요합니다', true);
    }
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

  if (tool === 'chop' || tool === 'forage') {
    var want = tool === 'chop' ? 'tree' : 'mushroom';
    forRect(a, b, function (i) {
      var o = world.objects[i];
      if (o && o.kind === want && !world.designations[i]) {
        world.designations[i] = tool;
        count++;
      }
    });
    if (count) UI.toast((tool === 'chop' ? '🪓 벌목' : '🧺 채집') + ' ' + count + '건 지시');
  }

  else if (tool === 'mine') {
    var seen = {};
    forRect(a, b, function (i) {
      var bid = world.occupancy[i];
      if (bid === undefined || seen[bid]) return;
      seen[bid] = 1;
      var bld = world.buildings[bid];
      if (bld && bld.kind === 'goldmine' && !bld.depleted && !world.mineDesig[bid]) {
        world.mineDesig[bid] = true;
        count++;
      }
    });
    if (count) UI.toast('⛏️ 금광 ' + count + '곳 채굴 지시');
    else UI.toast('⚠️ 범위에 채굴할 금광이 없습니다', true);
  }

  else if (tool === 'farm') {
    if (!world.research.unlocked.farming) {
      UI.toast('🔒 먼저 "농업" 기술을 연구해야 합니다', true);
      UI.showResearch();
    } else {
      forRect(a, b, function (i, x, y) {
        if (!world.farmZone[i] && isWalkable(world, x, y) &&
            world.occupancy[i] === undefined && !world.objects[i] && !world.stockpile[i]) {
          world.farmZone[i] = true;
          count++;
        }
      });
      if (count) UI.toast('🌾 농사 구역 ' + count + '칸 지정');
    }
  }

  else if (tool === 'cancel') {
    forRect(a, b, function (i) {
      if (world.designations[i]) { delete world.designations[i]; count++; }
      if (world.farmZone[i]) {
        delete world.farmZone[i];
        if (world.crops[i]) { delete world.crops[i]; R.refreshCrop(i); }
        count++;
      }
      var bid = world.occupancy[i];
      if (bid !== undefined) {
        var bld = world.buildings[bid];
        if (bld && world.mineDesig[bid]) { delete world.mineDesig[bid]; count++; }
        if (bld && bld.stage === 'bp') {
          for (var t in bld.delivered) {
            if (bld.delivered[t] > 0) addItem(world, idx(bld.x, bld.y + buildingDef(bld.kind).fh - 1), t, bld.delivered[t]);
          }
          removeBuilding(world, bld);
          R.removeBuildingSprite(bld.id);
          R.refreshItem(idx(bld.x, bld.y + buildingDef(bld.kind).fh - 1));
          count++;
        }
      }
    });
    if (count) UI.toast('✖️ ' + count + '건 취소');
  }

  else if (tool === 'stockpile') {
    forRect(a, b, function (i, x, y) {
      if (!world.stockpile[i] && isWalkable(world, x, y) && world.occupancy[i] === undefined) {
        world.stockpile[i] = true;
        count++;
      }
    });
    if (count) UI.toast('📦 비축 구역 ' + count + '칸 지정');
  }

  else if (tool === 'demolish') {
    var seenD = {};
    forRect(a, b, function (i) {
      if (world.stockpile[i]) { delete world.stockpile[i]; count++; }
      var bid = world.occupancy[i];
      if (bid === undefined || seenD[bid]) return;
      seenD[bid] = 1;
      var bld = world.buildings[bid];
      if (bld && bld.stage === 'built' && !bld.natural) {
        var cost = BUILDS[bld.kind].cost;
        var dropAt = idx(bld.x, bld.y + buildingDef(bld.kind).fh - 1);
        for (var t in cost) {
          var back = Math.floor(cost[t] / 2);
          if (back > 0) addItem(world, dropAt, t, back);
        }
        removeBuilding(world, bld);
        R.removeBuildingSprite(bld.id);
        R.refreshItem(dropAt);
        count++;
      }
    });
    if (count) UI.toast('🔨 ' + count + '건 철거 (자재 일부 회수)');
  }

  else if (BUILDS[tool]) {
    var def = BUILDS[tool];
    var px = Math.min(a.x, b.x), py = Math.min(a.y, b.y);
    if (!footprintClear(world, px, py, def.fw, def.fh, false)) {
      UI.toast('⚠️ 그 위치에는 지을 수 없습니다 (' + def.fw + '×' + def.fh + ' 필요)', true);
    } else {
      var bNew = addBuilding(world, tool, px, py);
      R.refreshBuilding(bNew);
      var needStr = Object.keys(def.cost).map(function (t) {
        var nm = { wood: '목재', gold: '금' }[t] || t;
        var lack = def.cost[t] > (res[t] || 0) ? ' (부족!)' : '';
        return nm + ' ' + def.cost[t] + lack;
      }).join(', ');
      UI.toast('📐 ' + def.name + ' 설계 — ' + needStr);
    }
  }

  R.refreshZones();
}

// ── 마우스 입력 ──
var canvas = R.app.view;
var panning = false;
var panStart = null;
var dragStart = null;

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
      var hit = null;
      pawns.forEach(function (p) {
        var d = Math.hypot(p.px - t.x, p.py - t.y);
        if (d < 1.1 && (!hit || d < hit.d)) hit = { p: p, d: d };
      });
      selectedPawn = hit ? hit.p : null;
      R.setSelected(selectedPawn);
      if (selectedPawn) {
        UI.showPawn(selectedPawn);
        enterControl(selectedPawn); // 클릭 = 빙의
      } else {
        UI.hidePawn();
        exitControl();
      }
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
  var tool = UI.getTool();
  if (dragStart) {
    var t = R.screenToTile(e.clientX, e.clientY);
    R.showDrag(dragStart.x, dragStart.y, t.x, t.y, 0x8ab6ff);
  } else if (BUILDS[tool]) {
    // 건설 도구: 풋프린트 미리보기
    var t2 = R.screenToTile(e.clientX, e.clientY);
    var def = BUILDS[tool];
    var ok = footprintClear(world, t2.x, t2.y, def.fw, def.fh, false);
    R.showDrag(t2.x, t2.y, t2.x + def.fw - 1, t2.y + def.fh - 1, ok ? 0x7dffb0 : 0xff6b81);
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
  var t2 = R.screenToTile(e.clientX, e.clientY);
  R.cam.x += (t2.x - t.x) * 64 * R.cam.zoom;
  R.cam.y += (t2.y - t.y) * 64 * R.cam.zoom;
  R.applyCamera();
}, { passive: false });

// ── 키보드 ──
var keys = {};
function isTyping(e) {
  return e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
}
window.addEventListener('keydown', function (e) {
  if (isTyping(e)) return;
  keys[e.code] = true;
  if (e.code === 'Space') {
    e.preventDefault();
    if (controlled && controlled.state !== 'dead') {
      var msg = manualInteract(world, controlled, ctx);
      if (msg) UI.toast(msg);
      else UI.toast('🤔 주변에 할 수 있는 일이 없습니다 (나무·금광·버섯·공사장 옆에서 누르세요)');
    } else {
      setSpeed(speed === 0 ? lastSpeed : 0);
    }
  }
  if (e.code === 'KeyP') setSpeed(speed === 0 ? lastSpeed : 0);
  if (e.code === 'Escape') {
    exitControl();
    selectedPawn = null;
    R.setSelected(null);
    UI.hidePawn();
  }
  if (e.code === 'Digit1') setSpeed(1);
  if (e.code === 'Digit2') setSpeed(2);
  if (e.code === 'Digit3') setSpeed(3);
});
window.addEventListener('keyup', function (e) {
  if (isTyping(e)) return;
  keys[e.code] = false;
});

// 직접 조종 이동 (충돌 시 축 분리 슬라이드)
function manualMove(pawn, gameMin) {
  var vx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  var vy = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
  if (pawn.state === 'working' && (vx || vy)) {
    // 이동 입력 시 작업 중단
    pawn.job = null;
    pawn.state = 'idle';
    pawn.workLeft = 0;
  }
  if (pawn.state !== 'idle' || (!vx && !vy)) {
    pawn.manualMoving = false;
    return;
  }
  var spd = gameMin * 1.25; // AI보다 25% 빠르게
  if (vx && vy) spd *= 0.7071;
  var nx = pawn.px + vx * spd;
  var ny = pawn.py + vy * spd;
  if (vx && isWalkable(world, Math.round(nx), Math.round(pawn.py))) pawn.px = nx;
  if (vy && isWalkable(world, Math.round(pawn.px), Math.round(ny))) pawn.py = ny;
  pawn.x = Math.round(pawn.px);
  pawn.y = Math.round(pawn.py);
  if (vx) pawn.face = vx > 0 ? 1 : -1;
  pawn.manualMoving = true;
}

// ── 게임 루프 ──
var hudTimer = 0;
R.app.ticker.add(function () {
  var realSec = R.app.ticker.deltaMS / 1000;

  var panSpd = 900 * realSec;
  if (!controlled) {
    if (keys.KeyW || keys.ArrowUp) { R.cam.y += panSpd; R.applyCamera(); }
    if (keys.KeyS || keys.ArrowDown) { R.cam.y -= panSpd; R.applyCamera(); }
    if (keys.KeyA || keys.ArrowLeft) { R.cam.x += panSpd; R.applyCamera(); }
    if (keys.KeyD || keys.ArrowRight) { R.cam.x -= panSpd; R.applyCamera(); }
  } else {
    if (keys.ArrowUp) { R.cam.y += panSpd; R.applyCamera(); }
    if (keys.ArrowDown) { R.cam.y -= panSpd; R.applyCamera(); }
    if (keys.ArrowLeft) { R.cam.x += panSpd; R.applyCamera(); }
    if (keys.ArrowRight) { R.cam.x -= panSpd; R.applyCamera(); }
  }

  var gameMin = Math.min(30, realSec * MIN_PER_SEC * SPEED_MULT[speed]);
  var manualBudget = gameMin;
  var prevDay = world.day;
  var cropReadyBatch = [];
  while (gameMin > 0) {
    var dt = Math.min(1, gameMin);
    gameMin -= dt;
    world.timeMin += dt;
    world.day = 1 + Math.floor(world.timeMin / DAY_MIN);
    var aliveNow = 0;
    for (var n = 0; n < pawns.length; n++) {
      updatePawn(world, pawns[n], dt, ctx);
      if (pawns[n].state !== 'dead') aliveNow++;
    }
    updateSheep(world, dt, ambientRng);
    tickResearch(world, aliveNow, dt);
    var ready = tickCrops(world, dt);
    if (ready.length) cropReadyBatch = cropReadyBatch.concat(ready);
  }
  cropReadyBatch.forEach(function (i) { R.refreshCrop(i); });
  if (world.day !== prevDay) {
    UI.toast('🌅 ' + world.day + '일차 아침이 밝았습니다');
    UI.addEvent('🌅 ' + world.day + '일차');
    var regrown = dailyRegrowth(world, mulberry32(world.seed + world.day));
    regrown.forEach(function (i) { R.refreshTile(i); });
  }

  // 직접 조종 이동 + 카메라 추적
  if (controlled) {
    if (controlled.state === 'dead') exitControl();
    else {
      manualMove(controlled, manualBudget);
      var targetX = R.app.screen.width / 2 - (controlled.px + 0.5) * 64 * R.cam.zoom;
      var targetY = R.app.screen.height / 2 - (controlled.py + 0.5) * 64 * R.cam.zoom;
      R.cam.x += (targetX - R.cam.x) * Math.min(1, realSec * 5);
      R.cam.y += (targetY - R.cam.y) * Math.min(1, realSec * 5);
      R.applyCamera();
    }
  }

  R.tick(realSec);
  for (var m = 0; m < pawns.length; m++) R.updatePawnSprite(pawns[m]);
  R.tickSelection();
  R.setTimeOfDay((world.timeMin % DAY_MIN) / 60);

  hudTimer += realSec;
  if (hudTimer > 0.25) {
    hudTimer = 0;
    UI.updateClock(world.day, world.timeMin);
    var alive = pawns.filter(function (p) { return p.state !== 'dead'; }).length;
    UI.updateRes(totalRes(world), alive);
    if (selectedPawn) UI.updatePawnPanel(selectedPawn);
  }
});

if (!saved) {
  // 새 게임: 커스터마이징 먼저
  setSpeed(0);
  setTimeout(function () {
    UI.showCustomize(pawns, '🏝️ 정착민 커스터마이징 — 이름과 외형을 정해 주세요', function () {
      setSpeed(1);
      UI.toast('🏝️ ' + pawns.map(function (p) { return p.name; }).join('·') + ' — 섬에 도착했습니다!');
      UI.addEvent('🏝️ 섬에 도착했습니다');
    });
  }, 400);
}

window.game = {
  world: world, pawns: pawns, R: R,
  applyTool: applyTool, setSpeed: setSpeed,
  enterControl: enterControl, exitControl: exitControl,
  keys: keys,
};
