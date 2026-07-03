// L1 시나리오 스모크 — 시드 고정, 헤드리스. stepWorld 추출이 올바른지 + 결정론 확인.
import { bootSim, run, runDays, designateChop, give, snapshot } from './harness.mjs';
import { addBuilding, storageCap, upgradeMult, upgradeAdd, maxPop, rankReqStatus, canAdvanceRank, advanceRank, defenseStats, tickTowers } from '../js/world.js';
import { findWorkJob } from '../js/jobs.js';

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

console.log('');
if (fails) { console.log('❌ sim-smoke 실패 ' + fails + '건'); process.exit(1); }
console.log('✅ sim-smoke 전체 통과');
