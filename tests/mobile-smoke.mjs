// 모바일(안드로이드) UI/UX 종합 점검 — Pixel 5 에뮬레이션 (터치·pointer:coarse)
import { createRequire } from 'module';
var require = createRequire('C:/Users/남재현/Desktop/madi-app/package.json');
var pw = require('playwright');
var chromium = pw.chromium, devices = pw.devices;

var fails = 0;
function ok(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); fails++; } }

(async function () {
  var pixel = devices['Pixel 5']; // 393x851, hasTouch, isMobile → pointer:coarse 에뮬레이션
  var browser = await chromium.launch({ args: ['--use-gl=angle'] });
  var ctx = await browser.newContext(Object.assign({}, pixel));
  var page = await ctx.newPage();
  var errs = [];
  page.on('pageerror', function (e) { errs.push(String(e).slice(0, 160)); });

  await page.goto('http://localhost:5800/?seed=12345&t=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1700);

  console.log('[1] 부팅·커스터마이즈 모달 (' + pixel.viewport.width + 'x' + pixel.viewport.height + ')');
  var modal = await page.evaluate(function () {
    var box = document.querySelector('.cm-box');
    var okBtn = document.querySelector('.cm-ok');
    if (!box || !okBtn) return null;
    var br = box.getBoundingClientRect(), or2 = okBtn.getBoundingClientRect();
    return {
      fitsX: br.right <= window.innerWidth + 1 && br.left >= -1,
      fitsY: br.height <= window.innerHeight + 1,
      okVisible: or2.bottom <= window.innerHeight && or2.width >= 40,
    };
  });
  ok(!!modal, '커스터마이즈 모달 표시됨');
  if (modal) {
    ok(modal.fitsX, '모달 가로가 화면 안에 들어옴');
    ok(modal.okVisible, '"확정하고 시작" 버튼이 화면 안·탭 가능 크기');
  }
  await page.tap('.cm-ok');
  await page.waitForTimeout(400);

  console.log('[2] 터치 모드 감지·레이아웃');
  var layout = await page.evaluate(function () {
    var tb = document.getElementById('toolbar');
    var top = document.getElementById('topbar');
    var lbl = document.querySelector('.res-lbl');
    var cancel = document.getElementById('btnCancelTouch');
    return {
      touchClass: document.body.classList.contains('touch'),
      bodyOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      toolbarScrollable: tb.scrollWidth > tb.clientWidth,
      toolbarFits: tb.getBoundingClientRect().width <= window.innerWidth + 1,
      topbarOverflow: top.getBoundingClientRect().width > window.innerWidth + 1,
      labelsHidden: lbl ? getComputedStyle(lbl).display === 'none' : true,
      minimapHidden: (function () { var m = document.getElementById('minimapBox'); return !m || getComputedStyle(m).display === 'none'; })(),
      cancelVisible: cancel ? getComputedStyle(cancel).display !== 'none' : false,
    };
  });
  ok(layout.touchClass, 'body.touch 자동 감지 (pointer:coarse)');
  ok(!layout.bodyOverflowX, '문서 가로 스크롤 없음');
  ok(layout.toolbarFits, '도구모음이 화면 폭 안(내부 가로 스크롤 ' + (layout.toolbarScrollable ? 'O' : 'X') + ')');
  ok(layout.labelsHidden, '좁은 화면: 재화 라벨 숨김(아이콘+숫자)');
  ok(layout.minimapHidden, '좁은 화면: 미니맵 숨김(공간 확보)');
  ok(layout.cancelVisible, '터치 전용 ✕ 취소 버튼 노출');
  if (layout.topbarOverflow) console.log('  ⚠ 상단바가 화면 폭 초과 (확인 필요)');

  // 하단 도구 버튼 겹침 검사 (DOM 순서대로 rect 가 서로 침범하지 않아야)
  var overlap = await page.evaluate(function () {
    var btns = Array.from(document.querySelectorAll('#toolbar .tool, #toolbar .tool-action'));
    var rs = btns.map(function (b) { var r = b.getBoundingClientRect(); return { l: r.left, r: r.right }; })
      .sort(function (a, b) { return a.l - b.l; });
    var worst = 0;
    for (var i = 1; i < rs.length; i++) { var ov = rs[i - 1].r - rs[i].l; if (ov > worst) worst = ov; }
    return { count: btns.length, worst: Math.round(worst) };
  });
  ok(overlap.worst <= 2, '도구 버튼 겹침 없음 (' + overlap.count + '개, 최대겹침 ' + overlap.worst + 'px)');

  console.log('[2b] 맵 이동 — 선택 모드 한 손가락 드래그 = 팬, 탭 = 팬 아님');
  var pan = await page.evaluate(function () {
    var g = window.game, cv = g.R.app.view;
    function fire(type, x, y) {
      var t = new Touch({ identifier: 1, target: cv, clientX: x, clientY: y });
      cv.dispatchEvent(new TouchEvent(type, {
        touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true,
      }));
    }
    // 드래그
    var x0 = g.R.cam.x;
    fire('touchstart', 250, 400); fire('touchmove', 130, 400); fire('touchend', 130, 400);
    var afterDrag = g.R.cam.x;
    // 탭(안 끌기)
    var x1 = g.R.cam.x;
    fire('touchstart', 250, 400); fire('touchend', 250, 400);
    var afterTap = g.R.cam.x;
    return { moved: Math.abs(afterDrag - x0), tapMoved: Math.abs(afterTap - x1) };
  });
  ok(pan.moved > 60, '한 손가락 드래그로 맵 이동 (' + Math.round(pan.moved) + 'px)');
  ok(pan.tapMoved < 3, '탭은 맵을 움직이지 않음 (' + Math.round(pan.tapMoved) + 'px)');

  console.log('[3] 탭으로 정착민 선택 → 가상 조이스틱·액션 버튼');
  // 정착민을 화면 중앙으로 데려와 탭
  await page.evaluate(function () {
    var g = window.game;
    var p0 = g.pawns[0];
    p0.px = p0.x = 48; p0.py = p0.y = 48;
    g.R.cam.zoom = 1.0; g.R.centerOn(48, 48); g.R.applyCamera();
  });
  await page.waitForTimeout(200);
  var center = await page.evaluate(function () {
    // 타일(48,48) 중심의 화면 좌표
    var g = window.game, cam = g.R.cam;
    return { x: cam.x + (48 + 0.5) * 64 * cam.zoom, y: cam.y + (48 + 0.5) * 64 * cam.zoom };
  });
  await page.touchscreen.tap(center.x, center.y);
  await page.waitForTimeout(300);
  var control = await page.evaluate(function () {
    var joy = document.getElementById('vJoyPad');
    var act = document.getElementById('btnActionTouch');
    return {
      hasControl: document.body.classList.contains('has-control'),
      joyVisible: joy && getComputedStyle(joy).display !== 'none',
      actVisible: act && getComputedStyle(act).display !== 'none',
      joySize: joy ? joy.getBoundingClientRect().width : 0,
    };
  });
  ok(control.hasControl, '탭으로 정착민 선택됨 (has-control)');
  ok(control.joyVisible, '가상 조이스틱 표시');
  ok(control.actVisible, '상호작용(▶) 버튼 표시');
  ok(control.joySize >= 90, '조이스틱 크기 충분 (' + Math.round(control.joySize) + 'px)');

  console.log('[4] ✕ 취소 → 선택 해제, 벌목 도구 터치 드래그 지정');
  await page.tap('#btnCancelTouch');
  await page.waitForTimeout(200);
  var cleared = await page.evaluate(function () { return !document.body.classList.contains('has-control'); });
  ok(cleared, '✕ 버튼으로 선택 해제');

  // 벌목 도구 선택 (도구모음 스크롤 안에 있어도 탭)
  await page.evaluate(function () { document.querySelector('[data-tool="chop"]').scrollIntoView({ inline: 'center' }); });
  await page.tap('[data-tool="chop"]');
  var desigResult = await page.evaluate(async function () {
    var g = window.game, w = g.world;
    // 정착촌에서 가장 가까운 나무를 찾아 카메라를 그쪽으로
    var best = null, bestD = 1e9;
    for (var i in w.objects) {
      if (w.objects[i].kind !== 'tree') continue;
      var x = i % 96, y = (i / 96) | 0;
      var d = Math.abs(x - 48) + Math.abs(y - 48);
      if (d < bestD) { bestD = d; best = { x: x, y: y, i: +i }; }
    }
    if (!best) return null;
    g.R.cam.zoom = 1.0; g.R.centerOn(best.x, best.y); g.R.applyCamera();
    var cam = g.R.cam;
    return { sx: cam.x + (best.x + 0.5) * 64 * cam.zoom, sy: cam.y + (best.y + 0.5) * 64 * cam.zoom, i: best.i };
  });
  if (desigResult) {
    var before = await page.evaluate(function () { return Object.keys(window.game.world.designations).length; });
    // 한 손가락 짧은 드래그 (터치 시퀀스)
    await page.touchscreen.tap(desigResult.sx, desigResult.sy);
    await page.waitForTimeout(250);
    var after = await page.evaluate(function () { return Object.keys(window.game.world.designations).length; });
    ok(after > before, '터치로 벌목 지정 동작 (' + before + '→' + after + ')');
  } else {
    console.log('  ⚠ 화면 안 나무 없음 — 벌목 터치 테스트 생략');
  }
  // 도구 취소
  await page.tap('#btnCancelTouch');

  console.log('[5] 모달(업그레이드·제작) 모바일 맞춤 확인');
  await page.evaluate(function () { document.getElementById('btnUpgrades').scrollIntoView({ inline: 'center' }); });
  await page.tap('#btnUpgrades');
  await page.waitForTimeout(300);
  var upModal = await page.evaluate(function () {
    var box = document.querySelector('.cm-box');
    if (!box) return null;
    var br = box.getBoundingClientRect();
    return { fitsX: br.width <= window.innerWidth + 1, scrollableY: box.scrollHeight > box.clientHeight, visH: br.height <= window.innerHeight + 1 };
  });
  ok(!!upModal, '업그레이드 모달 열림');
  if (upModal) {
    ok(upModal.fitsX, '모달 가로 화면 안');
    ok(upModal.visH, '모달 세로 화면 안(내부 스크롤 ' + (upModal.scrollableY ? 'O' : 'X') + ')');
  }
  await page.evaluate(function () { var m = document.getElementById('customModal'); if (m) m.remove(); });

  console.log('[6] 게임 구동(speed3) 8초 — 런타임 에러·시간 전진');
  var t0 = await page.evaluate(function () { window.game.setSpeed(3); return window.game.world.timeMin; });
  await page.waitForTimeout(8000);
  var t1 = await page.evaluate(function () { return window.game.world.timeMin; });
  ok(t1 - t0 > 100, '게임 시간 전진 +' + Math.round(t1 - t0) + '분 (모바일 뷰포트 구동)');

  ok(errs.length === 0, '콘솔 pageerror 0' + (errs.length ? ' — ' + errs.join(' | ') : ''));

  await page.screenshot({ path: process.env.SHOT || 'mobile.png' });
  await browser.close();
  console.log('');
  if (fails) { console.log('❌ 모바일 점검 실패 ' + fails + '건'); process.exit(1); }
  console.log('✅ 모바일(안드로이드) 점검 전체 통과');
})();
