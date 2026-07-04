# 🏝️ 타이니 콜로니 (Tiny Colony)

림월드 스타일의 브라우저 콜로니 생존 시뮬레이션. 빌드 도구 없는 순수 정적 웹앱 (바닐라 JS + PixiJS 7).

**v0.3 — Tiny Swords 비주얼 리메이크**: 바다 위 절차 생성 섬, 64px 아트, 유닛 6프레임 애니메이션(대기·걷기·망치·도끼·운반), 완성형 건물(집·망루·성·모닥불), 금광 채굴, 양 방목, 시간대 색보정 + 밤 광원(모닥불·창문), 이벤트 피드.

## 플레이

정적 서버로 열면 바로 실행됩니다:

```bash
npx serve -p 5800 .
# → http://localhost:5800
```

## 조작

| 입력 | 동작 |
|------|------|
| 우클릭/휠클릭 드래그 | 화면 이동 (WASD·방향키도 가능) |
| 마우스 휠 | 확대/축소 |
| 좌클릭 드래그 | 선택한 도구로 구역 지정 |
| Space | 일시정지 / 재개 |
| 1 · 2 · 3 | 게임 속도 |

## 시스템 (v0.1 수직 슬라이스)

- **절차 생성 맵** 64×64 — 숲 군집·바위·버섯 (시드 기반)
- **정착민 3명** — 포만감·기력·체력 욕구, 자율 작업 AI (A* 길찾기)
- **작업 지시** — 벌목 / 채광 / 채집 / 취소
- **건설** — 나무 벽 · 돌 벽 · 바닥 · 침대 (설계도 → 자재 운반 → 건설 자동 체인)
- **비축 구역** — 흩어진 자원 자동 운반·적재
- **낮밤 주기** — 밤 어둡기, 매일 아침 버섯 재생
- **생존** — 굶주림 → 체력 감소 → 사망(유령)
- **저장/불러오기** — localStorage

## 아키텍처

| 파일 | 역할 |
|------|------|
| `js/config.js` | 상수·타일시트 매핑·건설/욕구 정의 |
| `js/world.js` | 월드 상태·절차 생성·아이템 적재 |
| `js/path.js` | A* 길찾기 (이진 힙) |
| `js/jobs.js` | 작업 탐색·예약 시스템 |
| `js/pawns.js` | 정착민 상태기계 (욕구→식사/수면/작업) |
| `js/render.js` | PixiJS 렌더러 (레이어·카메라·밤 오버레이) |
| `js/ui.js` | DOM HUD (도구·시계·자원·정착민 패널) |
| `js/save.js` | localStorage 직렬화 |
| `js/main.js` | 게임 루프·입력·도구 적용 |
| `tiles.html` | 개발용 타일시트 인덱스 피커 |

로직(world/jobs/pawns)과 렌더(render)가 분리되어 있어 추후 엔진 이식이 쉽습니다.

## 로드맵

- [x] ~~물·호수 지형~~ (v0.2 — Kenney RPG 팩 + 호숫가 오토타일)
- [x] ~~정착민 걷기 애니메이션~~ (v0.2 — Ninja Adventure 4방향×4프레임)
- [ ] 습격 이벤트 (야생동물·도적) + 전투 — Ninja Adventure 몬스터 스프라이트 확보됨
- [ ] 농사 (밭 구역 → 파종 → 수확)
- [ ] 요리·모닥불(타일 확보: rpg 13·14), 온도/계절
- [ ] BGM·효과음 (Ninja Adventure 사운드 CC0)
- [ ] 정착민 영입·특성·기분
- [ ] 문(도어), 구역별 방 인식
- [ ] 모바일 터치 조작

## 개발 도구

- `tiles.html` — town/dungeon 시트 인덱스 피커
- `picker.html` — 파라미터형 시트 피커 (`?u=&cols=&rows=&sp=&px=&r0=&r1=&c0=&c1=`) — rpg 시트(57×31, 간격1px) 매핑에 사용
- `candidates.html` — 에셋 팩 후보 비교 (2026-07-02 조사)
- 헤드리스 스크린샷: Playwright는 `--use-gl=angle` 필수 (기본 GL이면 WebGL 캡처가 백지)

## 크레딧

- 아트(v0.3 메인): [Pixel Frog — Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords) — 무료·상업 사용 가능, 에셋 단독 재배포 금지 (이 저장소의 `assets/ts/`는 게임 구동용이며 에셋팩 재배포가 아닙니다. 에셋이 필요하면 원본 페이지에서 받아 주세요)
- 아트(구버전): [Kenney](https://kenney.nl) Roguelike/RPG·Tiny Town·Tiny Dungeon (CC0), [pixel-boy — Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack) (CC0)
- 건물(집·창고·대장간·치료소·목장·망루·가시벽): [Kenney — Medieval RTS](https://kenney.nl/assets/medieval-rts) (CC0). `assets/mrts/`.
- 공성 병기(특화 초소 — 투석기·석궁탑·속사탑): [LPC Siege Weapons — bluecarrot16 외](https://opengameart.org/content/lpc-siege-weapons) (CC-BY 4.0 / CC-BY 3.0 / OGA-BY 3.0). `assets/siege/` 는 게임 구동용이며, 전체 기여자 명단·라이선스는 원본 OpenGameArt 페이지를 따릅니다.
- 언데드 몬스터(좀비·스켈레톤, 대침공 혼합군): [Zombie and Skeleton 32x48 — Reemax / artisticdude](https://opengameart.org/content/zombie-and-skeleton-32x48) (CC0). `assets/monsters/`.
- 최종 보스 「악마후배」: [Red Demons (Animated) - Classic Hero Edit — Umz](https://opengameart.org/content/red-demons-animated-classic-hero-edit) (CC0). `assets/monsters/demon.png`.
- 섬의 수호신 「아보랑카도」: [Angels — AntumDeluge (원작 Svetlana Kushnariova)](https://opengameart.org/content/angels) (CC-BY 3.0). `assets/goddess/`.
- 배경 장식(소품·초가집 폐허 4종·우물·성문·잔디 텍스처 변형): [The Fan-tasy Tileset (Free) — Ventilatore](https://ventilatore.itch.io/the-fantasy-tileset) — 무료 버전, **비상업용 한정**·수정 가능·재배포 금지. `assets/fantasy/`.
- 야생동물(곰·사슴·사자·늑대는 여우 재사용): [LPC bears, deer, lions and more — tapatilorenzo (원작 Sevarihk)](https://opengameart.org/content/lpc-bears-deer-lions-and-more) (CC-BY 4.0). 호랑이는 전용 그림이 없어 사자 그림에 색조를 입혀 대체. `assets/wild/`.
- 야생동물(말): [LPC Horses — bluecarrot16](https://opengameart.org/content/lpc-horses) (CC-BY 3.0 / CC-BY-SA 3.0 / GPL 2.0 / GPL 3.0 / OGA-BY 3.0). `assets/wild/horse.png`.
- 렌더링: [PixiJS](https://pixijs.com) 7 (MIT)
