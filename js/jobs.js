// 작업 탐색·예약 시스템 (v0.3 — 건물 id 기반)
import { BUILDS } from './config.js';
import {
  ix, iy, idx, isWalkable, stackRoom, buildingDef, buildingFront,
} from './world.js';

export function reserve(world, key, pawnId) {
  if (world.reserved[key] !== undefined) return false;
  world.reserved[key] = pawnId;
  return true;
}

export function release(world, key) {
  delete world.reserved[key];
}

export function releaseAllOf(world, pawnId) {
  for (var k in world.reserved) {
    if (world.reserved[k] === pawnId) delete world.reserved[k];
  }
}

function dist(pawn, i) {
  return Math.abs(pawn.x - ix(i)) + Math.abs(pawn.y - iy(i));
}

function distB(pawn, b) {
  return Math.abs(pawn.x - b.x) + Math.abs(pawn.y - b.y);
}

function reachable(world, i) {
  var x = ix(i), y = iy(i);
  if (isWalkable(world, x, y)) return true;
  return isWalkable(world, x + 1, y) || isWalkable(world, x - 1, y) ||
         isWalkable(world, x, y + 1) || isWalkable(world, x, y - 1);
}

function nearest(pawn, cands, distFn) {
  var best = null, bestD = Infinity;
  for (var n = 0; n < cands.length; n++) {
    var d = distFn(cands[n]);
    if (d < bestD) { bestD = d; best = cands[n]; }
  }
  return best;
}

// ── 식사 ──
export function findFoodJob(world, pawn) {
  var cands = [];
  for (var i in world.items) {
    var ii = +i;
    if (world.items[i].food > 0 && world.reserved['eat:' + ii] === undefined && reachable(world, ii)) {
      cands.push({ type: 'eat', idx: ii });
    }
  }
  if (cands.length === 0) {
    for (var j in world.objects) {
      var jj = +j;
      if (world.objects[j].kind === 'mushroom' &&
          world.reserved['eat:' + jj] === undefined && reachable(world, jj)) {
        cands.push({ type: 'eatShroom', idx: jj });
      }
    }
  }
  var job = nearest(pawn, cands, function (c) { return dist(pawn, c.idx); });
  if (job) reserve(world, 'eat:' + job.idx, pawn.id);
  return job;
}

// ── 수면: 집 슬롯 or 맨바닥 ──
export function findSleepJob(world, pawn) {
  var cands = [];
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.kind !== 'house' || b.stage !== 'built') continue;
    var slots = BUILDS.house.sleeps;
    for (var s = 0; s < slots; s++) {
      if (world.reserved['house:' + id + ':' + s] === undefined) {
        var front = buildingFront(world, b);
        if (front) cands.push({ type: 'sleepHouse', bid: +id, slot: s, x: front.x, y: front.y });
        break;
      }
    }
  }
  var job = nearest(pawn, cands, function (c) {
    return Math.abs(pawn.x - c.x) + Math.abs(pawn.y - c.y);
  });
  if (job) {
    reserve(world, 'house:' + job.bid + ':' + job.slot, pawn.id);
    return job;
  }
  return { type: 'sleepGround' };
}

// ── 일: 건설 > 자재 운반 > 벌목/채집 > 금 채굴 > 비축 운반 ──
export function findWorkJob(world, pawn) {
  var cands = [];
  var i, ii, id, b, need;

  // 1) 자재 완비 설계도 → 건설
  for (id in world.buildings) {
    b = world.buildings[id];
    if (b.stage !== 'bp' || world.reserved['bp:' + id] !== undefined) continue;
    if (bpMissing(b) === null) cands.push({ type: 'build', bid: +id, _d: distB(pawn, b) });
  }

  // 2) 자재 부족 설계도 → 운반
  if (cands.length === 0) {
    for (id in world.buildings) {
      b = world.buildings[id];
      if (b.stage !== 'bp' || world.reserved['bp:' + id] !== undefined) continue;
      need = bpMissing(b);
      if (need === null) continue;
      var src = findItemSource(world, need.type);
      if (src >= 0) {
        cands.push({ type: 'deliver', bid: +id, srcIdx: src, resType: need.type,
                     amount: need.n, _d: dist(pawn, src) });
      }
    }
  }

  // 3) 벌목·채집 지정
  if (cands.length === 0) {
    for (i in world.designations) {
      ii = +i;
      if (world.reserved['job:' + ii] !== undefined) continue;
      if (!world.objects[i] || !reachable(world, ii)) continue;
      cands.push({ type: 'gather', idx: ii, _d: dist(pawn, ii) });
    }
  }

  // 4) 금광 채굴
  if (cands.length === 0) {
    for (id in world.mineDesig) {
      b = world.buildings[id];
      if (!b || (b.charges || 0) <= 0) continue;
      if (world.reserved['mine:' + id] !== undefined) continue;
      var front = buildingFront(world, b);
      if (!front) continue;
      cands.push({ type: 'mine', bid: +id, x: front.x, y: front.y, _d: distB(pawn, b) });
    }
  }

  // 5) 비축 운반
  if (cands.length === 0 && hasStockpileSpace(world)) {
    for (i in world.items) {
      ii = +i;
      if (world.stockpile[i]) continue;
      if (world.reserved['haul:' + ii] !== undefined || !reachable(world, ii)) continue;
      for (var t in world.items[i]) {
        if (world.items[i][t] > 0) {
          cands.push({ type: 'haul', idx: ii, resType: t, _d: dist(pawn, ii) });
          break;
        }
      }
    }
  }

  var job = nearest(pawn, cands, function (c) { return c._d; });
  if (!job) return null;

  if (job.type === 'build') reserve(world, 'bp:' + job.bid, pawn.id);
  else if (job.type === 'deliver') {
    reserve(world, 'bp:' + job.bid, pawn.id);
    reserve(world, 'item:' + job.srcIdx, pawn.id);
  }
  else if (job.type === 'gather') reserve(world, 'job:' + job.idx, pawn.id);
  else if (job.type === 'mine') reserve(world, 'mine:' + job.bid, pawn.id);
  else if (job.type === 'haul') reserve(world, 'haul:' + job.idx, pawn.id);
  return job;
}

// 설계도 부족 자재
export function bpMissing(b) {
  var cost = BUILDS[b.kind].cost;
  for (var t in cost) {
    var have = b.delivered[t] || 0;
    if (have < cost[t]) return { type: t, n: cost[t] - have };
  }
  return null;
}

function findItemSource(world, type) {
  for (var i in world.items) {
    var ii = +i;
    if ((world.items[i][type] || 0) > 0 &&
        world.reserved['item:' + ii] === undefined && reachable(world, ii)) {
      return ii;
    }
  }
  return -1;
}

export function hasStockpileSpace(world) {
  for (var i in world.stockpile) {
    if (!world.items[i]) return true;
    for (var t in world.items[i]) {
      if (stackRoom(world, +i, t) > 0) return true;
    }
  }
  return false;
}

export function findStockpileFor(world, type, pawn) {
  var best = -1, bestD = Infinity;
  for (var i in world.stockpile) {
    var ii = +i;
    if (world.reserved['stock:' + ii] !== undefined) continue;
    if (stackRoom(world, ii, type) <= 0) continue;
    if (!reachable(world, ii)) continue;
    var d = dist(pawn, ii);
    if (d < bestD) { bestD = d; best = ii; }
  }
  return best;
}
