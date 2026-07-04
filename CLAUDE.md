# 타이니 콜로니 — Claude 작업 가이드

## Claude 응대 규칙 (최우선)
- **호칭**: 사용자를 항상 **대장님**이라고 부른다.
- **말투**: 반드시 **존댓말(격식체)**. 반말 금지. 예외 없음.

---

## 프로젝트 개요
림월드형 브라우저 콜로니 생존 게임. **바닐라 JS(ES 모듈) + PixiJS 7**, 빌드 도구 없음.
- 라이브: `https://namga1541-prog.github.io/tiny-colony/`
- 배포: `main` push → GitHub Pages 자동(1~2분). `.nojekyll` 로 Jekyll 우회(정적 서빙).
- 로컬 실행: `npx serve -p 5800 .` (프리뷰 서버 5800)

### 작업 전 필독 (탐색 비용·오탐 절감)
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — 불변 사실 치트시트(좌표계·예약락·ctx 콜백·시간 모델·세이브·window.game·헤드리스 모듈).
- **[FUNCTIONS.md](./FUNCTIONS.md)** — 이름→파일:라인 인덱스(자동 생성). 위치는 여기서 찾아 **±15줄만 Read**.
- **[AGENTS.md](./AGENTS.md)** — 서브에이전트 플레이북(작업 프로토콜·자기검수·증상표·보고 형식) + 도메인 파티션·충돌 규칙.
- **[RECIPES.md](./RECIPES.md)** — 기능 추가 요리책. **새 건물·적·작업(job)·자원/아이템·테스트를 추가할 때는 반드시 해당 레시피부터 읽는다** — 누락 지점(하드코딩 나열·락 해제·UI 버튼 등)이 전부 명시돼 있음.
- **[ROADMAP.md](./ROADMAP.md)** — 다음 작업 백로그(우선순위·근거·시작점 포함). **대장님이 "다음에 뭐 하지" 없이 바로 지시하면 여기서 티어 0/1부터 골라 제안한다.**
- 검증: `npm run check` (FUNCTIONS 재생성 + 스타일 검사 + 헤드리스 시뮬 + 소크 불변식 + 브라우저 스모크).
- 빠른 게이트: `npm run check:style` — 스타일(var+function)·결정론(Math.random)·헤드리스 순수성·console.log 를 기계 검사(밀리초). **코드 수정 후 항상 먼저 실행.**

## 파일 구조
| 파일 | 역할 | 헤드리스? |
|------|------|:---:|
| `js/config.js` | 상수·에셋·건물·욕구 정의 (SSOT) | ✅ |
| `js/world.js` | 월드 상태·절차생성·틱 함수·재고 | ✅ |
| `js/path.js` | A* 길찾기 (바이너리 힙) | ✅ |
| `js/jobs.js` | 작업 탐색·예약락 | ✅ |
| `js/goals.js` | 목표(도전과제) 판정 | ✅ |
| `js/pawns.js` | 정착민 상태기계(욕구→작업) | ✅ |
| `js/sim.js` | **stepWorld — 게임 진행 SSOT** (main·테스트 공용) | ✅ |
| `js/render.js` | PixiJS 렌더러 | ❌ PIXI |
| `js/ui.js` | DOM HUD | ❌ DOM |
| `js/audio.js` | 사운드 | ❌ Audio |
| `js/save.js` | localStorage 직렬화 | ❌ |
| `js/main.js` | 부팅·게임루프·입력 (글루) | ⚠️ 혼합 |

## 핵심 규칙

### 코딩 컨벤션
- ES 모듈 named export. **world·pawns·jobs·main·ui 는 `var`+`function`**(arrow·let·const 미사용), **config 는 `const`**.
- 2스페이스 들여쓰기. 주석은 한국어. JSDoc 없음.
- 전역 상태: `world`(월드 전체), `pawns`(정착민 배열). 디버그 훅 `window.game`.

### 결정론 규칙 (테스트 하네스의 전제 — 필수)
- **시뮬레이션 로직에 `Math.random()` 직접 호출 금지.** 반드시 주입된 rng(ambient/ctx.rng/파생 mulberry32) 경유.
  · 이유: 헤드리스 하네스가 시드 고정으로 재현·회귀 비교를 한다. Math.random 은 재현을 깬다.
  · `createPawn(id, def, x, y, rng)` — 5번째 인자로 rng 주입(없으면 Math.random 폴백).
- 새로운 무작위 게임 시스템을 추가하면 rng 를 파라미터로 받게 설계한다.
- **`createWorld` 의 rng 소비 순서 주의**: 월드 생성 중간에 rng() 호출을 추가/삭제하면 이후 지형·콘텐츠가 전부 밀려 절대좌표 기반 테스트가 깨진다. 불가피하면 별도 파생 시드(`mulberry32(seed ^ 상수)`)를 쓰거나 테스트 기대값 갱신을 함께 처리.

### stepWorld 규칙 (게임 진행 SSOT)
- 게임 "진행"(정착민 틱·습격·일 넘김·목표) 로직은 **`js/sim.js` 의 `stepWorld` 한 곳**에만 둔다.
  main.js 티커와 헤드리스 테스트가 같은 stepWorld 를 호출 → 로직 중복/드리프트 금지.
- stepWorld 안에서 렌더·UI·오디오를 직접 호출하지 말 것. **모든 효과는 ctx 콜백으로 방출**(onToast·onSfx·onItemChange 등).

### 세이브 버전 규칙
- 세이브 스키마(필드 추가/의미 변경) 변경 시 `js/save.js` 의 `v` 정수를 올린다. 구버전은 `loadSaveData` 가 null 반환 → 새 게임 유도(마이그레이션 없음).
- 건물 객체에 필드만 추가하는 변경은 `world.buildings` 통째 직렬화라 버전 올릴 필요 없음(읽을 때 `b.x || 기본값` 폴백).

### 배포·검증
- 코드 수정 완료 후 **별도 언급 없어도** `git add -A && git commit && git push origin main`.
- 커밋 전 pre-commit 훅이 FUNCTIONS 재생성 + 헤드리스 테스트 자동 실행(설치: `git config core.hooksPath .githooks`, PC마다 1회).
- 배포 후 강제 새로고침(Ctrl+Shift+R) 안내 — PWA는 아니지만 브라우저 캐시.

### 금지 사항
- `console.log` 운영 코드에 추가 금지.
- 에셋 재배포 금지(Tiny Swords 는 게임 구동용, 팩 재배포 아님 — 크레딧은 README).

## 멀티에이전트 하네스
> 도메인 파티션·충돌 규칙·인터페이스 계약 → **[AGENTS.md](./AGENTS.md)**

- **단순 수정(1~2 파일)**: 직접 처리. FUNCTIONS.md 로 위치 찾아 ±15줄만 Read.
- **대형/전수(5+ 파일·감사)**: 도메인별 병렬 에이전트. `config`·`main` 은 웨이브 격리(단독/선행).
- 모델 티어: 탐색·분류 `haiku` / 기본 작업 `sonnet` / 아키텍처·심층 `opus`. 상위 메인모델 상속은 대장님 명시 요청 시만.
- **브리핑 규칙**: 서브에이전트 브리핑은 AGENTS.md 「브리핑 템플릿」으로 작성 — 공통 컨텍스트 블록 + 미리 찾은 `파일:라인` + 수용 기준 + "플레이북 프로토콜 준수" 지시. 하위 모델일수록 판단 여지를 줄인다(haiku 에겐 모방할 코드 조각까지 제공).
- **수용 검사**: 에이전트 보고(변경/검증/불확실 3항목)에서 ① 검증 명령 실제 실행 여부 ② "불확실" 항목 ③ 계약(ctx·예약락·세이브·rng) 접촉 여부를 확인. 계약을 건드린 디프는 원문 검수 후 통합.

## 테스트
```
npm run check:style      # L0 스타일·결정론·순수성 기계 검사 (밀리초)
npm run test:sim         # L1 헤드리스 시나리오·결정론 (밀리초)
npm run test:invariants  # L1 소크 불변식 (6시드×30일, ~5초)
npm run test:browser     # L2 브라우저 통합 (서버 5800 필요, MADI playwright 빌려씀)
npm run check            # 위 전부 + FUNCTIONS 재생성
```
