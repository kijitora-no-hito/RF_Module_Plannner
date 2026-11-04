/* ケーブル配線: 部品を避ける直交ルーティング(A*)・平行ケーブルのずらし・交差のジャンプ描画 */
(function (LP) {
  "use strict";

  var STEP = 12.5;          // 経路グリッドの基本間隔(px) = 半グリッド
  var MARGIN = 8;           // 部品の周囲に確保する余白(px)
  var STUB = 14;            // ポートから真っ直ぐ引き出す長さ(px)。MARGIN より大きくする
  var BEND_COST = 20;       // 曲がり1回のコスト(px 換算)
  var OVERLAP_COST = 8;     // 既存ケーブルと近接・平行に重なる長さ1pxあたりのコスト
  var CROSS_COST = 6;       // 既存ケーブルとの交差1回のコスト
  var NEAR = STEP * 0.6;    // この距離未満で平行に走ると「重なり」とみなす
  var PADS = [150, 600];    // 探索範囲(端点の外接矩形からの余白)。見つからなければ広げる

  // ---- 既存ケーブルの占有情報(バケットで近傍検索) ----
  function Occupancy() {
    this.h = {}; // 水平線分: バケット(floor(y/STEP)) → [{y, x1, x2}]
    this.v = {}; // 垂直線分: バケット(floor(x/STEP)) → [{x, y1, y2}]
  }
  Occupancy.prototype.add = function (a, b) {
    if (a[1] === b[1] && a[0] !== b[0]) {
      push(this.h, a[1], { y: a[1], x1: Math.min(a[0], b[0]), x2: Math.max(a[0], b[0]) });
    } else if (a[0] === b[0] && a[1] !== b[1]) {
      push(this.v, a[0], { x: a[0], y1: Math.min(a[1], b[1]), y2: Math.max(a[1], b[1]) });
    }
  };
  function push(map, coord, seg) {
    var k = Math.floor(coord / STEP);
    (map[k] = map[k] || []).push(seg);
  }
  function near(map, coord) {
    var k = Math.floor(coord / STEP);
    return [].concat(map[k - 1] || [], map[k] || [], map[k + 1] || []);
  }
  // 水平辺 (x1..x2, y) を通るときの追加コスト
  Occupancy.prototype.costH = function (y, x1, x2) {
    var c = 0;
    near(this.h, y).forEach(function (s) {
      if (Math.abs(s.y - y) < NEAR) {
        var ov = Math.min(x2, s.x2) - Math.max(x1, s.x1);
        if (ov > 0) { c += ov * OVERLAP_COST; }
      }
    });
    var vs = near(this.v, (x1 + x2) / 2);
    for (var i = 0; i < vs.length; i++) {
      var s = vs[i];
      if (s.x > x1 && s.x < x2 && y > s.y1 && y < s.y2) { c += CROSS_COST; }
    }
    return c;
  };
  Occupancy.prototype.costV = function (x, y1, y2) {
    var c = 0;
    near(this.v, x).forEach(function (s) {
      if (Math.abs(s.x - x) < NEAR) {
        var ov = Math.min(y2, s.y2) - Math.max(y1, s.y1);
        if (ov > 0) { c += ov * OVERLAP_COST; }
      }
    });
    var hs = near(this.h, (y1 + y2) / 2);
    for (var i = 0; i < hs.length; i++) {
      var s = hs[i];
      if (s.y > y1 && s.y < y2 && x > s.x1 && x < s.x2) { c += CROSS_COST; }
    }
    return c;
  };

  // ---- 最小ヒープ ----
  function Heap() { this.a = []; }
  Heap.prototype.push = function (f, v) {
    var a = this.a, i = a.length;
    a.push([f, v]);
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) { break; }
      var t = a[p]; a[p] = a[i]; a[i] = t; i = p;
    }
  };
  Heap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      var i = 0, n = a.length;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < n && a[l][0] < a[m][0]) { m = l; }
        if (r < n && a[r][0] < a[m][0]) { m = r; }
        if (m === i) { break; }
        var t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  };

  // 範囲 [lo, hi] の座標線(STEP の倍数 + 必須座標)
  function gridLines(lo, hi, extra) {
    var list = [];
    for (var v = Math.ceil(lo / STEP) * STEP; v <= hi; v += STEP) { list.push(v); }
    extra.forEach(function (e) { if (e >= lo && e <= hi) { list.push(e); } });
    list.sort(function (a, b) { return a - b; });
    var out = [];
    list.forEach(function (v) {
      if (out.length === 0 || v - out[out.length - 1] > 0.01) { out.push(v); }
    });
    return out;
  }

  function inside(obs, x, y) {
    for (var i = 0; i < obs.length; i++) {
      var o = obs[i];
      if (x > o.l && x < o.r && y > o.t && y < o.b) { return true; }
    }
    return false;
  }

  // 方向: 0=+x 1=-x 2=+y 3=-y
  var DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
  function dirOf(nx, ny) {
    if (nx > 0) { return 0; }
    if (nx < 0) { return 1; }
    if (ny > 0) { return 2; }
    return 3;
  }

  // A* で s → g の直交経路を探す。見つからなければ null
  // sDir: s から出発する向き / gDir: g に到着すべき向き
  function search(s, g, sDir, gDir, obstacles, occ, pad) {
    var minX = Math.min(s[0], g[0]) - pad, maxX = Math.max(s[0], g[0]) + pad;
    var minY = Math.min(s[1], g[1]) - pad, maxY = Math.max(s[1], g[1]) + pad;
    var obs = obstacles.filter(function (o) {
      return o.r > minX && o.l < maxX && o.b > minY && o.t < maxY;
    });
    var xs = gridLines(minX, maxX, [s[0], g[0]]);
    var ys = gridLines(minY, maxY, [s[1], g[1]]);
    var nx = xs.length, ny = ys.length, N = nx * ny;
    var si = xs.indexOf(s[0]) + ys.indexOf(s[1]) * nx;
    var gi = xs.indexOf(g[0]) + ys.indexOf(g[1]) * nx;

    var blocked = new Uint8Array(N);
    for (var j = 0; j < ny; j++) {
      for (var i = 0; i < nx; i++) {
        if (inside(obs, xs[i], ys[j])) { blocked[j * nx + i] = 1; }
      }
    }
    blocked[si] = 0;
    blocked[gi] = 0;

    var S = N * 4;
    var gCost = new Float64Array(S).fill(Infinity);
    var from = new Int32Array(S).fill(-1);
    var closed = new Uint8Array(S);
    var heap = new Heap();
    var gx = g[0], gy = g[1];
    function h(idx) {
      return Math.abs(xs[idx % nx] - gx) + Math.abs(ys[Math.floor(idx / nx)] - gy);
    }
    var start = si * 4 + sDir;
    gCost[start] = 0;
    heap.push(h(si), start);

    var goalState = -1;
    while (heap.a.length > 0) {
      var cur = heap.pop()[1];
      if (closed[cur]) { continue; }
      closed[cur] = 1;
      var node = cur >> 2, dir = cur & 3;
      if (node === gi) { goalState = cur; break; }
      var ci = node % nx, cj = (node - ci) / nx;
      for (var d = 0; d < 4; d++) {
        if ((d ^ 1) === dir) { continue; } // Uターン禁止
        var ni = ci + DX[d], nj = cj + DY[d];
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) { continue; }
        var nn = nj * nx + ni;
        if (blocked[nn]) { continue; }
        var x1 = xs[ci], y1 = ys[cj], x2 = xs[ni], y2 = ys[nj];
        if (inside(obs, (x1 + x2) / 2, (y1 + y2) / 2)) { continue; }
        var len = Math.abs(x2 - x1) + Math.abs(y2 - y1);
        var c = gCost[cur] + len + (d !== dir ? BEND_COST : 0);
        c += d < 2 ? occ.costH(y1, Math.min(x1, x2), Math.max(x1, x2))
                   : occ.costV(x1, Math.min(y1, y2), Math.max(y1, y2));
        if (nn === gi && d !== gDir) { c += BEND_COST; } // ポートへ向かう向きと違えば曲がりが1回増える
        var ns = nn * 4 + d;
        if (c < gCost[ns]) {
          gCost[ns] = c;
          from[ns] = cur;
          heap.push(c + h(nn), ns);
        }
      }
    }
    if (goalState < 0) { return null; }
    var pts = [];
    for (var st = goalState; st >= 0; st = from[st]) {
      var nd = st >> 2;
      pts.push([xs[nd % nx], ys[Math.floor(nd / nx)]]);
    }
    return pts.reverse();
  }

  // 同一直線上の中間点を除去
  function simplify(pts) {
    var out = [];
    pts.forEach(function (p) {
      var n = out.length;
      if (n > 0 && out[n - 1][0] === p[0] && out[n - 1][1] === p[1]) { return; }
      if (n >= 2) {
        var a = out[n - 2], b = out[n - 1];
        if ((a[0] === b[0] && b[0] === p[0]) || (a[1] === b[1] && b[1] === p[1])) {
          out[n - 1] = p;
          return;
        }
      }
      out.push(p);
    });
    return out;
  }

  // 探索に失敗したときの簡易経路(L字)
  function fallback(s, g) {
    return [s, [g[0], s[1]], g];
  }

  function polylineLength(pts) {
    var len = 0;
    for (var i = 1; i < pts.length; i++) {
      len += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
    }
    return len;
  }

  // ケーブル端のポート位置と外向き法線
  function endpoint(cableEnd) {
    var item = LP.findItem(cableEnd.itemId);
    if (!item) { return null; }
    var tpl = LP.findTemplate(LP.state.doc, item.templateId);
    if (!tpl) { return null; }
    var list = LP.portPositions(item, tpl);
    for (var i = 0; i < list.length; i++) {
      if (list[i].port.id === cableEnd.portId) { return list[i]; }
    }
    return null;
  }

  // 1本分の経路を求める
  function routeCable(pa, pb, obstacles, occ) {
    var a = [pa.x, pa.y], b = [pb.x, pb.y];
    var sa = [pa.x + pa.nx * STUB, pa.y + pa.ny * STUB];
    var sb = [pb.x + pb.nx * STUB, pb.y + pb.ny * STUB];
    var path = null;
    for (var i = 0; i < PADS.length && !path; i++) {
      path = search(sa, sb, dirOf(pa.nx, pa.ny), dirOf(-pb.nx, -pb.ny), obstacles, occ, PADS[i]);
    }
    if (!path) { path = fallback(sa, sb); }
    return simplify([a].concat(path, [b]));
  }

  // ---- 全ケーブルの経路(状態が変わらなければキャッシュを返す) ----
  var cacheKey = null;
  var cacheRoutes = {};

  function signature() {
    var doc = LP.state.doc;
    return JSON.stringify([
      doc.items.map(function (it) { return [it.id, it.templateId, it.x, it.y, it.w, it.h, it.rotation]; }),
      doc.cables.map(function (c) { return [c.id, c.type, c.a, c.b]; }),
      doc.templates.map(function (t) { return [t.id, t.width, t.height, t.ports.length]; })
    ]);
  }

  // 戻り値: cableId → { points: [[x,y],...], lengthPx }
  LP.getRoutes = function () {
    var key = signature();
    if (key === cacheKey) { return cacheRoutes; }
    var doc = LP.state.doc;
    var obstacles = [];
    doc.items.forEach(function (item) {
      var tpl = LP.findTemplate(doc, item.templateId);
      if (!tpl) { return; }
      var bb = LP.itemBounds(item, tpl);
      obstacles.push({ l: bb.l - MARGIN, t: bb.t - MARGIN, r: bb.r + MARGIN, b: bb.b + MARGIN });
    });
    var occ = new Occupancy();
    var routes = {};
    doc.cables.forEach(function (cable) {
      var def = LP.CABLE_TYPES[cable.type];
      var pa = endpoint(cable.a), pb = endpoint(cable.b);
      if (!def || !pa || !pb) { return; }
      var pts = def.direct
        ? [[pa.x, pa.y], [pb.x, pb.y]] // 直結はコネクタ同士を直線で結ぶ
        : routeCable(pa, pb, obstacles, occ);
      if (!def.direct) {
        for (var i = 1; i < pts.length; i++) { occ.add(pts[i - 1], pts[i]); }
      }
      routes[cable.id] = { points: pts, lengthPx: polylineLength(pts) };
    });
    cacheKey = key;
    cacheRoutes = routes;
    return routes;
  };

  // ---- 交差のジャンプ描画 ----
  // 後から描くケーブル(index が大きい)が、先に描いたケーブルを半円でまたぐ
  // 戻り値: cableId → SVG path の d
  LP.routePaths = function (hopRadius) {
    var routes = LP.getRoutes();
    var below = []; // 既に描いた線分 {a, b}
    var result = {};
    LP.state.doc.cables.forEach(function (cable) {
      var route = routes[cable.id];
      if (!route) { return; }
      var pts = route.points;
      var direct = LP.CABLE_TYPES[cable.type].direct;
      var d = "M " + pts[0][0] + " " + pts[0][1];
      for (var i = 1; i < pts.length; i++) {
        var p = pts[i - 1], q = pts[i];
        d += direct ? " L " + q[0] + " " + q[1] : segmentWithHops(p, q, below, hopRadius);
      }
      if (!direct) {
        for (var k = 1; k < pts.length; k++) { below.push({ a: pts[k - 1], b: pts[k] }); }
      }
      result[cable.id] = d;
    });
    return result;
  };

  function segmentWithHops(p, q, below, r) {
    var horiz = p[1] === q[1];
    var len = Math.abs(horiz ? q[0] - p[0] : q[1] - p[1]);
    var sign = (horiz ? q[0] - p[0] : q[1] - p[1]) > 0 ? 1 : -1;
    // この線分と直交して交わる既存線分の位置(p からの距離)
    var hits = [];
    below.forEach(function (s) {
      var sh = s.a[1] === s.b[1];
      if (sh === horiz) { return; }
      var t, cross;
      if (horiz) {
        cross = s.a[0];
        if (Math.min(s.a[1], s.b[1]) >= p[1] || Math.max(s.a[1], s.b[1]) <= p[1]) { return; }
        t = (cross - p[0]) * sign;
      } else {
        cross = s.a[1];
        if (Math.min(s.a[0], s.b[0]) >= p[0] || Math.max(s.a[0], s.b[0]) <= p[0]) { return; }
        t = (cross - p[1]) * sign;
      }
      if (t > r * 1.5 && t < len - r * 1.5) { hits.push(t); }
    });
    hits.sort(function (a, b) { return a - b; });
    // 近すぎるジャンプは1つにまとめる
    var merged = [];
    hits.forEach(function (t) {
      if (merged.length === 0 || t - merged[merged.length - 1] > r * 2.5) { merged.push(t); }
    });
    // ジャンプの向き: 水平線は上へ、垂直線は左へ膨らませる
    var sweep = horiz ? (sign > 0 ? 1 : 0) : (sign > 0 ? 0 : 1);
    var d = "";
    merged.forEach(function (t) {
      var a = pointAt(p, horiz, sign, t - r);
      var b = pointAt(p, horiz, sign, t + r);
      d += " L " + a[0] + " " + a[1] + " A " + r + " " + r + " 0 0 " + sweep + " " + b[0] + " " + b[1];
    });
    return d + " L " + q[0] + " " + q[1];
  }

  function pointAt(p, horiz, sign, t) {
    return horiz ? [p[0] + sign * t, p[1]] : [p[0], p[1] + sign * t];
  }
})(window.LP = window.LP || {});
