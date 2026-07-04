# RECIPES.md — 기능 추가 요리책 (검증된 단계별 절차)

> 실제 코드 역추적으로 작성된 레시피. 새 기능을 추가할 때 **여기 절차를 그대로 따르면** 누락 지점 없이 완성된다.
> 라인 번호는 작성 시점(2026-07) 기준 — 어긋나면 FUNCTIONS.md 로 재확인. 코드가 바뀌면 이 문서도 갱신.

---

## 레시피 1: 새 건물 추가

표본: `fenceGate`(성문, 1칸 드래그형) · `barn`(축사, 틱 효과형)

1. **config.js 에 정의 등록** — `BUILDS`(js/config.js:33 시작). 필드: `name`·`cost`(자재 딕셔너리)·`work`(완공 필요 작업량)·`hp`·`fw`/`fh`(풋프린트)·`solid`(모두 차단)·`enemyBlocked`(적만 차단)·`light`·`img`/`imgC`/`pw`/`ph`(범용 텍스처)·`town`(Tiny Town 시트 크롭, 있으면 img 무시)·`desc`(툴팁). 배치 게이트 플래그: `requireCoast`/`requireMineAdjacent`/`requireFarming`.
2. **해금 단계(선택)** — `BUILD_MIN_RANK`(js/config.js:475). 미등록이면 0단계부터 즉시 건설 가능 — 밸런스 주의.
3. **index.html 에 버튼 수동 추가 (자동 노출 없음!)** — 빌드 카테고리 그룹(index.html:71~92)에 `data-tool="<BUILDS 키>"` 버튼. ui.js `refreshLocks`(js/ui.js:93)가 이 버튼을 순회해 잠금 처리.
4. **render.js 텍스처 매핑** — `buildingTexture`(js/render.js:440) 우선순위: 특수분기 → `DECOR_BUILD_TEX` → `MRTS_KIND`(js/render.js:69) → `def.town` → `def.imgC/img`. 전용 그림이 있으면 MRTS_KIND 에 추가, 크기/앵커 보정은 `refreshBuilding`(js/render.js:509)에 kind 분기. 명패는 `BUILDING_SIGN`(js/render.js:351, 선택).
5. **배치 검증** — 기본은 `footprintClear`(js/world.js:390) + main.js 범용 분기(js/main.js:750~779)가 rank→escapePart→requireCoast(`footprintTouchesWater` js/world.js:524)→requireMineAdjacent(js/world.js:873)→requireFarming→footprintClear→canAfford 순으로 게이트. 새 특수 조건은 config 플래그 + main.js `else if` 게이트 + world.js 판정 헬퍼.
6. **틱 효과형이면** — world.js 에 `tickXxx(world, dtMin[, rng])` 함수(표본 `tickBarns` js/world.js:666): `world.buildings` 순회, `kind`·`stage==='built'` 필터, 타이머는 `(b.t||0)+dtMin` 패턴(세이브 폴백). sim.js import(js/sim.js:11) + `stepWorld` 루프 안 호출(js/sim.js:75 부근). 이벤트는 배열로 반환 → sim.js 가 ctx 콜백으로 방출. **world/sim 안에서 R./UI./Audio 직접 호출 금지.**
7. **완공 특수효과** — main.js `onBuildingBuilt`(js/main.js:432)에 `if (b.kind === '...')` 분기. pawns.js `finishWork`(js/pawns.js:571 build 분기)는 범용 처리만 — 여기 kind 분기 넣지 말 것.
8. **통행 차단** — `isWalkable`(js/world.js:466): `solid` → 모두 차단, `forEnemy && enemyBlocked` → 적만 차단. 장식물은 둘 다 생략.
9. **세이브·철거 — 코드 불필요** — `world.buildings` 통째 직렬화(js/save.js:13), 버전 안 올림. 철거 50% 환급도 `cost` 범용 처리(js/main.js:694).

**함정**:
- index.html 버튼을 안 넣으면 영원히 UI에 안 뜬다(정의만으로 자동 노출 안 됨).
- **1칸 드래그형**(fence/fenceGate 류)은 범용 분기를 타지 않는다 — main.js:734~748 의 전용 `else if` + `forRect` 패턴을 복제해야 드래그 다중 설치가 된다.
- `enemyBlocked` 는 `isWalkable(...,forEnemy=true)` 호출에서만 유효 — 적 길찾기 호출부가 인자를 안 넘기면 조용히 통과된다.
- config 키 ↔ index.html `data-tool` ↔ main.js tool 분기 문자열이 한 글자라도 다르면 `def undefined` 예외 또는 무반응.

---

## 레시피 2: 새 적(enemy) 종류 추가

표본: `skeleton`(커밋 2cdc5ae — 실제 변경 파일 9개: config·world·sim·render·main·assets·README·tests·FUNCTIONS)

1. **config.js 스탯 상수** — 전투 섹션(js/config.js:355~414)에 `export const XXX = { hp, power, attackCd, moveMinPerTile, dropGold, dropIron, name }`. `moveMinPerTile` 은 타일당 소요 게임분(클수록 느림, 고블린 1.4 기준).
2. **world.js import** — js/world.js:5 의 config import 목록에 상수 추가 (누락 시 스폰 시점에야 ReferenceError).
3. **enemyStats 분기** — js/world.js:956~966 에 `if (e && e.kind === 'xxx') return XXX;`. 누락 시 조용히 고블린 스탯으로 폴백.
4. **fixedHp 맵** — `spawnRaid` 내부(js/world.js:972). 등록하면 고정 체력, 누락하면 날짜 비례 스케일링(`ENEMY.hp + day*hpPerDay`) — 습격형이면 의도일 수 있으나 상주/보스형은 반드시 등록.
5. **스폰 경로 택 1**:
   - (a) 습격/대침공 웨이브: sim.js `spawnInvasionWave`(js/sim.js:19~32)에 `spawnRaid(world, sched.xxxPerWave || 0, rng, 'xxx', waveNo);` + config `INVASION.schedule[]`(js/config.js:406)에 `xxxPerWave` 필드.
   - (b) 원정 섬 상주: `createWorld` 최초 배치(js/world.js:303~317) + `dailyIslandRespawn` 의 테마→kind 맵(js/world.js:748 부근).
   - (c) 독자 스케줄 단발: sim.js 에 `spawnRaid` 직접 호출 + `GIANT_RAID` 류 config 오브젝트.
6. **render.js 외형** — `ENEMY_LOOK` 맵(js/render.js:187~196)에 kind 항목. 전용 시트면 텍스처 로드(js/render.js:22~53)도 추가. **누락 시 에러 없이 고블린 외형 폴백**(js/render.js:1041) — 육안 확인 필수.
7. **에셋 + 크레딧** — `assets/monsters/` 배치, README 크레딧 섹션에 출처 1줄(프로젝트 규칙).
8. **특수 AI(선택)** — `updateEnemies`(js/world.js:1141~) 안에 kind 분기. 참고: 거인 점프(js/world.js:1191~1238, `cb.onGiantJump`), 데몬 레이저(js/world.js:1156~1190, `cb.onDemonLaser`). 이동·근접공격은 스탯 범용이라 특수행동 없으면 생략.
9. **드랍은 자동** — 처치 시 `st.dropGold/dropIron` 범용 드랍(js/world.js:1146~1151). 보스급 후처리만 여기 분기.
10. **세이브 영향 없음** — `world.enemies` 통째 직렬화(js/save.js:39).

**함정**:
- **createWorld 안에 스폰 루프를 끼워 넣으면 rng 소비 순서가 밀려** 이후 지형·절대좌표 테스트가 깨진다(CLAUDE.md 결정론 규칙). 기존 생성 로직의 **끝에** 추가하거나 파생 시드 사용.
- `sched.xxxPerWave || 0` 옵셔널 처리 탓에 config·sim 간 필드명 오타 시 에러 없이 0마리 스폰.
- `world.islands` 는 저장 안 됨 — 섬 상주형 로직을 바꾸면 기존 세이브도 로드 시 새 로직으로 재현됨(마이그레이션 없음).
- 무작위는 반드시 주입 rng (Math.random 금지 — check:style 이 잡음).

---

## 레시피 3: 새 작업(job) 유형 추가 — 지정→탐색→예약→수행→완료 전체 흐름

표본: `fish`(낚시). **가장 많은 지점을 건드리는 레시피 — 순서대로 전부 확인할 것.**

1. **world 자료구조** — `createWorld` 반환 객체(js/world.js:163 부근)에 `myDesig: {}` (idx→true) 필드.
2. **UI 버튼** — index.html 에 `data-tool="myTool"` 버튼만 추가(예: index.html:63). ui.js:11~23 이 `.tool` 전체에 클릭 위임 — JS 등록 불필요.
3. **지정** — `applyTool`(js/main.js:594~602)에 `else if` 분기. `forRect`(js/main.js:490)가 드래그 순회 대행.
4. **취소 도구 연동(필수)** — main.js:675 `cancel` 분기에 `delete world.myDesig[i]` 추가. 누락 시 사용자가 지정을 못 지움.
5. **탐색 collector** — jobs.js:221~229 패턴 모방. `world.reserved['my:'+i] !== undefined` 체크 + `reachable` 필수.
6. **COLLECTOR 맵(jobs.js:248) + 우선순위 캐스케이드(jobs.js:294~305)** — 캐스케이드 삽입 위치가 곧 우선순위(건설>운반>제작>채집>채굴>농사>요리>사냥>낚시>비축).
7. **reserveJob(jobs.js:256~271)** — `reserve(world, 'my:'+job.idx, pawn.id)`. **COLLECTOR 와 reserveJob 은 반드시 쌍으로** — 한쪽만 하면 중복 배정 또는 락 미확인.
8. **역할 특화(선택)** — config.js `ROLES`(js/config.js:264)의 `jobs` 배열에 타입 토큰.
9. **jobTarget**(js/pawns.js:198) — 이동 좌표 케이스. 누락 시 `default: null` → 이동 자체가 안 됨("왜 아무도 안 감" 증상).
10. **onArrive**(js/pawns.js:292) — 대상 유효성 재검증(사라졌으면 `abandonJob`) 후 `state='working'` + `workLeft`.
11. **진행 중 재검증** — updatePawn 'working' 분기(js/pawns.js:860)에도 유효성 체크. onArrive 와 **양쪽 다** 필요.
12. **finishWork**(js/pawns.js:501~526) — 산출 `addItem` + `ctx.onEvent` 방출 + **`releaseAllOf` + `pawn.job=null` + `state='idle'`**. 성공 경로에서 releaseAllOf 누락이 가장 흔한 락 누수.
13. **jobSkill**(js/pawns.js:651~660) — 케이스 추가하면 스킬 성장·속도 배율 자동 적용.
14. **UI 라벨 3곳** — `taskLabel`(pawns.js:70~102, working 라벨 + 이동 names 맵) + `toolIconOf`(pawns.js:113~129).
15. **cancelTypes 맵**(js/main.js:360) — 등록해야 "작업취소" 버튼이 이 작업을 멈춤.
16. **INTERRUPTIBLE 맵(선택)**(js/pawns.js:136) — 건설 대기 시 양보 여부.
17. **렌더 마커** — `refreshZones`(js/render.js:668) 에 전용 오버레이 루프(전용 필드는 `DESIG_COLOR` 미적용).
18. **세이브** — save.js:17~18 에 필드 추가 + main.js:41 로드 폴백(`|| {}`). **주의: stock/buildings 와 달리 최상위 신규 필드는 save.js 에 명시적 추가 필요**(버전은 안 올려도 됨 — 폴백으로 안전).
19. **리셋 초기화** — main.js:381 전체 지정 리셋에 새 필드 포함 여부 판단.

**함정 (락 누수 경로)**:
- onArrive·진행중 한쪽만 재검증 → 취소된 지정으로 계속 걸어가거나 유령 작업.
- `abandonJob`(pawns.js:166)은 releaseAllOf+stuckCd=15 — 실패 경로에서 이걸 안 부르면 `world.reserved` 영구 잔류(test:invariants 락 누수로 검출).
- 후보 `type` 문자열이 avoidJobType(jobs.js:274)·cancelTypes 와 불일치하면 취소·회피가 조용히 무시됨.

---

## 레시피 4: 새 자원/아이템/어종/요리/장착품 추가

### A. 스톡 자원(world.stock) 신규 키 — "자동 3 + 수동 3"
- **자동(수정 불필요)**: `addItem`/`removeItem`(js/world.js:537~546, 키 무관 범용) · 세이브(save.js:16 `stock` 통째 직렬화, 버전 불필요) · `canAfford`/`consumeGlobal`.
- **수동(누락 시 조용한 버그)**:
  1. `totalRes`(js/world.js:550~559) — 빠지면 UI·요건판정에서 0 취급.
  2. `totalStored`(js/world.js:623~627) — 빠지면 **저장용량을 차지하지 않고 무한 축적**(밸런스 버그). 단 무기·방어구는 설계상 원래 미포함.
  3. UI 표시(js/ui.js:117~125 요소 참조 + 150~159 `updateRes`) — index.html 에 DOM 요소도 필요.
- 판매 가능 자원이면 `TRADER.rates`(js/config.js:507)에도 추가.

### B. 어종(FISH)
- config.js FISH 배열(js/config.js:522~537)에 항목만 추가하면 끝. 필드: `food`·`gold`·`weight`(가중치)·`rare`(0~4, rare≥2 는 이벤트 메시지)·`delicacy`·`spotOnly`(true=일반낚시 제외, 희귀스팟 전용 풀 자동 편입).
- `catchFish`/`catchRareFish`(config.js:542~563)·pawns.js 재고 반영(pawns.js:501~520) 전부 자동. 새 산출 자원명을 쓰면 pawns.js 에 분기 + A절 수동 3종.

### C. 요리 등급(COOK_TIERS)
- config.js:419~423 에 `{id, name, cost, work, eatAmount}` 추가. **배열 순서 = 등급 오름차순 유지**(뒤에서부터 고급 우선 선택·소비).
- 자동: `collectCook`(jobs.js:177~199) 등급 선택 · 요리 실행(pawns.js:479~499) · 섭취 우선순위(pawns.js:681~689).
- **수동**: `totalMeals` 하드코딩(jobs.js:180 — 빠지면 6개 상한이 새 등급을 못 세어 과잉 생산) + A절 수동 3종 + TRADER.rates.
- 초저확률 보너스 아이템 패턴은 `GLORIOUS_FOOD`(config.js:426~429) 모방: 생산 가로채기(pawns.js:484)·섭취 최우선(683)·섭취 효과(890~894).

### D. 장착품(무기 WEAPONS / 방어구 ARMOR)
- config.js:341~353 에 항목 추가(`iron:true` 면 강철 연구 게이트 자동).
- 자동: 대장간 UI(ui.js:780~816, Object.keys 순회) · 제작(pawns.js:626~644) · 전투 스탯(`pawnPower`/`pawnRange`/`armorDefense`).
- **수동 3중 하드코딩(함정)** — 하나라도 빠지면 "제작은 되는데 전투 때 안 집어듦":
  1. `hasStockWeapon`(js/pawns.js:715~718) 합산 나열
  2. `tryAutoArm` order 배열(pawns.js:720~726, 강한 순)
  3. `tryAutoArmor` order 배열(pawns.js:728~734)
- `totalRes` 나열(world.js:556~557)에도 추가. `totalStored` 에는 넣지 않음(기존 설계와 일관).

---

## 레시피 5-A: 헤드리스 테스트 시나리오 추가

하네스 API (tests/harness.mjs, 131줄 — 통독 허용):
- `bootSim(seed)` → `{ world, pawns, ctx, enemyCbs, ambient, events, counters }`. main.js 새게임과 동일 초기화. ctx 는 전 콜백 no-op stub(onEvent 는 events[] 기록, onToast/onSfx/onDeath/onRecruit 는 counters 증가). `ctx.rng = ambient`.
- `run(sim, gameMin, chunk=1)` / `runDays(sim, days)` — stepWorld 반복 호출.
- `designateChop(sim, n)` · `give(sim, stock)` · `snapshot(sim)`(결정론 비교용 JSON).

시나리오 구조: 함수 등록이 아니라 **`console.log('[sim-smoke] N) 제목')` + 즉시실행 IIFE** 를 파일에 순서대로 나열. 새 시나리오는 마지막 블록 뒤에 삽입. 단언은 `ok(cond, msg)` — 실패 시 fails 증가, 파일 말미에서 exit 1.

두 가지 스타일:
- **풀 시뮬형**(표본: 시나리오 28): bootSim → give → **ctx stub 을 스파이로 덮어씀**(`sim.ctx.onX = function(...){ calls.push(...) }`) → run → ok.
- **단일 정착민 직접형**(표본: 시나리오 40): `createPawn` + `p.job={...}; p.state='working'; p.workLeft=0.01` 주입 → `updatePawn(w, p, 1, 미니ctx)` 직접 호출. **rng 를 상수 함수(`function(){return 0.99}`)로 주입해 확률 분기를 강제.**

복붙 템플릿:
```js
console.log('[sim-smoke] N) <새 기능 제목> (신규)');
(function () {
  var sim = bootSim(1801); var w = sim.world;
  give(sim, { food: 200 });
  ok(!w.someFlag, '초기엔 발동 전');
  var calls = [];
  sim.ctx.onSomeCb = function (x, y) { calls.push({ x: x, y: y }); };
  run(sim, 3 * DAY_MIN);
  ok(w.someFlag, '조건 충족 후 플래그 true');
  ok(calls.length === 1, '콜백 정확히 1회 호출');
  run(sim, 2 * DAY_MIN);
  ok(calls.length === 1, '재발동 없음(1회성)');
})();
```

불변식 추가: tests/invariants.mjs `checkInvariants(sim)` 안에 `if (위반조건) return '설명';` 한 줄 — 시드 루프(6시드×30일)에 자동 편입.

결정론 시나리오(4·5)가 깨지는 전형적 원인: ① Math.random 직접 호출 ② createWorld 등의 rng 소비 순서/횟수 변경 ③ ambient/파생 스트림 혼용 순서 변경. 시나리오 5(chunk 결정론)는 **경고만 출력하는 소프트 검사** — 통과했다고 chunk 무관이 보장되진 않음.

## 레시피 5-B: 새 ctx 콜백(시뮬→효과) 신설

1. **sim.js 방출** — 이벤트 지점에 호출. 관용구 두 가지 혼재: 무조건 호출(`ctx.onX(...)`) vs 존재 체크(`if (ctx.onX) ctx.onX(...)`). **신규 콜백은 존재 체크 스타일 권장** — stub 누락 시에도 크래시하지 않음.
2. **sim.js 헤더 계약 주석**(js/sim.js:50~53) 갱신.
3. **main.js 배선** — ctx 리터럴(js/main.js:426~487)의 효과 구획에 실제 R.*/UI.* 구현 연결.
4. **harness stub**(tests/harness.mjs:26~45) 에 no-op 추가 — 무조건 호출 스타일이면 **필수**(누락 시 헤드리스 전체 `TypeError` 크래시).
5. **테스트** — stub 을 스파이로 덮어써 호출 횟수·인자 단언(레시피 5-A 템플릿).
6. **ARCHITECTURE.md ctx 계약 목록** 갱신 (문서 드리프트 방지).

---

## 공통 마무리 (모든 레시피)
1. `npm run check:style` → `npm run test:sim` → `npm run test:invariants`
2. 새 기능엔 sim-smoke 시나리오 1개 이상 추가(레시피 5-A)
3. FUNCTIONS.md 는 pre-commit 이 자동 재생성
4. 이 문서의 절차와 실제 코드가 어긋나면 이 문서를 갱신
