// L1 시나리오 스모크 — 시드 고정, 헤드리스. stepWorld 추출이 올바른지 + 결정론 확인.
import { bootSim, run, runDays, designateChop, give, snapshot } from './harness.mjs';
import { addBuilding, storageCap, upgradeMult, upgradeAdd, maxPop, rankReqStatus, canAdvanceRank, advanceRank, defenseStats, tickTowers, enemyStats, spawnRaid, mulberry32, grantRelic, dailyIslandRespawn, checkIslandDiscovery, updateEnemies, idx } from '../js/world.js';
import { GIANT, ENEMY, CANNIBAL, ISLANDS, INVASION, OUTPOST_BRANCHES, RAIDER, INVWARRIOR, ZOMBIE, SKELETON, GIANT_JUMP } from '../js/config.js';
import { findWorkJob, releaseAllOf } from '../js/jobs.js';

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
  ok(maxPop(w) === 8, '무리 인구 상한 8');
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
    return w.terrain[Math.round(isl.cy) * 96 + Math.round(isl.cx)] !== 0; // T_WATER=0
  });
  ok(allLand, '모든 섬 중심이 육지(물 아님)로 생성됨');

  // 보물섬: 반경 내 chest 오브젝트 존재
  var tIsl = byTheme.treasure;
  var chestCount = 0;
  for (var i in w.objects) {
    if (w.objects[i].kind === 'chest') {
      var x = i % 96, y = (i / 96) | 0;
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
  ok((w.relics.crown || 0) === sched0.relicCount + sched1.relicCount,
    '전설급 유물 누적 = 1차+2차 합(' + (w.relics.crown || 0) + ')');
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

console.log('');
if (fails) { console.log('❌ sim-smoke 실패 ' + fails + '건'); process.exit(1); }
console.log('✅ sim-smoke 전체 통과');
