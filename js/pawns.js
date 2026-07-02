// 정착민 AI (v0.3): 욕구 → 상태기계 → 작업 수행
import {
  NEEDS, NATURE, BUILDS, WALK_MIN_PER_TILE, TRAITS, CROP, WEAPONS,
  COMBAT, COOK, HUNT, CLINIC, ANIMALS, skillMult,
} from './config.js';
import {
  idx, ix, iy, isWalkable, addItem, removeItem, natureDef, stackRoom,
  buildingDef, buildingFront, consumeGlobal, canAfford, totalRes,
  mineResource, mineWork, mineDrops, nearestEnemy, sheepById, storageFull,
} from './world.js';
import { findPath } from './path.js';
import {
  findFoodJob, findWorkJob, bpMissing,
  reserve, release, releaseAllOf, findStockpileFor,
} from './jobs.js';

var CARRY_MAX = 10;

export function createPawn(id, def, x, y) {
  var trait = def.trait || TRAITS[(Math.random() * TRAITS.length) | 0];
  return {
    id: id,
    name: def.name,
    look: def.look || { unit: 'pawn', color: def.color || 'Blue' },
    trait: trait,
    skills: def.skills || {},   // {woodcutting, mining, construction, farming, combat} → xp
    equipped: def.equipped || null, // 'sword' | 'bow' | null
    face: 1,             // 1 우 / -1 좌
    x: x, y: y,
    px: x, py: y,
    hunger: 60 + Math.random() * 30,
    hp: 100,
    mood: 70,
    state: 'idle',       // idle | moving | working | eating | dead
    job: null,
    path: null,
    workLeft: 0,
    carry: null,
    wanderCd: 0,
    stuckCd: 0,
  };
}

// 정착민을 검/활로 무장 (창고 자원에서 즉시 소비) — 실패 시 null 메시지 반환
export function equipWeapon(world, pawn, weaponType) {
  var wdef = WEAPONS[weaponType];
  if (!wdef) return null;
  if (consumeGlobal(world, weaponType, 1) < 1) return '⚠️ ' + wdef.name + ' 이(가) 없습니다';
  pawn.equipped = weaponType;
  pawn.look = { unit: wdef.equip, color: pawn.look.color };
  return '🗡️ ' + pawn.name + ' 이(가) ' + wdef.name + ' 을(를) 장착했습니다';
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
  if (pawn.state === 'eating') return '🍽️ 식사 중';
  if (pawn.state === 'resting') return '🏥 치료 중';
  if (pawn.state === 'attacking') return '⚔️ 전투 중';
  var j = pawn.job;
  if (!j) return '🌿 대기 중';
  if (pawn.state === 'working') {
    if (j.type === 'gather') return '🪓 채취 중';
    if (j.type === 'mine') return '⛏️ 금 채굴 중';
    if (j.type === 'build') return '🔨 건설 중';
    if (j.type === 'eatShroom') return '🍄 버섯 따먹는 중';
    if (j.type === 'plant') return '🌱 파종 중';
    if (j.type === 'harvestCrop') return '🌾 수확 중';
    if (j.type === 'craft') return '⚒️ ' + (WEAPONS[j.order.type] || {}).name + ' 제작 중';
  }
  var names = {
    eat: '식량 가지러 가는 중', eatShroom: '버섯 찾아가는 중',
    build: '건설하러 가는 중', deliver: '자재 운반 중',
    gather: '작업하러 가는 중', mine: '금광으로 가는 중', haul: '자원 정리 중',
    plant: '밭으로 가는 중', harvestCrop: '수확하러 가는 중', craft: '대장간으로 가는 중',
  };
  return '🚶 ' + (names[j.type] || '작업 중');
}

// 렌더러용 포즈. 작업 포즈(axe/hammer)는 도구를 든 일꾼 모습으로 렌더 →
// render.js 가 이 포즈일 때 무기 외형 대신 기본 pawn 외형으로 그린다(칼·활 대신 도구).
export function poseOf(pawn) {
  if (pawn.state === 'dead') return 'dead';
  if (pawn.state === 'attacking') return 'attack';
  if (pawn.manual && pawn.manualMoving && pawn.state !== 'working') {
    return pawn.carry ? 'carryWalk' : 'walk';
  }
  if (pawn.state === 'moving') return pawn.carry ? 'carryWalk' : 'walk';
  if (pawn.state === 'working') {
    var j = pawn.job;
    if (!j) return 'axe';
    // 건설·제작·채굴 = 망치/곡괭이 스윙 / 벌목·채집·농사 = 도끼 스윙
    if (j.type === 'build' || j.type === 'craft' || j.type === 'mine') return 'hammer';
    return 'axe';
  }
  if (pawn.carry) return 'carryIdle';
  return 'idle';
}

// 작업(도구) 포즈 여부 — 이때는 무기 외형을 숨기고 일꾼 도구 모습으로 렌더
export function isToolPose(pose) {
  return pose === 'axe' || pose === 'hammer';
}

// 건설(우선순위 높음)에 밀려 중단 가능한 저순위 작업들
var INTERRUPTIBLE = { gather: 1, mine: 1, haul: 1, cook: 1, hunt: 1 };

// "지금 실제로 할 수 있는" 건설/자재운반 작업이 있으면 true.
// (설계도가 존재만 해서는 안 됨 — 지을 준비가 됐거나, 나를 수 있는 자재가 있어야 양보)
function buildWorkAvailable(world) {
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.stage !== 'bp' || world.reserved['bp:' + id] !== undefined) continue;
    var miss = bpMissing(b);
    if (miss === null) return true; // 자재 완비 → 건설 가능
    for (var i in world.items) { // 부족 자재를 나를 수 있는가
      if ((world.items[i][miss.type] || 0) > 0 && world.reserved['item:' + i] === undefined) return true;
    }
  }
  return false;
}

// 현재 작업을 즉시 놓아줌 (재탐색 쿨다운 없이 다음 틱에 새 작업 배정)
function yieldJob(world, pawn) {
  releaseAllOf(world, pawn.id);
  if (pawn.carry) {
    addItem(world, idx(pawn.x, pawn.y), pawn.carry.type, pawn.carry.n);
    if (pawn.ctxItemChange) pawn.ctxItemChange(idx(pawn.x, pawn.y));
    pawn.carry = null;
  }
  pawn.job = null;
  pawn.path = null;
  pawn.state = 'idle';
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
    case 'plant': case 'harvestCrop':
      return { x: ix(j.idx), y: iy(j.idx), adj: true };
    case 'craft': case 'cook': case 'rest':
      return { x: j.x, y: j.y, adj: false };
    case 'hunt':
      return { x: j.x, y: j.y, adj: true };
    case 'build': case 'deliver': {
      var b = world.buildings[j.bid];
      if (!b) return null;
      if (j.type === 'deliver' && j.stage === 'toSrc') return { x: ix(j.srcIdx), y: iy(j.srcIdx), adj: false };
      var f = buildingFront(world, b);
      if (!f) return null;
      return { x: f.x, y: f.y, adj: false };
    }
    case 'mine':
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
      var rt = j.resType || 'food';
      if (!world.items[j.idx] || !(world.items[j.idx][rt] > 0)) return abandonJob(world, pawn);
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
      pawn.workLeft = mineWork(mb.kind);
      break;
    }
    case 'cook': {
      if (totalRes(world).food < COOK.foodPerMeal) return abandonJob(world, pawn);
      pawn.state = 'working';
      pawn.workLeft = COOK.work;
      break;
    }
    case 'rest': {
      pawn.state = 'resting';
      break;
    }
    case 'hunt': {
      var sh = sheepById(world, j.sheepId);
      if (!sh || !sh.hunt) return abandonJob(world, pawn);
      pawn.state = 'working';
      pawn.workLeft = HUNT.work;
      pawn.face = sh.x > pawn.x ? 1 : -1;
      break;
    }
    case 'plant': {
      if (!world.farmZone[j.idx] || world.crops[j.idx]) return abandonJob(world, pawn);
      pawn.state = 'working';
      pawn.workLeft = CROP.plantWork;
      break;
    }
    case 'harvestCrop': {
      var cr = world.crops[j.idx];
      if (!cr || cr.stage !== 'ready') return abandonJob(world, pawn);
      pawn.state = 'working';
      pawn.workLeft = CROP.harvestWork;
      break;
    }
    case 'craft': {
      var order = world.craftQueue[0];
      if (!order || order !== j.order) return abandonJob(world, pawn);
      var wdef = WEAPONS[order.type];
      if (!wdef) return abandonJob(world, pawn);
      pawn.state = 'working';
      pawn.workLeft = wdef.work;
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
        if (storageFull(world)) { ctx.onStorageFull(); }
        else { for (var t in def.drops) addItem(world, j.idx, t, def.drops[t]); ctx.onItemChange(j.idx); }
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
    if (mb && (mb.charges || 0) > 0 && storageFull(world)) {
      ctx.onStorageFull();
    } else if (mb && (mb.charges || 0) > 0) {
      mb.charges--;
      addItem(world, idx(pawn.x, pawn.y), mineResource(mb.kind), mineDrops(mb.kind));
      ctx.onItemChange(idx(pawn.x, pawn.y));
      if (mb.charges <= 0) {
        mb.depleted = true;
        delete world.mineDesig[j.bid];
        ctx.onBuildingChange(mb);
        ctx.onEvent((mb.kind === 'ironmine' ? '철광' : '금광') + '이 고갈되었습니다');
      }
    }
    releaseAllOf(world, pawn.id);
    pawn.job = null;
    pawn.state = 'idle';
    return;
  }

  if (j.type === 'cook') {
    if (consumeGlobal(world, 'food', COOK.foodPerMeal) >= COOK.foodPerMeal) {
      addItem(world, idx(pawn.x, pawn.y), 'meal', 1);
      ctx.onItemChange(idx(pawn.x, pawn.y));
      ctx.onEvent(pawn.name + '이(가) 요리를 완성했습니다');
    }
    releaseAllOf(world, pawn.id);
    pawn.job = null;
    pawn.state = 'idle';
    return;
  }

  if (j.type === 'hunt') {
    var shp = sheepById(world, j.sheepId);
    if (shp) {
      var adef = ANIMALS[shp.type || 'sheep'] || ANIMALS.sheep;
      if (!storageFull(world)) { addItem(world, 0, 'food', adef.food); }
      else ctx.onStorageFull();
      var si2 = world.sheep.indexOf(shp);
      if (si2 >= 0) world.sheep.splice(si2, 1);
      ctx.onSheepChange();
      ctx.onEvent(pawn.name + '이(가) 사냥에 성공했습니다');
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

  if (j.type === 'plant') {
    if (world.farmZone[j.idx] && !world.crops[j.idx]) {
      world.crops[j.idx] = { stage: 'growing', timer: CROP.growTime };
      ctx.onCropChange(j.idx);
    }
    releaseAllOf(world, pawn.id);
    pawn.job = null;
    pawn.state = 'idle';
    return;
  }

  if (j.type === 'harvestCrop') {
    var cr = world.crops[j.idx];
    if (cr && cr.stage === 'ready') {
      delete world.crops[j.idx];
      if (storageFull(world)) ctx.onStorageFull();
      else { addItem(world, j.idx, 'food', CROP.yield); ctx.onItemChange(j.idx); }
      ctx.onCropChange(j.idx);
      ctx.onEvent(pawn.name + '이(가) 밀을 수확했습니다');
    }
    releaseAllOf(world, pawn.id);
    pawn.job = null;
    pawn.state = 'idle';
    return;
  }

  if (j.type === 'craft') {
    var pending = world.craftQueue[0];
    if (pending) {
      var wdef = WEAPONS[pending.type];
      if (wdef && canAfford(world, wdef.cost)) {
        for (var rt in wdef.cost) consumeGlobal(world, rt, wdef.cost[rt]);
        var dropIdx = idx(pawn.x, pawn.y);
        addItem(world, dropIdx, pending.type, 1);
        ctx.onItemChange(dropIdx);
        ctx.onEvent(pawn.name + '이(가) ' + wdef.name + ' 제작을 완료했습니다');
        world.craftQueue.shift();
      }
    }
    releaseAllOf(world, pawn.id);
    pawn.job = null;
    pawn.state = 'idle';
    return;
  }

  pawn.job = null;
  pawn.state = 'idle';
}

// ── 스킬 유틸 (4) ──
function jobSkill(world, j) {
  if (!j) return null;
  switch (j.type) {
    case 'gather': return (world.objects[j.idx] && world.objects[j.idx].kind === 'tree') ? 'woodcutting' : 'farming';
    case 'mine': return 'mining';
    case 'build': case 'craft': return 'construction';
    case 'plant': case 'harvestCrop': return 'farming';
    default: return null;
  }
}
function gainSkill(pawn, key, amt) {
  if (!key) return;
  if (!pawn.skills) pawn.skills = {};
  pawn.skills[key] = Math.min(1000, (pawn.skills[key] || 0) + amt);
}

function clinicExists(world) {
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.kind === 'clinic' && b.stage === 'built') return b;
  }
  return null;
}

// ── 전투 유틸 ──
export function pawnPower(pawn) {
  var base = (pawn.equipped && WEAPONS[pawn.equipped]) ? WEAPONS[pawn.equipped].power : COMBAT.unarmedPower;
  return Math.round(base * skillMult(pawn.skills && pawn.skills.combat)); // 전투 숙련 반영
}
export function pawnRange(pawn) {
  if (pawn.equipped && WEAPONS[pawn.equipped]) return WEAPONS[pawn.equipped].range;
  return 1;
}

function greedyStep(world, pawn, tx, ty, dtMin, spd) {
  var step = (dtMin / WALK_MIN_PER_TILE) * (spd || 1);
  var vx = Math.sign(tx - pawn.px), vy = Math.sign(ty - pawn.py);
  if (vx) pawn.face = vx;
  if (Math.abs(tx - pawn.px) >= Math.abs(ty - pawn.py)) {
    if (vx && isWalkable(world, Math.round(pawn.px + vx), Math.round(pawn.py))) pawn.px += vx * step;
    else if (vy && isWalkable(world, Math.round(pawn.px), Math.round(pawn.py + vy))) pawn.py += vy * step;
  } else {
    if (vy && isWalkable(world, Math.round(pawn.px), Math.round(pawn.py + vy))) pawn.py += vy * step;
    else if (vx && isWalkable(world, Math.round(pawn.px + vx), Math.round(pawn.py))) pawn.px += vx * step;
  }
  pawn.x = Math.round(pawn.px); pawn.y = Math.round(pawn.py);
}

// 적 대응. 교전/도주하면 true(이번 틱 작업 스킵)
function handleCombat(world, pawn, dtMin, ctx) {
  var armed = !!pawn.equipped;
  var range = pawnRange(pawn);
  var senseR = armed ? range + 4 : 2;
  var near = nearestEnemy(world, pawn.px, pawn.py, senseR);
  if (!near) {
    if (pawn.combat) { pawn.combat = false; if (pawn.state === 'attacking') pawn.state = 'idle'; }
    return false;
  }
  // 기존 작업 취소하고 전투 개입
  if (pawn.job) { releaseAllOf(world, pawn.id); pawn.job = null; pawn.path = null; }
  pawn.combat = true;
  var e = near.enemy;
  if (armed) {
    if (near.dist <= range) {
      pawn.state = 'attacking';
      pawn.face = e.px > pawn.px ? 1 : -1;
      pawn.atkCd = (pawn.atkCd || 0) - dtMin;
      if (pawn.atkCd <= 0) {
        pawn.atkCd = COMBAT.attackCd;
        e.hp -= pawnPower(pawn);
        gainSkill(pawn, 'combat', 4);
      }
    } else {
      pawn.state = 'moving';
      greedyStep(world, pawn, e.px, e.py, dtMin, 1);
    }
  } else {
    // 맨손 → 도주
    pawn.state = 'moving';
    greedyStep(world, pawn, pawn.px + (Math.sign(pawn.px - e.px) || 1) * 3,
      pawn.py + (Math.sign(pawn.py - e.py) || 1) * 3, dtMin, 1.1);
  }
  return true;
}

// ── 매 틱 ──
export function updatePawn(world, pawn, dtMin, ctx) {
  if (pawn.state === 'dead') return;
  pawn.ctxItemChange = ctx.onItemChange;

  var trait = pawn.trait;
  pawn.hunger = Math.max(0, pawn.hunger - NEEDS.hungerDecay * (trait.hungerMult || 1) * dtMin);
  if (pawn.hunger <= 0) {
    pawn.hp = Math.max(0, pawn.hp - NEEDS.starveHpDecay * dtMin);
    if (pawn.hp <= 0) {
      abandonJob(world, pawn);
      pawn.state = 'dead';
      ctx.onDeath(pawn);
      return;
    }
  } else if (pawn.hunger > 60 && pawn.hp < 100) {
    pawn.hp = Math.min(100, pawn.hp + NEEDS.hpRegen * (trait.hpRegenMult || 1) * dtMin);
  }
  if (pawn.stuckCd > 0) pawn.stuckCd -= dtMin;

  // 기분: 포만감·체력의 가중 평균으로 서서히 수렴
  var moodTarget = pawn.hunger * 0.6 + pawn.hp * 0.4;
  var moodRate = 0.006 * (trait.moodMult || 1);
  pawn.mood += (moodTarget - pawn.mood) * Math.min(1, moodRate * dtMin);
  pawn.mood = Math.max(0, Math.min(100, pawn.mood));

  // 전투: 적이 있으면 AI가 자동 대응 (직접 조종 중이면 플레이어가 Space로)
  if (!pawn.manual && world.enemies.length > 0) {
    if (handleCombat(world, pawn, dtMin, ctx)) return;
  }

  // 건설 지시가 있으면 저순위 작업(벌목·채굴·운반 등)을 중단하고 건설을 먼저 하도록 양보
  // (haul 은 건설용 자재 운반과 경쟁하므로 제외 대상이 아님 — 단, 실제 건설 작업이 가능할 때만)
  if (!pawn.manual && pawn.job && INTERRUPTIBLE[pawn.job.type] && buildWorkAvailable(world)) {
    return yieldJob(world, pawn);
  }

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
      if (j.type === 'plant' && !world.farmZone[j.idx]) return abandonJob(world, pawn);
      if (j.type === 'harvestCrop' &&
          (!world.crops[j.idx] || world.crops[j.idx].stage !== 'ready')) return abandonJob(world, pawn);
      if (j.type === 'build') {
        var b = world.buildings[j.bid];
        if (!b || b.stage !== 'bp') return abandonJob(world, pawn);
        b.work += dtMin;
      }
      var moodPenalty = pawn.mood < 30 ? 0.85 : 1;
      var sk = jobSkill(world, j);
      var sm = sk ? skillMult(pawn.skills && pawn.skills[sk]) : 1;
      if (sk) gainSkill(pawn, sk, dtMin * 0.6);
      pawn.workLeft -= dtMin * (pawn.trait.workMult || 1) * moodPenalty * sm;
      if (pawn.workLeft <= 0) finishWork(world, pawn, ctx);
      break;
    }

    case 'eating': {
      pawn.workLeft -= dtMin;
      if (pawn.workLeft <= 0) {
        var ert = (world.stock.meal || 0) > 0 ? 'meal' : 'food';
        var got = removeItem(world, 0, ert, 1);
        if (got > 0) {
          var amt = ert === 'meal' ? COOK.mealEatAmount : NEEDS.eatAmount;
          pawn.hunger = Math.min(100, pawn.hunger + amt);
        }
        releaseAllOf(world, pawn.id);
        pawn.job = null;
        pawn.state = 'idle';
      }
      break;
    }

    case 'resting': {
      pawn.hp = Math.min(100, pawn.hp + CLINIC.restRegen * dtMin);
      if (pawn.hp >= CLINIC.healedAt || world.enemies.length > 0) {
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
  // 1순위: 사거리 내 적 공격 (무장 시)
  var near = nearestEnemy(world, pawn.px, pawn.py, pawnRange(pawn));
  if (near) {
    var e = near.enemy;
    pawn.face = e.px > pawn.px ? 1 : -1;
    e.hp -= pawnPower(pawn);
    // 조종성 유지: 공격은 즉발, 상태는 idle 로 되돌려 계속 이동/공격 가능
    if (pawn.job) { releaseAllOf(world, pawn.id); pawn.job = null; }
    pawn.state = 'idle';
    return pawn.equipped ? '⚔️ 공격!' : '👊 맨손 공격 (약함 — 무기를 장착하세요)';
  }
  if (pawn.state === 'working') { // 작업 취소
    releaseAllOf(world, pawn.id);
    pawn.job = null;
    pawn.state = 'idle';
    pawn.workLeft = 0;
    return '작업을 멈췄습니다';
  }
  // 인접 동물 사냥
  for (var s = 0; s < world.sheep.length; s++) {
    var shp = world.sheep[s];
    if (Math.abs(shp.x - pawn.x) <= 1 && Math.abs(shp.y - pawn.y) <= 1) {
      var adef = ANIMALS[shp.type || 'sheep'] || ANIMALS.sheep;
      addItem(world, 0, 'food', adef.food);
      world.sheep.splice(s, 1);
      if (ctx.onSheepChange) ctx.onSheepChange();
      return '🥩 ' + adef.label + ' 사냥 성공 (+식량 ' + adef.food + ')';
    }
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
      if (o && o.kind === 'tree' && world.reserved['job:' + i] === undefined) {
        (function (ii) {
          consider(0, dd, function () {
            reserve(world, 'job:' + ii, pawn.id);
            pawn.job = { type: 'gather', idx: ii, manual: true };
            pawn.state = 'working';
            pawn.workLeft = NATURE.tree.work;
            return '🪓 벌목 시작';
          });
        })(i);
      } else if (o && o.kind === 'mushroom' && world.reserved['job:' + i] === undefined) {
        (function (ii) {
          consider(2, dd, function () {
            reserve(world, 'job:' + ii, pawn.id);
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
        if (b && (b.kind === 'goldmine' || b.kind === 'ironmine') && !b.depleted && world.reserved['mine:' + bid] === undefined) {
          (function (bb) {
            consider(1, dd, function () {
              reserve(world, 'mine:' + bb.id, pawn.id);
              pawn.job = { type: 'mine', bid: bb.id, manual: true };
              pawn.state = 'working';
              pawn.workLeft = mineWork(bb.kind);
              return bb.kind === 'ironmine' ? '⛏️ 철 채굴 시작' : '⛏️ 금 채굴 시작';
            });
          })(b);
        } else if (b && b.stage === 'bp' && world.reserved['bp:' + bid] === undefined) {
          (function (bb) {
            consider(3, dd, function () {
              if (bpMissing(bb) !== null) return '⚠️ 자재가 아직 부족합니다';
              reserve(world, 'bp:' + bb.id, pawn.id);
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
    // 재고에 식량/요리가 있으면 그 자리에서 바로 먹음 (바닥에 안 쌓음)
    if ((world.stock.meal || 0) > 0 || (world.stock.food || 0) > 0) {
      releaseAllOf(world, pawn.id);
      pawn.job = null;
      pawn.state = 'eating';
      pawn.workLeft = 4;
      return;
    }
    // 재고가 없으면 야생 버섯 채집
    var fj = findFoodJob(world, pawn);
    if (fj) {
      pawn.job = fj;
      var t0 = jobTarget(world, fj);
      if (!t0 || !goTo(world, pawn, t0.x, t0.y, t0.adj || false)) return abandonJob(world, pawn);
      return;
    }
    if (pawn.hunger < 15) ctx.onStarving(pawn);
  }

  // 부상 + 치료소 존재 + 적 없음 → 치료소로 가서 회복 (6)
  if (pawn.hp < CLINIC.hurtAt && world.enemies.length === 0) {
    var clinic = clinicExists(world);
    if (clinic) {
      var cf = buildingFront(world, clinic);
      if (cf) {
        pawn.job = { type: 'rest', x: cf.x, y: cf.y };
        if (!goTo(world, pawn, cf.x, cf.y, false)) { pawn.job = null; }
        else return;
      }
    }
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
