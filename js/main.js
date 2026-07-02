// v0.3 부팅·게임 루프·입력
import {
  MAP_W, MAP_H, MIN_PER_SEC, DAY_MIN, SPEED_MULT, BUILDS, PAWN_DEFS,
  RAID, BRIDGE, TRAITS, COLORS,
} from './config.js';
import {
  createWorld, mulberry32, idx, ix, iy, isWalkable, footprintClear,
  addBuilding, removeBuilding, buildingDef, addItem, totalRes, dailyRegrowth,
  updateSheep, tickResearch, tickCrops, updateEnemies, spawnRaid,
  canPlaceBridge, consumeGlobal, seasonDef, seasonIndex,
  tickRanches, storageCap, totalStored, dailyMineRegen, tickTowers,
} from './world.js';
import { createPawn, updatePawn, manualInteract, equipWeapon } from './pawns.js';
import { RESEARCH, WEAPONS, HIRE, hireCost } from './config.js';
import { releaseAllOf } from './jobs.js';
import { GOALS, checkGoals } from './goals.js';
import { createAudio } from './audio.js';
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
  world.enemies = saved.enemies || [];
  world.nextEid = saved.nextEid || 1;
  world.nextSid = saved.nextSid || (world.sheep.length + 1);
  world.goals = saved.goals || {};
  world.nextRaidDay = saved.nextRaidDay || RAID.firstDay;
  pawns = saved.pawns.map(function (p) {
    var pw = createPawn(p.id, { name: p.name, look: p.look, color: p.color, trait: p.trait, equipped: p.equipped, skills: p.skills }, p.x, p.y);
    pw.hunger = p.hunger; pw.hp = p.hp;
    pw.mood = p.mood === undefined ? 70 : p.mood;
    pw.carry = p.carry || null;
    if (p.dead) pw.state = 'dead';
    return pw;
  });
} else {
  world = createWorld((Math.random() * 1e9) | 0);
  world.nextRaidDay = RAID.firstDay;
  var cx = MAP_W / 2, cy = MAP_H / 2;
  pawns = PAWN_DEFS.map(function (def, n) {
    return createPawn(n, def, cx - 1 + n, cy + 1);
  });
}
var nextPawnId = pawns.reduce(function (m, p) { return Math.max(m, p.id); }, -1) + 1;

var ambientRng = mulberry32(world.seed ^ 0x5eed);

// ── 렌더러·UI ──
var R = createRenderer(world);
var Audio2 = createAudio();
var speed = 1;
var lastSpeed = 1;
var controlled = []; // 선택·직접 조종 중인 정착민 무리
var storageWarnCd = 0;

function panelPawn() { return controlled.length ? controlled[0] : null; }

// 정착민 무리 선택 (list = pawn 배열 또는 단일 pawn)
function selectPawns(list) {
  if (!list) list = [];
  else if (list.length === undefined) list = [list];
  list = list.filter(function (p) { return p && p.state !== 'dead'; });
  exitControl();
  controlled = list;
  list.forEach(function (p) {
    releaseAllOf(world, p.id);
    p.job = null;
    p.path = null;
    if (p.state !== 'working') p.state = 'idle';
    p.manual = true;
  });
  R.setSelected(controlled);
  if (controlled.length) {
    UI.hideBuilding();
    UI.showPawn(controlled[0]);
    UI.toast(controlled.length === 1
      ? '🎮 ' + controlled[0].name + ' 선택 — WASD 이동 · Space 작업 · ESC 해제'
      : '🎮 ' + controlled.length + '명 선택 — WASD로 함께 이동 · Space 작업');
  } else {
    UI.hidePawn();
  }
}

// 하위 호환: 단일 조종 진입
function enterControl(pawn) { selectPawns(pawn ? [pawn] : []); }

function buildingAtTile(x, y) {
  var bid = world.occupancy[idx(x, y)];
  return bid !== undefined ? world.buildings[bid] : null;
}

// 진행 중인 모든 것 취소: 도구→선택, 정착민 선택 해제, 드래그 박스 제거
function cancelToSelect() {
  if (UI.getTool() !== 'select') UI.setTool('select');
  exitControl();
  UI.hidePawn();
  UI.hideBuilding();
  dragStart = null;
  selDrag = null;
  R.showDrag(null);
}

function exitControl() {
  if (!controlled.length) return;
  // 하던 작업은 유지(양보 아님) — manual 만 해제하면 작업 완료 후 AI 복귀
  controlled.forEach(function (p) { p.manual = false; p.manualMoving = false; });
  controlled = [];
  R.setSelected(null);
}

var UI = createUI({
  world: world,
  onToolChange: function () { R.showDrag(null); },
  onSpeed: setSpeed,
  onEditPawn: function () {
    var sp = panelPawn();
    if (!sp || sp.state === 'dead') return;
    var wasSpeed = speed;
    setSpeed(0);
    UI.showCustomize([sp], '✏️ ' + sp.name + ' 편집', function () {
      setSpeed(wasSpeed || 1);
      UI.updatePawnPanel(sp);
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
  onShowGoals: function () { UI.showGoals(GOALS, world); },
  onHire: function () {
    var alive = pawns.filter(function (p) { return p.state !== 'dead'; }).length;
    if (alive >= HIRE.maxPop) { UI.toast('⚠️ 인구 상한(' + HIRE.maxPop + '명)에 도달했습니다', true); return; }
    var cost = hireCost(alive);
    if (totalRes(world).food < cost) { UI.toast('⚠️ 식량이 부족합니다 (고용 비용 ' + cost + ')', true); return; }
    consumeGlobal(world, 'food', cost);
    var pw = recruitWanderer('고용');
    if (pw) UI.toast('🧑‍🌾 새 정착민 "' + pw.name + '" 을(를) 고용했습니다 (식량 ' + cost + ' 소비)');
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
    var def = buildingDef(b.kind);
    Audio2.play('build');
    if (b.kind === 'warehouse') R.invalidateMinimapTerrain();

    // 창고: 건물 주변 1칸 테두리를 자동으로 비축 구역화 (건물 자체는 진입 불가라 제외)
    if (def.autoStockRing) {
      for (var ry = -1; ry <= def.fh; ry++) {
        for (var rx = -1; rx <= def.fw; rx++) {
          if (rx >= 0 && rx < def.fw && ry >= 0 && ry < def.fh) continue; // 건물 내부는 제외
          var rtx = b.x + rx, rty = b.y + ry;
          var ri = idx(rtx, rty);
          if (isWalkable(world, rtx, rty) && world.occupancy[ri] === undefined && !world.stockpile[ri]) {
            world.stockpile[ri] = true;
          }
        }
      }
      R.refreshZones();
      UI.addEvent('🏚️ 창고 주변에 비축 구역이 자동 지정되었습니다');
    }

    // 완공된 건물 풋프린트에 서 있던 정착민 밀어내기
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
  onStorageFull: function () {
    if (world.timeMin - storageWarnCd > 180) {
      storageWarnCd = world.timeMin;
      UI.toast('📦 저장고가 가득 찼습니다 — 창고를 지어 용량을 늘리세요', true);
    }
  },
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
  onSheepChange: function () { /* 렌더는 tick()의 syncSheep 이 처리 */ },
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
    var needSteel = false;
    forRect(a, b, function (i) {
      var bid = world.occupancy[i];
      if (bid === undefined || seen[bid]) return;
      seen[bid] = 1;
      var bld = world.buildings[bid];
      if (!bld || bld.depleted || world.mineDesig[bid]) return;
      if (bld.kind === 'ironmine' && !world.research.unlocked.steel) { needSteel = true; return; }
      if (bld.kind === 'goldmine' || bld.kind === 'ironmine') {
        world.mineDesig[bid] = true;
        count++;
      }
    });
    if (count) UI.toast('⛏️ 광산 ' + count + '곳 채굴 지시');
    else if (needSteel) UI.toast('🔒 철광을 캐려면 "제철 기술" 연구가 필요합니다', true);
    else UI.toast('⚠️ 범위에 채굴할 광산이 없습니다', true);
  }

  else if (tool === 'hunt') {
    forRect(a, b, function (i, x, y) {
      for (var s = 0; s < world.sheep.length; s++) {
        var sh = world.sheep[s];
        if (sh.x === x && sh.y === y && !sh.hunt) { sh.hunt = true; count++; }
      }
    });
    if (count) UI.toast('🥩 ' + count + '마리 사냥 지시');
    else UI.toast('⚠️ 범위에 양이 없습니다', true);
  }

  else if (tool === 'bridge') {
    forRect(a, b, function (i, x, y) {
      if (!canPlaceBridge(world, x, y)) return;
      if (!totalRes(world).wood || totalRes(world).wood < BRIDGE.cost.wood) return;
      consumeGlobal(world, 'wood', BRIDGE.cost.wood);
      var bb = addBuilding(world, 'bridge', x, y, { stage: 'built' });
      R.refreshBuilding(bb);
      count++;
    });
    if (count) UI.toast('🌉 다리 ' + count + '칸 건설');
    else UI.toast('⚠️ 물 가장자리에만, 목재가 있어야 놓을 수 있습니다', true);
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
        var cost = (BUILDS[bld.kind] && BUILDS[bld.kind].cost) || {};
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

// 음소거 버튼 + 첫 입력에 BGM 시작
document.getElementById('btnMute').addEventListener('click', function () {
  var m = Audio2.toggleMute();
  document.getElementById('btnMute').textContent = m ? '🔇' : '🔊';
});
window.addEventListener('pointerdown', function () { Audio2.startBgm(); });
window.addEventListener('keydown', function () { Audio2.startBgm(); });

// 명단에서 정착민 클릭 → 선택 + 카메라 이동
window.addEventListener('roster-select', function (e) {
  var p = pawns[e.detail];
  if (p && p.state !== 'dead') {
    selectPawns([p]);
    R.centerOn(p.x, p.y);
  }
});

// ── 마우스 입력 ──
var canvas = R.app.view;
var panning = false;
var panStart = null;
var dragStart = null;
var selDrag = null; // 선택 박스 드래그 상태

canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

canvas.addEventListener('mousedown', function (e) {
  if (e.button === 2 || e.button === 1) {
    panning = true;
    panStart = { mx: e.clientX, my: e.clientY, cx: R.cam.x, cy: R.cam.y, moved: false };
    return;
  }
  if (e.button === 0) {
    var t = R.screenToTile(e.clientX, e.clientY);
    var tool = UI.getTool();
    if (tool === 'select') {
      // 선택 도구: 클릭=단일 선택 / 드래그=박스 다중 선택 (mouseup 에서 판정)
      selDrag = { sx: e.clientX, sy: e.clientY, tile: t };
    } else {
      dragStart = t;
    }
  }
});

window.addEventListener('mousemove', function (e) {
  if (panning && panStart) {
    if (Math.abs(e.clientX - panStart.mx) + Math.abs(e.clientY - panStart.my) > 4) panStart.moved = true;
    R.cam.x = panStart.cx + (e.clientX - panStart.mx);
    R.cam.y = panStart.cy + (e.clientY - panStart.my);
    R.applyCamera();
    return;
  }
  var tool = UI.getTool();
  if (selDrag) {
    // 선택 박스 (일정 거리 이상 끌었을 때만 표시)
    if (Math.abs(e.clientX - selDrag.sx) + Math.abs(e.clientY - selDrag.sy) > 6) {
      var st = R.screenToTile(e.clientX, e.clientY);
      R.showDrag(selDrag.tile.x, selDrag.tile.y, st.x, st.y, 0x7dffb0);
    }
  } else if (dragStart) {
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
    var didMove = panStart && panStart.moved;
    panning = false;
    panStart = null;
    // 우클릭을 끌지 않고 그냥 눌렀다 떼면 = 취소 (도구→선택, 선택 무리 해제)
    if (e.button === 2 && !didMove) cancelToSelect();
    return;
  }
  if (e.button === 0 && selDrag) {
    var t2 = R.screenToTile(e.clientX, e.clientY);
    var moved = Math.abs(e.clientX - selDrag.sx) + Math.abs(e.clientY - selDrag.sy) > 6;
    if (moved) {
      // 박스 안의 살아있는 정착민 다중 선택
      var x0 = Math.min(selDrag.tile.x, t2.x), x1 = Math.max(selDrag.tile.x, t2.x);
      var y0 = Math.min(selDrag.tile.y, t2.y), y1 = Math.max(selDrag.tile.y, t2.y);
      var inBox = pawns.filter(function (p) {
        return p.state !== 'dead' && p.px >= x0 - 0.5 && p.px <= x1 + 0.5 && p.py >= y0 - 0.5 && p.py <= y1 + 0.5;
      });
      selectPawns(inBox);
    } else {
      // 단일 클릭: 정착민 우선, 없으면 건물 정보, 그것도 없으면 해제
      var hit = null;
      pawns.forEach(function (p) {
        if (p.state === 'dead') return;
        var d = Math.hypot(p.px - t2.x, p.py - t2.y);
        if (d < 1.1 && (!hit || d < hit.d)) hit = { p: p, d: d };
      });
      if (hit) { selectPawns([hit.p]); UI.hideBuilding(); }
      else {
        var bAt = buildingAtTile(t2.x, t2.y);
        if (bAt) { selectPawns([]); UI.showBuilding(bAt); }
        else { selectPawns([]); UI.hideBuilding(); }
      }
    }
    selDrag = null;
    R.showDrag(null);
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
    var live = controlled.filter(function (p) { return p.state !== 'dead'; });
    if (live.length) {
      var did = 0, lastMsg = null;
      live.forEach(function (p) { var m = manualInteract(world, p, ctx); if (m) { did++; lastMsg = m; } });
      if (did) UI.toast(live.length > 1 ? '🎬 ' + did + '명이 작업 시작' : lastMsg);
      else UI.toast('🤔 주변에 할 수 있는 일이 없습니다 (나무·금광·버섯·공사장 옆에서 누르세요)');
    } else {
      setSpeed(speed === 0 ? lastSpeed : 0);
    }
  }
  if (e.code === 'KeyP') setSpeed(speed === 0 ? lastSpeed : 0);
  if (e.code === 'Escape') cancelToSelect();
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

// ── 전투 콜백 (적→정착민) ──
var enemyCbs = {
  onHit: function (pawn) { /* 데미지는 world 에서 처리 */ },
  onPawnDeath: function (pawn) {
    releaseAllOf(world, pawn.id);
    var ci = controlled.indexOf(pawn);
    if (ci >= 0) { controlled.splice(ci, 1); R.setSelected(controlled); if (!controlled.length) UI.hidePawn(); }
    UI.toast('💀 ' + pawn.name + ' 이(가) 고블린에게 쓰러졌습니다...', true);
    UI.addEvent('💀 ' + pawn.name + ' 전사');
    R.updatePawnSprite(pawn);
  },
  onEnemyDown: function (e) { R.refreshItem(idx(e.x, e.y)); Audio2.play('coin'); },
};

// 계절 초기 표시
var prevSeason = seasonIndex(world);
(function () { var sd = seasonDef(world); R.setSeasonTint(sd.tint, sd.tintA || 0); })();

var WANDERER_NAMES = ['바람', '이슬', '보리', '들풀', '가온', '노을', '솔', '한별', '미르', '아라'];
function recruitWanderer(via) {
  var cx0 = MAP_W / 2, cy0 = MAP_H / 2;
  var spot = null;
  for (var r = 0; r < 10 && !spot; r++) {
    for (var dy = -r; dy <= r && !spot; dy++) {
      for (var dx = -r; dx <= r && !spot; dx++) {
        if (isWalkable(world, cx0 + dx, cy0 + dy)) spot = { x: cx0 + dx, y: cy0 + dy };
      }
    }
  }
  if (!spot) return null;
  var nm = WANDERER_NAMES[(ambientRng() * WANDERER_NAMES.length) | 0];
  var col = COLORS[(ambientRng() * COLORS.length) | 0];
  var tr = TRAITS[(ambientRng() * TRAITS.length) | 0];
  var pw = createPawn(nextPawnId++, { name: nm, look: { unit: 'pawn', color: col }, trait: tr }, spot.x, spot.y);
  pawns.push(pw);
  R.addPawn(pw);
  if (via === '고용') {
    UI.addEvent('🧑‍🌾 ' + nm + ' 고용');
  } else {
    UI.toast('🧳 떠돌이 "' + nm + '" 이(가) 합류했습니다!');
    UI.addEvent('🧳 ' + nm + ' 합류');
  }
  return pw;
}

// ── 게임 루프 ──
var hudTimer = 0;
R.app.ticker.add(function () {
  var realSec = R.app.ticker.deltaMS / 1000;

  var panSpd = 900 * realSec;
  if (!controlled.length) {
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
    tickTowers(world, dt, enemyCbs);
    updateEnemies(world, pawns, dt, enemyCbs);
    tickResearch(world, aliveNow, dt);
    var ready = tickCrops(world, dt);
    if (ready.length) cropReadyBatch = cropReadyBatch.concat(ready);
    var rev = tickRanches(world, dt, ambientRng);
    for (var re = 0; re < rev.length; re++) { if (rev[re].idx !== undefined) R.refreshItem(rev[re].idx); }
  }
  cropReadyBatch.forEach(function (i) { R.refreshCrop(i); });

  // 습격 격퇴 판정: 습격 중이었는데 적이 전멸하면
  if (world.raidActive && world.enemies.length === 0) {
    world.raidActive = false;
    world.raidCleared = true;
    // 전리품 보상 (일수 비례)
    var mult = Math.max(1, 1 + Math.floor((world.day - RAID.firstDay) * 0.3));
    var lootAt = idx(MAP_W / 2 | 0, MAP_H / 2 | 0);
    addItem(world, lootAt, 'gold', RAID.loot.gold * mult);
    addItem(world, lootAt, 'iron', RAID.loot.iron * mult);
    R.refreshItem(lootAt);
    UI.toast('🎉 고블린 습격을 격퇴했습니다! 전리품 획득 (금 ' + (RAID.loot.gold * mult) + ' · 철 ' + (RAID.loot.iron * mult) + ')');
    UI.addEvent('🎉 습격 격퇴 +전리품');
    Audio2.play('success');
  }

  if (world.day !== prevDay) {
    UI.toast('🌅 ' + world.day + '일차 아침이 밝았습니다');
    UI.addEvent('🌅 ' + world.day + '일차');
    var regrown = dailyRegrowth(world, mulberry32(world.seed + world.day));
    regrown.forEach(function (i) { R.refreshTile(i); });
    // 광산 매장량 회복
    var minesRegen = dailyMineRegen(world);
    minesRegen.forEach(function (id) { if (world.buildings[id]) R.refreshBuilding(world.buildings[id]); });
    // 영입: 3일마다, 인구 8 미만이면 떠돌이 합류 (습격 없는 낮에만)
    var aliveCnt = pawns.filter(function (p) { return p.state !== 'dead'; }).length;
    if (world.day % 3 === 0 && aliveCnt < 8 && !world.raidActive && ambientRng() < 0.7) {
      recruitWanderer();
    }
    // 계절 갱신
    var sd = seasonDef(world);
    R.setSeasonTint(sd.tint, sd.tintA || 0);
    if (prevSeason !== seasonIndex(world)) {
      prevSeason = seasonIndex(world);
      UI.addEvent('🍃 계절: ' + sd.name);
      if (sd.noFarm) UI.toast('❄️ 겨울입니다 — 작물이 자라지 않습니다', true);
    }
  }

  // 습격 스케줄: 지정일 밤 spawnHour 에 상륙
  var curHour = (world.timeMin % DAY_MIN) / 60;
  if (world.day >= world.nextRaidDay && curHour >= RAID.spawnHour && !world.raidToday) {
    world.raidToday = true;
    var cnt = RAID.baseCount + Math.floor((world.day - RAID.firstDay) * RAID.perDayExtra);
    var got = spawnRaid(world, cnt, ambientRng);
    if (got > 0) {
      world.raidActive = true;
      world.nextRaidDay = world.day + RAID.intervalDays;
      UI.toast('⚔️ 고블린 습격! 고블린 ' + got + '마리가 상륙했습니다!', true);
      UI.addEvent('⚔️ 고블린 습격 (' + got + '마리)');
      Audio2.play('alert');
    }
  }
  if (curHour < RAID.spawnHour) world.raidToday = false;

  // 목표 달성 체크
  var newGoals = checkGoals(world, pawns);
  for (var gi = 0; gi < newGoals.length; gi++) {
    UI.toast('🏆 목표 달성: ' + newGoals[gi].name);
    UI.addEvent('🏆 ' + newGoals[gi].name);
    Audio2.play('success');
  }

  // 직접 조종 이동 + 카메라 추적 (선택 무리 전체)
  if (controlled.length) {
    var moveKey = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD;
    var sumX = 0, sumY = 0;
    for (var c = 0; c < controlled.length; c++) {
      manualMove(controlled[c], manualBudget);
      sumX += controlled[c].px; sumY += controlled[c].py;
    }
    if (moveKey) {
      // 무리 중심을 화면 중앙으로 따라감 (이동 중일 때만)
      var cxg = sumX / controlled.length, cyg = sumY / controlled.length;
      var targetX = R.app.screen.width / 2 - (cxg + 0.5) * 64 * R.cam.zoom;
      var targetY = R.app.screen.height / 2 - (cyg + 0.5) * 64 * R.cam.zoom;
      R.cam.x += (targetX - R.cam.x) * Math.min(1, realSec * 5);
      R.cam.y += (targetY - R.cam.y) * Math.min(1, realSec * 5);
      R.applyCamera();
    }
  }

  R.tick(realSec);
  for (var m = 0; m < pawns.length; m++) R.updatePawnSprite(pawns[m]);
  R.tickSelection();
  R.setTimeOfDay((world.timeMin % DAY_MIN) / 60);

  R.drawMinimap(pawns);

  hudTimer += realSec;
  if (hudTimer > 0.25) {
    hudTimer = 0;
    UI.updateClock(world.day, world.timeMin);
    var alive = pawns.filter(function (p) { return p.state !== 'dead'; }).length;
    var res = totalRes(world);
    UI.updateRes(res, alive);
    UI.updateStorage(totalStored(world), storageCap(world));
    // 고용 버튼: 현재 비용·가능 여부 표시
    if (alive >= HIRE.maxPop) UI.setHireInfo('🧑‍🌾 인구 최대', true);
    else {
      var hc = hireCost(alive);
      UI.setHireInfo('🧑‍🌾 고용 (🍖' + hc + ')', (res.food || 0) < hc);
    }
    var pp = panelPawn();
    if (pp) UI.updatePawnPanel(pp);
    UI.updateRoster(pawns, controlled);
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
