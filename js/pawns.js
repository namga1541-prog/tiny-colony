// 정착민 AI (v0.3): 욕구 → 상태기계 → 작업 수행
import { NEEDS, NATURE, BUILDS, GOLDMINE, WALK_MIN_PER_TILE } from './config.js';
import {
  idx, ix, iy, isWalkable, addItem, removeItem, natureDef, stackRoom,
  buildingDef, buildingFront,
} from './world.js';
import { findPath } from './path.js';
import {
  findFoodJob, findSleepJob, findWorkJob, bpMissing,
  reserve, release, releaseAllOf, findStockpileFor,
} from './jobs.js';

var CARRY_MAX = 10;

export function createPawn(id, def, x, y) {
  return {
    id: id,
    name: def.name,
    color: def.color,
    face: 1,             // 1 우 / -1 좌
    x: x, y: y,
    px: x, py: y,
    hunger: 60 + Math.random() * 30,
    energy: 60 + Math.random() * 30,
    hp: 100,
    state: 'idle',       // idle | moving | working | eating | sleeping | dead
    job: null,
    path: null,
    workLeft: 0,
    carry: null,
    wanderCd: 0,
    stuckCd: 0,
  };
}

export function taskLabel(pawn) {
  if (pawn.state === 'dead') return '💀 사망';
  if (pawn.manual) {
    if (pawn.state === 'working' && pawn.job) {
      var mw = { gather: '작업', mine: '금 채굴', build: '건설' };
      return '🎮 직접 조종 — ' + (mw[pawn.job.type] || '작업') + ' 중';
    }
    return '🎮 직접 조종 중 (WASD·Space)';
  }
  if (pawn.state === 'sleeping') {
    return pawn.job && pawn.job.type === 'sleepHouse' ? '😴 집에서 수면 중' : '😴 노숙 중';
  }
  if (pawn.state === 'eating') return '🍽️ 식사 중';
  var j = pawn.job;
  if (!j) return '🌿 대기 중';
  if (pawn.state === 'working') {
    if (j.type === 'gather') return '🪓 채취 중';
    if (j.type === 'mine') return '⛏️ 금 채굴 중';
    if (j.type === 'build') return '🔨 건설 중';
    if (j.type === 'eatShroom') return '🍄 버섯 따먹는 중';
  }
  var names = {
    eat: '식량 가지러 가는 중', eatShroom: '버섯 찾아가는 중',
    sleepHouse: '집으로 가는 중', sleepGround: '잘 곳 찾는 중',
    build: '건설하러 가는 중', deliver: '자재 운반 중',
    gather: '작업하러 가는 중', mine: '금광으로 가는 중', haul: '자원 정리 중',
  };
  return '🚶 ' + (names[j.type] || '작업 중');
}

// 렌더러용 포즈
export function poseOf(pawn) {
  if (pawn.state === 'dead') return 'dead';
  if (pawn.manual && pawn.manualMoving && pawn.state !== 'working') {
    return pawn.carry ? 'carryWalk' : 'walk';
  }
  if (pawn.state === 'moving') return pawn.carry ? 'carryWalk' : 'walk';
  if (pawn.state === 'working') {
    var j = pawn.job;
    if (j && (j.type === 'build')) return 'hammer';
    return 'axe'; // 벌목·채굴·채집
  }
  if (pawn.carry) return 'carryIdle';
  return 'idle';
}

function abandonJob(world, pawn) {
  releaseAllOf(world, pawn.id);
  if (pawn.carry) {
    addItem(world, idx(pawn.x, pawn.y), pawn.carry.type, pawn.carry.n);
    if (pawn.ctxItemChange) pawn.ctxItemChange(idx(pawn.x, pawn.y));
    pawn.carry = null;
  }
  pawn.job = null;
  pawn.path = null;
  pawn.state = 'idle';
  pawn.stuckCd = 15;
}

function goTo(world, pawn, tx, ty, adjacentOk) {
  var path = findPath(world, pawn.x, pawn.y, tx, ty, adjacentOk);
  if (path === null) return false;
  pawn.path = path;
  pawn.state = 'moving';
  return true;
}

function jobTarget(world, j) {
  // 잡 유형별 이동 목표 {x,y,adj}
  switch (j.type) {
    case 'eat': case 'haul': case 'eatShroom': case 'gather':
      return { x: ix(j.idx), y: iy(j.idx), adj: j.type === 'gather' };
    case 'build': case 'deliver': {
      var b = world.buildings[j.bid];
      if (!b) return null;
      if (j.type === 'deliver' && j.stage === 'toSrc') return { x: ix(j.srcIdx), y: iy(j.srcIdx), adj: false };
      var f = buildingFront(world, b);
      if (!f) return null;
      return { x: f.x, y: f.y, adj: false };
    }
    case 'mine': case 'sleepHouse':
      return { x: j.x, y: j.y, adj: false };
    default:
      return null;
  }
}

function moveStep(world, pawn, dtMin, ctx) {
  var budget = dtMin / WALK_MIN_PER_TILE;
  while (budget > 0 && pawn.path && pawn.path.length > 0) {
    var next = pawn.path[0];
    if (!isWalkable(world, next.x, next.y)) {
      var j = pawn.job;
      if (!j) { pawn.path = null; pawn.state = 'idle'; return; }
      var t = jobTarget(world, j);
      if (!t || !goTo(world, pawn, t.x, t.y, t.adj)) abandonJob(world, pawn);
      return;
    }
    var dx = next.x - pawn.px, dy = next.y - pawn.py;
    if (Math.abs(dx) > 0.05) pawn.face = dx > 0 ? 1 : -1;
    var d = Math.abs(dx) + Math.abs(dy);
    if (d <= budget) {
      budget -= d;
      pawn.px = next.x; pawn.py = next.y;
      pawn.x = next.x; pawn.y = next.y;
      pawn.path.shift();
    } else {
      pawn.px += (dx === 0 ? 0 : Math.sign(dx) * budget * (Math.abs(dx) / d));
      pawn.py += (dy === 0 ? 0 : Math.sign(dy) * budget * (Math.abs(dy) / d));
      budget = 0;
    }
  }
  if (pawn.path && pawn.path.length === 0) {
    pawn.path = null;
    onArrive(world, pawn, ctx);
  }
}

// ── 도착 처리 ──
function onArrive(world, pawn, ctx) {
  var j = pawn.job;
  if (!j) { pawn.state = 'idle'; return; }
  var here = idx(pawn.x, pawn.y);

  switch (j.type) {
    case 'eat': {
      if (!world.items[j.idx] || !(world.items[j.idx].food > 0)) return abandonJob(world, pawn);
      pawn.state = 'eating';
      pawn.workLeft = 6;
      break;
    }
    case 'eatShroom': {
      var o = world.objects[j.idx];
      if (!o || o.kind !== 'mushroom') return abandonJob(world, pawn);
      pawn.state = 'working';
      pawn.workLeft = NATURE.mushroom.work;
      break;
    }
    case 'sleepHouse': {
      var hb = world.buildings[j.bid];
      if (!hb || hb.stage !== 'built') return abandonJob(world, pawn);
      pawn.state = 'sleeping';
      break;
    }
    case 'sleepGround': {
      pawn.state = 'sleeping';
      break;
    }
    case 'gather': {
      if (!world.objects[j.idx] || !world.designations[j.idx]) return abandonJob(world, pawn);
      pawn.state = 'working';
      pawn.workLeft = natureDef(world.objects[j.idx].kind).work;
      if (ix(j.idx) !== pawn.x) pawn.face = ix(j.idx) > pawn.x ? 1 : -1;
      break;
    }
    case 'mine': {
      var mb = world.buildings[j.bid];
      if (!mb || (mb.charges || 0) <= 0 || !world.mineDesig[j.bid]) return abandonJob(world, pawn);
      pawn.state = 'working';
      pawn.workLeft = GOLDMINE.work;
      break;
    }
    case 'build': {
      var b = world.buildings[j.bid];
      if (!b || b.stage !== 'bp' || bpMissing(b) !== null) return abandonJob(world, pawn);
      pawn.state = 'working';
      pawn.workLeft = Math.max(1, BUILDS[b.kind].work - b.work);
      break;
    }
    case 'deliver': {
      if (j.stage === 'toSrc') {
        var b2 = world.buildings[j.bid];
        if (!b2 || b2.stage !== 'bp') return abandonJob(world, pawn);
        var missing = bpMissing(b2);
        if (!missing || missing.type !== j.resType) return abandonJob(world, pawn);
        var got = removeItem(world, here, j.resType, Math.min(j.amount, CARRY_MAX));
        release(world, 'item:' + j.srcIdx);
        if (got <= 0) return abandonJob(world, pawn);
        pawn.carry = { type: j.resType, n: got };
        ctx.onItemChange(here);
        j.stage = 'toBp';
        var t = jobTarget(world, j);
        if (!t || !goTo(world, pawn, t.x, t.y, false)) return abandonJob(world, pawn);
      } else {
        var b3 = world.buildings[j.bid];
        if (!b3 || b3.stage !== 'bp' || !pawn.carry) return abandonJob(world, pawn);
        b3.delivered[pawn.carry.type] = (b3.delivered[pawn.carry.type] || 0) + pawn.carry.n;
        var cost = BUILDS[b3.kind].cost[pawn.carry.type] || 0;
        var over = (b3.delivered[pawn.carry.type] || 0) - cost;
        if (over > 0) {
          b3.delivered[pawn.carry.type] = cost;
          addItem(world, here, pawn.carry.type, over);
          ctx.onItemChange(here);
        }
        pawn.carry = null;
        if (bpMissing(b3) === null) {
          pawn.job = { type: 'build', bid: j.bid };
          pawn.state = 'working';
          pawn.workLeft = BUILDS[b3.kind].work;
          ctx.onBuildingChange(b3);
        } else {
          release(world, 'bp:' + j.bid);
          pawn.job = null;
          pawn.state = 'idle';
        }
      }
      break;
    }
    case 'haul': {
      if (j.stage === 'toItem') {
        var slot = world.items[here];
        if (!slot || !(slot[j.resType] > 0)) return abandonJob(world, pawn);
        var take = removeItem(world, here, j.resType, CARRY_MAX);
        release(world, 'haul:' + j.idx);
        pawn.carry = { type: j.resType, n: take };
        ctx.onItemChange(here);
        var dest = findStockpileFor(world, j.resType, pawn);
        if (dest < 0) return abandonJob(world, pawn);
        j.destIdx = dest;
        j.stage = 'toStock';
        reserve(world, 'stock:' + dest, pawn.id);
        if (!goTo(world, pawn, ix(dest), iy(dest), false)) return abandonJob(world, pawn);
      } else {
        if (!pawn.carry) return abandonJob(world, pawn);
        var room = stackRoom(world, here, pawn.carry.type);
        var put = Math.min(room, pawn.carry.n);
        if (put > 0) {
          addItem(world, here, pawn.carry.type, put);
          pawn.carry.n -= put;
          ctx.onItemChange(here);
        }
        release(world, 'stock:' + here);
        if (pawn.carry.n <= 0) pawn.carry = null;
        if (pawn.carry) return abandonJob(world, pawn);
        pawn.job = null;
        pawn.state = 'idle';
      }
      break;
    }
    default:
      abandonJob(world, pawn);
  }
}

// ── 작업 완료 ──
function finishWork(world, pawn, ctx) {
  var j = pawn.job;
  if (!j) { pawn.state = 'idle'; return; }

  if (j.type === 'gather' || j.type === 'eatShroom') {
    var o = world.objects[j.idx];
    if (o) {
      var def = natureDef(o.kind);
      var wasTree = o.kind === 'tree';
      delete world.objects[j.idx];
      delete world.designations[j.idx];
      if (j.type === 'eatShroom') {
        pawn.hunger = Math.min(100, pawn.hunger + NEEDS.eatAmount);
      } else {
        for (var t in def.drops) addItem(world, j.idx, t, def.drops[t]);
        ctx.onItemChange(j.idx);
        if (wasTree) {
          world.objects[j.idx] = { kind: 'stump' }; // 그루터기 (통행 가능)
          ctx.onEvent(pawn.name + '이(가) 나무를 벌목했습니다');
        }
      }
      ctx.onWorldChange(j.idx);
    }
    releaseAllOf(world, pawn.id);
    pawn.job = null;
    pawn.state = 'idle';
    return;
  }

  if (j.type === 'mine') {
    var mb = world.buildings[j.bid];
    if (mb && (mb.charges || 0) > 0) {
      mb.charges--;
      addItem(world, idx(pawn.x, pawn.y), 'gold', GOLDMINE.dropsPerCycle);
      ctx.onItemChange(idx(pawn.x, pawn.y));
      if (mb.charges <= 0) {
        mb.depleted = true;
        delete world.mineDesig[j.bid];
        ctx.onBuildingChange(mb);
        ctx.onEvent('금광이 고갈되었습니다');
      }
    }
    releaseAllOf(world, pawn.id);
    pawn.job = null;
    pawn.state = 'idle';
    return;
  }

  if (j.type === 'build') {
    var b = world.buildings[j.bid];
    if (b && b.stage === 'bp') {
      b.stage = 'built';
      ctx.onBuildingChange(b);
      ctx.onBuildingBuilt(b);
      ctx.onEvent(pawn.name + '이(가) ' + BUILDS[b.kind].name + '을(를) 완공했습니다');
    }
    releaseAllOf(world, pawn.id);
    pawn.job = null;
    pawn.state = 'idle';
    return;
  }

  pawn.job = null;
  pawn.state = 'idle';
}

// ── 매 틱 ──
export function updatePawn(world, pawn, dtMin, ctx) {
  if (pawn.state === 'dead') return;
  pawn.ctxItemChange = ctx.onItemChange;

  pawn.hunger = Math.max(0, pawn.hunger - NEEDS.hungerDecay * dtMin);
  if (pawn.state !== 'sleeping') {
    pawn.energy = Math.max(0, pawn.energy - NEEDS.energyDecay * dtMin);
  }
  if (pawn.hunger <= 0) {
    pawn.hp = Math.max(0, pawn.hp - NEEDS.starveHpDecay * dtMin);
    if (pawn.hp <= 0) {
      abandonJob(world, pawn);
      pawn.state = 'dead';
      ctx.onDeath(pawn);
      return;
    }
  } else if (pawn.hunger > 60 && pawn.hp < 100) {
    pawn.hp = Math.min(100, pawn.hp + NEEDS.hpRegen * dtMin);
  }
  if (pawn.stuckCd > 0) pawn.stuckCd -= dtMin;

  switch (pawn.state) {
    case 'moving':
      moveStep(world, pawn, dtMin, ctx);
      break;

    case 'working': {
      var j = pawn.job;
      if (!j) { pawn.state = 'idle'; break; }
      if (j.type === 'gather' && (!world.objects[j.idx] || (!j.manual && !world.designations[j.idx]))) {
        return abandonJob(world, pawn);
      }
      if (j.type === 'build') {
        var b = world.buildings[j.bid];
        if (!b || b.stage !== 'bp') return abandonJob(world, pawn);
        b.work += dtMin;
      }
      pawn.workLeft -= dtMin;
      if (pawn.workLeft <= 0) finishWork(world, pawn, ctx);
      break;
    }

    case 'eating': {
      pawn.workLeft -= dtMin;
      if (pawn.workLeft <= 0) {
        var got = removeItem(world, idx(pawn.x, pawn.y), 'food', 1);
        if (got > 0) {
          pawn.hunger = Math.min(100, pawn.hunger + NEEDS.eatAmount);
          ctx.onItemChange(idx(pawn.x, pawn.y));
        }
        releaseAllOf(world, pawn.id);
        pawn.job = null;
        pawn.state = 'idle';
      }
      break;
    }

    case 'sleeping': {
      var inHouse = pawn.job && pawn.job.type === 'sleepHouse';
      var rate = inHouse ? NEEDS.sleepRestoreBed : NEEDS.sleepRestoreGround;
      pawn.energy = Math.min(100, pawn.energy + rate * dtMin);
      if (pawn.energy >= 100 || (pawn.hunger < 10 && pawn.energy > 30)) {
        releaseAllOf(world, pawn.id);
        pawn.job = null;
        pawn.state = 'idle';
      }
      break;
    }

    case 'idle': {
      if (pawn.manual) break; // 직접 조종 중엔 AI 미개입
      think(world, pawn, dtMin, ctx);
      break;
    }
  }
}

// ── 직접 조종: Space 상호작용 ──
// 주변(3x3)에서 나무 > 금광 > 버섯 > 설계도 순으로 대상 탐색 후 즉시 작업 시작
export function manualInteract(world, pawn, ctx) {
  if (pawn.state === 'working') { // 작업 취소
    pawn.job = null;
    pawn.state = 'idle';
    pawn.workLeft = 0;
    return '작업을 멈췄습니다';
  }
  var best = null; // {pri, d, start}
  function consider(pri, d, start) {
    if (!best || pri < best.pri || (pri === best.pri && d < best.d)) {
      best = { pri: pri, d: d, start: start };
    }
  }
  var seenB = {};
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      var tx2 = pawn.x + dx, ty2 = pawn.y + dy;
      var i = idx(tx2, ty2);
      var dd = Math.abs(dx) + Math.abs(dy) - (dx === pawn.face && dy === 0 ? 0.5 : 0);
      var o = world.objects[i];
      if (o && o.kind === 'tree') {
        (function (ii) {
          consider(0, dd, function () {
            pawn.job = { type: 'gather', idx: ii, manual: true };
            pawn.state = 'working';
            pawn.workLeft = NATURE.tree.work;
            return '🪓 벌목 시작';
          });
        })(i);
      } else if (o && o.kind === 'mushroom') {
        (function (ii) {
          consider(2, dd, function () {
            pawn.job = { type: 'gather', idx: ii, manual: true };
            pawn.state = 'working';
            pawn.workLeft = NATURE.mushroom.work;
            return '🧺 채집 시작';
          });
        })(i);
      }
      var bid = world.occupancy[i];
      if (bid !== undefined && !seenB[bid]) {
        seenB[bid] = 1;
        var b = world.buildings[bid];
        if (b && b.kind === 'goldmine' && !b.depleted) {
          (function (bb) {
            consider(1, dd, function () {
              pawn.job = { type: 'mine', bid: bb.id, manual: true };
              pawn.state = 'working';
              pawn.workLeft = GOLDMINE.work;
              return '⛏️ 금 채굴 시작';
            });
          })(b);
        } else if (b && b.stage === 'bp') {
          (function (bb) {
            consider(3, dd, function () {
              if (bpMissing(bb) !== null) return '⚠️ 자재가 아직 부족합니다';
              pawn.job = { type: 'build', bid: bb.id, manual: true };
              pawn.state = 'working';
              pawn.workLeft = Math.max(1, BUILDS[bb.kind].work - bb.work);
              return '🔨 건설 시작';
            });
          })(b);
        }
      }
    }
  }
  if (!best) return null;
  return best.start();
}

function think(world, pawn, dtMin, ctx) {
  if (pawn.hunger <= NEEDS.hungryAt) {
    var fj = findFoodJob(world, pawn);
    if (fj) {
      pawn.job = fj;
      var t0 = jobTarget(world, fj);
      if (!t0 || !goTo(world, pawn, t0.x, t0.y, t0.adj || false)) return abandonJob(world, pawn);
      return;
    }
    if (pawn.hunger < 15) ctx.onStarving(pawn);
  }

  if (pawn.energy <= NEEDS.sleepyAt) {
    var sj = findSleepJob(world, pawn);
    pawn.job = sj;
    if (sj.type === 'sleepHouse') {
      if (!goTo(world, pawn, sj.x, sj.y, false)) {
        releaseAllOf(world, pawn.id);
        pawn.job = { type: 'sleepGround' };
        pawn.state = 'sleeping';
      }
    } else {
      pawn.state = 'sleeping';
    }
    return;
  }

  if (pawn.stuckCd <= 0) {
    var wj = findWorkJob(world, pawn);
    if (wj) {
      pawn.job = wj;
      if (wj.type === 'deliver') wj.stage = 'toSrc';
      if (wj.type === 'haul') wj.stage = 'toItem';
      var t = jobTarget(world, wj);
      if (!t || !goTo(world, pawn, t.x, t.y, t.adj || false)) return abandonJob(world, pawn);
      return;
    }
  }

  pawn.wanderCd -= dtMin;
  if (pawn.wanderCd <= 0) {
    pawn.wanderCd = 20 + ctx.rng() * 40;
    var nx = pawn.x + ((ctx.rng() * 5) | 0) - 2;
    var ny = pawn.y + ((ctx.rng() * 5) | 0) - 2;
    if (isWalkable(world, nx, ny)) {
      var p = findPath(world, pawn.x, pawn.y, nx, ny, false);
      if (p && p.length > 0 && p.length < 8) {
        pawn.path = p;
        pawn.state = 'moving';
      }
    }
  }
}
