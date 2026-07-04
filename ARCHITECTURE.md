# ARCHITECTURE.md — 불변 사실 치트시트

> 수정·감사 전에 읽으면 재조사·오탐을 막는다. 코드가 바뀌면 이 문서도 갱신.

## 좌표계
- 타일 그리드 `MAP_W × MAP_H = 96 × 96`. 인덱스 `idx(x,y)=y*96+x`, 역변환 `ix(i)`·`iy(i)`.
- 정착민/적: **정수 `x`/`y`**(그리드 스냅) + **실수 `px`/`py`**(보간 위치). 렌더·거리계산은 px/py, 타일 판정은 x/y.
- 지형 코드: `T_WATER=0` · `T_GRASS=1` · `T_SAND=2`. `isWalkable`·`inMap` 로 판정.
- 맵은 **두 대륙**(본섬 + 바다 건너 고립 대륙) + **원정 섬 3곳**(보물·식인종·비경 — `world.islands`). 전부 뗏목(bridge)으로만 연결.

## 시간 모델
- `MIN_PER_SEC=6` · `DAY_MIN=1440`(1일=1440게임분) · `SPEED_MULT=[0,1,2.5,5]`(속도 0~3).
- 프레임당 `gameMin = min(30, realSec * 6 * SPEED_MULT[speed])`. `world.timeMin` 누적, `world.day = 1+floor(timeMin/1440)`.
- **진행은 `stepWorld`(sim.js) 가 단독 수행** — dt≤1 게임분 단위로 잘게 틱.

## 재고 모델 (글로벌 스톡)
- 모든 자원은 **`world.stock`** 콜로니 전체 재고(바닥에 안 쌓임). `{ wood, gold, food, iron, meal }`.
- `addItem(world, i, type, n)` / `removeItem(...)`(음수 클램프됨, 안전) / `consumeGlobal(world, type, n)` / `canAfford` / `totalRes`.
- 건설: 착공 시 자재를 재고에서 즉시 차감(운반 단계 없음). 식사: 재고의 meal→food 순으로 그 자리 섭취.
- 저장 용량: `storageCap(world)`(창고 tier 합산) vs `totalStored` → 초과 시 `storageFull`.

## stepWorld / ctx 콜백 계약 (sim.js)
`stepWorld(world, pawns, dtMin, rng, ctx, enemyCbs)` — 게임 진행 SSOT. 효과는 전부 ctx 로 방출.

**ctx (정착민·월드 상태 콜백)**: `rng`, `onWorldChange(i)`, `onItemChange(i)`, `onCropChange(i)`,
`onBuildingChange(b)`, `onBuildingBuilt(b)`, `onEvent(msg)`, `onStorageFull()`, `onDeath(pawn)`,
`onStarving(pawn)`, `onSheepChange()`
**ctx (오케스트레이션 효과 콜백)**: `onTileChange(i)`, `onToast(msg,warn)`, `onSfx(name)`, `onRecruit()`, `onSeasonTint(tint,alpha)`,
`onGoddessDescend(x,y)`(여신 강림 연출), `onBoatLanding(x,y)`(습격 상륙 배 연출), `onZonesChanged()`(구역 오버레이 갱신)
**enemyCbs (전투)**: `onHit(pawn,dmg)`, `onPawnDeath(pawn)`, `onEnemyDown(enemy)`, `onTowerFire(tower,enemy)`, `onCannonFire(castle,enemy)`(성 대포 tier 광역)

- main.js 는 ctx 에 실제 R.*/UI.*/Audio2.*/recruitWanderer 를 연결. 헤드리스 하네스는 기록용 stub 연결.
- **stepWorld 안에서 렌더/DOM/오디오 직접 호출 금지** — 이 규칙이 헤드리스 테스트를 가능케 함.

## 예약락 시스템 (jobs.js) — 스턱버그 원천
`reserve(world, key, pawnId)` / `release(world, key)` / `releaseAllOf(world, pawnId)`. `world.reserved[key]=pawnId`.
- 키 네임스페이스: `bp:<bid>` · `item:<idx>` · `job:<idx>` · `mine:<bid>` · `crop:<idx>` · `craft` · `cook` · `hunt:<sheepId>` · `fish:<idx>` · `eat:<idx>` · `haul:<idx>` · `stock:<idx>`.
- **불변식**: 살아있지 않은 정착민이 락을 보유하면 누수(죽으면 releaseAllOf 필수). `abandonJob` 은 releaseAllOf + `stuckCd=15`.
- 길찾기 실패 시 abandonJob 안 하면 자원 영구 잠김 → 스턱.

## RNG / 결정론
- `mulberry32(seed)` 시드 난수. `world.seed` 가 월드 시드. `ambientRng = mulberry32(seed ^ 0x5eed)`(습격·양·목장·영입).
- 초기 정착민: `mulberry32(seed ^ 0x9a3c)`(트레잇·허기) — ambient 스트림과 분리.
- 일일 재생: `mulberry32(seed + day)`. 낚시: `ctx.rng` 경유.
- **새게임 시드**: `?seed=123` URL 파라미터 있으면 사용(재현·테스트), 없으면 `Math.random()`.
- 규칙: 시뮬 로직에 Math.random 직접 금지 — 반드시 주입 rng.

## 세이브 (save.js)
- 키 `tinyColony.save1`, 현재 버전 **`v: 15`**. `loadSaveData` 는 `v !== 15` 이면 null(마이그레이션 없음).
- `world.buildings` 등은 통째 직렬화 → 건물에 필드만 추가하면 버전 안 올려도 됨(읽을 때 폴백).
- 버전 불일치로 로드 실패 시 main.js 가 `hadIncompatibleSave` 를 감지해 "이전 버전이라 불러올 수 없다" 토스트를 띄움(무설명 새 게임 방지).
- **`world.islands` 는 저장 안 함** — `createWorld(seed)` 가 결정론적으로 매번 동일하게 재생성(섬 위치·테마·chest/cannibal/raredeer 개수까지 시드 종속). 플레이 중 변한 부분(상자 개봉·식인종 처치·희귀동물 사냥)은 이미 직렬화되는 `objects`/`enemies`/`sheep` 필드로 정확히 복원됨 — `islands` 자체(메타·discovered 플래그)만 로드 시 초기화(발견 토스트 재발생 가능·무해). 이 설계 덕에 원정 섬 추가가 세이브 버전을 올리지 않음.

## 원정 섬 (world.islands) — 로그라이트 콘텐츠
- `config.js`: `ISLANDS`(위치·반경 비율, 테마) · `CANNIBAL`(적 스탯) · `NATURE.chest`/`NATURE.rareplant`(드롭) · `ANIMALS.raredeer`(희귀 동물, `rareGold` 처치 보너스).
- `world.js` `createWorld` 가 본섬·2번대륙과 멀리 떨어진 3개 원형 섬을 지형에 새김 → 테마별 콘텐츠 배치(보물상자/식인종 상주 적/희귀식물+희귀동물). `world.islands[]` 에 메타 저장(`id,name,icon,theme,cx,cy,r,discovered,cap`).
- `checkIslandDiscovery(world,pawns)`(매 stepWorld 호출) — 정착민이 섬 반경 진입 시 1회 발견 토스트. `dailyIslandRespawn(world,rng)`(매일 아침) — 식인종을 cap 까지 서서히 보충.
- 채집(`forage` 도구)이 chest/rareplant 도 지정 가능(버섯과 동일 취급). chest 개봉 시 60% 확률로 유물도 획득(`grantRelic`).
- 적 `kind`: `'goblin'`(기본)·`'giant'`(괴민)·`'cannibal'`(원정 섬 상주) — `enemyStats(e)` 가 종류별 스탯 분기.

## window.game (디버그·테스트 훅, main.js 말미)
`{ world, pawns, R, applyTool(tool,a,b), setSpeed(s), enterControl(pawn), exitControl(), keys }`
- 브라우저 테스트는 이걸로 상태 조작·검증. **주의: 프리뷰 탭이 백그라운드면 PixiJS 티커가 멈춰** eval 기반 시간검증이 왜곡됨 → 시간 의존 검증은 Playwright(페이지 활성 유지) 사용.
- **주의(과거 반복 크래시)**: eval 로 `stepWorld` 를 직접 호출할 때 미니 ctx 에 `rng` 를 빠뜨리면 `TypeError: ctx.rng is not a function`. 직접 호출 대신 게임 티커를 쓰거나, 부득이하면 ctx 에 `rng: Math.random` 포함(브라우저 검증용이라 결정론 불필요).

## 헤드리스 가능 모듈 (Node 에서 PIXI·DOM 없이 실행)
`config · world · path · jobs · goals · pawns · sim` — 순수 로직. 테스트 하네스(`tests/harness.mjs`)가 직접 import.
`render(PIXI) · ui(DOM) · audio(Audio) · save(localStorage) · main(혼합)` — 브라우저 전용.

## 알려진 취약점 (불변식 테스트가 감시 중)
- 적 `hp` 상한 클램프 없음(현재 회복 로직 없어 무해, invariants 가 감시).
- 정착민 `px/py` 맵 범위·NaN 가드 없음(greedyStep). invariants 가 감시.
- 이 둘이 실제로 깨지면 world.js 에 방어 추가.
