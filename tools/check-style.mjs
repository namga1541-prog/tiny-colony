// 스타일·불변식 기계 검사기 — 에이전트(특히 하위 모델)의 규칙 위반을 자동으로 잡는 안전망.
// 실행: npm run check:style  (pre-commit 훅에도 포함)
//
// 검사 항목 (CLAUDE.md·AGENTS.md 규칙의 기계화):
//   1. var+function 스타일: world·pawns·jobs·main·ui 에서 arrow(=>)·let·const 금지
//   2. 결정론: 헤드리스 모듈에서 Math.random 직접 호출 금지 (`|| Math.random` 폴백 관용구는 허용)
//   3. 순수성: 헤드리스 모듈에서 document/window/localStorage/PIXI/Audio 접근 금지
//   4. 운영 코드 console.log 금지 (js/ 전체)
// 위반 시 파일:라인과 원문을 출력하고 exit 1.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

var ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// var+function 스타일 강제 대상 (config 는 const 허용, render·audio·save·goals·path·sim 은 관례상 var 이지만 강제 안 함? → 강제 대상은 CLAUDE.md 명시 5개)
var VAR_ONLY = ['js/world.js', 'js/pawns.js', 'js/jobs.js', 'js/main.js', 'js/ui.js'];
// 헤드리스 모듈 — Node 에서 PIXI·DOM 없이 실행되어야 함 (ARCHITECTURE.md)
var HEADLESS = ['js/config.js', 'js/world.js', 'js/path.js', 'js/jobs.js', 'js/goals.js', 'js/pawns.js', 'js/sim.js'];
var ALL_JS = ['js/config.js', 'js/world.js', 'js/path.js', 'js/jobs.js', 'js/goals.js', 'js/pawns.js', 'js/sim.js',
  'js/render.js', 'js/ui.js', 'js/audio.js', 'js/save.js', 'js/main.js'];

var violations = [];

function addViolation(file, lineNo, rule, text) {
  violations.push(file + ':' + lineNo + '  [' + rule + ']  ' + text.trim());
}

// 라인 끝 // 주석 제거(주석 안 언급은 위반 아님). 문자열 내 // 는 이 코드베이스에 없음(URL 등).
function stripComment(line) {
  var i = line.indexOf('//');
  return i === -1 ? line : line.slice(0, i);
}

function checkFile(file) {
  var src;
  try { src = readFileSync(join(ROOT, file), 'utf8'); }
  catch (e) { console.error('[check-style] 파일 없음: ' + file); process.exitCode = 1; return; }
  var lines = src.split('\n');
  var varOnly = VAR_ONLY.indexOf(file) !== -1;
  var headless = HEADLESS.indexOf(file) !== -1;

  for (var n = 0; n < lines.length; n++) {
    var code = stripComment(lines[n]);
    if (!code.trim()) continue;

    // 1. var+function 스타일
    if (varOnly) {
      if (/=>/.test(code)) addViolation(file, n + 1, 'arrow 금지(var+function)', lines[n]);
      if (/(^|[^A-Za-z0-9_$.])(let|const)\s/.test(code)) addViolation(file, n + 1, 'let/const 금지(var+function)', lines[n]);
    }

    // 2. 결정론 — Math.random 직접 호출 금지. `rng || Math.random` / `: Math.random` 폴백 관용구는 허용.
    if (headless && /Math\.random/.test(code)) {
      var fallback = /(\|\|\s*Math\.random)|(:\s*Math\.random)/.test(code);
      if (!fallback) addViolation(file, n + 1, 'Math.random 금지(주입 rng 사용)', lines[n]);
    }

    // 3. 헤드리스 순수성 — DOM/렌더/오디오/스토리지 접근 금지
    if (headless && /(document\.|window\.|localStorage|PIXI\.|new Audio)/.test(code)) {
      addViolation(file, n + 1, '헤드리스 순수성 위반(DOM/PIXI/Audio 금지)', lines[n]);
    }

    // 4. console.log 금지 (js/ 전체)
    if (/console\.log/.test(code)) addViolation(file, n + 1, 'console.log 금지', lines[n]);
  }
}

for (var f = 0; f < ALL_JS.length; f++) checkFile(ALL_JS[f]);

if (violations.length) {
  console.error('[check-style] ❌ 위반 ' + violations.length + '건:');
  for (var v = 0; v < violations.length; v++) console.error('  ' + violations[v]);
  console.error('규칙 근거: CLAUDE.md 「코딩 컨벤션」·「결정론 규칙」, ARCHITECTURE.md 「헤드리스 가능 모듈」');
  process.exit(1);
}
console.log('[check-style] ✅ 통과 (' + ALL_JS.length + '개 파일)');
