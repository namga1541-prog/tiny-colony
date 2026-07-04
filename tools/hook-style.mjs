// PostToolUse 훅 래퍼 — Edit/Write 가 js/*.js 를 수정했을 때만 check-style 을 실행한다.
// 위반 발견 시 exit 2 + stderr → Claude 에게 즉시 피드백되어 자동 수정을 유도한다(모델 무관 안전망).
// 등록: .claude/settings.json 의 hooks.PostToolUse (matcher: Edit|Write)
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

var ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// stdin 으로 들어오는 훅 입력 JSON 에서 대상 파일 경로 추출
var raw = '';
try { raw = readFileSync(0, 'utf8'); } catch (e) {}
var fp = '';
try {
  var data = JSON.parse(raw);
  fp = (data.tool_input && data.tool_input.file_path) || (data.tool_response && data.tool_response.filePath) || '';
} catch (e) {}

// 게임 코드(js/*.js)가 아니면 통과 (문서·테스트·도구 수정은 검사 불필요)
if (!/[\\/]js[\\/][^\\/]+\.js$/.test(fp)) process.exit(0);

var r = spawnSync(process.execPath, [join(ROOT, 'tools', 'check-style.mjs')], { encoding: 'utf8' });
if (r.status !== 0) {
  process.stderr.write((r.stdout || '') + (r.stderr || ''));
  process.exit(2); // exit 2 = 위반 내용이 Claude 에게 전달됨
}
process.exit(0);
