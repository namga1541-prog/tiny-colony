// 작업 탐색·예약 시스템
// 잡: {type, idx, ...} — pawn 이 idle 일 때 findJob 으로 받아감
import { BUILDS } from './config.js';
import { ix, iy, isWalkable, stackRoom } from './world.js';

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

// 목표 타일이 서 있을 수 없는 곳이면 인접 도달로 처리해야 함
function reachable(world, i) {
  var x = ix(i), y = iy(i);
  if (isWalkable(world, x, y)) return true;
  return isWalkable(world, x + 1, y) || isWalkable(world, x - 1, y) ||
         isWalkable(world, x, y + 1) || isWalkable(world, x, y - 1);
}

function nearest(pawn, candidates) {
  var best = null, bestD = Infinity;
  for (var n = 0; n < candidates.length; n++) {
    var d = dist(pawn, candidates[n].idx);
    if (d < bestD) { bestD = d; best = candidates[n]; }
  }
  return best;
}

// ── 식사: 식량 아이템 or 버섯 직접 채취 ──
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
        cands.push({ type: 'eatMushroom', idx: jj });
      }
    }
  }
  var job = nearest(pawn, cands);
  if (job) reserve(world, 'eat:' + job.idx, pawn.id);
  return job;
}

// ── 수면: 빈 침대 or 맨바닥 ──
export function findSleepJob(world, pawn) {
  var cands = [];
  for (var i in world.built) {
    var ii = +i;
    if (world.built[i].kind === 'bed' && world.reserved['bed:' + ii] === undefined) {
      cands.push({ type: 'sleepBed', idx: ii });
    }
  }
  var job = nearest(pawn, cands);
  if (job) {
    reserve(world, 'bed:' + job.idx, pawn.id);
    return job;
  }
  return { type: 'sleepGround', idx: -1 };
}

// ── 일: 건설 > 자재 운반 > 벌목/채광/채집 > 비축 운반 ──
export function findWorkJob(world, pawn) {
  var cands = [];
  var i, ii, bp, need, t;

  // 1) 자재가 다 모인 설계도 → 건설
  for (i in world.blueprints) {
    ii = +i;
    if (world.reserved['bp:' + ii] !== undefined || !reachable(world, ii)) continue;
    bp = world.blueprints[i];
    if (bpMissing(bp) === null) cands.push({ type: 'build', idx: ii, pri: 0 });
  }

  // 2) 자재가 부족한 설계도 → 아이템 찾아 운반
  if (cands.length === 0) {
    for (i in world.blueprints) {
      ii = +i;
      if (world.reserved['bp:' + ii] !== undefined || !reachable(world, ii)) continue;
      bp = world.blueprints[i];
      need = bpMissing(bp);
      if (need === null) continue;
      var src = findItemSource(world, need.type);
      if (src >= 0) {
        cands.push({ type: 'deliver', idx: ii, srcIdx: src, resType: need.type,
                     amount: need.n, pri: 1 });
      }
    }
  }

  // 3) 지정 작업 (벌목·채광·채집)
  if (cands.length === 0) {
    for (i in world.designations) {
      ii = +i;
      if (world.reserved['job:' + ii] !== undefined) continue;
      if (!world.objects[i] || !reachable(world, ii)) continue;
      cands.push({ type: 'gather', idx: ii, pri: 2 });
    }
  }

  // 4) 흩어진 아이템 → 비축 구역 운반
  if (cands.length === 0 && hasStockpileSpace(world)) {
    for (i in world.items) {
      ii = +i;
      if (world.stockpile[i]) continue;
      if (world.reserved['haul:' + ii] !== undefined || !reachable(world, ii)) continue;
      for (t in world.items[i]) {
        if (world.items[i][t] > 0) {
          cands.push({ type: 'haul', idx: ii, resType: t, pri: 3 });
          break;
        }
      }
    }
  }

  var job = nearest(pawn, cands);
  if (!job) return null;

  if (job.type === 'build') reserve(world, 'bp:' + job.idx, pawn.id);
  else if (job.type === 'deliver') {
    reserve(world, 'bp:' + job.idx, pawn.id);
    reserve(world, 'item:' + job.srcIdx, pawn.id);
  }
  else if (job.type === 'gather') reserve(world, 'job:' + job.idx, pawn.id);
  else if (job.type === 'haul') reserve(world, 'haul:' + job.idx, pawn.id);
  return job;
}

// 설계도에 부족한 자재 { type, n } (없으면 null)
export function bpMissing(bp) {
  var cost = BUILDS[bp.kind].cost;
  for (var t in cost) {
    var have = bp.delivered[t] || 0;
    if (have < cost[t]) return { type: t, n: cost[t] - have };
  }
  return null;
}

// 예약 안 된 아이템 소스 타일 찾기
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

// 운반 목적지: 같은 종류를 쌓을 수 있는 비축 타일
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
