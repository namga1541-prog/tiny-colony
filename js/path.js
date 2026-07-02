// A* 길찾기 (4방향, 이진 힙)
import { MAP_W, MAP_H } from './config.js';
import { idx, ix, iy, isWalkable } from './world.js';

var SIZE = MAP_W * MAP_H;
var gScore = new Float32Array(SIZE);
var fScore = new Float32Array(SIZE);
var cameFrom = new Int32Array(SIZE);
var closed = new Uint8Array(SIZE);
var inOpen = new Uint8Array(SIZE);

function heapPush(heap, i) {
  heap.push(i);
  var c = heap.length - 1;
  while (c > 0) {
    var p = (c - 1) >> 1;
    if (fScore[heap[p]] <= fScore[heap[c]]) break;
    var t = heap[p]; heap[p] = heap[c]; heap[c] = t;
    c = p;
  }
}

function heapPop(heap) {
  var top = heap[0];
  var last = heap.pop();
  if (heap.length > 0) {
    heap[0] = last;
    var p = 0;
    for (;;) {
      var l = p * 2 + 1, r = l + 1, m = p;
      if (l < heap.length && fScore[heap[l]] < fScore[heap[m]]) m = l;
      if (r < heap.length && fScore[heap[r]] < fScore[heap[m]]) m = r;
      if (m === p) break;
      var t = heap[p]; heap[p] = heap[m]; heap[m] = t;
      p = m;
    }
  }
  return top;
}

/**
 * (sx,sy) → (tx,ty) 경로. adjacentOk 이면 목표 인접 칸 도달로 성공 처리.
 * 반환: [{x,y}, ...] (시작 칸 제외) 또는 null
 */
export function findPath(world, sx, sy, tx, ty, adjacentOk) {
  if (sx === tx && sy === ty) return [];
  if (adjacentOk && Math.abs(sx - tx) + Math.abs(sy - ty) === 1) return [];

  gScore.fill(Infinity);
  closed.fill(0);
  inOpen.fill(0);

  var start = idx(sx, sy);
  var heap = [];
  gScore[start] = 0;
  fScore[start] = Math.abs(sx - tx) + Math.abs(sy - ty);
  heapPush(heap, start);
  inOpen[start] = 1;
  cameFrom[start] = -1;

  var dx = [1, -1, 0, 0], dy = [0, 0, 1, -1];
  var goal = -1;

  while (heap.length > 0) {
    var cur = heapPop(heap);
    inOpen[cur] = 0;
    if (closed[cur]) continue;
    closed[cur] = 1;

    var cx = ix(cur), cy = iy(cur);
    if ((cx === tx && cy === ty) ||
        (adjacentOk && Math.abs(cx - tx) + Math.abs(cy - ty) === 1)) {
      goal = cur;
      break;
    }

    for (var d = 0; d < 4; d++) {
      var nx = cx + dx[d], ny = cy + dy[d];
      if (!isWalkable(world, nx, ny)) continue;
      var ni = idx(nx, ny);
      if (closed[ni]) continue;
      var tentative = gScore[cur] + 1;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        fScore[ni] = tentative + Math.abs(nx - tx) + Math.abs(ny - ty);
        cameFrom[ni] = cur;
        heapPush(heap, ni);
        inOpen[ni] = 1;
      }
    }
  }

  if (goal < 0) return null;

  var path = [];
  var node = goal;
  while (node !== start && node >= 0) {
    path.push({ x: ix(node), y: iy(node) });
    node = cameFrom[node];
  }
  path.reverse();
  return path;
}
