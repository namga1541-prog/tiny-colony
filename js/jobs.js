// 작업 탐색·예약 시스템 (v0.3 — 건물 id 기반)
import { BUILDS, WEAPONS, COOK, ROLES } from './config.js';
import {
  ix, iy, idx, isWalkable, stackRoom, buildingDef, buildingFront, canAfford, totalRes,
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

// ── 식사 ── 요리(meal) > 식량(food) > 야생 버섯
export function findFoodJob(world, pawn) {
  var order = ['meal', 'food'];
  for (var oi = 0; oi < order.length; oi++) {
    var rt = order[oi];
    var cands = [];
    for (var i in world.items) {
      var ii = +i;
      if ((world.items[i][rt] || 0) > 0 && world.reserved['eat:' + ii] === undefined && reachable(world, ii)) {
        cands.push({ type: 'eat', idx: ii, resType: rt });
      }
    }
    var job = nearest(pawn, cands, function (c) { return dist(pawn, c.idx); });
    if (job) { reserve(world, 'eat:' + job.idx, pawn.id); return job; }
  }
  var mc = [];
  for (var j in world.objects) {
    var jj = +j;
    if (world.objects[j].kind === 'mushroom' &&
        world.reserved['eat:' + jj] === undefined && reachable(world, jj)) {
      mc.push({ type: 'eatShroom', idx: jj });
    }
  }
  var mjob = nearest(pawn, mc, function (c) { return dist(pawn, c.idx); });
  if (mjob) reserve(world, 'eat:' + mjob.idx, pawn.id);
  return mjob;
}

// ── 작업 후보 수집기 (예약 안 함, 순수) ──
// 각 카테고리를 독립 함수로 분리 → 일반 캐스케이드와 역할 우선 탐색이 공유.
function collectBuild(world, pawn) {
  var cands = [];
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.stage !== 'bp' || world.reserved['bp:' + id] !== undefined) continue;
    if (bpMissing(b) === null) cands.push({ type: 'build', bid: +id, _d: distB(pawn, b) });
  }
  return cands;
}
function collectDeliver(world, pawn) {
  var cands = [];
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.stage !== 'bp' || world.reserved['bp:' + id] !== undefined) continue;
    var need = bpMissing(b);
    if (need === null) continue;
    var src = findItemSource(world, need.type);
    if (src >= 0) {
      cands.push({ type: 'deliver', bid: +id, srcIdx: src, resType: need.type,
                   amount: need.n, _d: dist(pawn, src) });
    }
  }
  return cands;
}
// 대장간 제작 주문 — 플레이어가 직접 주문한 것이므로 자동 채집·채굴보다 우선.
// 단 'craft' 예약락으로 한 번에 한 명만 제작(나머지는 계속 채집).
function collectCraft(world, pawn) {
  var cands = [];
  if (!world.research.unlocked.blacksmith || world.craftQueue.length === 0) return cands;
  if (world.reserved['craft'] !== undefined) return cands;
  // 대기열에서 '살 수 있는' 첫 주문 선택 — 맨 앞이 자재 부족(예: 철 없는 강철검)이어도 뒤 주문은 진행.
  var order = null;
  for (var qi = 0; qi < world.craftQueue.length; qi++) {
    var o = world.craftQueue[qi], wd = WEAPONS[o.type];
    if (wd && canAfford(world, wd.cost)) { order = o; break; }
  }
  if (!order) return cands;
  var smithyFront = null;
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.stage === 'built' && BUILDS[b.kind] && BUILDS[b.kind].craftHere) {
      var fr = buildingFront(world, b);
      if (fr) { smithyFront = fr; break; }
    }
  }
  if (smithyFront) cands.push({ type: 'craft', x: smithyFront.x, y: smithyFront.y, order: order, _d: distB(pawn, smithyFront) });
  return cands;
}
function collectGather(world, pawn) {
  var cands = [];
  for (var i in world.designations) {
    var ii = +i;
    if (world.reserved['job:' + ii] !== undefined) continue;
    if (!world.objects[i] || !reachable(world, ii)) continue;
    cands.push({ type: 'gather', idx: ii, _d: dist(pawn, ii) });
  }
  return cands;
}
function collectMine(world, pawn) {
  var cands = [];
  for (var id in world.mineDesig) {
    var b = world.buildings[id];
    if (!b || (b.charges || 0) <= 0) continue;
    if (world.reserved['mine:' + id] !== undefined) continue;
    var front = buildingFront(world, b);
    if (!front) continue;
    cands.push({ type: 'mine', bid: +id, x: front.x, y: front.y, _d: distB(pawn, b) });
  }
  return cands;
}
// 농사 (밭 심기 + 수확)
function collectFarm(world, pawn) {
  var cands = [];
  if (!world.research.unlocked.farming) return cands;
  for (var i in world.farmZone) {
    var ii = +i;
    var crop = world.crops[i];
    if (crop && crop.stage === 'ready') {
      if (world.reserved['crop:' + ii] !== undefined) continue;
      cands.push({ type: 'harvestCrop', idx: ii, _d: dist(pawn, ii) });
    } else if (!crop) {
      if (world.reserved['crop:' + ii] !== undefined || !reachable(world, ii)) continue;
      cands.push({ type: 'plant', idx: ii, _d: dist(pawn, ii) });
    }
  }
  return cands;
}
// 요리 (모닥불에서 식량 → 요리). 요리 재고가 적을 때만
function collectCook(world, pawn) {
  var cands = [];
  var res = totalRes(world);
  if (res.meal < 6 && res.food >= COOK.foodPerMeal && world.reserved['cook'] === undefined) {
    var fire = null;
    for (var id in world.buildings) {
      var b = world.buildings[id];
      if (b.kind === 'campfire' && b.stage === 'built') {
        var ff = buildingFront(world, b);
        if (ff) { fire = ff; break; }
      }
    }
    if (fire) cands.push({ type: 'cook', x: fire.x, y: fire.y, _d: distB(pawn, fire) });
  }
  return cands;
}
function collectHunt(world, pawn) {
  var cands = [];
  for (var si = 0; si < world.sheep.length; si++) {
    var sh = world.sheep[si];
    if (!sh.hunt) continue;
    if (world.reserved['hunt:' + sh.id] !== undefined) continue;
    cands.push({ type: 'hunt', sheepId: sh.id, x: sh.x, y: sh.y, _d: Math.abs(pawn.x - sh.x) + Math.abs(pawn.y - sh.y) });
  }
  return cands;
}
function collectFish(world, pawn) {
  var cands = [];
  for (var i in world.fishDesig) {
    var ii = +i;
    if (world.reserved['fish:' + ii] !== undefined || !reachable(world, ii)) continue;
    cands.push({ type: 'fish', idx: ii, _d: dist(pawn, ii) });
  }
  return cands;
}
function collectHaul(world, pawn) {
  var cands = [];
  if (!hasStockpileSpace(world)) return cands;
  for (var i in world.items) {
    var ii = +i;
    if (world.stockpile[i]) continue;
    if (world.reserved['haul:' + ii] !== undefined || !reachable(world, ii)) continue;
    for (var t in world.items[i]) {
      if (world.items[i][t] > 0) {
        cands.push({ type: 'haul', idx: ii, resType: t, _d: dist(pawn, ii) });
        break;
      }
    }
  }
  return cands;
}

// job.type 토큰 → 수집기. plant·harvestCrop 는 같은 농사 수집기(중복 호출은 seen 으로 방지).
var COLLECTOR = {
  build: collectBuild, deliver: collectDeliver, craft: collectCraft,
  gather: collectGather, mine: collectMine,
  plant: collectFarm, harvestCrop: collectFarm,
  cook: collectCook, hunt: collectHunt, fish: collectFish, haul: collectHaul,
};

// 확정 작업에 예약락 부여 (역할 탐색·일반 탐색 공용)
function reserveJob(world, job, pawn) {
  if (job.type === 'build') reserve(world, 'bp:' + job.bid, pawn.id);
  else if (job.type === 'deliver') {
    reserve(world, 'bp:' + job.bid, pawn.id);
    reserve(world, 'item:' + job.srcIdx, pawn.id);
  }
  else if (job.type === 'gather') reserve(world, 'job:' + job.idx, pawn.id);
  else if (job.type === 'mine') reserve(world, 'mine:' + job.bid, pawn.id);
  else if (job.type === 'haul') reserve(world, 'haul:' + job.idx, pawn.id);
  else if (job.type === 'plant' || job.type === 'harvestCrop') reserve(world, 'crop:' + job.idx, pawn.id);
  else if (job.type === 'craft') reserve(world, 'craft', pawn.id);
  else if (job.type === 'cook') reserve(world, 'cook', pawn.id);
  else if (job.type === 'hunt') reserve(world, 'hunt:' + job.sheepId, pawn.id);
  else if (job.type === 'fish') reserve(world, 'fish:' + job.idx, pawn.id);
}

// 역할 우선 탐색: 역할 작업 카테고리에서만 후보를 모아 가장 가까운 것 선택.
function findRoleWork(world, pawn, jobTypes) {
  var seen = [], cands = [];
  for (var k = 0; k < jobTypes.length; k++) {
    var col = COLLECTOR[jobTypes[k]];
    if (!col || seen.indexOf(col) >= 0) continue;
    seen.push(col);
    cands = cands.concat(col(world, pawn));
  }
  var job = nearest(pawn, cands, function (c) { return c._d; });
  if (job) reserveJob(world, job, pawn);
  return job;
}

// 일반 우선순위 캐스케이드: 건설 > 운반 > 제작 > 채집 > 채굴 > 농사 > 요리 > 사냥 > 낚시 > 비축.
function findDefaultWork(world, pawn) {
  var cands = collectBuild(world, pawn);
  if (!cands.length) cands = collectDeliver(world, pawn);
  if (!cands.length) cands = collectCraft(world, pawn);
  if (!cands.length) cands = collectGather(world, pawn);
  if (!cands.length) cands = collectMine(world, pawn);
  if (!cands.length) cands = collectFarm(world, pawn);
  if (!cands.length) cands = collectCook(world, pawn);
  if (!cands.length) cands = collectHunt(world, pawn);
  if (!cands.length) cands = collectFish(world, pawn);
  if (!cands.length) cands = collectHaul(world, pawn);
  var job = nearest(pawn, cands, function (c) { return c._d; });
  if (job) reserveJob(world, job, pawn);
  return job;
}

// ── 일: 역할이 있으면 전문 작업 우선, 없으면(또는 전문 작업 없으면) 일반 우선순위 ──
export function findWorkJob(world, pawn) {
  var role = pawn.role && ROLES[pawn.role];
  if (role && role.jobs && role.jobs.length) {
    var rj = findRoleWork(world, pawn, role.jobs);
    if (rj) return rj;
  }
  return findDefaultWork(world, pawn);
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
