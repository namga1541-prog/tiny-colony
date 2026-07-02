// 작업 탐색·예약 시스템 (v0.3 — 건물 id 기반)
import { BUILDS, WEAPONS, COOK } from './config.js';
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

  // 2.5) 대장간 제작 주문 — 플레이어가 직접 주문한 것이므로 자동 채집·채굴보다 우선.
  //       단 'craft' 예약락으로 한 번에 한 명만 제작(나머지는 계속 채집).
  if (cands.length === 0 && world.research.unlocked.blacksmith && world.craftQueue.length > 0) {
    var order = world.craftQueue[0];
    var wdef = WEAPONS[order.type];
    if (wdef && canAfford(world, wdef.cost) && world.reserved['craft'] === undefined) {
      var houseFront = null;
      for (id in world.buildings) {
        b = world.buildings[id];
        if (b.kind === 'house' && b.stage === 'built') {
          var fr = buildingFront(world, b);
          if (fr) { houseFront = fr; break; }
        }
      }
      if (houseFront) cands.push({ type: 'craft', x: houseFront.x, y: houseFront.y, order: order, _d: distB(pawn, houseFront) });
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

  // 4.5) 농사 (밭 심기 > 수확)
  if (cands.length === 0 && world.research.unlocked.farming) {
    for (i in world.farmZone) {
      ii = +i;
      var crop = world.crops[i];
      if (crop && crop.stage === 'ready') {
        if (world.reserved['crop:' + ii] !== undefined) continue;
        cands.push({ type: 'harvestCrop', idx: ii, _d: dist(pawn, ii) });
      } else if (!crop) {
        if (world.reserved['crop:' + ii] !== undefined || !reachable(world, ii)) continue;
        cands.push({ type: 'plant', idx: ii, _d: dist(pawn, ii) });
      }
    }
  }

  // 4.8) 요리 (모닥불에서 식량 → 요리). 요리 재고가 적을 때만
  if (cands.length === 0) {
    var res = totalRes(world);
    if (res.meal < 6 && res.food >= COOK.foodPerMeal && world.reserved['cook'] === undefined) {
      var fire = null;
      for (id in world.buildings) {
        b = world.buildings[id];
        if (b.kind === 'campfire' && b.stage === 'built') {
          var ff = buildingFront(world, b);
          if (ff) { fire = ff; break; }
        }
      }
      if (fire) cands.push({ type: 'cook', x: fire.x, y: fire.y, _d: distB(pawn, fire) });
    }
  }

  // 4.9) 사냥 (지정된 양)
  if (cands.length === 0) {
    for (var si = 0; si < world.sheep.length; si++) {
      var sh = world.sheep[si];
      if (!sh.hunt) continue;
      if (world.reserved['hunt:' + sh.id] !== undefined) continue;
      cands.push({ type: 'hunt', sheepId: sh.id, x: sh.x, y: sh.y, _d: Math.abs(pawn.x - sh.x) + Math.abs(pawn.y - sh.y) });
    }
  }

  // 4.95) 낚시 (지정된 물가)
  if (cands.length === 0) {
    for (i in world.fishDesig) {
      ii = +i;
      if (world.reserved['fish:' + ii] !== undefined || !reachable(world, ii)) continue;
      cands.push({ type: 'fish', idx: ii, _d: dist(pawn, ii) });
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
  else if (job.type === 'plant' || job.type === 'harvestCrop') reserve(world, 'crop:' + job.idx, pawn.id);
  else if (job.type === 'craft') reserve(world, 'craft', pawn.id);
  else if (job.type === 'cook') reserve(world, 'cook', pawn.id);
  else if (job.type === 'hunt') reserve(world, 'hunt:' + job.sheepId, pawn.id);
  else if (job.type === 'fish') reserve(world, 'fish:' + job.idx, pawn.id);
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
