# AGENTS.md — 멀티에이전트 오케스트레이션

타이니 콜로니에서 병렬 에이전트로 안전하게 작업하기 위한 도메인 파티션·충돌 규칙·인터페이스 계약.

## 공통 컨텍스트 블록 (에이전트 브리핑 상단에 복붙)
> 타이니 콜로니: 바닐라 JS(ES 모듈) + PixiJS 7 브라우저 콜로니 생존 게임. 빌드 도구 없음, 정적 사이트(`Desktop\tiny-colony`).
> 스타일: world·pawns·jobs·main·ui 는 `var`+`function`(arrow·let·const 금지), config 는 `const`. 2스페이스, 한국어 주석, named export.
> 커밋/푸시 금지(오케스트레이터가 통합 후 일괄). 위치는 FUNCTIONS.md 에서 찾아 ±15줄만 Read.
> 검증: `npm run test:sim && npm run test:invariants` (헤드리스, 빠름). 렌더/통합은 `npm run test:browser`(서버 5800).
> 결정론 규칙: 시뮬 로직에 Math.random 직접 금지 — 주입 rng 경유. stepWorld(sim.js) 안에서 렌더/DOM/오디오 직접 호출 금지(ctx 콜백만).

## 도메인 파티션
| 도메인 | 파일 | 웨이브 | 비고 |
|--------|------|:---:|------|
| **config** | `js/config.js` | 격리(선행) | SSOT. 모두가 import → 단독 웨이브. 상수·건물·밸런스. |
| **sim** | `js/world.js` `js/pawns.js` `js/jobs.js` `js/path.js` `js/goals.js` `js/sim.js` | 병렬 가능 | 순수 로직. pawns+jobs 는 함께 변경 경향 → 한 에이전트에. |
| **render** | `js/render.js` | 병렬 가능 | PixiJS. sim 상태를 읽어 그림. |
| **ui** | `js/ui.js` `index.html` `css/style.css` | 병렬 가능 | DOM HUD·모달·입력 버튼. |
| **io** | `js/save.js` `js/audio.js` | 병렬 가능 | 직렬화·사운드. |
| **glue** | `js/main.js` | 격리(선행/후행) | 부팅·게임루프·ctx 배선·입력. 고충돌. |

## 충돌 규칙
- **config·main 은 웨이브 격리**: 다른 도메인과 같은 웨이브에 넣지 않는다(모두가 의존/배선). 먼저 또는 마지막 단독으로.
- sim 은 **인터페이스 계약**(아래)만 지키면 render/ui/io 와 병렬 안전.
- pawns.js ↔ jobs.js 는 상호 결합(작업 예약) → 같은 에이전트에 배정(분리 시 충돌).
- 한 파일은 한 에이전트만. 파일 중복 배정 금지.

## 인터페이스 계약 (에이전트가 보존해야 할 불변식)
깨면 다른 도메인·테스트가 회귀한다.
1. **ctx 콜백 표면**(ARCHITECTURE.md 참조): stepWorld·updatePawn 이 부르는 ctx 필드를 임의로 이름 변경/삭제 금지.
   새 효과가 필요하면 ctx 에 콜백 추가 + main.js 에서 구현 연결.
2. **window.game 표면**: `{ world, pawns, R, applyTool, setSpeed, enterControl, exitControl, keys }` — 테스트가 의존. 유지.
3. **예약락 네임스페이스**(`bp: item: job: ...`): 새 작업 유형 추가 시 고유 prefix + abandonJob/죽음 경로에서 releaseAllOf 보장.
4. **결정론**: 무작위는 주입 rng. **세이브 스키마** 변경 시 save.js `v` 증가.
5. **stepWorld 순수성**: sim.js 안에서 R.*/document/Audio 직접 호출 금지(헤드리스 테스트 파괴).

## Fix-Verify 루프 (수정 후 필수)
```
npm run gen:functions   # 인덱스 갱신
npm run test:sim        # 헤드리스 시나리오·결정론
npm run test:invariants # 소크 불변식
npm run test:browser    # (렌더/ui/glue 변경 시) 브라우저 통합, 서버 5800 필요
```
- 각 단계 실패 시 즉시 재수정(최대 2회). 전부 통과 후 오케스트레이터가 통합·커밋.
- **디프 의미 검수**(커밋 전): 저장·삭제·예약락·결정론·ctx 배선을 건드린 디프는 오케스트레이터가 원문 검수(자동 게이트가 못 잡는 회귀 방지).

## 트리거
| 조건 | 동작 |
|------|------|
| 1~2 파일·버그 1건 | 직접 처리(에이전트 불필요) |
| 5+ 파일·전수감사·대형 기능 | 도메인별 병렬 에이전트 → 통합 |
| config·main 수정 포함 | 해당 도메인 웨이브 분리 |
