// FUNCTIONS.md 생성기 — js/*.js 의 함수를 스캔해 이름→파일:라인 인덱스를 만든다.
// 목적: 수정 전 전체 통독 대신 이 인덱스에서 위치를 찾아 해당 줄 ±15줄만 Read.
// pre-commit 훅이 자동 실행. 수동: npm run gen:functions
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

var ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
var JS_DIR = join(ROOT, 'js');

// export function foo( / function foo( / export const foo = function / foo: function (메서드성)
var patterns = [
  /^\s*export\s+function\s+([A-Za-z0-9_$]+)\s*\(/,
  /^\s*function\s+([A-Za-z0-9_$]+)\s*\(/,
  /^\s*export\s+const\s+([A-Za-z0-9_$]+)\s*=\s*function\b/,
];

var files = readdirSync(JS_DIR).filter(function (f) { return f.endsWith('.js'); }).sort();
var rows = [];
files.forEach(function (f) {
  var lines = readFileSync(join(JS_DIR, f), 'utf8').split(/\r?\n/);
  lines.forEach(function (line, n) {
    for (var p = 0; p < patterns.length; p++) {
      var m = line.match(patterns[p]);
      if (m) { rows.push({ name: m[1], file: 'js/' + f, line: n + 1 }); break; }
    }
  });
});

rows.sort(function (a, b) {
  if (a.name.toLowerCase() < b.name.toLowerCase()) return -1;
  if (a.name.toLowerCase() > b.name.toLowerCase()) return 1;
  return a.file < b.file ? -1 : 1;
});

var out = '# FUNCTIONS.md — 함수 인덱스 (자동 생성)\n\n';
out += '> `npm run gen:functions` 또는 pre-commit 훅이 재생성. **직접 편집 금지.**\n';
out += '> 수정 전 여기서 위치를 찾아 **해당 줄 ±15줄만 Read** 하세요(전체 통독 금지).\n\n';
out += '| 함수 | 위치 |\n|------|------|\n';
rows.forEach(function (r) { out += '| `' + r.name + '` | ' + r.file + ':' + r.line + ' |\n'; });
out += '\n_총 ' + rows.length + '개 함수 · ' + files.length + '개 파일_\n';

writeFileSync(join(ROOT, 'FUNCTIONS.md'), out);
console.log('FUNCTIONS.md 생성: ' + rows.length + '개 함수 / ' + files.length + '개 파일');
