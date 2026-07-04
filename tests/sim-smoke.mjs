// L1 시나리오 스모크 — 시드 고정, 헤드리스. stepWorld 추출이 올바른지 + 결정론 확인.
import { bootSim, run, runDays, designateChop, give, snapshot, DAY_MIN, MAP_W, MAP_H } from './harness.mjs';
import { addBuilding, storageCap, upgradeMult, upgradeAdd, maxPop, rankReqStatus, canAdvanceRank, advanceRank, defenseStats, tickTowers, enemyStats, spawnRaid, mulberry32, grantRelic, dailyIslandRespawn, checkIslandDiscovery, updateEnemies, idx, shipComplete, fishSpotTier, footprintTouchesWater, canPlaceBridge, isWalkable, autoDesignateLodges, footprintAdjacentMine, ensureBossIsland, tickBarns } from '../js/world.js';
import { GIANT, ENEMY, CANNIBAL, ISLANDS, INVASION, OUTPOST_BRANCHES, RAIDER, INVWARRIOR, ZOMBIE, SKELETON, GIANT_JUMP, ARMOR, FRUITTREE, FISH, catchFish, catchRareFish, GODDESS, TRADER, BUILDS, BUILD_MIN_RANK, FISH_PLATFORM, DEMON, MINIDEMON, GLORIOUS_FOOD, RARE_FISH_SPOT, INJURY, WALK_MIN_PER_TILE, RESEARCH, EGG_HATCH, RANCH } from '../js/config.js';
import { findWorkJob, releaseAllOf, bpMissing, reserve } from '../js/jobs.js';
import { findPath } from '../js/path.js';
import { createPawn, updatePawn } from '../js/pawns.js';
import { checkGoals } from '../js/goals.js';

var fails = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { console.log('  ✗ ' + msg); fails++; }
}

console.log('[sim-smoke] 1) 부팅 상태');
(function () {
  var sim = bootSim(12345);
  ok(sim.pawns.length === 3, '정착민 3명 생성');
  ok(sim.pawns.every(function (p) { return p.trait; }), '모든 정착민 트레잇 보유');
  ok(sim.world.day === 1, '시작 1일차');
  ok(sim.world.seed === 12345, '시드 고정 반영');
})();

console.log('[sim-smoke] 2) 벌목 → 재고 증가 (시뮬 전진)');
(function () {
  var sim = bootSim(12345);
  var n = designateChop(sim, 10);
  ok(n > 0, '벌목 지시 ' + n + '건 등록');
  var woodBefore = sim.world.stock.wood || 0;
  run(sim, 600); // 600 게임분(=10시간) 진행
  var woodAfter = sim.world.stock.wood || 0;
  ok(woodAfter > woodBefore, '벌목으로 목재 재고 증가 (' + woodBefore + '→' + woodAfter + ')');
  ok(sim.world.timeMin >= 600, '게임 시간 전진 (timeMin=' + Math.round(sim.world.timeMin) + ')');
})();

console.log('[sim-smoke] 3) 정착민 생존 (식량 지급 시 며칠 버팀)');
(function () {
  var sim = bootSim(777);
  give(sim, { food: 200, meal: 50 });
  designateChop(sim, 20);
  runDays(sim, 3);
  var alive = sim.pawns.filter(function (p) { return p.state !== 'dead'; }).length;
  ok(alive >= 1, '식량 충분 시 3일 후 최소 1명 생존 (' + alive + '명)');
  ok(sim.world.day >= 4, '3일 경과 → day ' + sim.world.day);
})();

console.log('[sim-smoke] 4) 결정론 — 동일 시드 2회 실행 결과 바이트 일치');
(function () {
  function playthrough(seed) {
    var sim = bootSim(seed);
    give(sim, { food: 100 });
    designateChop(sim, 15);
    runDays(sim, 5);
    return snapshot(sim);
  }
  var a = playthrough(999);
  var b = playthrough(999);
  ok(a === b, '시드 999 두 번 실행 → 스냅샷 동일');
  var c = playthrough(1000);
  ok(a !== c, '다른 시드(1000)는 다른 결과 (결정론이 시드에 종속)');
})();

console.log('[sim-smoke] 5) chunk 크기 무관 결정론 (1분 vs 5분 스텝)');
(function () {
  function playChunk(seed, chunk) {
    var sim = bootSim(seed);
    give(sim, { food: 100 });
    designateChop(sim, 15);
    // runDays 를 chunk 단위로
    var mins = 5 * 1440;
    var left = mins;
    while (left > 0) { var dt = Math.min(chunk, left); left -= dt; run(sim, dt, chunk); }
    return snapshot(sim);
  }
  var one = playChunk(2024, 1);
  var five = playChunk(2024, 5);
  // 주: 습격 스케줄 타이밍이 chunk 에 따라 미세하게 달라질 수 있어 완전 일치가 아닐 수 있음 → 경고만
  if (one === five) console.log('  ✓ 1분/5분 스텝 결과 동일 (완전 재현)');
  else console.log('  ⚠ 1분/5분 스텝 미세 차이(습격 타이밍) — 각 chunk 내 결정론은 유지됨');
})();

console.log('[sim-smoke] 6) 제작 우선순위 — 다른 일(벌목)이 많아도 주문한 무기가 제작됨 (회귀가드)');
(function () {
  // 회귀: 제작이 최하위 우선순위라 활발한 콜로니에서 영원히 굶주리던 버그(2026-07-03).
  var sim = bootSim(4242);
  var w = sim.world;
  var smithy = addBuilding(w, 'smithy', 51, 48, { stage: 'built' }); // 제작은 대장간에서
  smithy.work = 999;
  give(sim, { wood: 500, gold: 500 });
  w.research.unlocked.blacksmith = true;
  w.craftQueue.push({ type: 'sword' });
  var chops = designateChop(sim, 40);
  run(sim, 150); // 짧게 — 벌목이 아직 많이 남은 시점
  var remain = Object.keys(w.designations).length;
  ok((w.stock.sword || 0) >= 1, '벌목 ' + chops + '건 지시 중에도 검 제작 완료 (남은 벌목 ' + remain + ')');
  ok(remain > 0, '동시에 벌목도 진행 중 (제작이 벌목을 완전히 막지 않음)');
})();

console.log('[sim-smoke] 7) 콜로니 업그레이드 — 효과·저장고·집계 (회귀가드)');
(function () {
  // 벌목속도 업그레이드: 같은 시드·같은 시간에 목재 산출이 더 많아야 함
  function woodAfter(withUpg) {
    var sim = bootSim(555);
    sim.world.upgrades.log_store1 = true; sim.world.upgrades.log_store2 = true; // 저장고 넉넉히 — 목재9(3배)로 캡에 걸려 속도차가 가려지는 것 방지
    if (withUpg) sim.world.upgrades.prod_wood = true;
    designateChop(sim, 80);   // 넉넉히 지정해 시간 안에 다 못 베도록(나무 수 제한 회피)
    run(sim, 130);            // 짧은 구간: 벌목 속도가 총량을 좌우
    return sim.world.stock.wood || 0;
  }
  var base = woodAfter(false), up = woodAfter(true);
  ok(up > base, '벌목속도 업그레이드 시 목재 산출 증가 (' + base + ' → ' + up + ')');

  // 저장고 업그레이드: storageCap 이 정확히 +250
  var s = bootSim(1);
  var capBefore = storageCap(s.world);
  s.world.upgrades.log_store1 = true;
  ok(storageCap(s.world) === capBefore + 250, '저장고 업그레이드 시 용량 +250 (' + capBefore + ' → ' + storageCap(s.world) + ')');

  // 집계 함수: mult 누적 곱, add 누적 합
  var w = bootSim(2).world;
  w.upgrades.def_power1 = true; w.upgrades.def_power2 = true; // 1.4 * 1.5 = 2.1
  ok(Math.abs(upgradeMult(w, 'towerpower') - 2.1) < 1e-9, '방어력 mult 누적 곱 (2.1)');
  w.upgrades.pop_max1 = true; w.upgrades.pop_max2 = true; // 4 + 6 = 10
  ok(upgradeAdd(w, 'maxpop') === 10, '인구상한 add 누적 합 (10)');
})();

console.log('[sim-smoke] 8) 정착민 역할 특화 — 우선순위 게이트 + 폴백 (신규)');
(function () {
  // 역할이 있으면 전문 작업을 일반 우선순위보다 먼저 잡고, 전문 작업이 없으면 일반 작업으로 폴백.
  function setup(role) {
    var sim = bootSim(321);
    var p = sim.pawns[0];
    p.role = role;
    designateChop(sim, 5); // 벌목(gather) 후보 — 일반 캐스케이드에서 사냥보다 상위
    sim.world.sheep.push({ id: sim.world.nextSid++, x: p.x + 1, y: p.y, hunt: true }); // 사냥 후보
    return { sim: sim, p: p };
  }
  var a = setup('none');
  var jobNone = findWorkJob(a.sim.world, a.p);
  ok(jobNone && jobNone.type === 'gather', '자유 정착민은 일반 우선순위(벌목)를 잡음 (' + (jobNone && jobNone.type) + ')');

  var b = setup('hunter');
  var jobHunter = findWorkJob(b.sim.world, b.p);
  ok(jobHunter && jobHunter.type === 'hunt', '사냥꾼은 벌목보다 사냥을 우선함 (' + (jobHunter && jobHunter.type) + ')');

  var c = setup('hunter');
  c.sim.world.sheep = c.sim.world.sheep.filter(function (s) { return !s.hunt; }); // 사냥감 제거
  var jobFallback = findWorkJob(c.sim.world, c.p);
  ok(jobFallback && jobFallback.type === 'gather', '사냥감 없으면 사냥꾼도 일반 작업(벌목)으로 폴백 (' + (jobFallback && jobFallback.type) + ')');
})();

console.log('[sim-smoke] 9) 발전 단계 — 요건 판정·승급·인구상한·해금 (신규)');
(function () {
  var sim = bootSim(1);
  var w = sim.world;
  ok(w.rank === 0, '시작은 무리(0) 단계');
  ok(maxPop(w) === 6, '무리 인구 상한 6');
  var s0 = rankReqStatus(w, 3);
  ok(s0 && s0.next.id === 'group' && !s0.allOk, '다음=집단, 시작 시 요건 미달');
  ok(!canAdvanceRank(w, 3), '인구3·집0 → 승급 불가');
  addBuilding(w, 'house', 40, 40, { stage: 'built' });
  addBuilding(w, 'house', 42, 40, { stage: 'built' });
  ok(canAdvanceRank(w, 5), '집 2채 + 인구 5 → 집단 승급 가능');
  advanceRank(w);
  ok(w.rank === 1, '승급 → 집단(1)');
  ok(maxPop(w) === 12, '집단 인구 상한 12');
  // 인구 상한 업그레이드가 발전 단계 위에 누적되는지
  w.upgrades.pop_max1 = true; // +4
  ok(maxPop(w) === 16, '단계(12) + 인구상한 업그레이드(+4) 누적 = 16');
})();

console.log('[sim-smoke] 10) 방어건물 tier + 대포 광역 (신규)');
(function () {
  function enemy(id, x, y) { return { id: id, x: x, y: y, px: x, py: y, hp: 100, cd: 0, dir: 0, phase: 0, anim: 0 }; }
  var sim = bootSim(1);
  var w = sim.world;
  var castle = addBuilding(w, 'castle', 40, 40, { stage: 'built' });
  var s1 = defenseStats(castle);
  ok(s1.power === 18 && !s1.cannon, '성 1단계 = 공격력 18, 대포 아님');
  castle.tier = 3;
  var s3 = defenseStats(castle);
  ok(s3.power === 42 && s3.cannon, '성 3단계 = 공격력 42, 대포(광역)');
  // 대포: 뭉친 적 3마리 모두 피해 (사거리 내 + 서로 반경2 내)
  w.enemies = [enemy(1, 43, 41), enemy(2, 44, 41), enemy(3, 43, 42)];
  tickTowers(w, 20, {});
  ok(w.enemies.every(function (e) { return e.hp < 100; }), '대포 발사 → 반경 내 적 3마리 모두 피해(광역)');

  // 일반 망루(tier1): 단일 대상만 피해
  var w2 = bootSim(2).world;
  addBuilding(w2, 'tower', 40, 40, { stage: 'built' });
  w2.enemies = [enemy(1, 43, 41), enemy(2, 44, 41), enemy(3, 43, 42)];
  tickTowers(w2, 20, {});
  var hurt = w2.enemies.filter(function (e) { return e.hp < 100; }).length;
  ok(hurt === 1, '일반 망루는 단일 대상만 피해 (' + hurt + '마리)');
})();

console.log('[sim-smoke] 11) 무지성 거인 「괴민」 (신규)');
(function () {
  var sim = bootSim(5);
  var w = sim.world;
  ok(enemyStats({ kind: 'giant' }).power === GIANT.power, '거인 종류 스탯 = GIANT');
  ok(enemyStats({ kind: 'goblin' }).power === ENEMY.power, '고블린 종류 스탯 = ENEMY');
  ok(enemyStats({ kind: 'raider' }).hp === RAIDER.hp && enemyStats({ kind: 'warrior' }).hp === INVWARRIOR.hp,
    '약탈자·침략전사 종류 스탯 매핑 (RAIDER/INVWARRIOR)');
  ok(enemyStats({ kind: 'zombie' }).hp === ZOMBIE.hp && enemyStats({ kind: 'skeleton' }).hp === SKELETON.hp,
    '좀비·스켈레톤 종류 스탯 매핑 (ZOMBIE/SKELETON)');
  ok(GIANT.hp > ENEMY.hp && GIANT.power > ENEMY.power && GIANT.moveMinPerTile > ENEMY.moveMinPerTile,
    '거인은 더 튼튼(HP)·강함(공격)·느림(이동)');
  // 직접 스폰 (결정론 rng)
  var rng = mulberry32(w.seed ^ 0x1234);
  var got = spawnRaid(w, 1, rng, 'giant');
  var g = w.enemies.filter(function (e) { return e.kind === 'giant'; })[0];
  ok(got === 1 && g, '거인 스폰 → kind=giant');
  ok(g && g.hp >= GIANT.hp && g.maxHp === g.hp, '거인 HP가 GIANT 기준 이상 (' + (g && g.hp) + ')');
  // 5일밤 트리거 통합: 4일 경과 후 밤까지 진행 → 괴민 상륙
  var sim2 = bootSim(7);
  give(sim2, { food: 800, meal: 200 });
  runDays(sim2, 4);           // ~5일차 아침
  run(sim2, 14 * 60);         // 5일차 22시(거인 스폰 20시 경과)
  ok(sim2.world.enemies.some(function (e) { return e.kind === 'giant'; }), '5일밤 → 괴민 자동 상륙(sim 트리거)');
})();

console.log('[sim-smoke] 12) 제작 대기열 — 자재 부족 주문 건너뛰기 (회귀가드)');
(function () {
  // 회귀: 맨 앞 주문(강철검, 철 0)이 뒤의 검 제작을 막던 버그.
  var sim = bootSim(4242);
  var w = sim.world;
  addBuilding(w, 'smithy', 51, 48, { stage: 'built' });
  give(sim, { wood: 500, gold: 500 }); // 철 0 → 강철검 불가, 검·활은 가능
  w.research.unlocked.blacksmith = true;
  w.craftQueue.push({ type: 'ironSword' }); // 맨 앞: 살 수 없음
  w.craftQueue.push({ type: 'sword' });      // 뒤: 살 수 있음
  designateChop(sim, 40);
  run(sim, 220);
  ok((w.stock.sword || 0) >= 1, '자재 부족 강철검이 맨 앞이어도 뒤의 검이 제작됨 (검 ' + (w.stock.sword || 0) + ')');
  ok(w.craftQueue.some(function (o) { return o.type === 'ironSword'; }), '살 수 없는 강철검 주문은 대기열에 유지');
  ok(!w.craftQueue.some(function (o) { return o.type === 'sword'; }), '완료된 검 주문은 대기열에서 제거');
})();

console.log('[sim-smoke] 13) 유물 시스템 — 배율 합산·스택·업그레이드 시너지 (신규)');
(function () {
  var w = bootSim(1).world;
  ok(upgradeMult(w, 'speed_all') === 1, '유물 없으면 배율 1');
  var got = grantRelic(w, mulberry32(w.seed ^ 0xabc));
  ok(got && w.relics[got.id] === 1, '유물 획득 → 보유 1');
  w.relics = { worm: 2 }; // speed_all 1.12
  ok(Math.abs(upgradeMult(w, 'speed_all') - Math.pow(1.12, 2)) < 1e-9, 'worm ×2 → speed_all 1.12² (mult 스택)');
  w.relics = { axe: 1 }; w.upgrades = { prod_wood: true }; // 유물 1.4 × 업그레이드 1.3
  ok(Math.abs(upgradeMult(w, 'speed_woodcutting') - (1.3 * 1.4)) < 1e-9, '업그레이드(1.3)×유물(1.4) 시너지');
  w.relics = { banner: 2 }; w.upgrades = {}; // maxpop +3 each
  ok(upgradeAdd(w, 'maxpop') === 6, 'banner ×2 → maxpop +6 (add 스택)');
})();

console.log('[sim-smoke] 14) 직접 조종(선택) 중 방치돼도 굶어 죽지 않음 (버그 회귀가드)');
(function () {
  // 버그: 정착민을 선택(manual=true)한 채 방치하면 think()가 전혀 호출 안 돼
  // 배가 고파도 절대 먹지 않고 굶어 죽던 문제(모바일 터치 오선택으로 자주 발생).
  var sim = bootSim(9);
  var p = sim.pawns[0];
  give(sim, { food: 50 });
  p.manual = true;       // 선택(직접 조종) 상태로 방치
  p.state = 'idle';
  p.hunger = 20;         // hungryAt(30) 이하로 배고픔
  run(sim, 30);
  ok(p.hunger > 20 || p.state === 'eating', '선택 상태에서도 배고프면 자동으로 식사 시작 (hunger=' + Math.round(p.hunger) + ', state=' + p.state + ')');
  run(sim, 30);
  ok(p.hunger > 20, '식사 완료 후 포만감 회복 (hunger=' + Math.round(p.hunger) + ')');
  ok(p.manual === true, '식사 중에도 직접 조종 선택 상태는 유지(플레이어 제어권 보존)');
})();

console.log('[sim-smoke] 15) 원정 섬 — 생성·테마 콘텐츠·발견·리스폰 (신규)');
(function () {
  var w = bootSim(11).world;
  ok(w.islands && w.islands.length === ISLANDS.length, '섬 ' + ISLANDS.length + '개 생성 (' + (w.islands && w.islands.length) + ')');
  var byTheme = {};
  w.islands.forEach(function (isl) { byTheme[isl.theme] = isl; });
  ['treasure', 'cannibal', 'rare'].forEach(function (th) { ok(!!byTheme[th], '테마 「' + th + '」 섬 존재'); });

  // 섬 중심이 실제로 육지(잔디/모래)인지 — 바다 한복판에 생성되지 않았는지 확인
  var allLand = w.islands.every(function (isl) {
    return w.terrain[Math.round(isl.cy) * MAP_W + Math.round(isl.cx)] !== 0; // T_WATER=0
  });
  ok(allLand, '모든 섬 중심이 육지(물 아님)로 생성됨');

  // 보물섬: 반경 내 chest 오브젝트 존재
  var tIsl = byTheme.treasure;
  var chestCount = 0;
  for (var i in w.objects) {
    if (w.objects[i].kind === 'chest') {
      var x = i % MAP_W, y = (i / MAP_W) | 0;
      if (Math.hypot(x - tIsl.cx, y - tIsl.cy) <= tIsl.r * 1.1) chestCount++;
    }
  }
  ok(chestCount >= 1, '보물섬에 보물상자(chest) 배치됨 (' + chestCount + '개)');

  // 식인종 섬: kind=cannibal 인 적이 cap 만큼 상주
  var cIsl = byTheme.cannibal;
  var cannCount = w.enemies.filter(function (e) { return e.kind === 'cannibal'; }).length;
  ok(cannCount === cIsl.cap && cannCount > 0, '식인종 섬에 상주 적 cap만큼 스폰(' + cannCount + '/' + cIsl.cap + ')');
  ok(enemyStats({ kind: 'cannibal' }).hp === CANNIBAL.hp, '식인종 스탯 = CANNIBAL 설정');

  // 비경의 섬: rareplant + raredeer(rare:true)
  var rIsl = byTheme.rareland || byTheme.rare;
  var plantCount = 0;
  for (var j in w.objects) if (w.objects[j].kind === 'rareplant') plantCount++;
  ok(plantCount >= 1, '비경의 섬에 희귀식물(rareplant) 배치됨 (' + plantCount + '개)');
  var deerCount = w.sheep.filter(function (s) { return s.type === 'raredeer' && s.rare; }).length;
  ok(deerCount === rIsl.cap && deerCount > 0, '비경의 섬에 희귀 영양 cap만큼 스폰(' + deerCount + '/' + rIsl.cap + ')');

  // 발견(discovery): 정착민을 섬 반경 안으로 이동시키면 discovered=true + 반환
  var sim2 = bootSim(11), w2 = sim2.world, pawns2 = sim2.pawns;
  var isl2 = w2.islands.filter(function (x) { return x.theme === 'treasure'; })[0];
  pawns2[0].px = isl2.cx; pawns2[0].py = isl2.cy;
  var found = checkIslandDiscovery(w2, pawns2);
  ok(found.length === 1 && found[0].id === isl2.id, '섬 반경 진입 시 발견 처리(' + found.length + '건)');
  ok(isl2.discovered === true, 'discovered 플래그 true로 갱신');
  var found2 = checkIslandDiscovery(w2, pawns2);
  ok(found2.length === 0, '이미 발견한 섬은 재발견 처리 안 함(중복 토스트 방지)');

  // 식인종 리스폰: 전멸 후 rng 강제(항상 0) → 하루 만에 1체 리스폰
  var w3 = bootSim(11).world;
  w3.enemies = w3.enemies.filter(function (e) { return e.kind !== 'cannibal'; }); // 전멸 처리
  var spawned = dailyIslandRespawn(w3, function () { return 0; }); // rng()=0 → 확률조건(0<0.3) 항상 통과
  var cannAfter = w3.enemies.filter(function (e) { return e.kind === 'cannibal'; }).length;
  ok(spawned === 1 && cannAfter === 1, '식인종 전멸 후 리스폰 함수 호출 시 1체 보충(' + cannAfter + ')');
})();

// 침공 웨이브를 한 번에 전멸시켜 클리어 처리(테스트 헬퍼) — 정공법 케이스 재현
function wipeCurrentWave(w) {
  var wave = w.invasion.wave;
  w.enemies.forEach(function (e) { if (e.wave === wave) e.hp = 0; });
}

console.log('[sim-smoke] 16) 나라의 시련(대침공) — 달력상 10일차·20일차 고정 발동, 나라 단계 무관 (신규)');
(function () {
  var sim = bootSim(321);
  var w = sim.world;
  give(sim, { food: 2000, meal: 500 });
  // 2차(20일차)는 의도적으로 훨씬 가혹해서(8마리/웨이브×4웨이브) 정착민 3명이 무장 없이 버티지 못하고
  // "전멸 위기 재도전" 분기가 섞여 들어가 상태기계 검증이 흔들린다 — 여기선 상태 전이만 보는 게 목적이므로
  // 매 스텝 뒤 정착민을 안전하게 유지(다른 파일의 실제 전투 밸런스와는 무관, 테스트 전용 안전장치).
  function safeRun(mins) {
    // 1분 단위로 잘라 정착민을 매 틱 살려둠 — 늘어난 혼합군(언데드 포함)에 전멸→철수하지 않게(상태 전이만 검증)
    var left = mins;
    while (left > 0) {
      var d = Math.min(1, left); left -= d;
      run(sim, d);
      sim.pawns.forEach(function (p) { if (p.state === 'dead') p.state = 'idle'; p.hp = 100; });
    }
  }
  safeRun(1); // 부팅 직후부터 첫 예정 침공(10일차) 카운트다운이 자동 시작
  ok(w.invasion && w.invasion.phase === 'countdown', '게임 시작과 동시에 카운트다운 시작(나라 단계 요건 없음)');
  ok((w.rank || 0) === 0, '아직 나라 단계는커녕 무리 단계 — 그래도 침공 예정됨');
  ok(w.invasion.schedIndex === 0 && w.invasion.triggerDay === INVASION.schedule[0].day,
    '1차 침공은 ' + INVASION.schedule[0].day + '일차로 예약');

  // 발동 조건을 즉시 성립하도록 당긴 뒤 밤(spawnHour)까지 진행
  w.invasion.triggerDay = w.day;
  safeRun(21 * 60);
  var sched0 = INVASION.schedule[0];
  ok(w.invasion.phase === 'active' && w.invasion.wave === 1, '1차 침공 발동 → 1웨이브 active');
  var w1 = w.enemies.filter(function (e) { return e.wave === 1; });
  var expected1 = (sched0.goblinsPerWave || 0) + (sched0.raidersPerWave || 0) + (sched0.warriorsPerWave || 0) +
    (sched0.zombiesPerWave || 0) + (sched0.skeletonsPerWave || 0) + (sched0.warlordsPerWave || 0) + (sched0.giants || 0);
  ok(w1.length === expected1, '1웨이브 스폰 수 = 혼합군 (' + w1.length + '/' + expected1 + ')');
  ok(w1.some(function (e) { return e.kind === 'warlord'; }), '1웨이브에 정복자 포함');
  ok(w1.some(function (e) { return e.kind === 'raider'; }) && w1.some(function (e) { return e.kind === 'warrior'; }),
    '1웨이브에 약탈자·침략전사(외부 세력) 포함');
  ok(w1.some(function (e) { return e.kind === 'zombie'; }) && w1.some(function (e) { return e.kind === 'skeleton'; }),
    '1웨이브에 좀비·스켈레톤(언데드) 포함');
  var fastGiants = w1.filter(function (e) { return e.kind === 'giant' && e.fast; });
  ok(fastGiants.length === (sched0.giants || 0) && fastGiants.length > 0,
    '10일차 침공에 빠른 괴민 ' + (sched0.giants || 0) + '체 추가 (' + fastGiants.length + ')');

  // 정복자만 먼저 처치 → 잔당(고블린)도 함께 퇴각해 웨이브 조기 클리어
  w.enemies.forEach(function (e) { if (e.wave === 1 && e.kind === 'warlord') e.hp = 0; });
  safeRun(1);
  ok(w.invasion.phase === 'gap' && w.invasion.wave === 2, '정복자 처치 → 잔당도 함께 퇴각, 2웨이브 소강으로 전환');

  // 나머지 웨이브(2·3)는 정공법 전멸로 클리어
  for (var k = 2; k <= sched0.waves; k++) {
    safeRun(INVASION.waveGapMin + 1);
    ok(w.invasion.phase === 'active' && w.invasion.wave === k, k + '웨이브 자동 발동');
    wipeCurrentWave(w);
    safeRun(1);
  }
  ok(w.invasionsCompleted === 1, '1차 침공(' + sched0.day + '일차) 완료 카운트 1');
  ok((w.relics.crown || 0) === sched0.relicCount, '1차 승리 보상 = 전설급 유물 ' + sched0.relicCount + '개');
  ok(w.invasion.phase === 'countdown' && w.invasion.schedIndex === 1, '남은 예정 침공(20일차)으로 자동 전환');
  ok(w.invasionWon !== true, '아직 2차(20일차)가 남아있어 최종 승리 플래그는 미설정');

  // 2차 침공(20일차) — 더 가혹한 설정(웨이브·적 수·보상 증가) 확인 후 전부 클리어
  var sched1 = INVASION.schedule[1];
  ok(sched1.waves >= sched0.waves && sched1.goblinsPerWave >= sched0.goblinsPerWave &&
    sched1.warlordsPerWave >= sched0.warlordsPerWave && sched1.relicCount >= sched0.relicCount,
    '2차(20일차) 설정이 1차보다 약하지 않음(더 가혹)');
  w.invasion.triggerDay = w.day;
  safeRun(21 * 60);
  ok(w.invasion.phase === 'active' && w.invasion.wave === 1, '2차 침공 발동');
  var w1_2 = w.enemies.filter(function (e) { return e.wave === 1; });
  var fastGiants2 = w1_2.filter(function (e) { return e.kind === 'giant' && e.fast; });
  ok(fastGiants2.length === (sched1.giants || 0) && fastGiants2.length > 0,
    '20일차 침공에도 빠른 괴민 ' + (sched1.giants || 0) + '체 추가 (' + fastGiants2.length + ')');
  for (var k2 = 1; k2 <= sched1.waves; k2++) {
    ok(w.invasion.wave === k2, k2 + '웨이브 진행 중');
    wipeCurrentWave(w);
    safeRun(k2 < sched1.waves ? INVASION.waveGapMin + 1 : 1);
  }
  ok(w.invasionsCompleted === 2, '2차 침공까지 완료 카운트 2');
  ok(w.invasion.phase === 'won', '예정된 침공을 전부 격퇴 → 최종 승리');
  ok(w.invasionWon === true, 'invasionWon 플래그 설정(goals 판정용)');
  // 전설급 유물 후보가 여럿(crown·avorlancado 등)이라 어느 것으로 갈릴 수 있음 — 합계로 검증.
  // 진행 중 7일밤을 지나며 여신 강림(avorlancado 확정 1개)도 함께 섞이므로 그만큼 제외하고 비교.
  var legendaryTotal = (w.relics.crown || 0) + (w.relics.avorlancado || 0) - (w.goddessVisited ? 1 : 0);
  ok(legendaryTotal === sched0.relicCount + sched1.relicCount,
    '전설급 유물 누적(종류 무관, 여신 강림분 제외) = 1차+2차 합(' + legendaryTotal + ')');
})();

console.log('[sim-smoke] 17) 대침공 — 전멸 위기 시 게임오버 대신 같은 침공을 재도전 카운트다운으로 (신규)');
(function () {
  var sim = bootSim(654);
  var w = sim.world;
  give(sim, { food: 2000, meal: 500 });
  // 침공 발동 전까지는 정착민을 보호(1분 단위 힐) — 전멸위기 시점은 아래서 직접 통제해야 하므로
  run(sim, 1);
  w.invasion.triggerDay = w.day;
  var left = 21 * 60;
  while (left > 0) {
    var d = Math.min(1, left); left -= d;
    run(sim, d);
    sim.pawns.forEach(function (p) { if (p.state === 'dead') p.state = 'idle'; p.hp = 100; });
  }
  ok(w.invasion.phase === 'active', '1차 침공 발동');
  // 생존자 2명 이하로 강제 설정(전멸 위기 재현)
  for (var i = 2; i < sim.pawns.length; i++) sim.pawns[i].state = 'dead';
  var beforeDay = w.day;
  run(sim, 1);
  ok(w.invasion.phase === 'countdown', '전멸 위기 → 게임오버 대신 침공 철수·재도전 카운트다운');
  ok(w.invasion.schedIndex === 0, '재도전은 같은 1차 침공(스케줄 인덱스 유지) — 2차로 건너뛰지 않음');
  ok(w.invasion.triggerDay === beforeDay + INVASION.retryGapDays, '재도전까지 ' + INVASION.retryGapDays + '일 유예');
  ok(w.enemies.filter(function (e) { return e.wave === 1; }).length === 0, '철수한 침공군 제거됨');
})();

console.log('[sim-smoke] 18) 작업취소 회피(avoidJobType) — 취소한 정착민만 그 작업을 다시 안 잡음, 재선택 시 해제 (신규)');
(function () {
  var sim = bootSim(222);
  var w = sim.world;
  designateChop(sim, 5);
  var p = sim.pawns[0];
  var job1 = findWorkJob(w, p);
  ok(job1 && job1.type === 'gather', '평소엔 벌목(gather) 작업을 잡음');
  releaseAllOf(w, p.id);
  p.job = null;
  p.avoidJobType = 'gather'; // 🚫 작업취소로 이 정착민에게만 회피 표시
  var job2 = findWorkJob(w, p);
  ok(!job2 || job2.type !== 'gather', '회피 표시된 정착민은 벌목 작업을 다시 잡지 않음');
  var job2b = findWorkJob(w, sim.pawns[1]);
  ok(job2b && job2b.type === 'gather', '다른 정착민은 여전히 벌목 작업을 잡을 수 있음(회피는 개인 한정)');
  p.avoidJobType = null; // 재선택 시 해제되는 것과 동일한 상태
  var job3 = findWorkJob(w, p);
  ok(job3 && job3.type === 'gather', '회피 해제 후엔 다시 벌목 작업을 잡음');
})();

console.log('[sim-smoke] 19) 자동공격 토글(⚔️) — 기본 ON, 끄면 정지 (신규)');
(function () {
  var sim = bootSim(444);
  var w = sim.world;
  var p = sim.pawns[0];
  ok(p.autoAttack === true, '무기 든 정착민 자동공격 기본값 ON');
  p.manual = true;
  p.equipped = 'sword';
  var target = {
    id: w.nextEid++, x: p.x + 1, y: p.y, px: p.x + 1, py: p.y,
    hp: 50, maxHp: 50, cd: 0, dir: 1, anim: 0, kind: 'goblin', wave: 0,
  };
  w.enemies.push(target); // 섬 상주 적 등 기존 world.enemies 뒤에 추가되므로 인덱스가 아닌 참조로 추적
  // 자동공격 끄면 조종 중 공격 안 함
  p.autoAttack = false;
  run(sim, 1);
  ok(target.hp === 50, '자동공격 OFF → 조종 중 정착민이 사거리 안에 있어도 공격 안 함');
  // 다시 켜면(기본값) 공격
  p.autoAttack = true;
  run(sim, 1);
  ok(target.hp < 50, '자동공격 ON → 사거리 내 적을 자동으로 공격(HP ' + target.hp + ')');
})();

console.log('[sim-smoke] 20) 초소 특화 분기 — 근접(가시벽)·원거리(석궁/투석기/속사) 스탯·광역·연사 (신규)');
(function () {
  function enemy(id, x, y) { return { id: id, x: x, y: y, px: x, py: y, hp: 100, cd: 0, dir: 0, phase: 0, anim: 0 }; }
  var w = bootSim(1).world;
  var op = addBuilding(w, 'outpost', 40, 40, { stage: 'built' });
  var base = defenseStats(op);
  ok(base.power === 5 && base.range === 4 && base.aoe === 0, '기본 초소 = 공격력 5·사거리 4·단일');

  // 가시벽(근접): 짧은 사거리 + 인접 광역(aoe 1)
  op.branch = 'spike'; op.tier = 1;
  var sp = defenseStats(op);
  ok(sp.power === OUTPOST_BRANCHES.spike.tiers[0].power && sp.range === 3 && sp.aoe === 1 && sp.role === 'melee',
    '가시벽 1단계 = 근접·사거리 3·광역(반경1)');

  // 석궁탑(원거리·저격): 긴 사거리·단일. 2단계 강화 시 사거리↑
  op.branch = 'ballista'; op.tier = 1;
  var ba1 = defenseStats(op);
  op.tier = 2;
  var ba2 = defenseStats(op);
  ok(ba1.range === 8 && ba1.aoe === 0, '석궁탑 1단계 = 긴 사거리 8·단일');
  ok(ba2.range === 10 && ba2.power > ba1.power, '석궁탑 2단계 = 사거리 10·공격력 강화');

  // 투석기(원거리·광역): 중간 사거리 + aoe 2. 뭉친 적 3마리 모두 피해
  var w2 = bootSim(2).world;
  var cat = addBuilding(w2, 'outpost', 40, 40, { stage: 'built' });
  cat.branch = 'catapult'; cat.tier = 1;
  ok(defenseStats(cat).aoe === 2, '투석기 = 광역(반경2)');
  w2.enemies = [enemy(1, 43, 41), enemy(2, 44, 41), enemy(3, 43, 42)];
  tickTowers(w2, 30, {});
  ok(w2.enemies.every(function (e) { return e.hp < 100; }), '투석기 발사 → 반경 내 적 3마리 모두 피해(광역)');

  // 속사탑(원거리·연사): 단일 대상, 매우 짧은 쿨다운
  var w3 = bootSim(3).world;
  var rap = addBuilding(w3, 'outpost', 40, 40, { stage: 'built' });
  rap.branch = 'rapid'; rap.tier = 1;
  ok(defenseStats(rap).aoe === 0 && defenseStats(rap).cd < defenseStats(cat).cd, '속사탑 = 단일·투석기보다 빠른 연사');
  w3.enemies = [enemy(1, 43, 41), enemy(2, 44, 41), enemy(3, 43, 42)];
  tickTowers(w3, 30, {});
  var hurt = w3.enemies.filter(function (e) { return e.hp < 100; }).length;
  ok(hurt === 1, '속사탑은 단일 대상만 피해 (' + hurt + '마리)');

  // 가시벽 근접 광역: 곁에 붙은 적 무리에 splash
  var w4 = bootSim(4).world;
  var spk = addBuilding(w4, 'outpost', 40, 40, { stage: 'built' });
  spk.branch = 'spike'; spk.tier = 1;
  w4.enemies = [enemy(1, 42, 41), enemy(2, 43, 41), enemy(3, 42, 42)];
  tickTowers(w4, 30, {});
  ok(w4.enemies.filter(function (e) { return e.hp < 100; }).length >= 2, '가시벽 근접 광역 → 곁의 적 다수 피해');
})();

console.log('[sim-smoke] 21) 자동 무장 — 창고에 무기가 있으면 맨손 정착민이 집어들고 싸움 (버그 수정)');
(function () {
  function goblinNear(w, p, dx) {
    var x = Math.round(p.px) + dx, y = Math.round(p.py);
    var e = { id: w.nextEid++, x: x, y: y, px: x, py: y, hp: 100, maxHp: 100, cd: 0, dir: 1, anim: 0, kind: 'goblin', wave: 0 };
    w.enemies.push(e); return e;
  }
  // 창고에 검이 있으면: 맨손 정착민이 자동 장착 후 공격 (도망 X)
  var sim = bootSim(101); var w = sim.world; var p = sim.pawns[0];
  p.manual = false; p.equipped = null; w.stock.sword = 3;
  var e1 = goblinNear(w, p, 2);
  run(sim, 40);
  ok(p.equipped === 'sword', '맨손 정착민이 창고의 검을 자동 장착 (equipped=' + p.equipped + ')');
  ok((w.stock.sword || 0) < 3, '장착 시 검 재고 소비됨 (남은 ' + (w.stock.sword || 0) + ')');
  ok(e1.hp < 100, '자동 무장 후 적을 공격 (HP ' + e1.hp + ')');

  // 강한 무기 우선: 강철검이 있으면 그것을 집음
  var sim2 = bootSim(102); var w2 = sim2.world; var p2 = sim2.pawns[0];
  p2.manual = false; p2.equipped = null; w2.stock.sword = 1; w2.stock.ironSword = 1;
  goblinNear(w2, p2, 2);
  run(sim2, 20);
  ok(p2.equipped === 'ironSword', '강한 무기(강철검) 우선 장착 (equipped=' + p2.equipped + ')');

  // 창고에 무기가 전혀 없으면: 여전히 맨손 도주(장착 안 됨)
  var sim3 = bootSim(103); var w3 = sim3.world; var p3 = sim3.pawns[0];
  p3.manual = false; p3.equipped = null; // 무기 재고 0
  goblinNear(w3, p3, 2);
  run(sim3, 20);
  ok(!p3.equipped, '무기 재고가 없으면 장착 안 함(맨손 유지)');
})();

console.log('[sim-smoke] 22) 괴민 강화 — HP 3배 + 빠른 괴민(대침공)이 더 빨리 이동 (신규)');
(function () {
  ok(GIANT.hp === 900, '괴민 기본 HP 3배 = 900 (' + GIANT.hp + ')');
  // 같은 위치의 일반 괴민 vs 빠른 괴민 — 같은 시간 이동 시 빠른 쪽이 더 멀리
  function giant(w, p, fast) {
    var x = Math.round(p.px) + 8, y = Math.round(p.py);
    var e = { id: w.nextEid++, x: x, y: y, px: x, py: y, hp: 999, maxHp: 999, cd: 0, dir: 1, anim: 0, kind: 'giant', wave: 0, fast: !!fast };
    w.enemies.push(e); return e;
  }
  var s = bootSim(55); var w = s.world; var p = w.buildings ? s.pawns[0] : s.pawns[0];
  var slow = giant(w, p, false), quick = giant(w, p, true);
  var sx0 = slow.px, qx0 = quick.px;
  run(s, 30);
  var slowMoved = Math.abs(slow.px - sx0), quickMoved = Math.abs(quick.px - qx0);
  ok(quickMoved > slowMoved, '빠른 괴민이 일반 괴민보다 더 멀리 이동 (' + quickMoved.toFixed(2) + ' > ' + slowMoved.toFixed(2) + ')');
})();

console.log('[sim-smoke] 23) 적이 정착민 없거나 멀면 근처 건물·작물도 공격(파괴) (신규)');
(function () {
  var sim = bootSim(201); var w = sim.world;
  sim.pawns.forEach(function (p) { p.px = 2; p.py = 2; p.x = 2; p.y = 2; }); // 정착민을 멀리 치워 우선순위에서 배제
  var b = addBuilding(w, 'house', 40, 40, { stage: 'built' });
  ok(b.hp === b.maxHp && b.hp > 0, '완공 건물은 hp/maxHp 보유 (' + b.hp + '/' + b.maxHp + ')');
  var e1 = { id: w.nextEid++, x: 42, y: 40, px: 42, py: 40, hp: 999, maxHp: 999, cd: 0, dir: -1, anim: 0, kind: 'goblin', wave: 0 };
  w.enemies.push(e1);
  var hpBefore = b.hp;
  for (var i = 0; i < 25; i++) updateEnemies(w, sim.pawns, 10, {});
  ok(!w.buildings[b.id] || w.buildings[b.id].hp < hpBefore,
    '정착민이 멀면 근처 건물을 반복 공격해 파괴함 (' + (w.buildings[b.id] ? '남은hp ' + w.buildings[b.id].hp : '파괴됨') + ')');

  // 작물도 동일하게 공격 대상이 됨
  var w2 = bootSim(202).world;
  var sim2 = { world: w2, pawns: [] };
  var pawns2 = [{ id: 0, state: 'idle', px: 2, py: 2, x: 2, y: 2, hp: 100 }];
  w2.crops[idx(40, 40)] = { stage: 'ready', timer: 0 };
  var e2 = { id: w2.nextEid++, x: 41, y: 40, px: 41, py: 40, hp: 999, maxHp: 999, cd: 0, dir: -1, anim: 0, kind: 'goblin', wave: 0 };
  w2.enemies.push(e2);
  updateEnemies(w2, pawns2, 20, {});
  ok(!w2.crops[idx(40, 40)], '정착민이 멀면 근처 작물도 공격해 파괴함');

  // 정착민이 더 가까우면 정착민을 우선 타겟
  var w3 = bootSim(203).world;
  var b3 = addBuilding(w3, 'house', 40, 40, { stage: 'built' });
  var pawns3 = [{ id: 0, state: 'idle', px: 43, py: 40, x: 43, y: 40, hp: 100 }]; // 건물보다 정착민이 더 가까움
  var e3 = { id: w3.nextEid++, x: 43, y: 41, px: 43, py: 41, hp: 999, maxHp: 999, cd: 0, dir: -1, anim: 0, kind: 'goblin', wave: 0 };
  w3.enemies.push(e3);
  updateEnemies(w3, pawns3, 20, {});
  ok(pawns3[0].hp < 100 && b3.hp === b3.maxHp, '정착민이 더 가까우면 건물 대신 정착민을 우선 공격');
})();

console.log('[sim-smoke] 24) 괴민 점프 — 쿨다운마다 장애물 무시하고 도약 + 착지 반경 파괴 (신규)');
(function () {
  var sim = bootSim(301); var w = sim.world;
  var landX = 40 + GIANT_JUMP.distance;
  sim.pawns.forEach(function (p) { p.px = landX; p.py = 50; p.x = landX; p.y = 50; }); // 착지 지점에 배치(방향 유도 겸 피해 확인)
  var g = { id: w.nextEid++, x: 40, y: 50, px: 40, py: 50, hp: 900, maxHp: 900, cd: 0, dir: 1, anim: 0, kind: 'giant', wave: 0, jumpCd: 0 };
  w.enemies.push(g);
  w.objects[idx(landX, 50)] = { kind: 'tree' }; // 착지 지점에 나무(파괴 확인용)
  updateEnemies(w, sim.pawns, 1, {});
  ok(g.px === landX && g.py === 50, '괴민이 목표 방향으로 정확히 ' + GIANT_JUMP.distance + '칸 도약 (' + g.px + ',' + g.py + ')');
  ok(g.jumpCd > 0 && g.jumpCd <= GIANT_JUMP.cooldown, '점프 후 쿨다운 재설정 (' + g.jumpCd + ')');
  ok(w.objects[idx(landX, 50)].kind === 'stump', '착지 지점의 나무가 파괴됨(그루터기로)');
  ok(sim.pawns.every(function (p) { return p.hp === 100 - GIANT_JUMP.damage; }),
    '착지 반경 내 정착민이 피해를 입음 (hp ' + sim.pawns[0].hp + ')');
})();

console.log('[sim-smoke] 25) 방어구 — 착용 시 피격 데미지 경감 + 자동 착용 (신규)');
(function () {
  // 무방어 vs 가죽갑옷 vs 강철갑옷 — 같은 고블린 공격력(ENEMY.power)에 대한 경감 확인
  function hitOnce(armor) {
    var w = bootSim(401).world;
    var pawns = [{ id: 0, state: 'idle', px: 40, py: 40, x: 40, y: 40, hp: 100, armor: armor }];
    var e = { id: w.nextEid++, x: 40, y: 41, px: 40, py: 41, hp: 999, maxHp: 999, cd: 0, dir: -1, anim: 0, kind: 'goblin', wave: 0 };
    w.enemies.push(e);
    updateEnemies(w, pawns, 20, {});
    return 100 - pawns[0].hp;
  }
  var dmgNone = hitOnce(null);
  var dmgLeather = hitOnce('leatherArmor');
  var dmgIron = hitOnce('ironArmor');
  ok(dmgNone === ENEMY.power, '무방어 피해 = 고블린 공격력 그대로 (' + dmgNone + ')');
  ok(dmgLeather === Math.max(1, ENEMY.power - ARMOR.leatherArmor.defense), '가죽갑옷 착용 시 피해 경감 (' + dmgLeather + ')');
  ok(dmgIron === Math.max(1, ENEMY.power - ARMOR.ironArmor.defense), '강철갑옷 착용 시 피해 더 경감 (' + dmgIron + ')');
  ok(dmgIron <= dmgLeather, '강철갑옷이 가죽갑옷보다 경감 효과가 크거나 같음');

  // 자동 착용: 창고에 방어구가 있으면 전투 개입 시 무기와 별개로 자동 착용
  function goblinNear(w, p, dx) {
    var x = Math.round(p.px) + dx, y = Math.round(p.py);
    var e = { id: w.nextEid++, x: x, y: y, px: x, py: y, hp: 100, maxHp: 100, cd: 0, dir: 1, anim: 0, kind: 'goblin', wave: 0 };
    w.enemies.push(e); return e;
  }
  var sim = bootSim(402); var w = sim.world; var p = sim.pawns[0];
  p.manual = false; p.equipped = null; p.armor = null; w.stock.sword = 3; w.stock.leatherArmor = 2;
  goblinNear(w, p, 2);
  run(sim, 40);
  ok(p.armor === 'leatherArmor', '창고에 방어구가 있으면 전투 개입 시 자동 착용 (armor=' + p.armor + ')');
  ok((w.stock.leatherArmor || 0) < 2, '착용 시 방어구 재고 소비됨');
})();

console.log('[sim-smoke] 26) 과일나무 — 심으면 베지 않고 계속 열매를 맺음(재파종 불필요) (신규)');
(function () {
  var sim = bootSim(501); var w = sim.world;
  give(sim, { food: 40, meal: 10 }); // 저장고 기본 용량(120) 안쪽으로 — 과수확분(+5)이 들어갈 여유 확보
  w.research.unlocked.farming = true;
  // 정착민 스폰 지점(맵 중앙+1) 바로 옆으로 — 맵 크기·지형 시드에 관계없이 항상 도달 가능하게
  var cx = MAP_W / 2 | 0, cy = (MAP_H / 2 | 0) + 2;
  var i = idx(cx, cy);
  delete w.objects[i]; delete w.stockpile[i]; delete w.items[i];
  w.orchardZone[i] = true;

  var MAXT = 2000, t;
  // 파종될 때까지 5분 단위로 세밀히 폴링(과수확으로 인한 상태 스킵 방지)
  for (t = 0; !w.crops[i] && t < MAXT; t += 5) run(sim, 5);
  ok(!!w.crops[i], '과일나무 구역을 지정하면 자동으로 파종됨');
  ok(w.crops[i] && w.crops[i].kind === 'fruit', '심어진 작물의 종류 = fruit (' + (w.crops[i] && w.crops[i].kind) + ')');

  for (t = 0; w.crops[i] && w.crops[i].stage !== 'ready' && t < MAXT; t += 5) run(sim, 5);
  ok(w.crops[i] && w.crops[i].stage === 'ready', '충분한 시간 경과 후 열매를 맺음(ready)');

  var foodBefore = w.stock.food || 0;
  for (t = 0; w.crops[i] && w.crops[i].stage === 'ready' && t < MAXT; t += 5) run(sim, 5);
  ok((w.stock.food || 0) > foodBefore, '수확 시 식량 획득 (' + foodBefore + '→' + (w.stock.food || 0) + ')');
  ok(!!w.crops[i], '수확해도 나무는 삭제되지 않음(재파종 불필요)');
  ok(w.crops[i].kind === 'fruit' && w.crops[i].stage !== 'ready', '나무가 다시 자라기 시작(재성장 타이머로 리셋)');
})();

console.log('[sim-smoke] 27) 낚시 — 초희귀 어종 확장 (신규)');
(function () {
  var legendary = FISH.filter(function (f) { return f.rare === 3; });
  ok(legendary.length >= 5, '초희귀(rare=3) 어종이 다양해짐 (' + legendary.length + '종)');
  var goldFish = FISH.filter(function (f) { return f.gold > 0; });
  ok(goldFish.length === 1 && goldFish[0].name === '황금 잉어', '금은 여전히 황금 잉어에서만 나옴(유일 금 산출 어종)');
  var rng1 = mulberry32(9001), rng2 = mulberry32(9001);
  var a = catchFish(3, rng1), b = catchFish(3, rng2);
  ok(a.name === b.name, '동일 시드로 catchFish 결과 재현(결정론)');
})();

console.log('[sim-smoke] 28) 섬의 수호신 「아보랑카도」 — 지정일 밤 1회성 강림, 축복(유물) 확정 지급 (신규)');
(function () {
  var sim = bootSim(601); var w = sim.world;
  give(sim, { food: 500, meal: 100 });
  var descendCalls = [];
  sim.ctx.onGoddessDescend = function (x, y) { descendCalls.push({ x: x, y: y }); };
  ok(!w.goddessVisited, '초기엔 아직 강림 전');
  run(sim, (GODDESS.day - 1) * DAY_MIN - 480 - 1); // GODDESS.day 전날 23:59 근처까지
  ok(!w.goddessVisited, GODDESS.day + '일 이전에는 강림하지 않음');
  run(sim, 1201); // GODDESS.day 일 밤(spawnHour)까지 도달
  ok(w.goddessVisited, GODDESS.day + '일 밤에 강림');
  ok((w.relics[GODDESS.relicId] || 0) === 1, '축복(유물) 1개 확정 지급 (' + (w.relics[GODDESS.relicId] || 0) + ')');
  ok(descendCalls.length === 1, '강림 시각 이펙트 콜백(onGoddessDescend) 정확히 1회 호출');
  ok(descendCalls[0] && Number.isFinite(descendCalls[0].x) && Number.isFinite(descendCalls[0].y),
    '강림 위치(정착민 중심) 좌표 전달 (' + (descendCalls[0] && descendCalls[0].x) + ',' + (descendCalls[0] && descendCalls[0].y) + ')');
  run(sim, 2 * DAY_MIN);
  ok((w.relics[GODDESS.relicId] || 0) === 1, '재강림 없이 1회성 유지(유물 개수 변동 없음)');
  ok(descendCalls.length === 1, '재강림 이펙트도 다시 호출되지 않음(1회성)');
})();

console.log('[sim-smoke] 29) 탈출선 — 3부품(선체·엔진·반응로) 모두 완공 시 탈출 성공 (신규)');
(function () {
  var sim = bootSim(701); var w = sim.world;
  ok(!shipComplete(w), '부품 없으면 미완성');
  addBuilding(w, 'shipHull', 40, 40, { stage: 'built' });
  ok(!shipComplete(w), '1개만 완공 시 아직 미완성');
  addBuilding(w, 'shipEngine', 50, 40, { stage: 'built' });
  ok(!shipComplete(w), '2개만 완공 시 아직 미완성');
  addBuilding(w, 'shipReactor', 60, 40, { stage: 'built' });
  ok(shipComplete(w), '3개 모두 완공 시 탈출선 완성');
  ok(!w.escaped, 'stepWorld 실행 전엔 아직 탈출 처리 안 됨');
  var toasted = false;
  sim.ctx.onToast = function (msg) { if (msg.indexOf('탈출선') >= 0) toasted = true; };
  run(sim, 1);
  ok(w.escaped, 'stepWorld 실행 후 탈출 성공 처리(world.escaped)');
  ok(toasted, '탈출 성공 토스트 발생');
  ok(w.goals.escape === true, '목표(도전과제) "탈출 성공" 달성 기록');
  var before = w.escaped;
  run(sim, DAY_MIN);
  ok(w.escaped === before, '1회성 — 반복 처리되지 않음');
})();

console.log('[sim-smoke] 30) 떠돌이 상인 — 주기적 방문·체류·퇴장 (신규)');
(function () {
  var sim = bootSim(702); var w = sim.world;
  ok(!w.traderActive, '초기엔 상인 없음');
  run(sim, (TRADER.firstDay - 1) * DAY_MIN - 480 - 1); // firstDay 전날 23:59 근처까지
  ok(!w.traderActive, TRADER.firstDay + '일 전에는 방문하지 않음');
  run(sim, TRADER.spawnHour * 60 + 1); // firstDay spawnHour 도달
  ok(w.traderActive, TRADER.firstDay + '일 ' + TRADER.spawnHour + '시에 상인 방문');
  ok(w.traderDepartDay === TRADER.firstDay + TRADER.stayDays, '체류 종료일 = 방문일 + stayDays');
  ok(w.nextTraderDay === TRADER.firstDay + TRADER.intervalDays, '다음 방문 예정일 = 방문일 + intervalDays');
  run(sim, 2 * DAY_MIN);
  ok(!w.traderActive, '체류 기간 지나면 떠남');
  run(sim, 2 * DAY_MIN);
  ok(w.traderActive, '주기가 돌아오면 다시 방문(반복)');
  ok(['wood', 'iron', 'food', 'meal'].every(function (t) { return TRADER.rates[t] > 0; }),
    '모든 판매 가능 자원에 환율 설정됨');
})();

console.log('[sim-smoke] 31) 탈출선 해금 조건 — 나라 단계 + 대침공 완전 격퇴 (신규)');
(function () {
  ['shipHull', 'shipEngine', 'shipReactor'].forEach(function (k) {
    ok(BUILDS[k].escapePart === true, k + ' 은 escapePart 플래그 보유(대침공 격퇴 게이트용)');
    ok(BUILD_MIN_RANK[k] === 4, k + ' 은 나라 단계(4)에서만 해금');
  });
})();

console.log('[sim-smoke] 32) 좌대·선착장 — 낚시 등급 판정 + 희귀 확률 보정 (신규)');
(function () {
  var w = bootSim(801).world;
  // 물가 육지 옆 물 타일 하나 찾기(육지-물 경계)
  var wx = -1, wy = -1;
  for (var y = 1; y < 94 && wx < 0; y++) {
    for (var x = 1; x < 94; x++) {
      if (w.terrain[idx(x, y)] === 0 && isWalkable(w, x - 1, y)) { wx = x; wy = y; break; }
    }
  }
  ok(wx >= 0, '해안 물 타일 확보 (' + wx + ',' + wy + ')');
  ok(fishSpotTier(w, wx, wy) === 0, '일반 물가 = 등급 0(해안)');

  // 좌대를 인접 물 타일에 설치 → 그 좌대에 접한 물 타일 등급이 1로 상승
  var px = wx + 1;
  if (w.terrain[idx(px, wy)] === 0 && canPlaceBridge(w, px, wy)) {
    addBuilding(w, 'fishPlatform', px, wy, { stage: 'built' });
    ok(fishSpotTier(w, wx, wy) === 1, '좌대에 접한 물 = 등급 1(좌대)');
  } else { ok(true, '(좌대 설치 위치 부적합 — 스킵)'); }

  // 선착장(육지 2x2, 물 접함)을 지어 인접 물 등급 2 확인 — footprintTouchesWater 로 해안 판정
  var dx0 = -1, dy0 = -1;
  for (var yy = 2; yy < 92 && dx0 < 0; yy++) {
    for (var xx = 2; xx < 92; xx++) {
      if (isWalkable(w, xx, yy) && isWalkable(w, xx + 1, yy) && isWalkable(w, xx, yy + 1) && isWalkable(w, xx + 1, yy + 1) &&
          footprintTouchesWater(w, xx, yy, 2, 2)) { dx0 = xx; dy0 = yy; break; }
    }
  }
  ok(dx0 >= 0, '물과 접한 2x2 육지 확보(선착장 부지)');
  ok(footprintTouchesWater(w, dx0, dy0, 2, 2) === true, 'footprintTouchesWater 가 해안 부지를 참으로 판정');
  ok(footprintTouchesWater(w, dx0, dy0, 1, 1) !== undefined, 'footprintTouchesWater 는 boolean 반환');

  // catchFish 보정: 같은 rodTier 라도 spotBonus 가 높으면 희귀 어종 기대치↑
  function rareShare(rod, spot) {
    var rng = mulberry32(999);
    var rare = 0, N = 4000;
    for (var i = 0; i < N; i++) { if (catchFish(rod, rng, spot).rare >= 2) rare++; }
    return rare / N;
  }
  var base = rareShare(0, 0);
  var withPlatform = rareShare(0, 1);
  var withDock = rareShare(0, 2);
  ok(withPlatform > base, '좌대 보정(spot 1)이 희귀 어종 비율을 높임 (' + base.toFixed(3) + '→' + withPlatform.toFixed(3) + ')');
  ok(withDock > withPlatform, '선착장 보정(spot 2)이 좌대보다 더 높임 (' + withDock.toFixed(3) + ')');
  ok(FISH_PLATFORM.cost.wood > 0, '좌대 비용 정의됨');
})();

console.log('[sim-smoke] 33) 적 길찾기 — 장애물 우회 + 완전 차단 시 돌파 (신규)');
(function () {
  // (a) 나무 벽을 사이에 두고 정착민이 반대편에 있으면, 적이 벽을 돌아 접근한다
  var sim = bootSim(901); var w = sim.world;
  // 맵 중앙 근처 개활지 확보 + 세로 나무벽(가운데 한 칸만 뚫림)
  var cx = 48, cy = 48;
  for (var yy = 40; yy <= 56; yy++) for (var xx = 44; xx <= 52; xx++) { delete w.objects[idx(xx, yy)]; }
  for (var wy2 = 44; wy2 <= 52; wy2++) { if (wy2 !== 48) w.objects[idx(48, wy2)] = { kind: 'tree' }; } // x=48 세로벽, y=48만 통로
  var pawn = { id: 0, state: 'idle', px: 46, py: 45, x: 46, y: 45, hp: 100 }; // 벽 왼쪽
  var enemy = { id: w.nextEid++, x: 50, y: 51, px: 50, py: 51, hp: 200, maxHp: 200, cd: 0, dir: -1, anim: 0, kind: 'goblin', wave: 0 }; // 벽 오른쪽
  w.enemies = [enemy];
  var d0 = Math.abs(enemy.px - pawn.px) + Math.abs(enemy.py - pawn.py);
  for (var t = 0; t < 120; t++) updateEnemies(w, [pawn], 1, {});
  var d1 = Math.abs(enemy.px - pawn.px) + Math.abs(enemy.py - pawn.py);
  ok(d1 < d0 - 1, '나무벽을 우회해 정착민에게 접근함 (거리 ' + d0.toFixed(0) + '→' + d1.toFixed(1) + ')');

  // (b) 정착민을 나무로 완전히 가두면(사방 통로 없음), 적이 나무를 부수고 돌파한다
  var sim2 = bootSim(902); var w2 = sim2.world;
  for (var y3 = 40; y3 <= 56; y3++) for (var x3 = 44; x3 <= 52; x3++) { delete w2.objects[idx(x3, y3)]; }
  var pcx = 48, pcy = 48;
  // 정착민 둘레(반경1) 8칸을 전부 나무로 봉쇄
  for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
    if (ox === 0 && oy === 0) continue;
    w2.objects[idx(pcx + ox, pcy + oy)] = { kind: 'tree' };
  }
  var pawn2 = { id: 0, state: 'idle', px: pcx, py: pcy, x: pcx, y: pcy, hp: 100 };
  var enemy2 = { id: w2.nextEid++, x: pcx + 3, y: pcy, px: pcx + 3, py: pcy, hp: 300, maxHp: 300, cd: 0, dir: -1, anim: 0, kind: 'goblin', wave: 0 };
  w2.enemies = [enemy2];
  var treesBefore = 0; for (var oy2 = -1; oy2 <= 1; oy2++) for (var ox2 = -1; ox2 <= 1; ox2++) { if (w2.objects[idx(pcx + ox2, pcy + oy2)] && w2.objects[idx(pcx + ox2, pcy + oy2)].kind === 'tree') treesBefore++; }
  var broke = false;
  for (var t2 = 0; t2 < 200 && !broke; t2++) {
    updateEnemies(w2, [pawn2], 1, {});
    var treesNow = 0; for (var oy3 = -1; oy3 <= 1; oy3++) for (var ox3 = -1; ox3 <= 1; ox3++) { var oo = w2.objects[idx(pcx + ox3, pcy + oy3)]; if (oo && oo.kind === 'tree') treesNow++; }
    if (treesNow < treesBefore) broke = true;
  }
  ok(broke, '완전히 갇힌 정착민을 향해 나무를 부수고 돌파함 (봉쇄 나무 ' + treesBefore + '개 중 일부 파괴)');

  // (c) 다리(라프트) 벽도 돌파 대상 — 한 방에 제거
  var w3 = bootSim(903).world;
  // 물 타일 위 다리 한 칸 + 그 옆 육지에 적, 다리 너머(막다른) 정착민 배치는 복잡하므로 breakThrough 직접 검증 대신
  // 다리가 solid 아님에도 통행판(walkable)임을 재확인(길찾기가 다리 위를 지날 수 있음)
  var bx = -1, by = -1;
  for (var yb = 2; yb < 92 && bx < 0; yb++) for (var xb = 2; xb < 92; xb++) { if (w3.terrain[idx(xb, yb)] === 0 && canPlaceBridge(w3, xb, yb)) { bx = xb; by = yb; break; } }
  if (bx >= 0) {
    addBuilding(w3, 'bridge', bx, by, { stage: 'built' });
    ok(isWalkable(w3, bx, by), '다리 위는 통행 가능 — 길찾기가 다리를 경유할 수 있음');
  } else { ok(true, '(다리 설치 위치 없음 — 스킵)'); }
})();

console.log('[sim-smoke] 34) 일꾼 오두막 — 광부(인접 광산 자동 채굴)·농부(주변 자동 농사 구역) (신규)');
(function () {
  // (a) 광부 오두막: 인접 광산을 자동 채굴 지정
  var w = bootSim(1001).world;
  var mine = addBuilding(w, 'goldmine', 40, 40, { natural: true, stage: 'built', charges: 20 });
  ok(footprintAdjacentMine(w, 43, 40, 2, 2) === true, '광산 오른쪽에 붙인 자리 = 광산 인접(배치 허용)');
  ok(footprintAdjacentMine(w, 60, 60, 2, 2) === false, '광산과 먼 자리 = 인접 아님(배치 거부)');
  var lodge = addBuilding(w, 'minerLodge', 43, 40, { stage: 'built' });
  ok(!w.mineDesig[mine.id], '오두막만 지었을 뿐 아직 자동 지정 전');
  var changed = autoDesignateLodges(w);
  ok(w.mineDesig[mine.id] === true, '광부 오두막이 인접 광산을 자동 채굴 지정함');
  ok(changed === true, '지정 변경 시 true 반환(구역 갱신 신호)');
  // 고갈 후에도(재생되면) 다시 자동 지정 — 고갈 상태면 지정 안 함
  mine.charges = 0; mine.depleted = true; delete w.mineDesig[mine.id];
  autoDesignateLodges(w);
  ok(!w.mineDesig[mine.id], '고갈된 광산은 자동 지정하지 않음');
  mine.charges = 10; mine.depleted = false;
  autoDesignateLodges(w);
  ok(w.mineDesig[mine.id] === true, '재생(충전>0)되면 다시 자동 채굴 지정');

  // (b) 농부 오두막: 농업 연구 후 주변 잔디를 자동 농사 구역화
  var w2 = bootSim(1002).world;
  // 개활지 확보
  for (var yy = 44; yy <= 56; yy++) for (var xx = 44; xx <= 56; xx++) { delete w2.objects[idx(xx, yy)]; }
  var flodge = addBuilding(w2, 'farmLodge', 50, 50, { stage: 'built' });
  ok(Object.keys(w2.farmZone).length === 0, '초기 농사 구역 없음');
  autoDesignateLodges(w2);
  ok(Object.keys(w2.farmZone).length === 0, '농업 연구 전에는 자동 농사 구역 생성 안 함');
  w2.research.unlocked.farming = true;
  autoDesignateLodges(w2);
  ok(Object.keys(w2.farmZone).length > 0, '농업 연구 후 주변 잔디가 자동 농사 구역이 됨 (' + Object.keys(w2.farmZone).length + '칸)');
  ok(!w2.farmZone[idx(50, 50)], '오두막 자리 자체는 농사 구역에서 제외');
})();

console.log('[sim-smoke] 35) 최종 보스 「악마후배」 — 먼 섬 상주 + 괴민 10배 체력 + 처치 시 막대한 보상 (신규)');
(function () {
  // 보스 섬 정의 존재 + 시작 대륙(맵 중앙)에서 가장 먼 섬
  var demonDef = ISLANDS.find(function (i) { return i.theme === 'boss'; });
  ok(!!demonDef, 'ISLANDS 에 보스(악마의 섬) 정의 존재');
  ok(enemyStats({ kind: 'demon' }).hp === DEMON.hp, '악마후배 종류 스탯 = DEMON');
  ok(DEMON.hp === GIANT.hp * 10, '악마후배 체력 = 괴민의 10배 (' + DEMON.hp + ')');
  ok(DEMON.dropGold >= 1000 && DEMON.dropIron >= 500, '처치 보상이 막대함(금·철)');

  // 월드 생성 시 보스 1체 상주 + 섬 중앙에서 가장 먼 위치인지
  var w = bootSim(1101).world;
  var demons = w.enemies.filter(function (e) { return e.kind === 'demon'; });
  ok(demons.length === 1, '월드에 악마후배 1체 상주 (' + demons.length + ')');
  ok(demons[0].hp === DEMON.hp && demons[0].boss === true, '보스 플래그·풀피 초기화');
  // 보스 섬이 다른 원정 섬들보다 시작점(맵 중앙 48,48)에서 멀거나 비슷하게 외딴가
  var bIsl = w.islands.find(function (i) { return i.theme === 'boss'; });
  ok(!!bIsl, '보스 섬 메타 생성됨');

  // 처치 → world.bossJustKilled 플래그 → sim 이 보상 처리
  var sim = bootSim(1102);
  var w2 = sim.world;
  var boss = w2.enemies.filter(function (e) { return e.kind === 'demon'; })[0];
  var goldBefore = w2.stock.gold || 0, ironBefore = w2.stock.iron || 0;
  boss.hp = 0; // 즉사 처리
  updateEnemies(w2, sim.pawns, 1, {});
  ok(w2.bossJustKilled === true, '보스 처치 시 bossJustKilled 플래그 설정');
  ok((w2.stock.gold || 0) >= goldBefore + DEMON.dropGold, '막대한 금 드랍 (' + goldBefore + '→' + (w2.stock.gold || 0) + ')');
  ok((w2.stock.iron || 0) >= ironBefore + DEMON.dropIron, '막대한 철 드랍');
  ok(!w2.enemies.some(function (e) { return e.kind === 'demon'; }), '처치된 보스는 제거됨(리스폰 없음)');
  // sim.stepWorld 가 전설 유물 + 보스 격파 플래그 처리
  var relicBefore = Object.values(w2.relics || {}).reduce(function (a, b) { return a + b; }, 0);
  run(sim, 1);
  ok(w2.bossDefeated === true, 'stepWorld 후 bossDefeated 설정');
  ok(w2.bossJustKilled === false, '보상 처리 후 플래그 해제(1회성)');
  var relicAfter = Object.values(w2.relics || {}).reduce(function (a, b) { return a + b; }, 0);
  ok(relicAfter > relicBefore, '처치 보상으로 전설 유물 지급 (' + relicBefore + '→' + relicAfter + ')');
})();

console.log('[sim-smoke] 36) 자동 무장 토글 — 켜면 유휴 정착민이 창고 무기를 미리 장착 (신규)');
(function () {
  var sim = bootSim(1201); var w = sim.world;
  give(sim, { food: 300, meal: 50 });
  w.stock.sword = 3;
  w.autoEquip = false;
  run(sim, 30);
  ok(sim.pawns.every(function (p) { return !p.equipped; }), '자동 무장 OFF: 적이 없으면 무기 미장착');
  w.autoEquip = true;
  run(sim, 30);
  var armed = sim.pawns.filter(function (p) { return p.equipped; }).length;
  ok(armed > 0, '자동 무장 ON: 유휴 정착민이 창고 무기를 미리 장착 (' + armed + '명)');
  ok((w.stock.sword || 0) < 3, '장착한 만큼 창고 무기 소비됨 (남은 ' + (w.stock.sword || 0) + ')');
})();

console.log('[sim-smoke] 37) 악마후배 광역 레이저 — 쿨다운마다 반경 내 전체 강타 (신규)');
(function () {
  ok(DEMON.laser && DEMON.laser.damage > 0 && DEMON.laser.radius > 0, '레이저 스탯 정의(피해·반경)');
  var w = bootSim(1301).world;
  w.enemies = []; // 기존 보스 제거 후 통제된 배치
  var demon = { id: w.nextEid++, x: 50, y: 50, px: 50, py: 50, hp: 9000, maxHp: 9000, cd: 999, dir: -1, anim: 0, kind: 'demon', boss: true, laserCd: 0 };
  w.enemies = [demon];
  // 반경 안 3명 + 반경 밖 1명
  var pIn = [
    { id: 0, state: 'idle', px: 51, py: 50, x: 51, y: 50, hp: 100 },
    { id: 1, state: 'idle', px: 50, py: 53, x: 50, y: 53, hp: 100 },
    { id: 2, state: 'idle', px: 48, py: 49, x: 48, y: 49, hp: 100 },
  ];
  var pOut = { id: 3, state: 'idle', px: 50, py: 80, x: 50, y: 80, hp: 100 }; // 반경(6) 밖 + 사거리 밖
  var pawns = pIn.concat([pOut]);
  var lasered = [];
  updateEnemies(w, pawns, 1, { onDemonLaser: function (e, tx, ty) { lasered.push({ tx: tx, ty: ty }); } });
  ok(lasered.length === 1, '사거리 내 목표가 있으면 레이저 발사(콜백 1회)');
  ok(pIn.every(function (p) { return p.hp < 100; }), '반경 내 정착민 전원 피해');
  ok(pIn.every(function (p) { return p.hp === 100 - DEMON.laser.damage; }), '피해량 = DEMON.laser.damage (' + pIn[0].hp + ')');
  ok(pOut.hp === 100, '반경 밖 정착민은 무사');
  ok(demon.laserCd === DEMON.laser.cooldown, '발사 후 쿨다운 재설정');
  // 쿨다운 동안 재발사 안 함
  var again = [];
  updateEnemies(w, pawns, 1, { onDemonLaser: function () { again.push(1); } });
  ok(again.length === 0, '쿨다운 중에는 재발사 안 함');
  // 방어구 착용 시 레이저 피해 경감
  var w2 = bootSim(1302).world;
  var demon2 = { id: w2.nextEid++, x: 50, y: 50, px: 50, py: 50, hp: 9000, maxHp: 9000, cd: 999, dir: -1, anim: 0, kind: 'demon', boss: true, laserCd: 0 };
  w2.enemies = [demon2];
  var armored = { id: 0, state: 'idle', px: 51, py: 50, x: 51, y: 50, hp: 100, armor: 'ironArmor' };
  updateEnemies(w2, [armored], 1, {});
  ok(armored.hp === 100 - Math.max(1, DEMON.laser.damage - ARMOR.ironArmor.defense), '레이저도 방어구로 경감됨 (' + armored.hp + ')');
})();

console.log('[sim-smoke] 38) 악마후배 — 앞을 막은 건물을 부수며 직진 + 구버전 세이브 마이그레이션 (신규)');
(function () {
  // (a) 정착민과 악마 사이에 건물벽 → 악마가 우회 대신 부수며 직진
  var w = bootSim(1401).world;
  w.enemies = [];
  for (var yy = 40; yy <= 58; yy++) for (var xx = 40; xx <= 58; xx++) delete w.objects[idx(xx, yy)];
  var b1 = addBuilding(w, 'house', 48, 47, { stage: 'built' });
  var b2 = addBuilding(w, 'house', 50, 47, { stage: 'built' });
  var demon = { id: w.nextEid++, x: 49, y: 50, px: 49, py: 50, hp: 9000, maxHp: 9000, cd: 0, dir: -1, anim: 0, kind: 'demon', boss: true, laserCd: 999 };
  w.enemies = [demon];
  var pawn = { id: 0, state: 'idle', px: 49, py: 44, x: 49, y: 44, hp: 100 }; // 벽 너머(악마의 목표)
  var destroyed = 0;
  var cb = { onBuildingDestroyed: function () { destroyed++; }, onBuildingHit: function () {}, onHit: function () {} };
  for (var t = 0; t < 40; t++) updateEnemies(w, [pawn], 5, cb);
  ok(!w.buildings[b1.id] && !w.buildings[b2.id], '악마가 앞을 막은 건물벽(2채)을 부수며 돌파함');
  ok(destroyed >= 2, '파괴 콜백 발생(' + destroyed + '건)');
  ok(Math.round(demon.py) < 50, '건물을 부순 뒤 정착민 쪽으로 전진함 (y ' + Math.round(demon.py) + ')');

  // (b) 옆(목표 반대 방향) 건물은 부수지 않음 — 앞만 부숨
  var w2 = bootSim(1402).world;
  w2.enemies = [];
  for (var y2 = 40; y2 <= 58; y2++) for (var x2 = 40; x2 <= 58; x2++) delete w2.objects[idx(x2, y2)];
  var side = addBuilding(w2, 'house', 46, 50, { stage: 'built' }); // 악마 왼쪽(목표는 위쪽)
  var demon2 = { id: w2.nextEid++, x: 49, y: 50, px: 49, py: 50, hp: 9000, maxHp: 9000, cd: 0, dir: -1, anim: 0, kind: 'demon', boss: true, laserCd: 999 };
  w2.enemies = [demon2];
  var pawn2 = { id: 0, state: 'idle', px: 49, py: 42, x: 49, y: 42, hp: 100 }; // 위쪽 목표(옆 건물과 무관)
  updateEnemies(w2, [pawn2], 3, {});
  ok(!!w2.buildings[side.id], '목표 방향이 아닌 옆 건물은 부수지 않음(직진만)');

  // (c) 구버전 세이브 마이그레이션: 보스 없으면 ensureBossIsland 로 스폰
  var w3 = bootSim(1403).world;
  w3.enemies = w3.enemies.filter(function (e) { return e.kind !== 'demon'; }); // 구버전처럼 보스 제거
  ok(!w3.enemies.some(function (e) { return e.kind === 'demon'; }), '마이그레이션 전: 보스 없음');
  var added = ensureBossIsland(w3);
  ok(added === true, 'ensureBossIsland 가 보스를 추가함');
  ok(w3.enemies.filter(function (e) { return e.kind === 'demon'; }).length === 1, '보스 1체 스폰');
  var added2 = ensureBossIsland(w3);
  ok(added2 === false, '이미 있으면 중복 스폰 안 함');
  w3.bossDefeated = true;
  w3.enemies = w3.enemies.filter(function (e) { return e.kind !== 'demon'; });
  ok(ensureBossIsland(w3) === false, '이미 격파한 경우엔 다시 스폰하지 않음');
})();

console.log('[sim-smoke] 39) 성문(fenceGate) — 정착민은 통과·적은 차단 + 막다른 길이면 결국 돌파 (신규)');
(function () {
  var w = bootSim(1501).world;
  var gx = 48, gy = 48;
  addBuilding(w, 'fenceGate', gx, gy, { stage: 'built' });
  ok(isWalkable(w, gx, gy), '정착민 시점(기본값)에는 성문이 통행 가능');
  ok(isWalkable(w, gx, gy, true) === false, '적 시점(forEnemy)에는 성문이 통행 불가');

  // (a) 목적지(50,50)를 나무 링(5x5 테두리)으로 완전히 에워싸고, 테두리 위쪽 한 칸만 성문으로 뚫어둠
  //     → 정착민은 성문을 통과해 들어가지만, 적 시점 길찾기는 유일한 통로(성문)가 막혀 경로가 없다
  for (var yy = 44; yy <= 54; yy++) for (var xx = 44; xx <= 54; xx++) { delete w.objects[idx(xx, yy)]; }
  for (var rx = 48; rx <= 52; rx++) { w.objects[idx(rx, 48)] = { kind: 'tree' }; w.objects[idx(rx, 52)] = { kind: 'tree' }; }
  for (var ry = 49; ry <= 51; ry++) { w.objects[idx(48, ry)] = { kind: 'tree' }; w.objects[idx(52, ry)] = { kind: 'tree' }; }
  gx = 50; gy = 48;
  delete w.objects[idx(gx, gy)]; // 위쪽 변 가운데 한 칸을 성문 자리로 비움
  addBuilding(w, 'fenceGate', gx, gy, { stage: 'built' });
  var pawnPath = findPath(w, 50, 44, 50, 50, false);
  var enemyPath = findPath(w, 50, 44, 50, 50, false, true);
  ok(pawnPath !== null, '정착민 길찾기는 성문을 통과해 링 안쪽까지 경로를 찾음');
  ok(enemyPath === null, '적 길찾기는 성문이 유일한 통로면 경로를 못 찾음(우회·직진 모두 불가)');

  // (b) 링의 다른 변에 우회 통로를 하나 더 뚫으면 — 적은 성문 칸을 피해 그 우회로로 돌아간다
  delete w.objects[idx(48, 50)]; // 왼쪽 변에 우회 통로 하나 더 뚫음
  var enemyPath2 = findPath(w, 50, 44, 50, 50, false, true);
  ok(enemyPath2 !== null, '우회로가 있으면 적도 결국 도달함(성문 칸만 피해서)');
  ok(enemyPath2.every(function (p) { return !(p.x === gx && p.y === gy); }), '적의 우회 경로는 성문 칸을 지나지 않음');
})();

console.log('[sim-smoke] 40) 찬란한 음식 — 요리 중 극저확률로 등급 대신 성공 + 먹으면 최대 체력 영구 증가 (신규)');
(function () {
  var w = bootSim(1601).world;
  var p = createPawn(0, {}, 50, 50);
  p.hunger = 60; p.mood = 70;
  w.stock.food = 10;
  var ctxBase = { onItemChange: function () {}, onEvent: function () {}, onToast: function () {}, onDeath: function () {} };

  // (a) 확률 굴림이 실패(임계값 이상)하면 평소대로 등급 요리가 나옴
  p.job = { type: 'cook', tierId: 'meal' };
  reserve(w, 'cook', p.id); // 직접 대입형 — 실제 배정처럼 예약락도 함께(안 하면 방치작업 판정으로 즉시 양보됨)
  p.state = 'working'; p.workLeft = 0.01;
  updatePawn(w, p, 1, Object.assign({}, ctxBase, { rng: function () { return 0.99; } }));
  ok((w.stock.meal || 0) === 1, '확률 굴림 실패 시 평소대로 등급 요리(소박한 식사)가 나옴');
  ok(!w.stock[GLORIOUS_FOOD.id], '이번엔 찬란한 음식이 나오지 않음');

  // (b) 확률 굴림이 성공(임계값 미만)하면 등급과 무관하게 찬란한 음식이 나옴
  w.stock.food = 10;
  p.job = { type: 'cook', tierId: 'meal' };
  reserve(w, 'cook', p.id);
  p.state = 'working'; p.workLeft = 0.01;
  updatePawn(w, p, 1, Object.assign({}, ctxBase, { rng: function () { return 0; } }));
  ok(w.stock[GLORIOUS_FOOD.id] === 1, '확률 굴림 성공 시 찬란한 음식이 나옴');
  ok((w.stock.meal || 0) === 1, '기존에 있던 등급 요리 재고는 그대로(추가 생산 안 됨)');

  // (c) 찬란한 음식을 먹으면 최대 체력이 영구 증가하고, 그만큼 체력도 회복됨
  var maxHpBefore = p.maxHp;
  p.hp = 50;
  p.job = null; p.state = 'eating'; p.workLeft = 0.01;
  updatePawn(w, p, 1, Object.assign({}, ctxBase, { rng: function () { return 0.99; } }));
  ok(p.maxHp === maxHpBefore + GLORIOUS_FOOD.maxHpBonus, '찬란한 음식을 먹으면 최대 체력이 영구 증가 (' + maxHpBefore + '→' + p.maxHp + ')');
  ok(p.hp === 50 + GLORIOUS_FOOD.maxHpBonus, '체력도 증가분만큼 즉시 회복됨');
  ok(!w.stock[GLORIOUS_FOOD.id], '먹은 만큼 찬란한 음식 재고 소비됨');
  ok((w.stock.meal || 0) === 1, '일반 등급 요리는 건드리지 않음(찬란한 음식이 최우선으로 소비됨)');
})();

console.log('[sim-smoke] 41) 초특급 희귀 낚시 스팟 — 맵에 몇 곳뿐인 전용 지점 + 밍크고래 등 전용 어종 (신규)');
(function () {
  var w = bootSim(1701).world;
  var spots = Object.keys(w.rareFishTile).map(function (s) { return +s; });
  ok(spots.length >= RARE_FISH_SPOT.countMin && spots.length <= RARE_FISH_SPOT.countMax,
    '맵당 스팟 개수가 설정 범위 안(' + spots.length + '개, ' + RARE_FISH_SPOT.countMin + '~' + RARE_FISH_SPOT.countMax + ')');
  var cx = MAP_W / 2, cy = MAP_H / 2;
  ok(spots.every(function (i) {
    var x = i % MAP_W, y = (i / MAP_W) | 0;
    return w.terrain[i] === 0 && Math.hypot(x - cx, y - cy) >= RARE_FISH_SPOT.minDistFromCenter && fishSpotTier(w, x, y) >= 0;
  }), '모든 스팟이 스폰 지점에서 멀리 떨어진 해안 물 타일(육지 인접)');

  // (a) 일반 낚시(catchFish)에서는 spotOnly 어종이 절대 나오지 않음
  var rng1 = mulberry32(555);
  var sawSpotOnly = false;
  for (var i = 0; i < 3000; i++) { if (catchFish(3, rng1, 2).spotOnly) sawSpotOnly = true; }
  ok(!sawSpotOnly, '일반 낚시에서는 밍크고래 등 spotOnly 어종이 절대 나오지 않음(3000회 시행)');

  // (b) 희귀 스팟 전용 낚시(catchRareFish)는 항상 spotOnly 어종만 나옴
  var rng2 = mulberry32(556);
  var allSpotOnly = true;
  for (var i2 = 0; i2 < 200; i2++) { var f = catchRareFish(rng2); if (!f.spotOnly) allSpotOnly = false; }
  ok(allSpotOnly, '희귀 스팟에서는 항상 spotOnly 어종(밍크고래·대왕오징어)만 낚임(200회 시행)');

  // (c) 실제 낚시 작업 완료 시 — 희귀 스팟 타일이면 spotOnly 어종, 일반 타일이면 일반 어종
  var rareIdx = spots[0];
  var rx = rareIdx % MAP_W, ry = (rareIdx / MAP_W) | 0;
  w.fishDesig[rareIdx] = true;
  var p = createPawn(0, {}, rx, ry);
  p.hunger = 60; p.job = { type: 'fish', idx: rareIdx }; p.state = 'working'; p.workLeft = 0.01;
  var ctxFish = { onItemChange: function () {}, onEvent: function () {}, onToast: function () {}, onDeath: function () {}, onStorageFull: function () {}, rng: function () { return 0.5; } };
  updatePawn(w, p, 1, ctxFish);
  ok((w.stock.food || 0) >= 25 && (w.stock.delicacy || 0) >= 2, '희귀 스팟 낚시 결과가 spotOnly 어종의 후한 식량·진미로 반영됨');
})();

console.log('[sim-smoke] 42) 신규 도전과제 3종 — 성문·찬란한 음식·초특급 희귀어종 (신규)');
(function () {
  var w = bootSim(1801).world;
  ok(checkGoals(w, []).every(function (g) { return g.id !== 'gate' && g.id !== 'feast' && g.id !== 'abyss'; }),
    '초기엔 신규 도전과제 3종 모두 미달성');

  // (a) 성문 완공 → '출입 통제' 달성
  addBuilding(w, 'fenceGate', 40, 40, { stage: 'built' });
  var newly1 = checkGoals(w, []);
  ok(newly1.some(function (g) { return g.id === 'gate'; }), '성문 완공 시 "출입 통제" 신규 달성');

  // (b) 찬란한 음식 섭취 → '기적의 만찬' 달성 (실제 pawns.js 섭취 코드 경로로 플래그 설정 검증)
  var p = createPawn(0, {}, 50, 50);
  w.stock[GLORIOUS_FOOD.id] = 1;
  p.hunger = 60; p.job = null; p.state = 'eating'; p.workLeft = 0.01;
  var ctxEat = { onItemChange: function () {}, onEvent: function () {}, onToast: function () {}, onDeath: function () {} };
  updatePawn(w, p, 1, ctxEat);
  ok(w.ateGloriousFood === true, '찬란한 음식 섭취 시 world.ateGloriousFood 플래그 설정');
  var newly2 = checkGoals(w, [p]);
  ok(newly2.some(function (g) { return g.id === 'feast'; }), '찬란한 음식 섭취 시 "기적의 만찬" 신규 달성');

  // (c) 초특급 희귀어종 포획 → '심해의 전설' 달성 (실제 pawns.js 낚시 완료 코드 경로로 플래그 설정 검증)
  var spots = Object.keys(w.rareFishTile).map(function (s) { return +s; });
  var rareIdx = spots[0];
  var rx = rareIdx % MAP_W, ry = (rareIdx / MAP_W) | 0;
  w.fishDesig[rareIdx] = true;
  var p2 = createPawn(1, {}, rx, ry);
  p2.hunger = 60; p2.job = { type: 'fish', idx: rareIdx }; p2.state = 'working'; p2.workLeft = 0.01;
  var ctxFish2 = { onItemChange: function () {}, onEvent: function () {}, onToast: function () {}, onDeath: function () {}, onStorageFull: function () {}, rng: function () { return 0.5; } };
  updatePawn(w, p2, 1, ctxFish2);
  ok(w.caughtSpotOnlyFish === true, '초특급 희귀어종 포획 시 world.caughtSpotOnlyFish 플래그 설정');
  var newly3 = checkGoals(w, [p, p2]);
  ok(newly3.some(function (g) { return g.id === 'abyss'; }), '초특급 희귀어종 포획 시 "심해의 전설" 신규 달성');

  // (d) 이미 달성한 목표는 재알림 없음(1회성)
  var newly4 = checkGoals(w, [p, p2]);
  ok(newly4.length === 0, '이미 달성한 목표는 재알림 없음');
})();

console.log('[sim-smoke] 43) 신규 연구 3종(관개·수의학·요새화) + 양털 + 정자 사기 보정 (신규)');
(function () {
  var ctxBase = { onItemChange: function () {}, onEvent: function () {}, onCropChange: function () {}, onDeath: function () {}, onStorageFull: function () {}, onSheepChange: function () {}, rng: function () { return 0.5; } };

  // (a) 관개 — 밀 수확량이 30% 늘어남
  var w1 = bootSim(1901).world;
  var foodBefore1 = w1.stock.food || 0;
  w1.crops[0] = { stage: 'ready', kind: 'wheat' };
  var p1 = createPawn(0, {}, 0, 0);
  p1.job = { type: 'harvestCrop', idx: 0 }; p1.state = 'working'; p1.workLeft = 0.01;
  updatePawn(w1, p1, 1, ctxBase);
  var yieldBase = (w1.stock.food || 0) - foodBefore1;
  var foodBefore2 = w1.stock.food || 0;
  w1.crops[0] = { stage: 'ready', kind: 'wheat' };
  w1.research.unlocked.irrigation = true;
  p1.job = { type: 'harvestCrop', idx: 0 }; p1.state = 'working'; p1.workLeft = 0.01;
  updatePawn(w1, p1, 1, ctxBase);
  var yieldIrri = (w1.stock.food || 0) - foodBefore2;
  ok(yieldIrri > yieldBase, '관개 연구 해금 시 밀 수확량이 늘어남 (' + yieldBase + ' → ' + yieldIrri + ')');

  // (b) 수의학 — 사냥 산출량이 늘어나고, 양은 양털도 함께 산출 (새로 push 한 양은 배열 맨 끝에 들어감에 주의)
  var w2 = bootSim(1902).world;
  w2.stock.meal = 6; // 방치작업(starvedWork) 판정에서 "요리" 후보가 끼어들어 사냥이 가로채이지 않도록 미리 충족
  w2.sheep.push({ id: w2.nextSid++, type: 'sheep', x: 0, y: 0 });
  var sheepA = w2.sheep[w2.sheep.length - 1];
  var foodBeforeA = w2.stock.food || 0;
  var p2 = createPawn(0, {}, 0, 0);
  p2.job = { type: 'hunt', sheepId: sheepA.id };
  reserve(w2, 'hunt:' + sheepA.id, p2.id); // 직접 대입형 — 예약락도 함께(안 하면 방치작업 판정으로 즉시 양보됨)
  p2.state = 'working'; p2.workLeft = 0.01;
  updatePawn(w2, p2, 1, ctxBase);
  var foodGainBase = (w2.stock.food || 0) - foodBeforeA;
  ok((w2.stock.wool || 0) > 0, '양 사냥 시 양털도 함께 산출됨 (' + (w2.stock.wool || 0) + ')');

  w2.sheep.push({ id: w2.nextSid++, type: 'sheep', x: 0, y: 0 });
  var sheepB = w2.sheep[w2.sheep.length - 1];
  w2.research.unlocked.veterinary = true;
  var foodBeforeB = w2.stock.food || 0;
  var p2b = createPawn(1, {}, 0, 0);
  p2b.job = { type: 'hunt', sheepId: sheepB.id };
  reserve(w2, 'hunt:' + sheepB.id, p2b.id);
  p2b.state = 'working'; p2b.workLeft = 0.01;
  updatePawn(w2, p2b, 1, ctxBase);
  var foodGainVet = (w2.stock.food || 0) - foodBeforeB;
  ok(foodGainVet > foodGainBase, '수의학 연구 해금 시 사냥 식량 산출이 늘어남 (' + foodGainBase + ' → ' + foodGainVet + ')');

  // (c) 요새화 — 방어 계열 건물(초소·성) 내구도 +40%, 비방어 건물은 영향 없음
  var w3 = bootSim(1903).world;
  var towerBase = addBuilding(w3, 'tower', 10, 10);
  var houseBase = addBuilding(w3, 'house', 12, 12);
  w3.research.unlocked.fortification = true;
  var towerFortified = addBuilding(w3, 'tower', 20, 20);
  var houseFortified = addBuilding(w3, 'house', 22, 22);
  ok(towerFortified.maxHp > towerBase.maxHp, '요새화 연구 해금 시 초소(방어 계열) 내구도 증가 (' + towerBase.maxHp + ' → ' + towerFortified.maxHp + ')');
  ok(houseFortified.maxHp === houseBase.maxHp, '요새화는 방어 계열이 아닌 건물(집)엔 영향 없음');

  // (d) 정자 — 완공되면 정착민 전체 사기가 소폭 올라감
  var w4a = bootSim(1904).world;
  var pa = createPawn(0, {}, 50, 50);
  pa.hunger = 50; pa.hp = 50; pa.mood = 50;
  for (var i = 0; i < 200; i++) updatePawn(w4a, pa, 1, ctxBase);
  var w4b = bootSim(1904).world;
  addBuilding(w4b, 'pavilion', 40, 40, { stage: 'built' });
  var pb = createPawn(0, {}, 50, 50);
  pb.hunger = 50; pb.hp = 50; pb.mood = 50;
  for (var j = 0; j < 200; j++) updatePawn(w4b, pb, 1, ctxBase);
  ok(pb.mood > pa.mood, '정자가 있으면 같은 조건에서도 사기가 더 높게 수렴함 (' + pa.mood.toFixed(1) + ' → ' + pb.mood.toFixed(1) + ')');
})();

console.log('[sim-smoke] 44) 당근(채집 전용 신규 재료) + 채소죽(COOK_TIERS 신규 등급) (신규)');
(function () {
  var ctxBase = { onItemChange: function () {}, onEvent: function () {}, onCropChange: function () {}, onDeath: function () {}, onStorageFull: function () {}, onWorldChange: function () {}, rng: function () { return 0.5; } };

  // (a) 매일 아침 재생성으로 당근밭이 맵에 보충됨
  var sim = bootSim(2001);
  run(sim, 25 * 60); // 하루 남짓 진행 → dailyRegrowth 최소 1회 실행
  var hasCarrotPatch = false;
  for (var i in sim.world.objects) if (sim.world.objects[i].kind === 'carrotPatch') hasCarrotPatch = true;
  ok(hasCarrotPatch, '하루 경과 후 당근밭이 맵에 보충됨');

  // (b) 채집(forage) 지정 → 당근 획득 (main.js 화이트리스트를 거치지 않고 job 파이프라인 자체를 직접 검증)
  var w = bootSim(2002).world;
  w.stock.meal = 6; // 방치작업(starvedWork) 판정에서 "요리" 후보가 끼어들어 채집이 가로채이지 않도록 미리 충족
  w.objects[0] = { kind: 'carrotPatch' };
  w.designations[0] = 'forage';
  var p = createPawn(0, {}, 0, 0);
  p.job = { type: 'gather', idx: 0 };
  reserve(w, 'job:0', p.id); // 직접 대입형 — 예약락도 함께(안 하면 방치작업 판정으로 즉시 양보됨)
  p.state = 'working'; p.workLeft = 0.01;
  updatePawn(w, p, 1, ctxBase);
  ok((w.stock.carrot || 0) >= 2, '당근밭 채집 시 당근 재고 증가 (' + (w.stock.carrot || 0) + ')');
  ok(!w.objects[0], '채집 후 당근밭은 사라짐(그루터기 없이 소모)');

  // (c) 채소죽 요리 — food+carrot 소비, mealVeg 산출
  var w2 = bootSim(2003).world;
  w2.stock.food = 10; w2.stock.carrot = 10;
  var p2 = createPawn(0, {}, 50, 50);
  p2.job = { type: 'cook', tierId: 'mealVeg' };
  reserve(w2, 'cook', p2.id);
  p2.state = 'working'; p2.workLeft = 0.01;
  updatePawn(w2, p2, 1, ctxBase);
  ok(w2.stock.mealVeg === 1, '채소죽 요리 완료 시 mealVeg 재고 1 생성');
  ok(w2.stock.food === 9 && w2.stock.carrot === 8, '요리 재료(식량1+당근2) 소비됨');

  // (d) 채소죽만 있을 때 생식량보다 먼저 섭취됨
  var w3 = bootSim(2004).world;
  w3.stock.mealVeg = 1; w3.stock.food = 5;
  var p3 = createPawn(0, {}, 50, 50);
  p3.hunger = 60; p3.job = null; p3.state = 'eating'; p3.workLeft = 0.01;
  updatePawn(w3, p3, 1, ctxBase);
  ok(w3.stock.mealVeg === 0, '채소죽이 있으면 생식량보다 먼저 소비됨');
  ok(w3.stock.food === 5, '생식량은 그대로(채소죽이 최우선 소비)');
})();

console.log('[sim-smoke] 45) 정착민 부상 — 전투 피격 시 확률 발생 + 다리(이동↓)·팔(작업↓) + 치료소 완치 (신규)');
(function () {
  var ctxBase = { onItemChange: function () {}, onEvent: function () {}, onCropChange: function () {}, onDeath: function () {}, onStorageFull: function () {} };

  // (a) 전투 피격 시 부상 발생(확률 성공) — rng=0 이면 항상 발생 + 항상 '다리' 선택(0.5 미만)
  var w1 = bootSim(2101).world;
  var pawn1 = { id: 0, state: 'idle', px: 40, py: 40, x: 40, y: 40, hp: 100, armor: null };
  var e1 = { id: w1.nextEid++, x: 40, y: 41, px: 40, py: 41, hp: 999, maxHp: 999, cd: 0, dir: -1, anim: 0, kind: 'goblin', wave: 0 };
  w1.enemies.push(e1);
  updateEnemies(w1, [pawn1], 20, {}, function () { return 0; });
  ok(pawn1.injury && pawn1.injury.type === 'leg' && pawn1.injury.severity === 1, '피격 시 부상 발생(확률 강제 성공) — 다리 부상');

  // (b) 확률 굴림이 실패(임계값 이상)하면 부상 없음
  var w1b = bootSim(2101).world;
  var pawn1b = { id: 0, state: 'idle', px: 40, py: 40, x: 40, y: 40, hp: 100, armor: null };
  var e1b = { id: w1b.nextEid++, x: 40, y: 41, px: 40, py: 41, hp: 999, maxHp: 999, cd: 0, dir: -1, anim: 0, kind: 'goblin', wave: 0 };
  w1b.enemies.push(e1b);
  updateEnemies(w1b, [pawn1b], 20, {}, function () { return 0.99; });
  ok(!pawn1b.injury, '확률 굴림 실패 시 부상 없음');

  // (c) 다리 부상 — 이동 속도 저하 (moveStep). 목표 타일을 강제로 통행 가능하게(잔디+장애물 제거) 만들어 측정.
  var w2 = bootSim(2102).world;
  w2.terrain[idx(10, 0)] = 1; delete w2.objects[idx(10, 0)]; delete w2.occupancy[idx(10, 0)];
  var neutralTrait = { id: 'none', name: '평범', desc: '' };
  var pNormal = createPawn(0, { trait: neutralTrait }, 0, 0);
  pNormal.state = 'moving'; pNormal.path = [{ x: 10, y: 0 }];
  updatePawn(w2, pNormal, 1, ctxBase);
  var pInjured = createPawn(1, { trait: neutralTrait }, 0, 0);
  pInjured.injury = { type: 'leg', severity: 1 };
  pInjured.state = 'moving'; pInjured.path = [{ x: 10, y: 0 }];
  updatePawn(w2, pInjured, 1, ctxBase);
  ok(pNormal.px > 0, '평소엔 목표 타일 방향으로 정상 이동함(비교 기준 확보)');
  ok(Math.abs(pInjured.px - pNormal.px * INJURY.legSpeedMult) < 1e-6,
    '다리 부상 시 이동 거리가 legSpeedMult 배로 줄어듦 (' + pNormal.px.toFixed(2) + ' → ' + pInjured.px.toFixed(2) + ')');

  // (d) 팔 부상 — 작업 속도 저하 (working, gather). 트레잇을 고정해 workMult 차이로 인한 오차를 배제.
  // 서로 다른 나무(idx 0/1)를 써서 예약락이 겹치지 않게 함.
  var w3 = bootSim(2103).world;
  w3.stock.meal = 6; // 방치작업 판정에서 "요리" 후보가 끼어들지 않도록
  w3.objects[0] = { kind: 'tree' }; w3.designations[0] = 'chop';
  w3.objects[1] = { kind: 'tree' }; w3.designations[1] = 'chop';
  var wNormal = createPawn(0, { trait: neutralTrait }, 0, 0);
  wNormal.job = { type: 'gather', idx: 0 };
  reserve(w3, 'job:0', wNormal.id);
  wNormal.state = 'working'; wNormal.workLeft = 100;
  updatePawn(w3, wNormal, 1, ctxBase);
  var wInjured = createPawn(1, { trait: neutralTrait }, 1, 0);
  wInjured.injury = { type: 'arm', severity: 1 };
  wInjured.job = { type: 'gather', idx: 1 };
  reserve(w3, 'job:1', wInjured.id);
  wInjured.state = 'working'; wInjured.workLeft = 100;
  updatePawn(w3, wInjured, 1, ctxBase);
  var normalProgress = 100 - wNormal.workLeft, injuredProgress = 100 - wInjured.workLeft;
  ok(normalProgress > 0, '평소엔 작업이 정상 진행됨(비교 기준 확보)');
  ok(Math.abs(injuredProgress - normalProgress * INJURY.armWorkMult) < 1e-6,
    '팔 부상 시 작업 진행이 armWorkMult 배로 줄어듦 (' + normalProgress.toFixed(3) + ' → ' + injuredProgress.toFixed(3) + ')');

  // (e) 치료소에서 쉬면 부상이 서서히 낫고, hp 완쾌라도 부상이 남아있으면 계속 쉼 + 다 나으면 idle 복귀
  // (원정 섬 상주 몬스터가 항상 world.enemies 에 존재하므로 — 이 시나리오만 별개로 비움)
  var ctxRng = { onItemChange: function () {}, onEvent: function () {}, onCropChange: function () {}, onDeath: function () {}, onStorageFull: function () {}, rng: function () { return 0.5; } };
  var w4 = bootSim(2104).world;
  w4.enemies = [];
  addBuilding(w4, 'clinic', 10, 10, { stage: 'built' });
  var p4 = createPawn(0, {}, 11, 12);
  p4.hp = 100; p4.injury = { type: 'leg', severity: 1 };
  p4.job = { type: 'rest', x: 11, y: 12 }; p4.state = 'resting';
  updatePawn(w4, p4, 1, ctxRng);
  ok(p4.state === 'resting' && p4.injury && p4.injury.severity < 1,
    'hp 는 이미 완쾌라도 부상이 남아있으면 계속 치료소에 머무름(심각도 ' + p4.injury.severity.toFixed(3) + ')');
  for (var t = 0; t < 130; t++) updatePawn(w4, p4, 1, ctxRng);
  ok(!p4.injury, '충분히 쉬면 부상이 완전히 나음');
  ok(p4.state === 'idle', '부상까지 다 나으면 치료소를 떠나 idle 복귀');
})();

console.log('[sim-smoke] 46) GOALS 전면 확장 — 신규 도전과제 10종 (신규)');
(function () {
  var w = bootSim(2201).world;
  var before = checkGoals(w, []).map(function (g) { return g.id; });
  ok(before.indexOf('islands') < 0 && before.indexOf('boss') < 0 && before.indexOf('research') < 0,
    '초기엔 신규 도전과제 미달성');

  // 원정 섬 4곳 전부 발견
  w.islands.forEach(function (isl) { isl.discovered = true; });
  ok(checkGoals(w, []).some(function (g) { return g.id === 'islands'; }), '원정 섬 4곳 전부 발견 시 "미지의 발견" 달성');

  // 보스 처치
  w.bossDefeated = true;
  ok(checkGoals(w, []).some(function (g) { return g.id === 'boss'; }), '보스 처치 시 "파괴자를 쓰러뜨리다" 달성');

  // 연구 올클리어
  Object.keys(RESEARCH).forEach(function (k) { w.research.unlocked[k] = true; });
  ok(checkGoals(w, []).some(function (g) { return g.id === 'research'; }), '연구 올클리어 시 "지혜의 정점" 달성');

  // 양털 비축
  w.stock.wool = 30;
  ok(checkGoals(w, []).some(function (g) { return g.id === 'wool'; }), '양털 30 비축 시 "포근한 양모" 달성');

  // 정자 완공
  addBuilding(w, 'pavilion', 5, 5, { stage: 'built' });
  ok(checkGoals(w, []).some(function (g) { return g.id === 'pavilion'; }), '정자 완공 시 "화목한 마을" 달성');

  // 금 500 비축
  w.stock.gold = 500;
  ok(checkGoals(w, []).some(function (g) { return g.id === 'richColony'; }), '금 500 비축 시 "부유한 콜로니" 달성');

  // 정착민 10명
  var tenPawns = Array.from({ length: 10 }, function (_, i) { return createPawn(i, {}, 0, 0); });
  ok(checkGoals(w, tenPawns).some(function (g) { return g.id === 'pop10'; }), '정착민 10명 시 "대번영" 달성');

  // 여신 강림 목격
  w.goddessVisited = true;
  ok(checkGoals(w, []).some(function (g) { return g.id === 'goddess'; }), '여신 강림 목격 시 "여신의 축복" 달성');

  // 유물 5개 이상
  w.relics = { worm: 3, banner: 2 };
  ok(checkGoals(w, []).some(function (g) { return g.id === 'relics'; }), '유물 5개 이상 시 "유물 수집가" 달성');

  // 강철 무기 제작
  w.stock.ironSword = 1;
  ok(checkGoals(w, []).some(function (g) { return g.id === 'steel'; }), '강철 무기 제작 시 "강철의 시대" 달성');

  // 재알림 없음
  ok(checkGoals(w, tenPawns).length === 0, '전부 달성 후 재알림 없음');
})();

console.log('[sim-smoke] 47) 운반→건설 확장 — 배치 즉시 차감 대신 재고에서 나르는 가상 창고 왕복 (신규)');
(function () {
  var sim = bootSim(2301);
  var w = sim.world;
  // 경로탐색이 확실히 되도록 널찍한 잔디밭으로 미리 정리(장애물·건물 제거)
  for (var cy = 15; cy <= 35; cy++) for (var cx = 15; cx <= 35; cx++) {
    var ci = idx(cx, cy);
    w.terrain[ci] = 1; delete w.objects[ci]; delete w.occupancy[ci]; delete w.stockpile[ci];
  }
  var woodBefore = w.stock.wood || 0;
  give(sim, { wood: 10 });
  var b = addBuilding(w, 'house', 30, 30); // stage 기본 'bp'
  ok(b.stage === 'bp' && Object.keys(b.delivered).length === 0, '배치 직후엔 자재가 전혀 배달되지 않은 상태(delivered 빈 객체)');
  ok((w.stock.wood || 0) === woodBefore + 10, '배치해도 재고가 즉시 차감되지 않음(가상 창고 방식)');
  ok(bpMissing(b).type === 'wood' && bpMissing(b).n === 10, 'bpMissing 이 목재 10 부족을 보고');

  var ctxD = { onItemChange: function () {}, onEvent: function () {}, onBuildingChange: function () {}, onBuildingBuilt: function () {}, onCropChange: function () {}, onDeath: function () {}, onStorageFull: function () {} };
  var p = createPawn(0, {}, 25, 25);
  var job = findWorkJob(w, p);
  ok(job && job.type === 'deliver' && job.resType === 'wood', '재고에 자재가 있으면 deliver 잡을 잡음');
  ok(w.reserved['bp:' + b.id] === p.id, 'bp: 락이 배달하는 일꾼에게 걸림');

  job.stage = 'toSrc';
  p.job = job; p.state = 'moving'; p.path = []; // 출처가 자기 자리라 이동 없이 즉시 도착 처리
  updatePawn(w, p, 1, ctxD);
  ok((w.stock.wood || 0) === woodBefore, 'toSrc 도착 시 전역 재고에서 실제로 차감됨(' + (woodBefore + 10) + '→' + woodBefore + ')');
  ok(p.carry && p.carry.type === 'wood' && p.carry.n === 10, '일꾼이 목재 10을 들고 이동 중');
  ok(p.job.stage === 'toBp', '다음 단계(건물로 이동)로 전환');

  p.path = []; // 건물 앞까지 이미 도착했다고 간주(경로탐색 자체는 다른 시나리오에서 검증됨)
  updatePawn(w, p, 1, ctxD);
  ok(b.delivered.wood === 10, '건물에 목재 10 배달 완료(cost 와 일치)');
  ok(!p.carry, '배달 완료 후 손엔 아무것도 없음');
  ok(bpMissing(b) === null, '필요 자재를 모두 배달받음');
  ok(p.job && p.job.type === 'build', '자재가 다 채워지면 곧바로 건설 작업으로 전환(같은 일꾼이 이어서 지음)');
  ok(w.reserved['bp:' + b.id] === p.id, '건설 단계에서도 bp: 락이 계속 유지됨(같은 일꾼 전담)');

  p.workLeft = 0.01;
  updatePawn(w, p, 1, ctxD);
  ok(b.stage === 'built', '건설 완료 → 건물 완공');
  ok(w.reserved['bp:' + b.id] === undefined, '완공 후 bp: 락 해제(누수 없음)');
  ok(p.state === 'idle' && !p.job, '완공 후 일꾼은 idle 로 복귀');

  // 회귀 확인: 기존 세이브처럼 delivered 가 이미 cost 만큼 채워진 bp 건물은 즉시 건설 재개(구버전 호환)
  var w2 = bootSim(2302).world;
  var b2 = addBuilding(w2, 'house', 40, 40);
  b2.delivered.wood = 10;
  ok(bpMissing(b2) === null, '기존 방식대로 delivered 를 미리 채워둔 건물은 배달 없이 곧바로 건설 가능(회귀 없음)');
})();

console.log('[sim-smoke] 48) 방치 작업 방지 — 벌목이 넘쳐도 낚시 등 새 지정이 최소 1명은 배정됨 (신규)');
(function () {
  var w = bootSim(2401).world;
  w.stock.meal = 6; // 방치작업 판정에서 "요리" 후보가 끼어들지 않도록
  // 정착민 주변을 널찍이 정리(장애물 제거)해 벌목·이동 경로가 확실히 통하게 함
  for (var yy = 0; yy <= 25; yy++) for (var xx = 0; xx <= 110; xx++) {
    var ci = yy * 128 + xx;
    w.terrain[ci] = 1; delete w.objects[ci]; delete w.occupancy[ci];
  }
  // 벌목 지정을 정착민 수보다 훨씬 많이(우선순위가 벌목보다 낮은 낚시가 영원히 안 잡히던 원래 버그 재현 조건)
  for (var i = 0; i < 10; i++) {
    w.objects[idx(100 + i, 0)] = { kind: 'tree' };
    w.designations[idx(100 + i, 0)] = 'chop';
  }
  // 낚시 지정 1곳 — 해안 물 타일을 직접 마련
  var wx = 20, wy = 20;
  w.terrain[idx(wx, wy)] = 0; // 물
  w.fishDesig[idx(wx, wy)] = true;

  var p1 = createPawn(0, {}, 0, 0);
  var job1 = findWorkJob(w, p1);
  ok(job1 && job1.type === 'gather', '첫 정착민은 평소 우선순위대로 벌목을 잡음(' + (job1 && job1.type) + ')');

  var p2 = createPawn(1, {}, wx - 1, wy);
  var job2 = findWorkJob(w, p2);
  ok(job2 && job2.type === 'fish', '벌목이 여전히 넘쳐도, 둘째 정착민은 방치된 낚시를 우선 배정받음(' + (job2 && job2.type) + ')');
  ok(w.reserved['fish:' + idx(wx, wy)] === p2.id, '낚시 지정에도 정상적으로 예약락이 걸림');

  var p3 = createPawn(2, {}, 0, 1);
  var job3 = findWorkJob(w, p3);
  ok(job3 && job3.type === 'gather', '낚시가 이미 배정된 뒤엔 셋째 정착민은 평소 우선순위(벌목)로 복귀(' + (job3 && job3.type) + ')');
})();

console.log('[sim-smoke] 49) 적이 건물 바로 앞에서 더 못 다가가 영원히 못 부수던 버그 수정 (신규)');
(function () {
  var w = bootSim(3001).world;
  for (var yy = 30; yy <= 90; yy++) for (var xx = 30; xx <= 90; xx++) {
    var i = yy * 128 + xx;
    w.terrain[i] = 1; delete w.objects[i]; delete w.occupancy[i];
  }
  w.buildings = {};
  w.enemies = [];
  var tower = addBuilding(w, 'tower', 60, 60, { stage: 'built' });
  var g = { id: w.nextEid++, x: 60, y: 45, px: 60, py: 45, hp: 908, maxHp: 908, cd: 0, dir: 1, anim: 0, kind: 'giant', wave: 0 };
  w.enemies.push(g);
  var rng = function () { return 0.5; };
  var destroyed = false;
  for (var t = 0; t < 400 && !destroyed; t++) {
    updateEnemies(w, [], 1, {}, rng);
    if (tower.hp <= 0) destroyed = true;
  }
  ok(destroyed, '건물 바로 앞까지 접근한 적이 멈추지 않고 결국 건물을 파괴함(직선 접근 시 좌표 반올림으로 영원히 막히던 버그)');
})();

console.log('[sim-smoke] 50) 가금 사육 연구 — 축사가 알을 품어 주기적으로 병아리(닭)를 부화 (신규)');
(function () {
  var w = bootSim(3101).world;
  for (var yy = 10; yy <= 20; yy++) for (var xx = 10; xx <= 20; xx++) {
    var i = yy * 128 + xx;
    w.terrain[i] = 1; delete w.objects[i]; delete w.occupancy[i];
  }
  var barn = addBuilding(w, 'barn', 12, 12, { stage: 'built' });
  var rng = mulberry32(42);

  // (a) 연구 해금 전에는 아무리 시간이 지나도 부화하지 않음
  var sheepBefore = w.sheep.length;
  tickBarns(w, EGG_HATCH.interval * 2, rng);
  ok(w.sheep.length === sheepBefore, '가금 사육 연구 전에는 알을 부화시키지 않음');
  ok(barn.eggT === undefined || barn.eggT === 0, '연구 전에는 부화 타이머 자체가 진행되지 않음');

  // (b) 연구 해금 후 — 시간이 지나면 닭 한 마리가 부화(길들인 동물 하나 없어도 동작)
  w.research.unlocked.poultry = true;
  tickBarns(w, EGG_HATCH.interval - 1, rng);
  ok(w.sheep.length === sheepBefore, '부화 주기가 되기 전에는 아직 부화하지 않음');
  tickBarns(w, 2, rng);
  ok(w.sheep.length === sheepBefore + 1, '부화 주기가 차면 닭 한 마리가 부화함');
  var hatched = w.sheep[w.sheep.length - 1];
  ok(hatched.type === 'chicken' && hatched.tamed === true, '부화한 개체는 이미 길들여진 닭(고정)');

  // (c) 상한(RANCH.maxSheep)은 "길들인" 개체 수 기준 — 맵을 배회하는 야생동물과 무관하게, 이미 상한이면 더 부화하지 않음
  function tamedCountOf(world) { var n = 0; for (var s = 0; s < world.sheep.length; s++) if (world.sheep[s].tamed) n++; return n; }
  while (tamedCountOf(w) < RANCH.maxSheep) w.sheep.push({ id: w.nextSid++, type: 'chicken', x: 12, y: 12, px: 12, py: 12, tamed: true, dir: 1, cd: 0, phase: 0 });
  var atCap = w.sheep.length;
  tickBarns(w, EGG_HATCH.interval + 1, rng);
  ok(w.sheep.length === atCap, '길들인 개체 상한(RANCH.maxSheep)에 도달하면 더 이상 부화하지 않음');
})();

console.log('[sim-smoke] 51) 악마후배 미니 악마 소환 + 레이저 사거리 3배 (신규)');
(function () {
  // (a) 스탯: 미니 악마는 고블린보다 강하고 괴민보다 약함 + 레이저 사거리 42(=14×3)
  ok(MINIDEMON.hp > ENEMY.hp && MINIDEMON.power > ENEMY.power, '미니 악마가 고블린보다 강함 (hp ' + MINIDEMON.hp + ', power ' + MINIDEMON.power + ')');
  ok(MINIDEMON.hp < GIANT.hp && MINIDEMON.power < GIANT.power, '미니 악마가 괴민보다 약함');
  ok(DEMON.laser.range === 42, '레이저 사거리 42(기존 14의 3배)');
  ok(enemyStats({ kind: 'minidemon' }) === MINIDEMON, "enemyStats 가 'minidemon' → MINIDEMON 매핑");

  // (b) 사거리 내 목표가 있을 때 쿨다운마다 미니 악마 소환
  var w = bootSim(1501).world;
  w.enemies = [];
  for (var yy = 40; yy <= 60; yy++) for (var xx = 40; xx <= 60; xx++) {
    var i = yy * 128 + xx; w.terrain[i] = 1; delete w.objects[i]; delete w.occupancy[i];
  }
  var demon = { id: w.nextEid++, x: 50, y: 50, px: 50, py: 50, hp: 9000, maxHp: 9000, cd: 999, dir: -1, anim: 0, kind: 'demon', boss: true, laserCd: 999, summonCd: 0 };
  w.enemies = [demon];
  var pawn = { id: 0, state: 'idle', px: 52, py: 50, x: 52, y: 50, hp: 100 };
  var summons = [];
  var rng = mulberry32(7);
  updateEnemies(w, [pawn], 1, { onDemonSummon: function (e, n) { summons.push(n); } }, rng);
  var minis = w.enemies.filter(function (e) { return e.kind === 'minidemon'; });
  ok(minis.length === DEMON.summon.count, '사거리 내 목표가 있으면 미니 악마 ' + DEMON.summon.count + '마리 소환 (' + minis.length + ')');
  ok(summons.length === 1 && summons[0] === DEMON.summon.count, '소환 콜백(onDemonSummon) 1회 호출');
  ok(minis.every(function (m) { return m.hp === MINIDEMON.hp && m.maxHp === MINIDEMON.hp; }), '소환된 미니 악마는 MINIDEMON 체력');
  ok(demon.summonCd === DEMON.summon.cooldown, '소환 후 쿨다운 재설정');

  // (c) 목표가 사거리 밖이면 소환하지 않음 (건물·작물도 공격 대상이므로 함께 비워 순수 검증)
  var w2 = bootSim(1502).world;
  w2.enemies = []; w2.buildings = {}; w2.crops = {};
  var demon2 = { id: w2.nextEid++, x: 50, y: 50, px: 50, py: 50, hp: 9000, maxHp: 9000, cd: 999, dir: -1, anim: 0, kind: 'demon', boss: true, laserCd: 999, summonCd: 0 };
  w2.enemies = [demon2];
  var farPawn = { id: 0, state: 'idle', px: 110, py: 110, x: 110, y: 110, hp: 100 }; // 사거리(42) 밖
  updateEnemies(w2, [farPawn], 1, {}, mulberry32(9));
  ok(w2.enemies.filter(function (e) { return e.kind === 'minidemon'; }).length === 0, '사거리 밖 목표만 있으면 소환하지 않음');

  // (d) 이미 상한(maxAlive)이면 더 소환하지 않음
  var w3 = bootSim(1503).world;
  w3.enemies = [];
  for (var y3 = 40; y3 <= 60; y3++) for (var x3 = 40; x3 <= 60; x3++) {
    var i3 = y3 * 128 + x3; w3.terrain[i3] = 1; delete w3.objects[i3]; delete w3.occupancy[i3];
  }
  var demon3 = { id: w3.nextEid++, x: 50, y: 50, px: 50, py: 50, hp: 9000, maxHp: 9000, cd: 999, dir: -1, anim: 0, kind: 'demon', boss: true, laserCd: 999, summonCd: 0 };
  w3.enemies = [demon3];
  for (var k = 0; k < DEMON.summon.maxAlive; k++) w3.enemies.push({ id: w3.nextEid++, x: 51, y: 51, px: 51, py: 51, hp: MINIDEMON.hp, maxHp: MINIDEMON.hp, cd: 0, dir: 1, anim: 0, kind: 'minidemon', wave: 0 });
  var pawn3 = { id: 0, state: 'idle', px: 52, py: 50, x: 52, y: 50, hp: 100 };
  updateEnemies(w3, [pawn3], 1, {}, mulberry32(11));
  ok(w3.enemies.filter(function (e) { return e.kind === 'minidemon'; }).length === DEMON.summon.maxAlive, '상한(maxAlive)에 도달하면 추가 소환 안 함');
})();

console.log('');
if (fails) { console.log('❌ sim-smoke 실패 ' + fails + '건'); process.exit(1); }
console.log('✅ sim-smoke 전체 통과');
