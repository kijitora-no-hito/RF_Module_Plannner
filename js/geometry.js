/* 幾何計算(純関数): スナップ・多角形・ポート座標・ケーブル経路・長さ */
(function (LP) {
  "use strict";

  // グリッドスナップ
  LP.snap = function (v, grid) {
    return Math.round(v / grid) * grid;
  };

  LP.snapPoint = function (x, y, grid) {
    return [LP.snap(x, grid), LP.snap(y, grid)];
  };

  // 多角形の重心(ラベル配置用の簡易版: 頂点平均)
  LP.polygonCenter = function (points) {
    var sx = 0, sy = 0;
    points.forEach(function (p) { sx += p[0]; sy += p[1]; });
    return [sx / points.length, sy / points.length];
  };

  // 点の回転(cx,cy中心, deg度)
  LP.rotatePoint = function (x, y, cx, cy, deg) {
    var rad = deg * Math.PI / 180;
    var dx = x - cx, dy = y - cy;
    return [
      cx + dx * Math.cos(rad) - dy * Math.sin(rad),
      cy + dx * Math.sin(rad) + dy * Math.cos(rad)
    ];
  };

  // アイテムの実効サイズ(個別指定があればそれを、なければテンプレート値)
  LP.itemSize = function (item, template) {
    return {
      w: item.w || template.width,
      h: item.h || template.height
    };
  };

  // 辺上の位置(t: 0〜1)→ 回転前座標
  function sidePoint(item, w, h, side, t) {
    if (side === "t") { return [item.x + w * t, item.y]; }
    if (side === "r") { return [item.x + w, item.y + h * t]; }
    if (side === "b") { return [item.x + w * t, item.y + h]; }
    return [item.x, item.y + h * t]; // "l"
  }

  // アイテムのポート座標を計算(回転適用後の絶対座標)
  // ポートの side 指定ごとにその辺へ等間隔配置。side 未指定のポートは周囲に等間隔配置
  LP.portPositions = function (item, template) {
    var ports = template.ports;
    if (ports.length === 0) { return []; }
    var size = LP.itemSize(item, template);
    var w = size.w, h = size.h;
    var cx = item.x + w / 2, cy = item.y + h / 2;
    var rot = item.rotation || 0;

    var bySide = { t: [], r: [], b: [], l: [] };
    var free = [];
    ports.forEach(function (p, i) {
      if (p.side && bySide[p.side]) { bySide[p.side].push(i); } else { free.push(i); }
    });

    var raw = new Array(ports.length);
    var sides = new Array(ports.length);
    Object.keys(bySide).forEach(function (side) {
      var list = bySide[side];
      list.forEach(function (portIndex, k) {
        raw[portIndex] = sidePoint(item, w, h, side, (k + 0.5) / list.length);
        sides[portIndex] = side;
      });
    });
    var perimeter = 2 * (w + h);
    free.forEach(function (portIndex, k) {
      var d = perimeter * (k + 0.5) / free.length;
      var pt, side;
      if (d < w) { pt = [item.x + d, item.y]; side = "t"; }
      else if (d < w + h) { pt = [item.x + w, item.y + (d - w)]; side = "r"; }
      else if (d < 2 * w + h) { pt = [item.x + w - (d - w - h), item.y + h]; side = "b"; }
      else { pt = [item.x, item.y + h - (d - 2 * w - h)]; side = "l"; }
      raw[portIndex] = pt;
      sides[portIndex] = side;
    });

    return ports.map(function (port, i) {
      var r = LP.rotatePoint(raw[i][0], raw[i][1], cx, cy, rot);
      // 外向き法線(回転は90°単位なので整数に丸める)
      var o = OUTWARD[sides[i]];
      var n = LP.rotatePoint(o[0], o[1], 0, 0, rot);
      return {
        port: port, x: r[0], y: r[1], cx: cx, cy: cy,
        nx: Math.round(n[0]), ny: Math.round(n[1])
      };
    });
  };

  var OUTWARD = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1] };

  // 回転後の外接矩形(回転は90°単位)
  LP.itemBounds = function (item, template) {
    var size = LP.itemSize(item, template);
    var cx = item.x + size.w / 2, cy = item.y + size.h / 2;
    var quarter = Math.round((item.rotation || 0) / 90) % 2 === 1;
    var hw = (quarter ? size.h : size.w) / 2;
    var hh = (quarter ? size.w : size.h) / 2;
    return { l: cx - hw, t: cy - hh, r: cx + hw, b: cy + hh };
  };

  // ケーブルのベジェパス(軽い垂み)
  LP.cablePath = function (x1, y1, x2, y2) {
    var mx = (x1 + x2) / 2;
    var my = (y1 + y2) / 2;
    var dist = Math.hypot(x2 - x1, y2 - y1);
    var sag = Math.min(30, dist * 0.15) + 8; // 距離に応じた垂み
    return "M " + x1 + " " + y1 +
      " Q " + mx + " " + (my + sag) + " " + x2 + " " + y2;
  };

  // ズームに応じた実効グリッド(ズームインで細かく、アウトで粗く)
  // 画面上の点間隔が約15〜40pxに収まるよう2倍/半分に切り替える
  LP.effectiveGrid = function (settings, zoom) {
    var px = settings.gridSize;          // 基準: 25px = 1cm
    var cm = settings.scaleCmPerGrid;
    while (px * zoom > 40 && cm > 0.26) { px /= 2; cm /= 2; } // 最小 0.25cm
    while (px * zoom < 15 && cm < 4) { px *= 2; cm *= 2; }     // 最大 4cm
    return { px: px, cm: cm };
  };

  // px距離 → 実寸(cm)
  LP.pxToCm = function (px, settings) {
    var grid = (settings && settings.gridSize) || LP.GRID_SIZE;
    var scale = (settings && settings.scaleCmPerGrid) || LP.SCALE_CM_PER_GRID;
    return px / grid * scale;
  };

  // 長さ表示(1cm 未満切り上げ、100cm 以上は m 表記)
  LP.formatLength = function (cm) {
    var c = Math.ceil(cm);
    if (c >= 100) { return (c / 100).toFixed(2).replace(/\.?0+$/, "") + "m"; }
    return c + "cm";
  };

  // 必要長さ以上で最短の市販標準長さ(cm)。範囲外は null
  LP.recommendedLength = function (cm) {
    var list = LP.STANDARD_LENGTHS_CM;
    for (var i = 0; i < list.length; i++) {
      if (list[i] >= cm) { return list[i]; }
    }
    return null;
  };

  // ケーブルの最小要求長さ(cm) = ポート間の直線距離
  LP.cableLengthCm = function (x1, y1, x2, y2, settings) {
    return LP.pxToCm(Math.hypot(x2 - x1, y2 - y1), settings);
  };

  // クライアント座標 → SVG座標
  LP.clientToSvg = function (svg, clientX, clientY) {
    var pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    var m = svg.getScreenCTM();
    if (!m) { return [0, 0]; }
    var p = pt.matrixTransform(m.inverse());
    return [p.x, p.y];
  };
})(window.LP = window.LP || {});
