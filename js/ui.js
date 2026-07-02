// DOM HUD: 도구·시계·자원·정착민 패널·토스트
import { taskLabel } from './pawns.js';

export function createUI(handlers) {
  var tool = 'select';

  // 도구 버튼
  var toolBtns = document.querySelectorAll('.tool');
  toolBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      toolBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      tool = btn.dataset.tool;
      handlers.onToolChange(tool);
    });
  });

  // 속도 버튼
  var spdBtns = document.querySelectorAll('.spd');
  spdBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      handlers.onSpeed(+btn.dataset.speed);
    });
  });
  function setSpeedUI(speed) {
    spdBtns.forEach(function (b) {
      b.classList.toggle('active', +b.dataset.speed === speed);
    });
  }

  document.getElementById('btnSave').addEventListener('click', handlers.onSave);
  document.getElementById('btnLoad').addEventListener('click', handlers.onLoad);
  document.getElementById('btnNew').addEventListener('click', handlers.onNew);

  // 시계·자원
  var dayLabel = document.getElementById('dayLabel');
  var timeLabel = document.getElementById('timeLabel');
  var resWood = document.getElementById('resWood');
  var resStone = document.getElementById('resStone');
  var resFood = document.getElementById('resFood');
  var resPop = document.getElementById('resPop');

  function updateClock(day, timeMin) {
    var m = Math.floor(timeMin % 1440);
    var hh = String((m / 60) | 0).padStart(2, '0');
    var mm = String(m % 60).padStart(2, '0');
    dayLabel.textContent = day + '일차';
    timeLabel.textContent = hh + ':' + mm;
  }

  function updateRes(sum, alivePawns) {
    resWood.textContent = sum.wood || 0;
    resStone.textContent = sum.stone || 0;
    resFood.textContent = sum.food || 0;
    resPop.textContent = alivePawns;
  }

  // 정착민 패널
  var panel = document.getElementById('pawnPanel');
  var pawnName = document.getElementById('pawnName');
  var pawnTask = document.getElementById('pawnTask');
  var barHunger = document.getElementById('barHunger');
  var barEnergy = document.getElementById('barEnergy');
  var barHp = document.getElementById('barHp');

  function showPawn(pawn) {
    panel.classList.remove('hidden');
    updatePawnPanel(pawn);
  }
  function hidePawn() {
    panel.classList.add('hidden');
  }
  function updatePawnPanel(pawn) {
    pawnName.textContent = pawn.name;
    pawnTask.textContent = taskLabel(pawn);
    barHunger.style.width = pawn.hunger + '%';
    barEnergy.style.width = pawn.energy + '%';
    barHp.style.width = pawn.hp + '%';
  }

  // 토스트
  var toastHost = document.getElementById('toastHost');
  function toast(msg, warn) {
    var el = document.createElement('div');
    el.className = 'toast' + (warn ? ' warn' : '');
    el.textContent = msg;
    toastHost.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.4s';
      setTimeout(function () { el.remove(); }, 450);
    }, 2600);
  }

  return {
    getTool: function () { return tool; },
    setSpeedUI: setSpeedUI,
    updateClock: updateClock,
    updateRes: updateRes,
    showPawn: showPawn,
    hidePawn: hidePawn,
    updatePawnPanel: updatePawnPanel,
    toast: toast,
  };
}
