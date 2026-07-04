# AGENTS.md — 멀티에이전트 오케스트레이션

타이니 콜로니에서 병렬 에이전트로 안전하게 작업하기 위한 도메인 파티션·충돌 규칙·인터페이스 계약.

## 공통 컨텍스트 블록 (에이전트 브리핑 상단에 복붙)
> 타이니 콜로니: 바닐라 JS(ES 모듈) + PixiJS 7 브라우저 콜로니 생존 게임. 빌드 도구 없음, 정적 사이트(`Desktop\tiny-colony`).
> 스타일: world·pawns·jobs·main·ui 는 `var`+`function`(arrow·let·const 금지), config 는 `const`. 2스페이스, 한국어 주석, named export.
> 커밋/푸시 금지(오케스트레이터가 통합 후 일괄). 위치는 FUNCTIONS.md 에서 찾아 ±15줄만 Read.
> 검증: `npm run check:style && npm run test:sim && npm run test:invariants` (헤드리스, 빠름). 렌더/통합은 `npm run test:browser`(서버 5800).
> 결정론 규칙: 시뮬 로직에 Math.random 직접 금지 — 주입 rng 경유. stepWorld(sim.js) 안에서 렌더/DOM/오디오 직접 호출 금지(ctx 콜백만).

## 서브에이전트 플레이북 (하위 모델 필수 — 절차를 그대로 따르면 상위 모델급 결과가 나온다)

> 원리: 판단이 필요한 지점을 기계적 절차로 바꾼다. "알 것 같다"로 행동하지 말고 아래 순서를 그대로 밟는다.

### 작업 프로토콜 (순서 고정, 건너뛰기 금지)
0. **레시피 확인**: 새 건물·적·작업(job)·자원/아이템·테스트 추가라면 RECIPES.md 의 해당 레시피를 먼저 읽고 그 단계 목록을 체크리스트로 쓴다.
1. **위치 파악**: 함수·상수·필드 이름을 기억/추측으로 쓰지 않는다. FUNCTIONS.md 에서 찾거나 Grep 으로 실존 확인.
   찾는 이름이 없으면 → 비슷한 이름을 지어내지 말고 "없음"으로 보고.
2. **최소 읽기**: 해당 위치 ±15줄만 Read. 파일 전체 통독·전체 재작성 금지.
3. **수정**: 주변 줄의 스타일을 그대로 모방한다(주변 코드가 스타일 정답지). 요청 범위 밖 코드는 좋아 보여도 건드리지 않는다.
4. **자기검수**: 아래 체크리스트를 하나씩 확인(전부 "예"여야 함).
5. **검증**: `npm run check:style && npm run test:sim && npm run test:invariants` 실행.
   실패 → 아래 「증상→원인 표」 대조 후 수정, 재실행(최대 2회). 그래도 실패면 시도 내용을 포함해 보고.
6. **보고**: 아래 「보고 형식」대로.

### 자기검수 체크리스트 (수정 직후, 테스트 전에)
- [ ] 새 무작위 로직이 있다면 주입 rng(ambient/ctx.rng/mulberry32 파생)를 쓰는가? Math.random 직접 호출 없음?
- [ ] sim 계열(config·world·path·jobs·goals·pawns·sim)에서 렌더·DOM·오디오를 직접 호출하지 않았는가? (효과는 ctx 콜백으로만)
- [ ] 새 예약락 key 를 만들었다면 고유 prefix 이고, abandonJob·죽음 경로에서 해제되는가?
- [ ] 세이브에 저장되는 필드의 **의미**를 바꿨는가? → save.js `v` 증가. 필드 **추가**만이면 읽기 폴백(`b.x || 기본값`)으로 충분.
- [ ] world·pawns·jobs·main·ui 에서 `var`+`function`만 썼는가? (arrow·let·const 금지 — config 만 const 허용)
- [ ] `createWorld` 내부의 rng() 호출 횟수를 바꿨는가? → 이후 지형 생성이 전부 밀려 절대좌표 테스트가 깨진다. 바꿨다면 보고에 명시.
- [ ] console.log 를 추가하지 않았는가?

### 증상→원인 표 (테스트 실패 시 여기 먼저 대조)
| 증상 | 유력 원인 → 조치 |
|------|------|
| `check:style` 실패 | 출력된 파일:라인의 arrow/let/const/Math.random/console.log 위반 → 해당 줄만 수정 |
| `test:sim` 결정론(동일 시드 불일치) 실패 | Math.random 직접 호출 또는 기존 rng 스트림의 소비 순서/횟수 변경 |
| `test:sim` 절대좌표·지형 기대값 불일치 | `createWorld` 의 rng 소비 횟수 변경(섬·콘텐츠 추가 등) → 테스트 기대값 갱신 필요 여부 보고 |
| `document is not defined` 등 크래시 | 헤드리스 모듈에서 DOM/PIXI/Audio 접근 → ctx 콜백으로 방출하도록 수정 |
| `test:invariants` 예약락 누수 | 새 작업 경로에서 실패·죽음 시 releaseAllOf/release 누락 |
| `test:invariants` NaN/범위 이탈 | px/py 계산에 0 나눗셈·미정의 변수 → greedyStep·이동 코드 확인 |

### 보고 형식 (최종 메시지에 이 3항목 필수)
1. **변경**: 파일:라인 — 무엇을 왜 바꿨는지 한 줄씩.
2. **검증**: 실행한 명령과 결과(통과/실패 원문 요약). 실행 안 했으면 "미실행"이라고 명시(통과처럼 쓰지 말 것).
3. **불확실**: 확신 못 하는 부분·계약(ctx/락/세이브/rng)을 건드린 부분. 없으면 "없음".

### 금지 (위반 시 오케스트레이터가 롤백)
- git commit/push (오케스트레이터가 통합 후 일괄).
- 파일 전체 재작성, 요청 밖 리팩터·정리·개선.
- 존재 확인 안 한 함수/필드 호출, 새 외부 의존성 추가.
- ctx 콜백·window.game·예약락 prefix 등 인터페이스 계약의 이름 변경/삭제(추가는 가능, 아래 계약 참조).

## 모델 티어별 역할 (브리핑 작성 기준)
| 티어 | 맡길 일 | 브리핑에 반드시 넣을 것 |
|------|------|------|
| **haiku** | 탐색·분류·집계, 위치가 `파일:라인`으로 특정된 기계적 수정 | 정확한 위치 + 기대 결과 예시(모방할 코드 조각). 판단 여지를 남기지 말 것 |
| **sonnet** | 일반 기능 구현·버그 수정(1~3 파일) | 공통 컨텍스트 블록 + "AGENTS.md 플레이북 프로토콜 준수" 지시 + 수용 기준 |
| **opus** | 다중 파일 설계·심층 디버깅·계약 변경 검토 | 위 전부 + 관련 ARCHITECTURE.md 섹션 원문. 계약 변경은 실행 말고 제안으로 반환 |

### 브리핑 템플릿 (오케스트레이터가 복붙 후 [ ] 채움)
```
[공통 컨텍스트 블록 — 이 문서 상단 복붙]
## 작업
- 목표: [한 문장]
- 위치: [파일:라인 — FUNCTIONS.md 에서 미리 찾아서 제공]
- 수용 기준: [완료 판정 조건, 테스트 통과 포함]
## 절차
AGENTS.md 「서브에이전트 플레이북」의 작업 프로토콜·자기검수·보고 형식을 그대로 따르라.
검증: npm run check:style && npm run test:sim && npm run test:invariants
```

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
npm run check:style     # 스타일·결정론·순수성 기계 검사 (밀리초)
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
