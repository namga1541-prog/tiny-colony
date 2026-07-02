// 간단 오디오: BGM 루프 + 효과음 풀 + 음소거. 브라우저 자동재생 정책상 첫 입력 후 BGM 시작.
var SFX = {
  build: 'assets/audio/build.wav',
  chop: 'assets/audio/chop.wav',
  attack: 'assets/audio/attack.wav',
  coin: 'assets/audio/coin.wav',
  success: 'assets/audio/success.wav',
  alert: 'assets/audio/alert.wav',
};

export function createAudio() {
  var muted = false;
  var started = false;
  var bgm = new Audio('assets/audio/bgm.ogg');
  bgm.loop = true;
  bgm.volume = 0.28;

  // 효과음은 몇 개 미리 로드, 재생 시 복제해 겹침 허용
  var cache = {};
  for (var k in SFX) { cache[k] = new Audio(SFX[k]); cache[k].volume = 0.5; }

  function startBgm() {
    if (started || muted) return;
    started = true;
    bgm.play().catch(function () { started = false; }); // 정책 거부 시 다음 입력에 재시도
  }

  function play(name) {
    if (muted) return;
    var base = cache[name];
    if (!base) return;
    try {
      var s = base.cloneNode();
      s.volume = base.volume;
      s.play().catch(function () {});
    } catch (e) { /* noop */ }
  }

  function toggleMute() {
    muted = !muted;
    if (muted) { bgm.pause(); }
    else if (started) { bgm.play().catch(function () {}); }
    return muted;
  }

  return { startBgm: startBgm, play: play, toggleMute: toggleMute, isMuted: function () { return muted; } };
}
