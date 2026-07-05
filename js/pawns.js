// 정착민 AI (v0.3): 욕구 → 상태기계 → 작업 수행
import {
  NEEDS, NATURE, BUILDS, WALK_MIN_PER_TILE, TRAITS, CROP, FRUITTREE, WEAPONS, ARMOR, ITEMS,
  COMBAT, COOK_TIERS, GLORIOUS_FOOD, HUNT, TAME, CLINIC, INJURY, WINTER, ANIMALS, FISHING, FISH, catchFish, catchRareFish, skillMult,
  ROLES, ROLE_SPEED_BONUS, FAITH,
} from './config.js';
import {
  idx, ix, iy, isWalkable, addItem, removeItem, natureDef, stackRoom,
  buildingDef, buildingFront, consumeGlobal, canAfford, totalRes,
  mineResource, mineWork, mineDrops, nearestEnemy, sheepById, storageFull,
  upgradeMult, grantRelic, fishSpotTier, seasonDef,
} from './world.js';
import { findPath } from './path.js';
import {
  findFoodJob, findWorkJob, bpMissing, hasStarvedWork,
  reserve, release, releaseAllOf, findStockpileFor,
} from './jobs.js';

var CARRY_MAX = 10;

export function createPawn(id, def, x, y, rng) {
  // rng: 결정론용 주입 난수(테스트·재현). 없으면 Math.random 폴백(런타임 동일 동작).
  var rnd = rng || Math.random;
  var trait = def.trait || TRAITS[(rnd() * TRAITS.length) | 0];
  return {
    id: id,
    name: def.name,
    look: def.look || { human: 'villager' },
    trait: trait,
    skills: def.skills || {},   // {woodcutting, mining, construction, farming, combat} → xp
    role: def.role || 'none',   // 특화 역할 (config.ROLES 키). 'none' = 자유
    equipped: def.equipped || null, // 'sword' | 'bow' | null
    armor: def.armor || null,       // 'leatherArmor' | 'ironArmor' | null
    injury: def.injury || null,     // { type: 'leg'|'arm', severity: 0~1 } | null — 치료소에서 쉬어야만 낫는다
    cold: def.cold || 0,            // 냉기(0 따뜻함~100 동결). 겨울에 온기 밖이면 상승, 최대치면 hp 감소
    boating: def.boating || null,   // 탑승 중인 배 id(없으면 null). 탑승 중엔 물 위를 조종해 다닌다
    autoAttack: true,    // 무기 든 채 직접 조종 중에도 사거리 내 적 자동 공격(기본 ON, ⚔️로 끔)
    face: 1,             // 1 우 / -1 좌
    x: x, y: y,
    px: x, py: y,
    hunger: 60 + rnd() * 30,
    hp: 100,
    maxHp: def.maxHp || 100, // 찬란한 음식(GLORIOUS_FOOD)을 먹으면 영구 증가
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
  pawn.equipped = weaponType; // 사람은 장착해도 외형 불변 (전투 스탯만 반영, 무기는 아이콘으로)
  return '🗡️ ' + pawn.name + ' 이(가) ' + wdef.name + ' 을(를) 장착했습니다';
}

// 정착민에게 방어구 착용 (창고 자원에서 즉시 소비) — 무기와 별개 슬롯
export function equipArmor(world, pawn, armorType) {
  var adef = ARMOR[armorType];
  if (!adef) return null;
  if (consumeGlobal(world, armorType, 1) < 1) return '⚠️ ' + adef.name + ' 이(가) 없습니다';
  pawn.armor = armorType;
  return '🛡️ ' + pawn.name + ' 이(가) ' + adef.name + ' 을(를) 착용했습니다';
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
    if (j.type === 'fish') return '🎣 낚시 중';
    if (j.type === 'craft') return '⚒️ ' + (ITEMS[j.order.type] || {}).name + ' 제작 중';
  }
  var names = {
    eat: '식량 가지러 가는 중', eatShroom: '버섯 찾아가는 중',
    build: '건설하러 가는 중', deliver: '자재 운반 중',
    gather: '작업하러 가는 중', mine: '금광으로 가는 중', haul: '자원 정리 중',
    plant: '밭으로 가는 중', harvestCrop: '수확하러 가는 중', craft: '대장간으로 가는 중',
    fish: '낚시터로 가는 중', tame: '동물 길들이는 중',
  };
  return '🚶 ' + (names[j.type] || '작업 중');
}

// 렌더러용 포즈 (사람 캐릭터: idle/walk/dead). 작업 표시는 머리 위 도구 아이콘(toolIconOf)이 담당.
export function poseOf(pawn) {
  if (pawn.state === 'dead') return 'dead';
  var moving = pawn.state === 'moving' || (pawn.manual && pawn.manualMoving && pawn.state !== 'working');
  return moving ? 'walk' : 'idle';
}

// 작업 중 손에 든 도구 아이콘(작업 종류마다 다르게 표시) — 스프라이트 시트에
// 동작별 애니메이션이 없어(도끼/망치 스윙 2종뿐) 아이콘으로 작업 종류를 구분한다.
export function toolIconOf(world, pawn) {
  if (pawn.state === 'resting') return '❤️';
  if (pawn.state !== 'working' || !pawn.job) return null;
  switch (pawn.job.type) {
    case 'gather': {
      var o = world.objects[pawn.job.idx];
      return (o && (o.kind === 'mushroom' || o.kind === 'carrotPatch')) ? '🧺' : '🪓';
    }
    case 'mine': return '⛏️';
    case 'build': return '🔨';
    case 'craft': return '⚒️';
    case 'cook': return '🍳';
    case 'hunt': return '🏹';
    case 'tame': return '🐴';
    case 'fish': return '🎣';
    case 'plant': return '🌱';
    case 'harvestCrop': return '🌾';
    case 'eatShroom': return '🍄';
    default: return null;
  }
}

// 건설(우선순위 높음)에 밀려 중단 가능한 저순위 작업들
var INTERRUPTIBLE = { gather: 1, mine: 1, haul: 1, cook: 1, hunt: 1, tame: 1 };

// "지금 실제로 할 수 있는" 건설/자재운반 작업이 있으면 true.
// (설계도가 존재만 해서는 안 됨 — 지을 준비가 됐거나, 재고에서 나를 수 있는 자재가 있어야 양보)
function buildWorkAvailable(world) {
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.stage !== 'bp' || world.reserved['bp:' + id] !== undefined) continue;
    var miss = bpMissing(b);
    if (miss === null) return true; // 자재 완비 → 건설 가능
    if ((world.stock[miss.type] || 0) > 0) return true; // 재고에서 나를 수 있음(가상 창고 배달)
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
    case 'hunt': case 'tame':
      return { x: j.x, y: j.y, adj: true };
    case 'fish':
      return { x: ix(j.idx), y: iy(j.idx), adj: true }; // 물가 인접에서 낚시
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
  var legMult = (pawn.injury && pawn.injury.type === 'leg') ? INJURY.legSpeedMult : 1;
  var budget = (dtMin / WALK_MIN_PER_TILE) * legMult;
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
      var cookTier = cookTierDef(j.tierId);
      if (!cookTier || !canAfford(world, cookTier.cost)) return abandonJob(world, pawn);
      pawn.state = 'working';
      pawn.workLeft = cookTier.work;
      break;
    }
    case 'rest': {
      pawn.state = 'resting';
      break;
    }
    case 'fish': {
      if (!world.fishDesig[j.idx]) return abandonJob(world, pawn);
      pawn.state = 'working';
      pawn.workLeft = FISHING.work;
      pawn.face = ix(j.idx) > pawn.x ? 1 : -1;
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
    case 'tame': {
      var shT = sheepById(world, j.sheepId);
      if (!shT || !shT.tame || shT.tamed) return abandonJob(world, pawn);
      pawn.state = 'working';
      pawn.workLeft = TAME.work;
      pawn.face = shT.x > pawn.x ? 1 : -1;
      break;
    }
    case 'plant': {
      var isOrchard = !!world.orchardZone[j.idx];
      if ((!world.farmZone[j.idx] && !isOrchard) || world.crops[j.idx]) return abandonJob(world, pawn);
      pawn.state = 'working';
      pawn.workLeft = isOrchard ? FRUITTREE.plantWork : CROP.plantWork;
      break;
    }
    case 'harvestCrop': {
      var cr = world.crops[j.idx];
      if (!cr || cr.stage !== 'ready') return abandonJob(world, pawn);
      pawn.state = 'working';
      pawn.workLeft = cr.kind === 'fruit' ? FRUITTREE.harvestWork : CROP.harvestWork;
      break;
    }
    case 'craft': {
      var order = j.order;
      if (!order || world.craftQueue.indexOf(order) < 0) return abandonJob(world, pawn);
      var wdef = ITEMS[order.type];
      if (!wdef || !canAfford(world, wdef.cost)) return abandonJob(world, pawn);
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
      var wasChest = o.kind === 'chest';
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
        if (wasChest) { // 원정 섬 보물상자: 60% 확률로 유물도 함께 획득
          if ((ctx.rng ? ctx.rng() : Math.random()) < 0.6) {
            var got = grantRelic(world, ctx.rng || Math.random);
            if (ctx.onToast) ctx.onToast('📦 보물상자에서 유물 획득: ' + got.def.icon + ' ' + got.def.name + ' — ' + got.def.desc);
          }
          ctx.onEvent('📦 ' + pawn.name + ' 이(가) 보물상자를 열었습니다!');
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
    var ctier = cookTierDef(j.tierId);
    if (ctier && canAfford(world, ctier.cost)) {
      for (var cct in ctier.cost) consumeGlobal(world, cct, ctier.cost[cct]);
      // 등급과 무관하게 극히 낮은 확률로 "성공"해 찬란한 음식이 대신 나옴
      if ((ctx.rng || Math.random)() < GLORIOUS_FOOD.chance) {
        addItem(world, idx(pawn.x, pawn.y), GLORIOUS_FOOD.id, 1);
        ctx.onItemChange(idx(pawn.x, pawn.y));
        if (ctx.onToast) ctx.onToast('✨ ' + pawn.name + '이(가) 요리 중 기적처럼 「찬란한 음식」을 만들어냈습니다!', true);
        ctx.onEvent('✨ ' + pawn.name + ' 이(가) 「찬란한 음식」을 완성했습니다');
      } else {
        addItem(world, idx(pawn.x, pawn.y), ctier.id, 1);
        ctx.onItemChange(idx(pawn.x, pawn.y));
        ctx.onEvent(pawn.name + '이(가) ' + ctier.name + '을(를) 완성했습니다');
      }
    }
    releaseAllOf(world, pawn.id);
    pawn.job = null;
    pawn.state = 'idle';
    return;
  }

  if (j.type === 'fish') {
    if (world.fishDesig[j.idx]) {
      if (storageFull(world)) { ctx.onStorageFull(); }
      else {
        var fish;
        if (world.rareFishTile[j.idx]) {
          fish = catchRareFish(ctx.rng || Math.random); // 초특급 희귀어종 전용 스팟 — 밍크고래 등만 낚임
        } else {
          var spotBonus = Math.max(0, fishSpotTier(world, ix(j.idx), iy(j.idx)));
          fish = catchFish(world.rodTier || 0, ctx.rng || Math.random, spotBonus);
        }
        addItem(world, 0, 'food', fish.food);
        if (fish.gold) addItem(world, 0, 'gold', fish.gold);
        if (fish.delicacy) addItem(world, 0, 'delicacy', fish.delicacy);
        var fgold = fish.gold ? ' (금 +' + fish.gold + ')' : '';
        var fdeli = fish.delicacy ? ' (진미 +' + fish.delicacy + ')' : '';
        if (fish.spotOnly) { world.caughtSpotOnlyFish = true; ctx.onEvent('🐋 ' + pawn.name + ' 이(가) 초특급 희귀어종 "' + fish.name + '" 을(를) 낚았습니다!!' + fgold + fdeli); }
        else if (fish.rare >= 2) ctx.onEvent('🎣 ' + pawn.name + ' 이(가) 희귀 어종 "' + fish.name + '" 을(를) 낚았습니다!' + fgold + fdeli);
        else ctx.onEvent('🎣 ' + pawn.name + ' 이(가) ' + fish.name + ' 을(를) 낚았습니다' + fgold);
      }
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
      var vetMult = (world.research && world.research.unlocked && world.research.unlocked.veterinary) ? 1.25 : 1;
      if (!storageFull(world)) {
        addItem(world, 0, 'food', Math.round(adef.food * vetMult));
        if (adef.leather) addItem(world, 0, 'leather', Math.round(adef.leather * vetMult));
        if (adef.meat) addItem(world, 0, 'meat', Math.round(adef.meat * vetMult));
        if (adef.rareGold) addItem(world, 0, 'gold', adef.rareGold); // 희귀 동물(원정 섬) 처치 보너스
        if (adef.wool) addItem(world, 0, 'wool', Math.round(adef.wool * vetMult));
      }
      else ctx.onStorageFull();
      var si2 = world.sheep.indexOf(shp);
      if (si2 >= 0) world.sheep.splice(si2, 1);
      ctx.onSheepChange();
      ctx.onEvent(pawn.name + '이(가) 사냥에 성공했습니다' + (adef.rareGold ? ' (희귀 동물! 금 +' + adef.rareGold + ')' : ''));
    }
    releaseAllOf(world, pawn.id);
    pawn.job = null;
    pawn.state = 'idle';
    return;
  }

  if (j.type === 'tame') {
    var shp2 = sheepById(world, j.sheepId);
    if (shp2 && shp2.tame && !shp2.tamed) {
      var adefT = ANIMALS[shp2.type] || ANIMALS.sheep;
      var rngF = ctx.rng || Math.random;
      if (rngF() < (adefT.tameChance || 0)) {
        shp2.tamed = true;
        shp2.tame = false;
        ctx.onEvent('🐴 ' + pawn.name + '이(가) ' + adefT.label + '을(를) 길들이는 데 성공했습니다!');
      } else {
        shp2.tame = false; // 실패 — 동물은 그대로 남고, 다시 지정하면 재시도 가능
        ctx.onEvent(pawn.name + '이(가) ' + adefT.label + ' 길들이기에 실패했습니다');
      }
      ctx.onSheepChange();
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
    if (!world.crops[j.idx]) {
      if (world.farmZone[j.idx]) {
        world.crops[j.idx] = { stage: 'growing', timer: CROP.growTime, kind: 'wheat' };
        ctx.onCropChange(j.idx);
      } else if (world.orchardZone[j.idx]) {
        world.crops[j.idx] = { stage: 'growing', timer: FRUITTREE.growTime, kind: 'fruit' };
        ctx.onCropChange(j.idx);
      }
    }
    releaseAllOf(world, pawn.id);
    pawn.job = null;
    pawn.state = 'idle';
    return;
  }

  if (j.type === 'harvestCrop') {
    var cr = world.crops[j.idx];
    if (cr && cr.stage === 'ready') {
      var irriMult = (world.research && world.research.unlocked && world.research.unlocked.irrigation) ? 1.3 : 1;
      if (cr.kind === 'fruit') {
        // 과일나무는 베지 않고 다시 자람 — 재파종 불필요
        if (storageFull(world)) ctx.onStorageFull();
        else { addItem(world, j.idx, 'food', Math.round(FRUITTREE.yield * irriMult)); ctx.onItemChange(j.idx); }
        cr.stage = 'growing';
        cr.timer = FRUITTREE.regrowTime;
        ctx.onCropChange(j.idx);
        ctx.onEvent(pawn.name + '이(가) 과일을 수확했습니다');
      } else {
        delete world.crops[j.idx];
        if (storageFull(world)) ctx.onStorageFull();
        else { addItem(world, j.idx, 'food', Math.round(CROP.yield * irriMult)); ctx.onItemChange(j.idx); }
        ctx.onCropChange(j.idx);
        ctx.onEvent(pawn.name + '이(가) 밀을 수확했습니다');
      }
    }
    releaseAllOf(world, pawn.id);
    pawn.job = null;
    pawn.state = 'idle';
    return;
  }

  if (j.type === 'craft') {
    var pending = j.order;
    var qi = pending ? world.craftQueue.indexOf(pending) : -1;
    if (qi >= 0) {
      var wdef = ITEMS[pending.type];
      if (wdef && canAfford(world, wdef.cost)) {
        for (var rt in wdef.cost) consumeGlobal(world, rt, wdef.cost[rt]);
        var dropIdx = idx(pawn.x, pawn.y);
        addItem(world, dropIdx, pending.type, 1);
        ctx.onItemChange(dropIdx);
        ctx.onEvent(pawn.name + '이(가) ' + wdef.name + ' 제작을 완료했습니다');
        world.craftQueue.splice(qi, 1); // 완료한 그 주문만 제거(맨 앞이 아니어도)
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
    case 'fish': return 'fishing';
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

function pavilionExists(world) {
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.kind === 'pavilion' && b.stage === 'built') return true;
  }
  return false;
}

// 제단(신앙) 사기 보너스 — 제단이 하나라도 있으면 기본 보너스 + 받은 축복 누적에 비례한 추가분(상한).
function altarFaithMood(world) {
  var has = false;
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.kind === 'altar' && b.stage === 'built') { has = true; break; }
  }
  if (!has) return 0;
  return FAITH.moodBase + Math.min(FAITH.moodCap, (world.faithBlessings || 0) * FAITH.moodPerBlessing);
}

// 겨울 온기: 완공된 모닥불·난로(warmth 반경) 안에 있으면 true. 난로는 장작이 떨어져 꺼지면(b.lit===false) 온기 없음.
function nearWarmth(world, pawn) {
  for (var id in world.buildings) {
    var b = world.buildings[id];
    if (b.stage !== 'built') continue;
    var def = BUILDS[b.kind];
    var r = def && def.warmth;
    if (!r) continue;
    if (b.kind === 'heater' && b.lit === false) continue; // 연료 떨어진 난로는 온기 없음
    var bcx = b.x + (def.fw - 1) / 2, bcy = b.y + (def.fh - 1) / 2;
    if (Math.hypot(pawn.px - bcx, pawn.py - bcy) <= r) return true;
  }
  return false;
}

// ── 전투 유틸 ──
function cookTierDef(id) {
  for (var i = 0; i < COOK_TIERS.length; i++) if (COOK_TIERS[i].id === id) return COOK_TIERS[i];
  return null;
}
// 먹을거리 선택: 찬란한 음식(최상급) → 등급 높은 요리부터(포만감 회복이 크므로 먼저 소비), 없으면 생식량.
function pickEatSource(world) {
  if ((world.stock[GLORIOUS_FOOD.id] || 0) > 0) return { type: GLORIOUS_FOOD.id, amt: GLORIOUS_FOOD.eatAmount };
  for (var i = COOK_TIERS.length - 1; i >= 0; i--) {
    var t = COOK_TIERS[i];
    if ((world.stock[t.id] || 0) > 0) return { type: t.id, amt: t.eatAmount };
  }
  if ((world.stock.food || 0) > 0) return { type: 'food', amt: NEEDS.eatAmount };
  return null;
}
export function pawnPower(pawn) {
  var base = (pawn.equipped && WEAPONS[pawn.equipped]) ? WEAPONS[pawn.equipped].power : COMBAT.unarmedPower;
  return Math.round(base * skillMult(pawn.skills && pawn.skills.combat)); // 전투 숙련 반영
}
export function pawnRange(pawn) {
  if (pawn.equipped && WEAPONS[pawn.equipped]) return WEAPONS[pawn.equipped].range;
  return 1;
}

function greedyStep(world, pawn, tx, ty, dtMin, spd) {
  var legMult = (pawn.injury && pawn.injury.type === 'leg') ? INJURY.legSpeedMult : 1;
  var step = (dtMin / WALK_MIN_PER_TILE) * (spd || 1) * legMult;
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

// 창고에 장착 가능한 무기가 있는지 (강한 순서 판단용)
function hasStockWeapon(world) {
  var s = world.stock || {};
  return (s.ironSword || 0) + (s.ironBow || 0) + (s.sword || 0) + (s.bow || 0) > 0;
}
// 창고의 무기를 강한 순서로 자동 장착 (성공 시 무기 id 반환). 제작만 해두면 습격 때 알아서 듦.
function tryAutoArm(world, pawn) {
  var order = ['ironSword', 'ironBow', 'sword', 'bow'];
  for (var i = 0; i < order.length; i++) {
    if (consumeGlobal(world, order[i], 1) >= 1) { pawn.equipped = order[i]; return order[i]; }
  }
  return null;
}
// 창고의 방어구를 강한 순서로 자동 착용 (무기와 별개 슬롯 — 둘 다 갖출 수 있음)
function tryAutoArmor(world, pawn) {
  var order = ['ironArmor', 'leatherArmor'];
  for (var i = 0; i < order.length; i++) {
    if (consumeGlobal(world, order[i], 1) >= 1) { pawn.armor = order[i]; return order[i]; }
  }
  return null;
}

// 적 대응. 교전/도주하면 true(이번 틱 작업 스킵)
function handleCombat(world, pawn, dtMin, ctx) {
  var armed = !!pawn.equipped;
  // 미장착이라도 창고에 무기가 있으면 곧 집어들 것이므로 무장한 것처럼 넓게 감지(도망 대신 대응)
  var willArm = !armed && hasStockWeapon(world);
  var range = pawnRange(pawn);
  var senseR = (armed || willArm) ? range + 4 : 2;
  var near = nearestEnemy(world, pawn.px, pawn.py, senseR);
  if (!near) {
    if (pawn.combat) { pawn.combat = false; if (pawn.state === 'attacking') pawn.state = 'idle'; }
    return false;
  }
  // 맨손인데 창고에 무기가 있으면 즉시 무장 (도망치지 않고 싸우도록)
  if (!armed) {
    var got = tryAutoArm(world, pawn);
    if (got) {
      armed = true;
      range = pawnRange(pawn);
      if (ctx && ctx.onToast) ctx.onToast('🗡️ ' + pawn.name + ' 이(가) ' + WEAPONS[got].name + ' 을(를) 들고 맞섭니다!');
    }
  }
  // 무기와 별개로 방어구도 창고에 있으면 자동 착용
  if (!pawn.armor) {
    var gotA = tryAutoArmor(world, pawn);
    if (gotA && ctx && ctx.onToast) ctx.onToast('🛡️ ' + pawn.name + ' 이(가) ' + ARMOR[gotA].name + ' 을(를) 착용했습니다!');
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

// 직접 조종 중 자동공격 토글(⚔️ 버튼): 이동은 플레이어가 계속 담당, 사거리 내 적은 쿨다운마다 자동 공격.
// handleCombat 과 달리 상태·이동을 가로채지 않음 — 조종성을 유지한 채 배경에서 공격만 발동.
function autoAttackTick(world, pawn, dtMin, ctx) {
  var near = nearestEnemy(world, pawn.px, pawn.py, pawnRange(pawn));
  if (!near) return;
  var e = near.enemy;
  pawn.face = e.px > pawn.px ? 1 : -1;
  pawn.atkCd = (pawn.atkCd || 0) - dtMin;
  if (pawn.atkCd <= 0) {
    pawn.atkCd = COMBAT.attackCd;
    e.hp -= pawnPower(pawn);
    gainSkill(pawn, 'combat', 4);
  }
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
  } else if (pawn.hunger > 60 && pawn.hp < (pawn.maxHp || 100)) {
    pawn.hp = Math.min(pawn.maxHp || 100, pawn.hp + NEEDS.hpRegen * (trait.hpRegenMult || 1) * dtMin);
  }

  // 겨울 냉기(허기와 대칭): 겨울에 온기 밖이면 cold 상승, 온기 안이면 회복. 최대치(freezeAt)면 동사.
  if (seasonDef(world).cold) {
    if (nearWarmth(world, pawn)) {
      pawn.cold = Math.max(0, pawn.cold - WINTER.coldFall * dtMin);
    } else {
      pawn.cold = Math.min(100, pawn.cold + WINTER.coldRise * dtMin);
      if (pawn.cold >= WINTER.freezeAt) {
        pawn.hp = Math.max(0, pawn.hp - WINTER.coldHpDecay * dtMin);
        if (pawn.hp <= 0) {
          abandonJob(world, pawn);
          pawn.state = 'dead';
          ctx.onDeath(pawn);
          return;
        }
      }
    }
  } else if (pawn.cold > 0) {
    pawn.cold = Math.max(0, pawn.cold - WINTER.coldFall * dtMin); // 비겨울엔 자연 회복
  }
  if (pawn.stuckCd > 0) pawn.stuckCd -= dtMin;

  // 기분: 포만감·체력의 가중 평균으로 서서히 수렴 + 정자가 있으면 보정
  var moodTarget = pawn.hunger * 0.6 + pawn.hp * 0.4 + (pavilionExists(world) ? 10 : 0) + altarFaithMood(world);
  var moodRate = 0.006 * (trait.moodMult || 1);
  pawn.mood += (moodTarget - pawn.mood) * Math.min(1, moodRate * dtMin);
  pawn.mood = Math.max(0, Math.min(100, pawn.mood));

  // 자동 무장 토글(관리 탭): 켜져 있으면 유휴 정착민이 창고 무기를 미리(전투 전에) 장착 — 강한 것 우선, 조용히
  if (world.autoEquip && !pawn.manual && !pawn.equipped && hasStockWeapon(world)) {
    tryAutoArm(world, pawn);
  }

  // 전투: 적이 있으면 AI가 자동 대응 (직접 조종 중이면 Space 즉발 공격 또는 ⚔️ 자동공격 토글)
  if (!pawn.manual && world.enemies.length > 0) {
    if (handleCombat(world, pawn, dtMin, ctx)) return;
  } else if (pawn.manual && pawn.autoAttack && world.enemies.length > 0) {
    autoAttackTick(world, pawn, dtMin, ctx);
  }

  // 건설 지시가 있으면 저순위 작업(벌목·채굴·운반 등)을 중단하고 건설을 먼저 하도록 양보
  // (haul 은 건설용 자재 운반과 경쟁하므로 제외 대상이 아님 — 단, 실제 건설 작업이 가능할 때만)
  // + 방치된 작업 종류(아무도 안 하는 새 지정, 예: 낚시)가 있으면 그것도 양보 사유가 됨 —
  //   그래야 벌목 지정이 잔뜩 남아 있어도 새로 지정한 낚시가 영원히 밀리지 않는다.
  if (!pawn.manual && pawn.job && INTERRUPTIBLE[pawn.job.type] && (buildWorkAvailable(world) || hasStarvedWork(world, pawn))) {
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
      if (j.type === 'plant' && !world.farmZone[j.idx] && !world.orchardZone[j.idx]) return abandonJob(world, pawn);
      if (j.type === 'fish' && !world.fishDesig[j.idx]) return abandonJob(world, pawn);
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
      // 콜로니 업그레이드: 전체 작업속도 + 해당 작업 전용 속도 (구매 즉시 라이브 반영)
      var um = upgradeMult(world, 'speed_all') * (sk ? upgradeMult(world, 'speed_' + sk) : 1);
      // 역할 특화 보너스: 이 작업이 정착민 역할의 전문 작업이면 +15%
      var rdef = pawn.role && ROLES[pawn.role];
      var rm = (rdef && rdef.jobs.indexOf(j.type) >= 0) ? ROLE_SPEED_BONUS : 1;
      var im = (pawn.injury && pawn.injury.type === 'arm') ? INJURY.armWorkMult : 1;
      pawn.workLeft -= dtMin * (pawn.trait.workMult || 1) * moodPenalty * sm * um * rm * im;
      if (pawn.workLeft <= 0) finishWork(world, pawn, ctx);
      break;
    }

    case 'eating': {
      pawn.workLeft -= dtMin;
      if (pawn.workLeft <= 0) {
        var eatSrc = pickEatSource(world);
        if (eatSrc) {
          var got = removeItem(world, 0, eatSrc.type, 1);
          if (got > 0) {
            pawn.hunger = Math.min(100, pawn.hunger + eatSrc.amt);
            if (eatSrc.type === GLORIOUS_FOOD.id) {
              pawn.maxHp = (pawn.maxHp || 100) + GLORIOUS_FOOD.maxHpBonus;
              pawn.hp = Math.min(pawn.maxHp, pawn.hp + GLORIOUS_FOOD.maxHpBonus);
              world.ateGloriousFood = true;
              if (ctx.onToast) ctx.onToast('✨ ' + pawn.name + '이(가) 「찬란한 음식」을 먹고 몸이 더 튼튼해졌습니다! (최대 체력 +' + GLORIOUS_FOOD.maxHpBonus + ')', true);
              ctx.onEvent('✨ ' + pawn.name + ' 최대 체력 +' + GLORIOUS_FOOD.maxHpBonus);
            }
          }
        }
        releaseAllOf(world, pawn.id);
        pawn.job = null;
        pawn.state = 'idle';
      }
      break;
    }

    case 'resting': {
      pawn.hp = Math.min(pawn.maxHp || 100, pawn.hp + CLINIC.restRegen * upgradeMult(world, 'healspeed') * dtMin);
      if (pawn.injury) {
        pawn.injury.severity = Math.max(0, pawn.injury.severity - INJURY.healRate * dtMin);
        if (pawn.injury.severity <= 0) pawn.injury = null;
      }
      if (pawn.hp >= CLINIC.healedAt && !pawn.injury) {
        releaseAllOf(world, pawn.id);
        pawn.job = null;
        pawn.state = 'idle';
        if (ctx.onEvent) ctx.onEvent('❤️ ' + pawn.name + ' 완쾌');
      } else if (world.enemies.length > 0) {
        releaseAllOf(world, pawn.id);
        pawn.job = null;
        pawn.state = 'idle';
      }
      break;
    }

    case 'idle': {
      if (pawn.manual) {
        // 위급 허기 안전장치: 직접 조종(선택) 상태로 방치돼도 굶어 죽지 않도록 자동 식사.
        // (모바일 터치로 실수 선택 후 잊어버리는 경우 대비 — 이동/전투 중엔 발동 안 함)
        if (pawn.hunger <= NEEDS.hungryAt && pickEatSource(world)) {
          releaseAllOf(world, pawn.id);
          pawn.job = null;
          pawn.state = 'eating';
          pawn.workLeft = 4;
        }
        break; // 그 외엔 직접 조종 중이므로 AI 미개입
      }
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
      if (adef.leather) addItem(world, 0, 'leather', adef.leather);
      if (adef.meat) addItem(world, 0, 'meat', adef.meat);
      if (adef.rareGold) addItem(world, 0, 'gold', adef.rareGold); // 희귀 동물(원정 섬) 처치 보너스
      world.sheep.splice(s, 1);
      if (ctx.onSheepChange) ctx.onSheepChange();
      return '🥩 ' + adef.label + ' 사냥 성공 (+식량 ' + adef.food + (adef.leather ? ' · 가죽 +' + adef.leather : '') + (adef.meat ? ' · 고기 +' + adef.meat : '') + (adef.rareGold ? ' · 금 +' + adef.rareGold : '') + ')';
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
    if (pickEatSource(world)) {
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
  if ((pawn.hp < CLINIC.hurtAt || pawn.injury) && world.enemies.length === 0) {
    var clinic = clinicExists(world);
    if (clinic) {
      var cf = buildingFront(world, clinic);
      if (cf) {
        pawn.job = { type: 'rest', x: cf.x, y: cf.y };
        if (!goTo(world, pawn, cf.x, cf.y, false)) { pawn.job = null; }
        else {
          if (ctx.onEvent) ctx.onEvent('🏥 ' + pawn.name + ' 이(가) 치료소로 향합니다');
          return;
        }
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
