// L2 브라우저 스모크 (통합) — 실제 index.html 부팅 → 렌더·UI·stepWorld 통합 + 콘솔에러 0.
// Playwright 는 설치하지 않고 MADI 의 node_modules 를 빌려 쓴다(createRequire).
// 사전조건: 정적 서버가 http://localhost:5800 에서 구동 중이어야 함 (npx serve -p 5800 .)
import { createRequire } from 'module';

var MADI = 'C:/Users/남재현/Desktop/madi-app/package.json';
var require = createRequire(MADI);
var chromium;
try {
  chromium = require('playwright').chromium;
} catch (e) {
  console.log('❌ Playwright 를 찾을 수 없습니다 (MADI node_modules 경로 확인): ' + e.message);
  process.exit(1);
}

var URL = 'http://localhost:5800/?seed=12345&t=' + Date.now();
var fails = 0;
function ok(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); fails++; } }

(async function () {
  var browser = await chromium.launch({ args: ['--use-gl=angle'] });
  var page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  var errors = [];
  page.on('pageerror', function (e) { errors.push(String(e).slice(0, 200)); });

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 8000 });
  } catch (e) {
    console.log('❌ 서버(localhost:5800) 접속 실패 — `npx serve -p 5800 .` 로 먼저 서버를 띄우세요.');
    await browser.close();
    process.exit(1);
  }

  await page.waitForTimeout(1600);
  await page.click('.cm-ok');
  await page.waitForTimeout(300);

  // 부팅 상태
  var boot = await page.evaluate(function () {
    return {
      hasCanvas: !!document.querySelector('#stage canvas'),
      pawns: window.game.pawns.length,
      seed: window.game.world.seed,
      t0: window.game.world.timeMin,
    };
  });
  ok(boot.hasCanvas, '캔버스 렌더링됨');
  ok(boot.pawns === 3, '정착민 3명');
  ok(boot.seed === 12345, '?seed=12345 반영 (재현 가능)');

  // stepWorld 통합: speed3 로 실제 게임 진행 → 시간 전진 + 벌목 파이프라인
  var run = await page.evaluate(async function () {
    var g = window.game, w = g.world;
    // 중심 근처 나무 벌목 지정
    var cx = 48, cy = 48, trees = [];
    for (var i in w.objects) {
      if (w.objects[i].kind === 'tree') {
        var x = i % 96, y = (i / 96) | 0;
        trees.push({ x: x, y: y, d: Math.abs(x - cx) + Math.abs(y - cy) });
      }
    }
    trees.sort(function (a, b) { return a.d - b.d; });
    for (var k = 0; k < 10 && k < trees.length; k++) g.applyTool('chop', trees[k], trees[k]);
    var woodBefore = w.stock.wood || 0;
    var t0 = w.timeMin;
    g.setSpeed(3);
    await new Promise(function (r) { setTimeout(r, 5000); });
    return { timeAdvanced: w.timeMin - t0, woodBefore: woodBefore, woodAfter: w.stock.wood || 0, day: w.day };
  });
  ok(run.timeAdvanced > 0, '게임 시간 전진 (stepWorld 실제 구동, +' + Math.round(run.timeAdvanced) + '분)');
  ok(run.woodAfter > run.woodBefore, '벌목 파이프라인 동작 (목재 ' + run.woodBefore + '→' + run.woodAfter + ')');

  // HUD 채워짐
  var hud = await page.evaluate(function () {
    return {
      wood: (document.getElementById('resWood') || {}).textContent,
      day: (document.getElementById('dayLabel') || {}).textContent,
    };
  });
  ok(hud.wood !== undefined && hud.wood !== '', 'HUD 자원 표시 갱신됨 (목재=' + hud.wood + ')');

  ok(errors.length === 0, '콘솔 pageerror 0' + (errors.length ? ' — ' + errors.join(' | ') : ''));

  await browser.close();
  console.log('');
  if (fails) { console.log('❌ browser-smoke 실패 ' + fails + '건'); process.exit(1); }
  console.log('✅ browser-smoke 통과 (리팩터 후 실제 게임 정상)');
})();
