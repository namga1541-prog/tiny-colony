// 시뮬레이션 오케스트레이션 (순수 로직 — PIXI·DOM 없음)
//
// 이 모듈은 게임 "진행"의 단일 진실원(SSOT)이다. main.js 티커와 헤드리스 테스트 하네스가
// 똑같이 이 stepWorld() 를 호출한다 → 테스트가 실제 코드를 검증하며, 로직 중복/드리프트가 없다.
//
// 모든 렌더·UI·오디오 효과는 ctx 콜백으로만 방출한다(상태 변경과 효과 분리).
// main.js 는 ctx 에 실제 R.*/UI.*/Audio2.* 를, 하네스는 기록용 stub 을 연결한다.
import { DAY_MIN, RAID, GIANT_RAID, INVASION, MAP_W, MAP_H } from './config.js';
import {
  idx, addItem, mulberry32,
  updateSheep, tickTowers, updateEnemies, tickResearch, tickCrops, tickRanches,
  dailyRegrowth, dailyMineRegen, spawnRaid, seasonDef, seasonIndex, maxPop, grantRelic,
  dailyIslandRespawn, checkIslandDiscovery,
  grantLegendaryRelic, warlordsAliveInWave,
} from './world.js';
import { updatePawn } from './pawns.js';
import { checkGoals } from './goals.js';

// 대침공 한 웨이브 스폰 — 여러 종족 혼합(고블린·약탈자·침략전사 + 정복자), 옵션으로 빠른 괴민.
function spawnInvasionWave(world, rng, sched, waveNo, withGiants) {
  spawnRaid(world, sched.goblinsPerWave || 0, rng, 'goblin', waveNo);
  spawnRaid(world, sched.raidersPerWave || 0, rng, 'raider', waveNo);
  spawnRaid(world, sched.warriorsPerWave || 0, rng, 'warrior', waveNo);
  spawnRaid(world, sched.warlordsPerWave || 0, rng, 'warlord', waveNo);
  if (withGiants && sched.giants) {
    var g0 = world.enemies.length;
    spawnRaid(world, sched.giants, rng, 'giant', waveNo);
    for (var gi = g0; gi < world.enemies.length; gi++) world.enemies[gi].fast = true;
  }
}

// 게임 세계를 dtMin 게임분 만큼 전진시킨다.
//   world, pawns : 가변 상태 (직접 변형됨)
//   dtMin        : 이번 호출로 흘릴 게임분 (내부에서 dt≤1 로 잘게 나눠 처리)
//   rng          : 주입 난수(ambient) — 양·목장·습격·영입 결정에 사용 (결정론)
//   ctx          : 정착민/월드 콜백 + 효과 콜백 (아래 계약 참조)
//   enemyCbs     : 적/방어건물 전투 콜백 (onHit·onPawnDeath·onEnemyDown·onTowerFire)
//
// ctx 계약: (상태) rng, onWorldChange, onItemChange, onCropChange, onBuildingChange,
//   onBuildingBuilt, onEvent, onStorageFull, onDeath, onStarving, onSheepChange
//   (효과) onTileChange, onToast(msg,warn), onSfx(name), onRecruit(), onSeasonTint(tint,alpha)
export function stepWorld(world, pawns, dtMin, rng, ctx, enemyCbs) {
  var prevDay = world.day;
  var gameMin = dtMin;
  while (gameMin > 0) {
    var dt = Math.min(1, gameMin);
    gameMin -= dt;
    world.timeMin += dt;
    world.day = 1 + Math.floor(world.timeMin / DAY_MIN);
    var aliveNow = 0;
    for (var n = 0; n < pawns.length; n++) {
      updatePawn(world, pawns[n], dt, ctx);
      if (pawns[n].state !== 'dead') aliveNow++;
    }
    updateSheep(world, dt, rng);
    tickTowers(world, dt, enemyCbs);
    updateEnemies(world, pawns, dt, enemyCbs);
    tickResearch(world, aliveNow, dt);
    var ready = tickCrops(world, dt);
    for (var ci = 0; ci < ready.length; ci++) ctx.onCropChange(ready[ci]);
    var rev = tickRanches(world, dt, rng);
    for (var re = 0; re < rev.length; re++) { if (rev[re].idx !== undefined) ctx.onItemChange(rev[re].idx); }
  }

  // 원정 섬 발견: 정착민이 섬 반경 안에 들어오면 즉시 안내
  var newlyFound = checkIslandDiscovery(world, pawns);
  for (var nf = 0; nf < newlyFound.length; nf++) {
    var isl2 = newlyFound[nf];
    ctx.onToast(isl2.icon + ' 새로운 섬을 발견했습니다: 「' + isl2.name + '」!');
    ctx.onEvent(isl2.icon + ' 섬 발견 — ' + isl2.name);
    ctx.onSfx('success');
  }

  // 습격 격퇴 판정: 습격 중이었는데 적이 전멸하면 (대침공 진행 중엔 아래 전용 블록이 처리)
  if (world.raidActive && world.enemies.length === 0 && !(world.invasion && world.invasion.phase === 'active')) {
    world.raidActive = false;
    world.raidCleared = true;
    var mult = Math.max(1, 1 + Math.floor((world.day - RAID.firstDay) * 0.3));
    var lootAt = idx(MAP_W / 2 | 0, MAP_H / 2 | 0);
    addItem(world, lootAt, 'gold', RAID.loot.gold * mult);
    addItem(world, lootAt, 'iron', RAID.loot.iron * mult);
    ctx.onItemChange(lootAt);
    ctx.onToast('🎉 고블린 습격을 격퇴했습니다! 전리품 획득 (금 ' + (RAID.loot.gold * mult) + ' · 철 ' + (RAID.loot.iron * mult) + ')');
    ctx.onEvent('🎉 습격 격퇴 +전리품');
    ctx.onSfx('success');
    // 유물(아이작풍): 괴민을 잡은 밤이면 확정, 일반 습격은 확률 획득
    if (world.raidHadGiant || rng() < 0.5) {
      var got = grantRelic(world, rng);
      ctx.onToast('🎁 유물 획득: ' + got.def.icon + ' ' + got.def.name + ' — ' + got.def.desc + (got.count > 1 ? ' (x' + got.count + ')' : ''));
      ctx.onEvent('🎁 유물 ' + got.def.icon + ' ' + got.def.name);
      ctx.onSfx('coin');
    }
    world.raidHadGiant = false;
  }

  // 일 넘김 처리
  if (world.day !== prevDay) {
    ctx.onToast('🌅 ' + world.day + '일차 아침이 밝았습니다');
    ctx.onEvent('🌅 ' + world.day + '일차');
    var regrown = dailyRegrowth(world, mulberry32(world.seed + world.day));
    for (var g = 0; g < regrown.length; g++) ctx.onTileChange(regrown[g]);
    var minesRegen = dailyMineRegen(world);
    for (var mi = 0; mi < minesRegen.length; mi++) {
      if (world.buildings[minesRegen[mi]]) ctx.onBuildingChange(world.buildings[minesRegen[mi]]);
    }
    dailyIslandRespawn(world, mulberry32(world.seed + world.day + 0x1a2b));
    // 영입: 3일마다, 인구가 상한 미만이면 떠돌이 합류 (습격 없는 낮에만)
    var aliveCnt = 0;
    for (var a = 0; a < pawns.length; a++) if (pawns[a].state !== 'dead') aliveCnt++;
    if (world.day % 3 === 0 && aliveCnt < maxPop(world) && !world.raidActive && rng() < 0.7) {
      ctx.onRecruit();
    }
    // 계절 갱신
    var sd = seasonDef(world);
    ctx.onSeasonTint(sd.tint, sd.tintA || 0);
    var si = seasonIndex(world);
    if (world.prevSeason !== si) {
      world.prevSeason = si;
      ctx.onEvent('🍃 계절: ' + sd.name);
      if (sd.noFarm) ctx.onToast('❄️ 겨울입니다 — 작물이 자라지 않습니다', true);
    }
  }

  // 나라의 시련(대침공): 달력상 고정 날짜(INVASION.schedule)에 발동 — 나라 단계 도달과 무관하게 무조건 옴.
  if (!world.invasion && (world.invasionsCompleted || 0) < INVASION.schedule.length) {
    var sched0 = INVASION.schedule[world.invasionsCompleted || 0];
    world.invasion = { phase: 'countdown', schedIndex: world.invasionsCompleted || 0, triggerDay: sched0.day, wave: 0 };
    ctx.onToast('⚔️ ' + sched0.day + '일차 밤, 대침공이 예고되었습니다 — 방어를 준비하세요!', true);
    ctx.onEvent('⚠️ 대침공 예고 — ' + sched0.day + '일차');
    ctx.onSfx('alert');
  }
  var invasionBusy = !!(world.invasion && (world.invasion.phase === 'active' || world.invasion.phase === 'gap'));

  // 습격 스케줄: 지정일 밤 spawnHour 에 상륙 (대침공 진행 중엔 겹치지 않도록 보류)
  var curHour = (world.timeMin % DAY_MIN) / 60;
  if (world.day >= world.nextRaidDay && curHour >= RAID.spawnHour && !world.raidToday && !invasionBusy) {
    world.raidToday = true;
    var cnt = RAID.baseCount + Math.floor((world.day - RAID.firstDay) * RAID.perDayExtra);
    var got = spawnRaid(world, cnt, rng);
    if (got > 0) {
      world.raidActive = true;
      world.nextRaidDay = world.day + RAID.intervalDays;
      ctx.onToast('⚔️ 고블린 습격! 고블린 ' + got + '마리가 상륙했습니다!', true);
      ctx.onEvent('⚔️ 고블린 습격 (' + got + '마리)');
      ctx.onSfx('alert');
    }
  }
  if (curHour < RAID.spawnHour) world.raidToday = false;

  // 무지성 거인 「괴민」: 5일밤(5·10·15…)마다 상륙 (대침공 진행 중엔 겹치지 않도록 보류)
  if (world.day % GIANT_RAID.everyDays === 0 && curHour >= GIANT_RAID.spawnHour && !world.giantToday && !invasionBusy) {
    world.giantToday = true;
    var gcnt = GIANT_RAID.baseCount + Math.floor((world.day - GIANT_RAID.everyDays) / 15);
    var gg = spawnRaid(world, gcnt, rng, 'giant');
    if (gg > 0) {
      world.raidActive = true;
      world.raidHadGiant = true; // 격퇴 시 유물 확정
      ctx.onToast('🧟 무지성 거인 「괴민」 출현! 느리지만 거대하고 강력합니다 — 힘을 합쳐 막으세요!', true);
      ctx.onEvent('🧟 거인 괴민 상륙' + (gg > 1 ? ' (' + gg + '체)' : ''));
      ctx.onSfx('alert');
    }
  }
  if (curHour < GIANT_RAID.spawnHour) world.giantToday = false;

  // 대침공 진행: countdown(예고) → active(웨이브 전투) → gap(소강) → won(승리) / 전멸위기 시 countdown 재시작
  // schedIndex 로 현재 몇 번째 침공(10일차/20일차)인지 추적 — 뒤로 갈수록 sched 값이 더 가혹해짐.
  if (world.invasion) {
    var inv = world.invasion;
    var sched = INVASION.schedule[inv.schedIndex];
    if (inv.phase === 'countdown' && world.day >= inv.triggerDay && curHour >= INVASION.spawnHour) {
      inv.phase = 'active';
      inv.wave = 1;
      spawnInvasionWave(world, rng, sched, 1, true);
      world.raidActive = true;
      ctx.onToast('🏴 대침공! 배를 타고 침략군(약탈자·전사)이 상륙합니다!' + (sched.giants ? ' 빠른 괴민 ' + sched.giants + '체 동반!' : '') + ' 정복자가 지휘합니다.', true);
      ctx.onEvent('🏴 대침공 웨이브 1/' + sched.waves + ' — 침략군 상륙' + (sched.giants ? ' (+괴민 ' + sched.giants + ')' : ''));
      ctx.onSfx('alert');
    } else if (inv.phase === 'active') {
      if (aliveNow <= 2) {
        // 전멸 위기: 이번 웨이브 침공군을 철수시키고 같은 침공을 재도전 카운트다운으로 되돌림 (게임오버·자원손실 없음)
        world.enemies = world.enemies.filter(function (e) { return e.wave !== inv.wave; });
        world.raidActive = false;
        world.invasion = { phase: 'countdown', schedIndex: inv.schedIndex, triggerDay: world.day + INVASION.retryGapDays, wave: 0 };
        ctx.onToast('🏳️ 콜로니가 위기에 빠지자 침공군이 일시 물러갔습니다. ' + INVASION.retryGapDays + '일 후 다시 옵니다', true);
        ctx.onEvent('🏳️ 대침공 철수(재정비)');
        ctx.onSfx('alert');
      } else {
        var waveLeft = world.enemies.filter(function (e) { return e.wave === inv.wave; }).length;
        var warlordsLeft = warlordsAliveInWave(world, inv.wave);
        // 정복자를 먼저 쓰러뜨리면 리더를 잃은 잔당도 함께 퇴각(웨이브 즉시 클리어)
        var cleared = waveLeft > 0 && warlordsLeft === 0;
        if (cleared || waveLeft === 0) {
          if (cleared) world.enemies = world.enemies.filter(function (e) { return e.wave !== inv.wave; });
          if (inv.wave >= sched.waves) {
            // 이번 침공 승리: 가벼운 토스트+효과음 연출, 전설급 유물 relicCount 개 확정 지급
            world.raidActive = false;
            world.invasionsCompleted = (world.invasionsCompleted || 0) + 1;
            ctx.onToast('🎉 콜로니의 승리! ' + sched.day + '일차 대침공을 완전히 격퇴했습니다!', false);
            ctx.onEvent('🎉 콜로니의 승리 — ' + sched.day + '일차 대침공 격퇴');
            ctx.onSfx('success');
            for (var ri = 0; ri < sched.relicCount; ri++) {
              var leg = grantLegendaryRelic(world, rng);
              ctx.onToast('👑 전설급 유물 획득: ' + leg.def.icon + ' ' + leg.def.name + ' — ' + leg.def.desc);
              ctx.onEvent('👑 전설 유물 ' + leg.def.icon + ' ' + leg.def.name);
              ctx.onSfx('coin');
            }
            if (world.invasionsCompleted >= INVASION.schedule.length) {
              // 예정된 침공을 전부 격퇴 — goals.js 판정용 플래그
              world.invasion = { phase: 'won', schedIndex: inv.schedIndex, wave: inv.wave };
              world.invasionWon = true;
            } else {
              var nextSched = INVASION.schedule[world.invasionsCompleted];
              world.invasion = { phase: 'countdown', schedIndex: world.invasionsCompleted, triggerDay: nextSched.day, wave: 0 };
              ctx.onToast('⚔️ 다음 대침공은 ' + nextSched.day + '일차입니다', true);
              ctx.onEvent('⚠️ 다음 대침공 예고 — ' + nextSched.day + '일차');
            }
          } else {
            world.invasion = { phase: 'gap', schedIndex: inv.schedIndex, wave: inv.wave + 1, gapUntilMin: world.timeMin + INVASION.waveGapMin };
            world.raidActive = false;
            ctx.onToast('⏸️ ' + inv.wave + '웨이브 격퇴! 곧 ' + (inv.wave + 1) + '웨이브가 몰려옵니다 — 정비하세요', true);
            ctx.onEvent('⏸️ 웨이브 ' + inv.wave + ' 격퇴 (소강)');
            ctx.onSfx('success');
          }
        }
      }
    } else if (inv.phase === 'gap' && world.timeMin >= inv.gapUntilMin) {
      var nextWave = inv.wave;
      spawnInvasionWave(world, rng, sched, nextWave, false);
      world.invasion = { phase: 'active', schedIndex: inv.schedIndex, wave: nextWave };
      world.raidActive = true;
      ctx.onToast('🏴 ' + nextWave + '웨이브 상륙!', true);
      ctx.onEvent('🏴 대침공 웨이브 ' + nextWave + '/' + sched.waves);
      ctx.onSfx('alert');
    }
  }

  // 목표 달성 체크
  var newGoals = checkGoals(world, pawns);
  for (var gi = 0; gi < newGoals.length; gi++) {
    ctx.onToast('🏆 목표 달성: ' + newGoals[gi].name);
    ctx.onEvent('🏆 ' + newGoals[gi].name);
    ctx.onSfx('success');
  }
}
