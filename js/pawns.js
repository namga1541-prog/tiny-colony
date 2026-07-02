// 정착민 AI: 욕구 → 상태기계 → 작업 수행
import { NEEDS, NATURE, BUILDS, WALK_MIN_PER_TILE } from './config.js';
import {
  idx, ix, iy, isWalkable, addItem, removeItem, natureDef, stackRoom,
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
    spr: def.spr,
    x: x, y: y,          // 논리 위치 (타일)
    px: x, py: y,        // 표시 위치 (부드러운 이동)
    hunger: 85, energy: 85, hp: 100,
    state: 'idle',       // idle | moving | working | eating | sleeping | dead
    job: null,
    path: null,
    workLeft: 0,
    carry: null,         // {type, n}
    wanderCd: 0,
    stuckCd: 0,
  };
}

export function taskLabel(pawn) {
  if (pawn.state === 'dead') return '💀 사망';
  if (pawn.state === 'sleeping') return '😴 수면 중';
  if (pawn.state === 'eating') return '🍽️ 식사 중';
  var j = pawn.job;
  if (!j) return '🌿 대기 중';
  var names = {
    eat: '식량 가지러 가는 중', eatMushroom: '버섯 먹으러 가는 중',
    sleepBed: '침대로 가는 중', sleepGround: '잘 곳 찾는 중',
    build: '건설 중', deliver: '자재 운반 중',
    gather: '채취 작업 중', haul: '자원 정리 중',
  };
  if (j.type === 'build' && pawn.state === 'working') {
    return '🔨 ' + BUILDS[j.kind || (j.bpKind || 'woodWall')].name + ' 건설 중';
  }
  if (j.type === 'gather' && pawn.state === 'working') return '🪓 채취 중';
  return '🚶 ' + (names[j.type] || '작업 중');
}

function abandonJob(world, pawn) {
  releaseAllOf(world, pawn.id);
  if (pawn.carry) {
    addItem(world, idx(pawn.x, pawn.y), pawn.carry.type, pawn.carry.n);
    pawn.carry = null;
    if (pawn.onItemChange) pawn.onItemChange(idx(pawn.x, pawn.y));
  }
  pawn.job = null;
  pawn.path = null;
  pawn.state = 'idle';
  pawn.stuckCd = 15; // 15 게임분 동안 재탐색 쉬기 (무한 루프 방지)
}

function goTo(world, pawn, targetIdx, adjacentOk) {
  var path = findPath(world, pawn.x, pawn.y, ix(targetIdx), iy(targetIdx), adjacentOk);
  if (path === null) return false;
  pawn.path = path;
  pawn.state = 'moving';
  return true;
}

function moveStep(world, pawn, dtMin, ctx) {
  var budget = dtMin / WALK_MIN_PER_TILE;
  while (budget > 0 && pawn.path && pawn.path.length > 0) {
    var next = pawn.path[0];
    if (!isWalkable(world, next.x, next.y)) {
      // 벽이 새로 생기는 등 경로가 막힘 → 재계산
      var j = pawn.job;
      if (!j) { pawn.path = null; pawn.state = 'idle'; return; }
      var tIdx = j.idx;
      if (j.type === 'deliver' && j.stage === 'toSrc') tIdx = j.srcIdx;
      if (j.type === 'haul' && j.stage === 'toStock') tIdx = j.destIdx;
      if (!goTo(world, pawn, tIdx, jobAdjacentOk(world, j))) abandonJob(world, pawn);
      return;
    }
    var dx = next.x - pawn.px, dy = next.y - pawn.py;
    var d = Math.abs(dx) + Math.abs(dy);
    if (d <= budget) {
      budget -= d;
      pawn.px = next.x; pawn.py = next.y;
      pawn.x = next.x; pawn.y = next.y;
      pawn.path.shift();
    } else {
      pawn.px += (dx === 0 ? 0 : Math.sign(dx) * budget * (Math.abs(dx) / d));
      pawn.py += (dy === 0 ? 0 : Math.sign(dy) * budget * (Math.abs(dy) / d));
      // 이동 방향 절반 넘으면 논리 위치도 갱신
      budget = 0;
    }
  }
  if (pawn.path && pawn.path.length === 0) {
    pawn.path = null;
    onArrive(world, pawn, ctx);
  }
}

function jobAdjacentOk(world, job) {
  if (!job) return false;
  if (job.type === 'gather' || job.type === 'build' || job.type === 'eatMushroom') return true;
  if (job.type === 'deliver' && job.stage === 'toBp') return true;
  return false;
}

// ── 도착 시 다음 단계 ──
function onArrive(world, pawn, ctx) {
  var j = pawn.job;
  if (!j) { pawn.state = 'idle'; return; }
  var here = idx(pawn.x, pawn.y);

  switch (j.type) {
    case 'eat': {
      if (!world.items[j.idx] || !(world.items[j.idx].food > 0)) return abandonJob(world, pawn);
      pawn.state = 'eating';
      pawn.workLeft = 6; // 6 게임분 식사
      break;
    }
    case 'eatMushroom': {
      var o = world.objects[j.idx];
      if (!o || o.kind !== 'mushroom') return abandonJob(world, pawn);
      pawn.state = 'working';
      pawn.workLeft = NATURE.mushroom.work;
      break;
    }
    case 'sleepBed': {
      if (!world.built[j.idx] || world.built[j.idx].kind !== 'bed') return abandonJob(world, pawn);
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
      break;
    }
    case 'build': {
      var bp = world.blueprints[j.idx];
      if (!bp || bpMissing(bp) !== null) return abandonJob(world, pawn);
      pawn.state = 'working';
      pawn.workLeft = Math.max(1, BUILDS[bp.kind].work - bp.work);
      j.bpKind = bp.kind;
      break;
    }
    case 'deliver': {
      if (j.stage === 'toSrc') {
        var bp2 = world.blueprints[j.idx];
        if (!bp2) return abandonJob(world, pawn);
        var missing = bpMissing(bp2);
        if (!missing || missing.type !== j.resType) return abandonJob(world, pawn);
        var got = removeItem(world, here, j.resType, Math.min(j.amount, CARRY_MAX));
        release(world, 'item:' + j.srcIdx);
        if (got <= 0) return abandonJob(world, pawn);
        pawn.carry = { type: j.resType, n: got };
        ctx.onItemChange(here);
        j.stage = 'toBp';
        if (!goTo(world, pawn, j.idx, true)) return abandonJob(world, pawn);
      } else {
        var bp3 = world.blueprints[j.idx];
        if (!bp3 || !pawn.carry) return abandonJob(world, pawn);
        bp3.delivered[pawn.carry.type] = (bp3.delivered[pawn.carry.type] || 0) + pawn.carry.n;
        // 초과분은 바닥에 내려놓음
        var cost = BUILDS[bp3.kind].cost[pawn.carry.type] || 0;
        var over = (bp3.delivered[pawn.carry.type] || 0) - cost;
        if (over > 0) {
          bp3.delivered[pawn.carry.type] = cost;
          addItem(world, here, pawn.carry.type, over);
          ctx.onItemChange(here);
        }
        pawn.carry = null;
        if (bpMissing(bp3) === null) {
          // 자재 완비 → 바로 건설 시작 (bp 예약 유지)
          pawn.job = { type: 'build', idx: j.idx };
          pawn.state = 'working';
          pawn.workLeft = BUILDS[bp3.kind].work;
        } else {
          release(world, 'bp:' + j.idx);
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
        if (!goTo(world, pawn, dest, false)) return abandonJob(world, pawn);
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
        if (pawn.carry) return abandonJob(world, pawn); // 남으면 그 자리에 내려놓음
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
  var here;
  if (!j) { pawn.state = 'idle'; return; }

  if (j.type === 'gather' || j.type === 'eatMushroom') {
    var o = world.objects[j.idx];
    if (o) {
      var def = natureDef(o.kind);
      delete world.objects[j.idx];
      delete world.designations[j.idx];
      if (j.type === 'eatMushroom') {
        pawn.hunger = Math.min(100, pawn.hunger + NEEDS.eatAmount);
      } else {
        for (var t in def.drops) addItem(world, j.idx, t, def.drops[t]);
        ctx.onItemChange(j.idx);
      }
      ctx.onWorldChange(j.idx);
    }
    releaseAllOf(world, pawn.id);
    pawn.job = null;
    pawn.state = 'idle';
    return;
  }

  if (j.type === 'build') {
    var bp = world.blueprints[j.idx];
    if (bp) {
      delete world.blueprints[j.idx];
      world.built[j.idx] = { kind: bp.kind };
      ctx.onWorldChange(j.idx);
      // 벽이 완성되면 그 칸에 서 있던 정착민을 옆으로 밀어냄
      if (BUILDS[bp.kind].solid) ctx.onWallBuilt(j.idx);
    }
    releaseAllOf(world, pawn.id);
    pawn.job = null;
    pawn.state = 'idle';
    return;
  }

  pawn.job = null;
  pawn.state = 'idle';
}

// ── 매 틱 갱신 ──
export function updatePawn(world, pawn, dtMin, ctx) {
  if (pawn.state === 'dead') return;

  // 욕구 감소
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
      // 작업 대상 유효성 확인
      var j = pawn.job;
      if (!j) { pawn.state = 'idle'; break; }
      if (j.type === 'gather' && (!world.objects[j.idx] || !world.designations[j.idx])) {
        return abandonJob(world, pawn);
      }
      if (j.type === 'build') {
        var bp = world.blueprints[j.idx];
        if (!bp) return abandonJob(world, pawn);
        bp.work += dtMin;
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
      var inBed = pawn.job && pawn.job.type === 'sleepBed';
      var rate = inBed ? NEEDS.sleepRestoreBed : NEEDS.sleepRestoreGround;
      pawn.energy = Math.min(100, pawn.energy + rate * dtMin);
      if (pawn.energy >= 100 || (pawn.hunger < 10 && pawn.energy > 30)) {
        releaseAllOf(world, pawn.id);
        pawn.job = null;
        pawn.state = 'idle';
      }
      break;
    }

    case 'idle': {
      think(world, pawn, dtMin, ctx);
      break;
    }
  }
}

function think(world, pawn, dtMin, ctx) {
  // 1) 배고픔
  if (pawn.hunger <= NEEDS.hungryAt) {
    var fj = findFoodJob(world, pawn);
    if (fj) {
      pawn.job = fj;
      var adjOk = fj.type === 'eatMushroom';
      if (!goTo(world, pawn, fj.idx, adjOk)) return abandonJob(world, pawn);
      return;
    }
    if (pawn.hunger < 15) ctx.onStarving(pawn);
  }

  // 2) 졸림
  if (pawn.energy <= NEEDS.sleepyAt) {
    var sj = findSleepJob(world, pawn);
    pawn.job = sj;
    if (sj.type === 'sleepBed') {
      if (!goTo(world, pawn, sj.idx, false)) {
        release(world, 'bed:' + sj.idx);
        pawn.job = { type: 'sleepGround', idx: -1 };
        pawn.state = 'sleeping';
      }
    } else {
      pawn.state = 'sleeping';
    }
    return;
  }

  // 3) 일감
  if (pawn.stuckCd <= 0) {
    var wj = findWorkJob(world, pawn);
    if (wj) {
      pawn.job = wj;
      if (wj.type === 'deliver') wj.stage = 'toSrc';
      if (wj.type === 'haul') wj.stage = 'toItem';
      var target = wj.type === 'deliver' ? wj.srcIdx : wj.idx;
      var adj = wj.type === 'gather' || wj.type === 'build';
      if (!goTo(world, pawn, target, adj)) return abandonJob(world, pawn);
      return;
    }
  }

  // 4) 배회
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
