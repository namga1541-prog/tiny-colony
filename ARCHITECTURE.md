# ARCHITECTURE.md — 불변 사실 치트시트

> 수정·감사 전에 읽으면 재조사·오탐을 막는다. 코드가 바뀌면 이 문서도 갱신.

## 좌표계
- 타일 그리드 `MAP_W × MAP_H = 128 × 128`(2026-07 확장, 과거 96×96). 인덱스 `idx(x,y)=y*MAP_W+x`, 역변환 `ix(i)`·`iy(i)`.
- 정착민/적: **정수 `x`/`y`**(그리드 스냅) + **실수 `px`/`py`**(보간 위치). 렌더·거리계산은 px/py, 타일 판정은 x/y.
- 지형 코드: `T_WATER=0` · `T_GRASS=1` · `T_SAND=2`. `isWalkable(world,x,y,forEnemy)`(`forEnemy`=적 전용 판정, `enemyBlocked` 건물도 막음)·`inMap` 로 판정.
- 맵은 **두 대륙**(본섬 + 바다 건너 고립 대륙) + **원정 섬 4곳**(보물·식인종·비경·악마의 섬(최종보스) — `world.islands`) + **초특급 희귀 낚시 스팟**(`world.rareFishTile`, 맵당 2~4곳, 해안 물 타일). 섬은 전부 뗏목(bridge)으로만 연결.

## 시간 모델
- `MIN_PER_SEC=6` · `DAY_MIN=1440`(1일=1440게임분) · `SPEED_MULT=[0,1,2.5,5]`(속도 0~3).
- 프레임당 `gameMin = min(30, realSec * 6 * SPEED_MULT[speed])`. `world.timeMin` 누적, `world.day = 1+floor(timeMin/1440)`.
- **진행은 `stepWorld`(sim.js) 가 단독 수행** — dt≤1 게임분 단위로 잘게 틱.

## 재고 모델 (글로벌 스톡)
- 모든 자원은 **`world.stock`** 콜로니 전체 재고(바닥에 안 쌓임). 초기 키 `{ wood, gold, food, iron, meal, leather, meat, delicacy, mealGood, mealFeast }` + 플레이 중 `addItem` 으로 생기는 `wool·carrot·mealVeg`, 무기 `sword·bow·ironSword·ironBow`, 방어구 `leatherArmor·ironArmor` 등. 집계는 `totalRes`(world.js) 가 나열.
- `addItem(world, i, type, n)` / `removeItem(...)`(음수 클램프됨, 안전) / `consumeGlobal(world, type, n)` / `canAfford` / `totalRes`.
- 건설: 착공은 설계도만 배치(자재 즉시 차감 없음, `b.delivered={}`) — `deliver` 잡이 `world.stock` 을 출처로 삼아 왕복하며 `b.delivered` 를 채우고, `bpMissing()===null` 이 되면 `build` 잡으로 전환해 실제 공사가 시작됨(2026-07, `world.items` 물리 적재는 여전히 미사용). 식사: 재고의 meal→food 순으로 그 자리 섭취.
- 저장 용량: `storageCap(world)`(창고 tier 합산) vs `totalStored` → 초과 시 `storageFull`.

## stepWorld / ctx 콜백 계약 (sim.js)
`stepWorld(world, pawns, dtMin, rng, ctx, enemyCbs)` — 게임 진행 SSOT. 효과는 전부 ctx 로 방출.

**ctx (정착민·월드 상태 콜백)**: `rng`, `onWorldChange(i)`, `onItemChange(i)`, `onCropChange(i)`,
`onBuildingChange(b)`, `onBuildingBuilt(b)`, `onEvent(msg)`, `onStorageFull()`, `onDeath(pawn)`,
`onStarving(pawn)`, `onSheepChange()`
**ctx (오케스트레이션 효과 콜백)**: `onTileChange(i)`, `onToast(msg,warn)`, `onSfx(name)`, `onRecruit()`, `onSeasonTint(tint,alpha)`,
`onGoddessDescend(x,y)`(여신 강림 연출·신앙 축복), `onBoatLanding(x,y)`(습격 상륙 배 연출), `onZonesChanged()`(구역 오버레이 갱신), `onPawnStrike(enemy,dmg)`(정착민 강타 타격 이펙트)
**enemyCbs (전투)**: `onHit(pawn,dmg)`, `onPawnDeath(pawn)`, `onEnemyDown(enemy)`, `onTowerFire(tower,enemy)`, `onCannonFire(castle,enemy)`(성 대포 tier 광역), `onGiantJump(e,x,y)`, `onGiantSmash(e,pawn)`(괴민 주먹질 충격), `onDemonLaser(e,tx,ty)`, `onDemonSummon(e,n)`(악마후배 미니 악마 소환), `onBuildingHit(b,dmg)`, `onBuildingDestroyed(b)`, `onObstacleBreak(x,y)`(적이 막은 나무 파괴), `onCropDestroyed(idx)`

- main.js 는 ctx 에 실제 R.*/UI.*/Audio2.*/recruitWanderer 를 연결. 헤드리스 하네스는 기록용 stub 연결.
- **stepWorld 안에서 렌더/DOM/오디오 직접 호출 금지** — 이 규칙이 헤드리스 테스트를 가능케 함.

## 예약락 시스템 (jobs.js) — 스턱버그 원천
`reserve(world, key, pawnId)` / `release(world, key)` / `releaseAllOf(world, pawnId)`. `world.reserved[key]=pawnId`.
- 키 네임스페이스: `bp:<bid>`(건설/배달) · `job:<idx>`(채집) · `mine:<bid>` · `crop:<idx>`(파종/수확) · `craft` · `cook` · `hunt:<sheepId>` · `tame:<sheepId>` · `fish:<idx>` · `eat:<idx>` · `haul:<idx>` · `stock:<idx>`. (구 `item:<idx>` 는 운반→건설 확장 이후 미사용 — 유일 참조하던 `findItemSource` 도 현재 데드코드.)
- **불변식**: 살아있지 않은 정착민이 락을 보유하면 누수(죽으면 releaseAllOf 필수). `abandonJob` 은 releaseAllOf + `stuckCd=15`.
- 길찾기 실패 시 abandonJob 안 하면 자원 영구 잠김 → 스턱.

## RNG / 결정론
- `mulberry32(seed)` 시드 난수. `world.seed` 가 월드 시드. `ambientRng = mulberry32(seed ^ 0x5eed)`(습격·양·목장·영입).
- 초기 정착민: `mulberry32(seed ^ 0x9a3c)`(트레잇·허기) — ambient 스트림과 분리.
- 일일 재생: `mulberry32(seed + day)`. 낚시: `ctx.rng` 경유. 전투 부상 판정(`updateEnemies` 5번째 인자): `stepWorld` 의 `rng` 그대로 전달.
- **새게임 시드**: `?seed=123` URL 파라미터 있으면 사용(재현·테스트), 없으면 `Math.random()`.
- 규칙: 시뮬 로직에 Math.random 직접 금지 — 반드시 주입 rng.

## 세이브 (save.js)
- 키 `tinyColony.save1`, 현재 버전 **`v: 15`**. `loadSaveData` 는 `v !== 15` 이면 null(마이그레이션 없음).
- `world.buildings` 등은 통째 직렬화 → 건물에 필드만 추가하면 버전 안 올려도 됨(읽을 때 폴백).
- 버전 불일치로 로드 실패 시 main.js 가 `hadIncompatibleSave` 를 감지해 "이전 버전이라 불러올 수 없다" 토스트를 띄움(무설명 새 게임 방지).
- **`world.islands` 는 저장 안 함** — `createWorld(seed)` 가 결정론적으로 매번 동일하게 재생성(섬 위치·테마·chest/cannibal/raredeer 개수까지 시드 종속). 플레이 중 변한 부분(상자 개봉·식인종 처치·희귀동물 사냥)은 이미 직렬화되는 `objects`/`enemies`/`sheep` 필드로 정확히 복원됨 — `islands` 자체(메타·discovered 플래그)만 로드 시 초기화(발견 토스트 재발생 가능·무해). 이 설계 덕에 원정 섬 추가가 세이브 버전을 올리지 않음.

## 원정 섬 (world.islands) — 로그라이트 콘텐츠
- `config.js`: `ISLANDS`(위치·반경 비율, 테마: treasure·cannibal·rare·boss) · `CANNIBAL`/`SKELETON`/`DEMON`(적 스탯) · `NATURE.chest`/`NATURE.rareplant`(드롭) · `ANIMALS.raredeer`(희귀 동물, `rareGold` 처치 보너스).
- `world.js` `createWorld` 가 본섬·2번대륙과 멀리 떨어진 4개 원형 섬을 지형에 새김 → 테마별 콘텐츠 배치(보물상자+스켈레톤 수호자/식인종 상주/희귀식물+희귀동물/최종보스 데몬). `world.islands[]` 에 메타 저장(`id,name,icon,theme,cx,cy,r,discovered,cap`).
- `checkIslandDiscovery(world,pawns)`(매 stepWorld 호출) — 정착민이 섬 반경 진입 시 1회 발견 토스트. `dailyIslandRespawn(world,rng)`(매일 아침) — 테마별 종족(식인종/스켈레톤)을 cap 까지 서서히 보충(`ISLAND_GUARD_KIND`/`ISLAND_GUARD_STAT` 맵).
- 채집(`forage` 도구)이 chest/rareplant 도 지정 가능(버섯과 동일 취급). chest 개봉 시 60% 확률로 유물도 획득(`grantRelic`).
- 적 `kind`: `'goblin'`(기본)·`'giant'`(괴민)·`'cannibal'`/`'skeleton'`(원정 섬 상주)·`'raider'`/`'warrior'`(=INVWARRIOR)/`'zombie'`/`'warlord'`(정복자 미니보스)(대침공 혼합군)·`'demon'`(최종 보스)·`'minidemon'`(악마후배가 소환하는 하수인) — `enemyStats(e)` 가 종류별 스탯 분기. **주의: kind 문자열은 `'warrior'`(설정 상수명은 `INVWARRIOR`)** — 둘이 다름.
- **주의**: createWorld 안에 섬 콘텐츠·rng 소비 코드를 추가/삭제하면 이후 지형 생성 순서가 밀려 절대좌표 기반 테스트가 깨질 수 있음(RECIPES.md 레시피 2 함정 참고).

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
