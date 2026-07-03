// v0.3 부팅·게임 루프·입력
import {
  MAP_W, MAP_H, MIN_PER_SEC, DAY_MIN, SPEED_MULT, BUILDS, PAWN_DEFS,
  RAID, BRIDGE, FISH_PLATFORM, TRAITS, HUMAN_IDS, WAREHOUSE_TIERS, BUILD_MIN_RANK, RANKS, DEFENSE_TIERS, OUTPOST_BRANCHES, ROLES, T_WATER,
} from './config.js';
import {
  createWorld, mulberry32, idx, ix, iy, isWalkable, footprintClear,
  addBuilding, removeBuilding, buildingDef, addItem, totalRes, dailyRegrowth,
  updateSheep, tickResearch, tickCrops, updateEnemies, spawnRaid,
  canPlaceBridge, fishSpotTier, footprintTouchesWater, consumeGlobal, seasonDef, seasonIndex,
  tickRanches, storageCap, totalStored, dailyMineRegen, tickTowers, canAfford,
  upgradeAdd, maxPop, canAdvanceRank, advanceRank, defenseStats,
} from './world.js';
import { createPawn, updatePawn, manualInteract, equipWeapon, equipArmor } from './pawns.js';
import { RESEARCH, ITEMS, HIRE, hireCost, UPGRADES, UPGRADE_CATS, TRADER } from './config.js';
import { releaseAllOf } from './jobs.js';
import { GOALS, checkGoals } from './goals.js';
import { stepWorld } from './sim.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { createUI } from './ui.js';
import { saveGame, loadSaveData, clearSave, hasSave } from './save.js';

// ── 월드 준비 ──
var world, pawns;
var saved = loadSaveData();
// 저장은 있었지만(hasSave) 버전 불일치·손상 등으로 불러오기 실패 → 새 게임으로 유도됨.
// 안내 없이 새 게임 화면이 뜨면 "저장이 사라졌다"로 오해하기 쉬워, 이유를 명확히 알림.
var hadIncompatibleSave = !saved && hasSave();
if (hadIncompatibleSave) clearSave(); // 못 쓰는 구버전 데이터 정리(다음 저장이 새 형식으로 덮어씀)

if (saved) {
  world = createWorld(saved.seed);
  world.terrain = Uint8Array.from(saved.terrain);
  world.objects = saved.objects;
  world.buildings = saved.buildings;
  world.occupancy = saved.occupancy;
  world.nextBid = saved.nextBid;
  world.stock = saved.stock || { wood: 0, gold: 0, food: 0, iron: 0, meal: 0 };
  world.rodTier = saved.rodTier || 0;
  world.fishDesig = saved.fishDesig || {};
  world.rank = saved.rank || 0;
  world.relics = saved.relics || {};
  world.goddessVisited = saved.goddessVisited || false;
  world.traderActive = saved.traderActive || false;
  world.traderDepartDay = saved.traderDepartDay || 0;
  world.nextTraderDay = saved.nextTraderDay || 0;
  world.escaped = saved.escaped || false;
  world.invasion = saved.invasion || null;
  world.invasionWon = saved.invasionWon || false;
  world.invasionsCompleted = saved.invasionsCompleted || 0;
  world.dug = saved.dug || {};
  world.items = {};
  world.stockpile = saved.stockpile || {};
  world.designations = saved.designations;
  world.mineDesig = saved.mineDesig || {};
  world.sheep = saved.sheep || [];
  world.reserved = {};
  world.timeMin = saved.timeMin;
  world.day = saved.day;
  world.research = saved.research || { points: 0, unlocked: {} };
  world.upgrades = saved.upgrades || {};
  world.farmZone = saved.farmZone || {};
  world.orchardZone = saved.orchardZone || {};
  world.crops = saved.crops || {};
  world.craftQueue = saved.craftQueue || [];
  world.enemies = saved.enemies || [];
  world.nextEid = saved.nextEid || 1;
  world.nextSid = saved.nextSid || (world.sheep.length + 1);
  world.goals = saved.goals || {};
  world.nextRaidDay = saved.nextRaidDay || RAID.firstDay;
  pawns = saved.pawns.map(function (p) {
    var pw = createPawn(p.id, { name: p.name, look: p.look, color: p.color, trait: p.trait, equipped: p.equipped, armor: p.armor, skills: p.skills, role: p.role }, p.x, p.y);
    pw.hunger = p.hunger; pw.hp = p.hp;
    pw.mood = p.mood === undefined ? 70 : p.mood;
    pw.carry = p.carry || null;
    if (p.dead) pw.state = 'dead';
    return pw;
  });
} else {
  // 시드: ?seed=123 URL 파라미터가 있으면 사용(테스트·재현용), 없으면 무작위
  var urlSeed = null;
  try {
    var sp = new URLSearchParams(location.search).get('seed');
    if (sp !== null && sp !== '' && isFinite(+sp)) urlSeed = (+sp) | 0;
  } catch (e) { /* location 접근 불가 환경 무시 */ }
  world = createWorld(urlSeed !== null ? urlSeed : (Math.random() * 1e9) | 0);
  world.nextRaidDay = RAID.firstDay;
  var cx = MAP_W / 2, cy = MAP_H / 2;
  // 초기 정착민도 시드 기반으로 생성(트레잇·허기 결정론) — ambient 스트림과 분리된 파생 rng
  var pinit = mulberry32(world.seed ^ 0x9a3c);
  pawns = PAWN_DEFS.map(function (def, n) {
    return createPawn(n, def, cx - 1 + n, cy + 1, pinit);
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
    p.avoidJobType = null; // 재선택은 새 지시의 시작점 — 이전 작업취소로 걸어둔 회피를 초기화
    if (p.state !== 'working') p.state = 'idle';
    p.manual = true;
  });
  R.setSelected(controlled);
  document.body.classList.toggle('has-control', controlled.length > 0);
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
  document.body.classList.remove('has-control'); // 터치 조이스틱·액션버튼 숨김
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
    UI.toast('⚒️ ' + ITEMS[type].name + ' 제작 주문 접수');
  },
  onCraftRod: function (rod) {
    if (!canAfford(world, rod.cost)) { UI.toast('⚠️ 자재가 부족합니다', true); return; }
    for (var t in rod.cost) consumeGlobal(world, t, rod.cost[t]);
    if ((world.rodTier || 0) < rod.tier) world.rodTier = rod.tier;
    UI.toast('🎣 ' + rod.name + ' 제작 — 희귀 어종 확률이 올랐습니다!');
    UI.addEvent('🎣 ' + rod.name + ' 제작');
  },
  onTradeSell: function (type, amt) {
    if (!world.traderActive) { UI.toast('⚠️ 지금은 상인이 없습니다', true); return; }
    var have = totalRes(world)[type] || 0;
    var n = amt === 'all' ? have : Math.min(amt, have);
    if (n <= 0) return;
    consumeGlobal(world, type, n);
    var gold = Math.floor(n * (TRADER.rates[type] || 0));
    world.stock.gold = (world.stock.gold || 0) + gold;
    var names = { wood: '목재', iron: '철', food: '식량', meal: '요리' };
    UI.toast('🛒 ' + (names[type] || type) + ' ' + n + '개 판매 → 금 ' + gold + ' 획득');
  },
  onEquip: function (pawn, type) {
    var msg = equipWeapon(world, pawn, type);
    if (msg) UI.toast(msg);
    R.updatePawnSprite(pawn);
    UI.updatePawnPanel(pawn);
  },
  onEquipArmor: function (pawn, type) {
    var msg = equipArmor(world, pawn, type);
    if (msg) UI.toast(msg);
    UI.updatePawnPanel(pawn);
  },
  onToggleAutoAttack: function () {
    var pawn = panelPawn();
    if (!pawn || pawn.state === 'dead') return;
    var on = !pawn.autoAttack;
    var targets = controlled.length ? controlled : [pawn];
    targets.forEach(function (p) { p.autoAttack = on; });
    UI.toast(on ? '⚔️ 자동공격 ON — 사거리 안의 적을 자동으로 공격합니다 (이동은 직접 조작)' : '⚔️ 자동공격 OFF');
    UI.updatePawnPanel(pawn);
  },
  onSetRole: function (pawn, role) {
    var newRole = (pawn.role === role) ? 'none' : role; // 패널 정착민 기준 토글
    // 선택한 정착민 전원에 적용 (2명 선택 → 어부 = 둘 다 어부). 선택 없으면 해당 정착민만.
    var targets = controlled.length ? controlled : [pawn];
    targets.forEach(function (p) { p.role = newRole; });
    if (targets.length > 1) UI.toast('🎯 선택한 ' + targets.length + '명을 「' + (ROLES[newRole] ? ROLES[newRole].name : '자유') + '」(으)로 지정');
    UI.updatePawnPanel(pawn);
  },
  onUpgradeWarehouse: function (b) {
    var curTier = b.tier || 1;
    var next = WAREHOUSE_TIERS[curTier]; // 0-based: 다음 단계 정의
    if (!next) return; // 이미 최대 단계
    if (!canAfford(world, next.cost)) { UI.toast('⚠️ 자재가 부족합니다', true); return; }
    for (var t in next.cost) consumeGlobal(world, t, next.cost[t]);
    b.tier = curTier + 1;
    R.refreshBuilding(b);
    UI.showBuilding(b);
    UI.toast('🔼 창고를 ' + b.tier + '단계로 업그레이드했습니다!');
    UI.addEvent('🔼 창고 업그레이드 (' + b.tier + '단계)');
  },
  // 방어건물 업그레이드. branch 인자가 있으면 미분기 초소를 그 특화로 전환, 없으면 현재 라인의 다음 단계로 강화.
  onUpgradeBuilding: function (b, branch) {
    // ① 초소 특화 분기 선택 (가시벽/석궁탑/투석기/속사탑)
    if (branch && OUTPOST_BRANCHES[branch]) {
      if (b.branch) return; // 이미 특화됨
      var brDef = OUTPOST_BRANCHES[branch];
      var t1 = brDef.tiers[0];
      if (!canAfford(world, t1.cost)) { UI.toast('⚠️ 자재가 부족합니다', true); return; }
      for (var bt in t1.cost) consumeGlobal(world, bt, t1.cost[bt]);
      b.branch = branch;
      b.tier = 1;
      R.refreshBuilding(b);
      UI.showBuilding(b);
      UI.toast(brDef.icon + ' 초소를 「' + brDef.name + '」(으)로 특화했습니다!');
      UI.addEvent(brDef.icon + ' ' + brDef.name + ' 특화');
      Audio2.play('build');
      return;
    }
    // ② 이미 특화된 초소: 분기 자체 tier 로 강화
    if (b.branch && OUTPOST_BRANCHES[b.branch]) {
      var br = OUTPOST_BRANCHES[b.branch];
      var curB = b.tier || 1;
      var nextB = br.tiers[curB]; // 0-based: 다음 단계
      if (!nextB) return;
      if (!canAfford(world, nextB.cost)) { UI.toast('⚠️ 자재가 부족합니다', true); return; }
      for (var t3 in nextB.cost) consumeGlobal(world, t3, nextB.cost[t3]);
      b.tier = curB + 1;
      R.refreshBuilding(b);
      UI.showBuilding(b);
      UI.toast('🔼 ' + br.name + ' 을(를) ' + b.tier + '단계로 강화했습니다!');
      UI.addEvent('🔼 ' + br.name + ' ' + b.tier + '단계');
      Audio2.play('build');
      return;
    }
    // ③ 망루·성 등 선형 tier 건물
    var tiers = DEFENSE_TIERS[b.kind];
    if (!tiers) return;
    var curTier = b.tier || 1;
    var next = tiers[curTier]; // 0-based: 다음 단계
    if (!next) return;
    if (next.minRank !== undefined && (world.rank || 0) < next.minRank) {
      UI.toast('🔒 「' + RANKS[next.minRank].name + '」 단계에서 해금됩니다', true); return;
    }
    if (!canAfford(world, next.cost)) { UI.toast('⚠️ 자재가 부족합니다', true); return; }
    for (var t in next.cost) consumeGlobal(world, t, next.cost[t]);
    b.tier = curTier + 1;
    R.refreshBuilding(b);
    UI.showBuilding(b);
    var def = BUILDS[b.kind];
    if (defenseStats(b).cannon) {
      UI.toast('💥 ' + def.name + ' 에 대포를 장착했습니다! (광역 포격)');
      UI.addEvent('💥 대포 장착 — ' + def.name);
    } else {
      UI.toast('🔼 ' + def.name + ' 을(를) ' + b.tier + '단계로 강화했습니다!');
      UI.addEvent('🔼 ' + def.name + ' ' + b.tier + '단계');
    }
    Audio2.play('build');
  },
  onShowGoals: function () { UI.showGoals(GOALS, world); },
  onShowUpgrades: function () { UI.showUpgrades(UPGRADES, UPGRADE_CATS, world); },
  onBuyUpgrade: function (id) {
    var u = UPGRADES[id];
    if (!u || world.upgrades[id]) return;
    // 선행 조건 확인
    if (u.requires) {
      for (var r = 0; r < u.requires.length; r++) {
        if (!world.upgrades[u.requires[r]]) { UI.toast('🔒 선행 업그레이드가 필요합니다', true); return; }
      }
    }
    if (!canAfford(world, u.cost)) { UI.toast('⚠️ 자재가 부족합니다', true); return; }
    for (var t in u.cost) consumeGlobal(world, t, u.cost[t]);
    world.upgrades[id] = true;
    UI.toast('📈 업그레이드 완료: ' + u.name);
    UI.addEvent('📈 ' + u.name);
    Audio2.play('success');
  },
  onHire: function () {
    var alive = pawns.filter(function (p) { return p.state !== 'dead'; }).length;
    var cap = maxPop(world);
    if (alive >= cap) { UI.toast('⚠️ 인구 상한(' + cap + '명)에 도달했습니다', true); return; }
    var cost = hireCost(alive);
    if (totalRes(world).food < cost) { UI.toast('⚠️ 식량이 부족합니다 (고용 비용 ' + cost + ')', true); return; }
    consumeGlobal(world, 'food', cost);
    var pw = recruitWanderer('고용');
    if (pw) UI.toast('🧑‍🌾 새 정착민 "' + pw.name + '" 을(를) 고용했습니다 (식량 ' + cost + ' 소비)');
  },
  getAlive: function () { return pawns.filter(function (p) { return p.state !== 'dead'; }).length; },
  onDiscard: function (type, amount) {
    var removed = consumeGlobal(world, type, amount); // amount=Infinity → 전부
    if (removed > 0) {
      var nm = { wood: '목재', gold: '금', food: '식량', iron: '철', meal: '요리' }[type] || type;
      UI.toast('🗑️ ' + nm + ' ' + removed + ' 을(를) 버려 저장고를 비웠습니다');
    }
  },
  onCancelAll: function () {
    var cancelTypes = { gather: 1, mine: 1, fish: 1, plant: 1, harvestCrop: 1, haul: 1, cook: 1, hunt: 1, craft: 1 };
    function stop(p, markAvoid) {
      if (p.job && cancelTypes[p.job.type]) {
        // 선택 취소 시엔 이 정착민에게만 그 작업 종류를 다시 자동 배정하지 않도록 표시
        // (남은 지시·다른 정착민은 그대로 — jobs.js findWorkJob 에서 걸러짐)
        if (markAvoid) p.avoidJobType = p.job.type;
        releaseAllOf(world, p.id);
        p.job = null; p.path = null; p.workLeft = 0;
        if (p.state === 'working' || p.state === 'moving') p.state = 'idle';
        return true;
      }
      return false;
    }
    var sel = controlled.filter(function (p) { return p.state !== 'dead'; });
    if (sel.length) {
      // 선택한 정착민만: 그들의 현재 작업만 취소. 전체 지시·다른 정착민은 그대로 유지.
      sel.forEach(function (p) { stop(p, true); });
      UI.toast('🚫 선택한 ' + sel.length + '명의 작업만 취소했습니다 (그 작업은 이 정착민에게 다시 배정되지 않습니다)');
      return;
    }
    // 선택 없음 → 전체 예약 취소 (모든 지시 삭제 + 전원 재배치)
    world.designations = {}; world.mineDesig = {}; world.fishDesig = {}; world.craftQueue.length = 0;
    var n = 0;
    for (var i = 0; i < pawns.length; i++) {
      var p = pawns[i];
      if (p.state === 'dead' || p.manual) continue;
      if (stop(p, false)) n++;
    }
    R.refreshZones();
    UI.toast(n ? '🚫 전체 예약 작업 취소 — 정착민 ' + n + '명 재배치' : '🚫 취소할 예약 작업이 없습니다');
    UI.addEvent('🚫 전체 예약 작업 취소');
  },
  onAdvanceRank: function () {
    var alive = pawns.filter(function (p) { return p.state !== 'dead'; }).length;
    if (!canAdvanceRank(world, alive)) { UI.toast('아직 승급 요건이 부족합니다', true); return false; }
    var r = advanceRank(world);
    UI.toast('🎉 콜로니가 「' + r.name + '」 단계로 발전했습니다! (인구 상한 ' + maxPop(world) + ')');
    UI.addEvent('🎉 ' + r.icon + ' ' + r.name + ' 단계 도달');
    if (UI.refreshLocks) UI.refreshLocks();
    Audio2.play('goal');
    return true;
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
    if (b.kind === 'warehouse') {
      R.invalidateMinimapTerrain();
      UI.addEvent('🏚️ 창고 완공 — 저장 용량 증가');
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
  // ── stepWorld 오케스트레이션 효과 콜백 ──
  onTileChange: function (i) { R.refreshTile(i); },
  onToast: function (msg, warn) { UI.toast(msg, warn); },
  onSfx: function (name) { Audio2.play(name); },
  onRecruit: function () { recruitWanderer(); },
  onSeasonTint: function (tint, a) { R.setSeasonTint(tint, a); },
  onGoddessDescend: function (x, y) { R.spawnGoddessFx(x, y); },
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
    // forage 는 버섯뿐 아니라 원정 섬의 보물상자·희귀식물도 함께 지정(같은 채집 작업으로 처리)
    var wantSet = tool === 'chop' ? { tree: 1 } : { mushroom: 1, chest: 1, rareplant: 1 };
    forRect(a, b, function (i) {
      var o = world.objects[i];
      if (o && wantSet[o.kind] && !world.designations[i]) {
        world.designations[i] = tool;
        count++;
      }
    });
    if (count) UI.toast((tool === 'chop' ? '🪓 벌목' : '🧺 채집') + ' ' + count + '건 지시');
  }

  else if (tool === 'dig') {
    // 삽: 영역의 나무·그루터기·버섯을 즉시 치우고, 자원이 재생되지 않는 건설용 빈 땅으로.
    // 영역 안에 쓰러진 정착민(state=dead)이 있으면 시신을 매장 — 명단·렌더에서 완전히 제거.
    var buried = 0;
    forRect(a, b, function (i, x, y) {
      for (var pi = pawns.length - 1; pi >= 0; pi--) {
        var dp = pawns[pi];
        if (dp.state !== 'dead' || dp.x !== x || dp.y !== y) continue;
        R.removePawn(dp.id);
        var ci = controlled.indexOf(dp);
        if (ci >= 0) controlled.splice(ci, 1);
        pawns.splice(pi, 1);
        buried++;
      }
      if (world.terrain[i] === T_WATER || world.occupancy[i] !== undefined) return; // 물·건물 위는 못 팜
      if (world.objects[i]) { delete world.objects[i]; }
      if (world.designations[i]) { delete world.designations[i]; }
      if (!world.dug[i]) { world.dug[i] = true; }
      R.refreshTile(i);
      count++;
    });
    if (buried) {
      UI.toast('🪦 쓰러진 정착민 ' + buried + '명을 땅에 묻었습니다');
      UI.addEvent('🪦 정착민 매장 (' + buried + '명)');
      UI.updateRoster(pawns, controlled);
    }
    if (count) UI.toast('🕳️ ' + count + '칸을 파냈습니다 — 나무 제거 · 자원 재생 없음 · 건설 가능');
    R.refreshZones();
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
    else UI.toast('⚠️ 범위에 동물이 없습니다', true);
  }

  else if (tool === 'fish') {
    forRect(a, b, function (i, x, y) {
      if (world.terrain[i] !== 0 || world.fishDesig[i]) return; // 물 타일만
      // 육지(또는 좌대·선착장)와 접한 물가여야 함 (일꾼이 옆에 설 수 있어야)
      if (fishSpotTier(world, x, y) >= 0) { world.fishDesig[i] = true; count++; }
    });
    if (count) UI.toast('🎣 낚시터 ' + count + '곳 지정');
    else UI.toast('⚠️ 육지(또는 좌대·선착장)에 접한 물가에만 지정할 수 있습니다', true);
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

  else if (tool === 'fishPlatform') {
    forRect(a, b, function (i, x, y) {
      if (!canPlaceBridge(world, x, y)) return; // 좌대도 다리와 동일한 배치 조건(물+인접 통행 가능)
      if (!totalRes(world).wood || totalRes(world).wood < FISH_PLATFORM.cost.wood) return;
      consumeGlobal(world, 'wood', FISH_PLATFORM.cost.wood);
      var pb = addBuilding(world, 'fishPlatform', x, y, { stage: 'built' });
      R.refreshBuilding(pb);
      count++;
    });
    if (count) UI.toast('🎣 좌대 ' + count + '칸 건설 — 인접 낚시 희귀 확률 상승');
    else UI.toast('⚠️ 물 가장자리에만, 목재가 있어야 놓을 수 있습니다', true);
  }

  else if (tool === 'farm') {
    if (!world.research.unlocked.farming) {
      UI.toast('🔒 먼저 "농업" 기술을 연구해야 합니다', true);
      UI.showResearch();
    } else {
      forRect(a, b, function (i, x, y) {
        if (!world.farmZone[i] && !world.orchardZone[i] && isWalkable(world, x, y) &&
            world.occupancy[i] === undefined && !world.objects[i] && !world.stockpile[i]) {
          world.farmZone[i] = true;
          count++;
        }
      });
      if (count) UI.toast('🌾 농사 구역 ' + count + '칸 지정');
    }
  }

  else if (tool === 'orchard') {
    if (!world.research.unlocked.farming) {
      UI.toast('🔒 먼저 "농업" 기술을 연구해야 합니다', true);
      UI.showResearch();
    } else {
      forRect(a, b, function (i, x, y) {
        if (!world.farmZone[i] && !world.orchardZone[i] && isWalkable(world, x, y) &&
            world.occupancy[i] === undefined && !world.objects[i] && !world.stockpile[i]) {
          world.orchardZone[i] = true;
          count++;
        }
      });
      if (count) UI.toast('🍎 과일나무 구역 ' + count + '칸 지정 — 한 번 심으면 베지 않고 계속 열매를 맺습니다');
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
      if (world.orchardZone[i]) {
        delete world.orchardZone[i];
        if (world.crops[i]) { delete world.crops[i]; R.refreshCrop(i); }
        count++;
      }
      if (world.fishDesig[i]) { delete world.fishDesig[i]; count++; }
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
    if ((BUILD_MIN_RANK[tool] || 0) > (world.rank || 0)) {
      var rq = RANKS[BUILD_MIN_RANK[tool]];
      UI.toast('🔒 ' + def.name + ' 은(는) 「' + rq.name + '」 단계에서 해금됩니다', true);
    } else if (def.escapePart && !world.invasionWon) {
      UI.toast('🔒 ' + def.name + ' 은(는) 대침공을 완전히 격퇴해야 해금됩니다', true);
    } else if (def.requireCoast && !footprintTouchesWater(world, px, py, def.fw, def.fh)) {
      UI.toast('⚠️ ' + def.name + ' 은(는) 물과 접한 곳에만 지을 수 있습니다', true);
    } else if (!footprintClear(world, px, py, def.fw, def.fh, false)) {
      UI.toast('⚠️ 그 위치에는 지을 수 없습니다 (' + def.fw + '×' + def.fh + ' 필요)', true);
    } else if (!canAfford(world, def.cost)) {
      var needStr = Object.keys(def.cost).map(function (t) {
        var nm = { wood: '목재', gold: '금', iron: '철' }[t] || t;
        return nm + ' ' + def.cost[t];
      }).join(', ');
      UI.toast('⚠️ 자재가 부족합니다 — ' + def.name + ' (' + needStr + ')', true);
    } else {
      // 자재를 재고에서 즉시 차감하고 설계도 배치 (일꾼이 와서 짓기만 하면 됨)
      for (var ct in def.cost) consumeGlobal(world, ct, def.cost[ct]);
      var bNew = addBuilding(world, tool, px, py);
      for (var ct2 in def.cost) bNew.delivered[ct2] = def.cost[ct2]; // 운반 완료 상태로 시작
      R.refreshBuilding(bNew);
      UI.toast('📐 ' + def.name + ' 착공 — 일꾼이 건설합니다');
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

// 마우스·터치(단일 손가락) 공용 입력 처리
function pointerDown(x, y, button) {
  if (button === 2 || button === 1) {
    panning = true;
    panStart = { mx: x, my: y, cx: R.cam.x, cy: R.cam.y, moved: false };
    return;
  }
  var t = R.screenToTile(x, y);
  var tool = UI.getTool();
  if (tool === 'select') {
    // 선택 도구: 클릭=단일 선택 / 드래그=박스 다중 선택 (pointerUp 에서 판정)
    selDrag = { sx: x, sy: y, tile: t };
  } else {
    dragStart = t;
  }
}

function pointerMove(x, y) {
  if (panning && panStart) {
    if (Math.abs(x - panStart.mx) + Math.abs(y - panStart.my) > 4) panStart.moved = true;
    R.cam.x = panStart.cx + (x - panStart.mx);
    R.cam.y = panStart.cy + (y - panStart.my);
    R.applyCamera();
    return;
  }
  var tool = UI.getTool();
  if (selDrag) {
    // 선택 박스 (일정 거리 이상 끌었을 때만 표시)
    if (Math.abs(x - selDrag.sx) + Math.abs(y - selDrag.sy) > 6) {
      var st = R.screenToTile(x, y);
      R.showDrag(selDrag.tile.x, selDrag.tile.y, st.x, st.y, 0x7dffb0);
    }
  } else if (dragStart) {
    var t = R.screenToTile(x, y);
    R.showDrag(dragStart.x, dragStart.y, t.x, t.y, 0x8ab6ff);
  } else if (BUILDS[tool]) {
    // 건설 도구: 풋프린트 미리보기
    var t2 = R.screenToTile(x, y);
    var def = BUILDS[tool];
    var ok = footprintClear(world, t2.x, t2.y, def.fw, def.fh, false);
    R.showDrag(t2.x, t2.y, t2.x + def.fw - 1, t2.y + def.fh - 1, ok ? 0x7dffb0 : 0xff6b81);
  }
}

function pointerUp(x, y, button) {
  if (panning && (button === 2 || button === 1)) {
    var didMove = panStart && panStart.moved;
    panning = false;
    panStart = null;
    // 우클릭을 끌지 않고 그냥 눌렀다 떼면 = 취소 (도구→선택, 선택 무리 해제)
    if (button === 2 && !didMove) cancelToSelect();
    return;
  }
  if (button === 0 && selDrag) {
    var t2 = R.screenToTile(x, y);
    var moved = Math.abs(x - selDrag.sx) + Math.abs(y - selDrag.sy) > 6;
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
  if (button === 0 && dragStart) {
    var t = R.screenToTile(x, y);
    applyTool(UI.getTool(), dragStart, t);
    dragStart = null;
    R.showDrag(null);
  }
}

canvas.addEventListener('mousedown', function (e) { pointerDown(e.clientX, e.clientY, e.button); });
window.addEventListener('mousemove', function (e) { pointerMove(e.clientX, e.clientY); });
window.addEventListener('mouseup', function (e) { pointerUp(e.clientX, e.clientY, e.button); });

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

// 화면 좌표에서 탭 선택 (정착민 우선 → 건물 정보 → 해제)
function selectAtScreen(x, y) {
  var t2 = R.screenToTile(x, y);
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

// ── 터치 입력 (안드로이드 등) ──
//  선택 도구: 한 손가락 드래그 = 맵 이동 / 탭 = 선택
//  그 외 도구(벌목·건설 등): 한 손가락 = 지정·배치
//  두 손가락: 핀치 줌 + 이동
var isTouch = window.matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');

var pinch = null;        // { dist, zoom, camX, camY, mx, my }
var touchPan = null;     // 선택 모드 한 손가락 맵 이동 { sx, sy, camX, camY, moved }
var TAP_SLOP = 9;        // 이 이상 끌면 탭이 아니라 드래그
function touchXY(t) { return { x: t.clientX, y: t.clientY }; }

canvas.addEventListener('touchstart', function (e) {
  e.preventDefault();
  Audio2.startBgm();
  if (e.touches.length === 1) {
    var p0 = touchXY(e.touches[0]);
    if (UI.getTool() === 'select') {
      // 선택 모드: 한 손가락 = 맵 이동(드래그) 또는 선택(탭)
      touchPan = { sx: p0.x, sy: p0.y, camX: R.cam.x, camY: R.cam.y, moved: false };
    } else {
      // 도구 모드: 지정/건설 드래그
      pointerDown(p0.x, p0.y, 0);
    }
  } else if (e.touches.length === 2) {
    // 두 손가락 → 핀치. 진행 중이던 한 손가락 제스처 취소
    touchPan = null; dragStart = null; selDrag = null; R.showDrag(null);
    var a = touchXY(e.touches[0]), b = touchXY(e.touches[1]);
    pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: R.cam.zoom,
      camX: R.cam.x, camY: R.cam.y,
      mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2,
    };
  }
}, { passive: false });

canvas.addEventListener('touchmove', function (e) {
  e.preventDefault();
  if (e.touches.length === 1 && touchPan) {
    // 선택 모드 한 손가락 → 맵 이동
    var p0 = touchXY(e.touches[0]);
    var dx = p0.x - touchPan.sx, dy = p0.y - touchPan.sy;
    if (Math.abs(dx) + Math.abs(dy) > TAP_SLOP) touchPan.moved = true;
    R.cam.x = touchPan.camX + dx; R.cam.y = touchPan.camY + dy;
    R.applyCamera();
  } else if (e.touches.length === 1 && !pinch) {
    // 도구 모드 지정 프리뷰
    var p1 = touchXY(e.touches[0]);
    pointerMove(p1.x, p1.y);
  } else if (e.touches.length === 2 && pinch) {
    var a = touchXY(e.touches[0]), b = touchXY(e.touches[1]);
    var dist = Math.hypot(a.x - b.x, a.y - b.y);
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    R.cam.zoom = pinch.zoom * (dist / pinch.dist);
    R.cam.x = pinch.camX + (mx - pinch.mx);
    R.cam.y = pinch.camY + (my - pinch.my);
    R.applyCamera();
  }
}, { passive: false });

canvas.addEventListener('touchend', function (e) {
  e.preventDefault();
  if (pinch) { if (e.touches.length < 2) pinch = null; return; }
  if (touchPan) {
    // 안 끌었으면(탭) → 선택
    if (!touchPan.moved && e.changedTouches.length) {
      var ct = touchXY(e.changedTouches[0]);
      selectAtScreen(ct.x, ct.y);
    }
    if (e.touches.length === 0) touchPan = null;
    return;
  }
  // 도구 모드 지정 적용
  if (e.touches.length === 0 && e.changedTouches.length) {
    var ct2 = touchXY(e.changedTouches[0]);
    pointerUp(ct2.x, ct2.y, 0);
  }
}, { passive: false });
canvas.addEventListener('touchcancel', function (e) {
  e.preventDefault();
  pinch = null; dragStart = null; selDrag = null; R.showDrag(null);
}, { passive: false });

// 가상 조이스틱 (정착민 직접 조종 이동)
var joyVec = { x: 0, y: 0 };
(function setupJoystick() {
  var pad = document.getElementById('vJoyPad');
  var knob = document.getElementById('vJoyKnob');
  if (!pad) return;
  var activeId = null, ocx = 0, ocy = 0;
  var RADIUS = 40;
  pad.addEventListener('pointerdown', function (e) {
    if (activeId !== null) return;
    activeId = e.pointerId;
    pad.setPointerCapture(activeId);
    var r = pad.getBoundingClientRect();
    ocx = r.left + r.width / 2; ocy = r.top + r.height / 2;
    Audio2.startBgm();
  });
  pad.addEventListener('pointermove', function (e) {
    if (e.pointerId !== activeId) return;
    var dx = e.clientX - ocx, dy = e.clientY - ocy;
    var d = Math.hypot(dx, dy) || 1;
    var cl = Math.min(d, RADIUS);
    var nx = dx / d * cl, ny = dy / d * cl;
    knob.style.transform = 'translate(' + nx + 'px,' + ny + 'px)';
    joyVec.x = nx / RADIUS; joyVec.y = ny / RADIUS;
  });
  function release(e) {
    if (e.pointerId !== activeId) return;
    activeId = null; joyVec.x = 0; joyVec.y = 0;
    knob.style.transform = 'translate(0,0)';
  }
  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);
})();

var btnActionTouch = document.getElementById('btnActionTouch');
if (btnActionTouch) btnActionTouch.addEventListener('click', function () { doInteract(); });
var btnCancelTouch = document.getElementById('btnCancelTouch');
if (btnCancelTouch) btnCancelTouch.addEventListener('click', function () { cancelToSelect(); });

// ── 키보드 ──
var keys = {};
function isTyping(e) {
  return e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
}
function doInteract() {
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

window.addEventListener('keydown', function (e) {
  if (isTyping(e)) return;
  keys[e.code] = true;
  if (e.code === 'Space') {
    e.preventDefault();
    doInteract();
  }
  if (e.code === 'KeyP') setSpeed(speed === 0 ? lastSpeed : 0);
  if (e.code === 'KeyF') { // F: 선택한 건물 업그레이드(창고 tier·방어건물 강화·대포) 통일
    var upBtn = document.querySelector('#buildPanel:not(.hidden) .bp-upgrade button:not([disabled])');
    if (upBtn) { upBtn.click(); e.preventDefault(); }
  }
  if (e.code === 'Escape') cancelToSelect();
  if (e.code === 'Digit1') setSpeed(1);
  if (e.code === 'Digit2') setSpeed(2);
  if (e.code === 'Digit3') setSpeed(3);
});
window.addEventListener('keyup', function (e) {
  if (isTyping(e)) return;
  keys[e.code] = false;
});

// 직접 조종 이동 (충돌 시 축 분리 슬라이드) — 키보드(WASD) 또는 가상 조이스틱(joyVec)
function manualMove(pawn, gameMin) {
  var vx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  var vy = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
  if (!vx && !vy && (joyVec.x || joyVec.y)) { vx = joyVec.x; vy = joyVec.y; }
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
  var mag = Math.hypot(vx, vy);
  if (mag > 1) { vx /= mag; vy /= mag; mag = 1; } // 대각선(키보드) 또는 조이스틱 과대입력 정규화
  var spd = gameMin * 1.25 * mag; // AI보다 25% 빠르게, 조이스틱은 기울인 만큼 아날로그 속도
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
var lastHitSfxMin = -999; // 피격 효과음 스팸 방지(게임분 기준 스로틀)
function hitSfx() {
  if (world.timeMin - lastHitSfxMin >= 3) { lastHitSfxMin = world.timeMin; Audio2.play('attack'); }
}
var enemyCbs = {
  onHit: function (pawn, dmg) { // 정착민 피격: 타격 스파크 + 데미지 숫자 + 빨간 플래시 + 효과음
    R.spawnHitFx(pawn.px, pawn.py, dmg);
    R.flashPawn(pawn.id);
    hitSfx();
  },
  onPawnDeath: function (pawn) {
    releaseAllOf(world, pawn.id);
    var ci = controlled.indexOf(pawn);
    if (ci >= 0) { controlled.splice(ci, 1); R.setSelected(controlled); if (!controlled.length) UI.hidePawn(); }
    UI.toast('💀 ' + pawn.name + ' 이(가) 고블린에게 쓰러졌습니다...', true);
    UI.addEvent('💀 ' + pawn.name + ' 전사');
    R.updatePawnSprite(pawn);
  },
  onEnemyDown: function (e) { R.refreshItem(idx(e.x, e.y)); Audio2.play('coin'); },
  onTowerFire: function (b, e) {
    var def = BUILDS[b.kind];
    R.spawnAttackFx(b.x + (def.fw || 1) / 2, b.y + (def.fh || 1) / 2, e.x, e.y);
    Audio2.play('attack');
  },
  onCannonFire: function (b, e) {
    var def = BUILDS[b.kind];
    R.spawnAttackFx(b.x + (def.fw || 1) / 2, b.y + (def.fh || 1) / 2, e.x, e.y); // 포탄 궤적
    R.spawnBoomFx(e.x, e.y); // 착탄 광역 폭발
    Audio2.play('attack');
  },
  onGiantSmash: function (e, tgt) { // 괴민 주먹질 충격
    R.spawnBoomFx(tgt.x, tgt.y);
    Audio2.play('attack');
  },
  onBuildingHit: function (b, dmg) { // 건물 피격: 타격 스파크 + 데미지 숫자 + 머리 위 체력바 표시
    var def = BUILDS[b.kind] || buildingDef(b.kind);
    var cx = b.x + ((def.fw || 1) - 1) / 2, cy = b.y + ((def.fh || 1) - 1) / 2;
    R.spawnHitFx(cx, cy, dmg);
    R.updateBuildingHp(b);
    hitSfx();
  },
  onBuildingDestroyed: function (b) {
    var def = BUILDS[b.kind];
    R.spawnBoomFx(b.x, b.y);
    R.removeBuildingSprite(b.id);
    UI.toast('🔥 ' + (def ? def.name : b.kind) + '이(가) 파괴되었습니다!', true);
    UI.addEvent('🔥 ' + (def ? def.name : b.kind) + ' 파괴됨');
    Audio2.play('alert');
  },
  onCropDestroyed: function (cropIdx) { R.refreshCrop(cropIdx); },
  onGiantJump: function (e, x, y) { // 괴민 도약: 착지 이펙트 + 안내
    R.spawnBoomFx(x, y);
    Audio2.play('attack');
    UI.toast('🦶 괴민이 크게 뛰어올라 착지했습니다!', true);
  },
  onObstacleBreak: function (x, y) { // 적이 길 막은 나무를 부숨 → 그루터기 타일 갱신
    R.refreshTile(idx(x, y));
    R.spawnBoomFx(x, y);
  },
};

// 계절 초기 표시 (prevSeason 은 stepWorld 가 world.prevSeason 으로 추적)
world.prevSeason = seasonIndex(world);
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
  var hm = HUMAN_IDS[(ambientRng() * HUMAN_IDS.length) | 0];
  var tr = TRAITS[(ambientRng() * TRAITS.length) | 0];
  var pw = createPawn(nextPawnId++, { name: nm, look: { human: hm }, trait: tr }, spot.x, spot.y);
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
var lastLockSig = ''; // 툴바 잠금 상태 시그니처(바뀔 때만 refreshLocks → 깜빡임 방지)
var lastHireSig = ''; // 고용 버튼 라벨/활성 시그니처(바뀔 때만 갱신 → 툴바 리플로우 깜빡임 방지)
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
  // 시뮬레이션 전진 — 모든 상태 로직은 sim.js/stepWorld 가 단독 소유(테스트와 동일 코드)
  stepWorld(world, pawns, gameMin, ambientRng, ctx, enemyCbs);

  // 직접 조종 이동 + 카메라 추적 (선택 무리 전체)
  if (controlled.length) {
    var moveKey = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || joyVec.x || joyVec.y;
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
    // 고용 버튼: 현재 비용·가능 여부 표시 (라벨/활성이 바뀔 때만 — 무조건 갱신 시 툴바 리플로우로 깜빡임)
    var hireLabel, hireDisabled;
    if (alive >= maxPop(world)) { hireLabel = '🧑‍🌾 인구 최대'; hireDisabled = true; }
    else {
      var hc = hireCost(alive);
      hireLabel = '🧑‍🌾 고용 (🍖' + hc + ')'; hireDisabled = (res.food || 0) < hc;
    }
    var hireSig = hireLabel + '|' + (hireDisabled ? 1 : 0);
    if (hireSig !== lastHireSig) { lastHireSig = hireSig; UI.setHireInfo(hireLabel, hireDisabled); }
    var pp = panelPawn();
    if (pp) UI.updatePawnPanel(pp);
    UI.updateRoster(pawns, controlled);
    // 잠금 갱신은 상태가 실제로 바뀔 때만 — 매 프레임 호출 시 툴바 폭 재계산으로 깜빡임 발생
    var lockSig = (world.rank || 0) + '|' + (world.invasionWon ? 1 : 0) + '|' + (world.traderActive ? 1 : 0);
    if (lockSig !== lastLockSig) { lastLockSig = lockSig; if (UI.refreshLocks) UI.refreshLocks(); }
  }
});

if (!saved) {
  // 새 게임: 커스터마이징 먼저
  setSpeed(0);
  if (hadIncompatibleSave) {
    UI.toast('⚠️ 이전 저장 데이터를 이 버전에서 불러올 수 없어 새 게임으로 시작합니다 (게임 업데이트로 인한 호환 문제)', true);
  }
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
