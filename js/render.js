/* SVG描画: state → 全レイヤー再描画 */
(function (LP) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  function el(name, attrs, parent) {
    var e = document.createElementNS(SVG_NS, name);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    }
    if (parent) { parent.appendChild(e); }
    return e;
  }
  LP.svgEl = el;

  function clear(node) {
    while (node.firstChild) { node.removeChild(node.firstChild); }
  }

  function layer(id) { return document.getElementById(id); }

  // 拡大時のサイズ補正係数。ポート・文字を画面上で一定サイズに保つ
  // (ズームアウト時は補正しない = 俯瞰時は自然に縮小)
  var zc = 1;
  LP.zoomComp = function () { return zc; };

  function isSelected(type, id) {
    var sel = LP.state.ui.selection;
    return sel && sel.type === type && sel.id === id;
  }

  // ---- エリア(筐体・ベース板など) ----
  function renderAreas() {
    var g = layer("layer-areas");
    clear(g);
    LP.state.doc.areas.forEach(function (area) {
      var grp = el("g", { "class": "area" + (isSelected("area", area.id) ? " selected" : "") }, g);
      grp.dataset.areaId = area.id;
      el("polygon", {
        points: area.points.map(function (p) { return p[0] + "," + p[1]; }).join(" ")
      }, grp);
      var c = LP.polygonCenter(area.points);
      var t = el("text", { x: c[0], y: c[1], "text-anchor": "middle" }, grp);
      t.textContent = area.name;
      t.style.fontSize = (13 / zc) + "px";
    });
  }

  // ---- アイテム(部品・機器) ----
  function renderItems() {
    var g = layer("layer-items");
    var gLabels = layer("layer-labels"); // 名前・警告はケーブルより上に描く
    clear(g);
    clear(gLabels);
    LP.state.doc.items.forEach(function (item) {
      var tpl = LP.findTemplate(LP.state.doc, item.templateId);
      if (!tpl) { return; }
      var size = LP.itemSize(item, tpl);
      var cx = item.x + size.w / 2;
      var cy = item.y + size.h / 2;
      var selected = isSelected("item", item.id);
      var cls = "item" + (selected ? " selected" : "");
      if (LP.isGroupHidden(tpl.category)) { cls += " dimmed"; }
      var unpowered = LP.isUnpowered(item, tpl);
      if (unpowered) { cls += " unpowered"; }
      var outer = el("g", { "class": cls }, g);
      outer.dataset.itemId = item.id;
      var grp = el("g", {
        transform: "rotate(" + (item.rotation || 0) + " " + cx + " " + cy + ")"
      }, outer);
      var body = el("rect", {
        "class": "body", x: item.x, y: item.y,
        width: size.w, height: size.h, fill: tpl.color, rx: 3
      }, grp);
      el("title", null, body).textContent = (item.label || tpl.name) + " (" +
        LP.formatLength(LP.pxToCm(size.w, LP.state.doc.settings)) + " × " +
        LP.formatLength(LP.pxToCm(size.h, LP.state.doc.settings)) + ")" +
        (tpl.note ? "\n" + tpl.note : "");
      // 名前は回転させず、回転後の外接矩形の上に表示(小さい部品でもポートラベルと重ならない)
      var quarter = ((item.rotation || 0) / 90) % 2 === 1;
      var halfH = (quarter ? size.w : size.h) / 2;
      var labels = el("g", { "class": "item-labels" + (LP.isGroupHidden(tpl.category) ? " dimmed" : "") }, gLabels);
      var t = el("text", { "class": "label", x: cx, y: cy - halfH - 7 / zc }, labels);
      t.textContent = item.label || tpl.name;
      t.style.fontSize = (10 / zc) + "px";
      // 電源未接続バッジ(下側)
      if (unpowered) {
        var warn = el("text", {
          "class": "warn-badge", x: cx, y: cy + halfH + 12 / zc
        }, labels);
        warn.textContent = "⚡電源なし";
        warn.style.fontSize = (10 / zc) + "px";
      }
      // 選択中(配置モード)は回転・リサイズハンドルを表示
      if (selected && LP.state.ui.mode === "place") {
        var rh = el("circle", {
          "class": "rotate-handle", cx: item.x + size.w + 10 / zc, cy: item.y - 10 / zc, r: 6 / zc
        }, grp);
        el("title", null, rh).textContent = "クリックで90°回転";
        var hs = 10 / zc; // リサイズハンドルの辺長
        var sh = el("rect", {
          "class": "resize-handle",
          x: item.x + size.w - hs / 2, y: item.y + size.h - hs / 2,
          width: hs, height: hs
        }, grp);
        el("title", null, sh).textContent = "ドラッグでサイズ変更";
      }
    });
  }

  // ---- ポート ----
  function portStateClass(itemId, port) {
    var ui = LP.state.ui;
    var cls = "port";
    if (ui.mode !== "connect") { return cls + " passive"; }
    var used = LP.isPortUsed(itemId, port.id);
    var pending = ui.pendingPort &&
      ui.pendingPort.itemId === itemId && ui.pendingPort.portId === port.id;
    if (pending) { return cls + " pending"; }
    if (used) { return cls + " used"; }
    if (ui.cableType) {
      if (ui.pendingPort) {
        // 2点目: 1点目のポートと接続可能か(嵌合 + 給電方向)
        var pendingDef = LP.findPort(ui.pendingPort.itemId, ui.pendingPort.portId);
        var err = pendingDef
          ? LP.connectError(ui.cableType, ui.pendingPort.endIndex, pendingDef, port)
          : "err";
        cls += err ? " incompatible" : " compatible";
      } else {
        cls += LP.compatibleEnds(ui.cableType, port.type).length > 0 ? " compatible" : " incompatible";
      }
    }
    return cls;
  }

  // 辺の内向き法線(回転前)
  var INWARD = { l: [1, 0], r: [-1, 0], t: [0, 1], b: [0, -1] };

  function renderPorts() {
    var g = layer("layer-ports");
    clear(g);
    LP.state.doc.items.forEach(function (item) {
      var tpl = LP.findTemplate(LP.state.doc, item.templateId);
      if (!tpl || tpl.ports.length === 0) { return; }
      if (LP.isGroupHidden(tpl.category)) { return; } // 半透過中はポートも操作不可
      LP.portPositions(item, tpl).forEach(function (pp) {
        var conn = LP.CONNECTORS[pp.port.type];
        var r = 5 / zc;
        var c = el("circle", {
          "class": portStateClass(item.id, pp.port),
          cx: pp.x, cy: pp.y, r: r,
          fill: conn.color
        }, g);
        c.dataset.itemId = item.id;
        c.dataset.portId = pp.port.id;
        var used = LP.isPortUsed(item.id, pp.port.id);
        el("title", null, c).textContent = (item.label || tpl.name) + " / " + pp.port.label +
          " [" + conn.label + (pp.port.pwr ? " " + LP.PWR_LABELS[pp.port.pwr] : "") +
          (pp.port.sig ? " " + LP.SIG_LABELS[pp.port.sig] : "") + "] " +
          (used ? "使用中" : "空き");
        // メス(ジャック)は中心に白丸を描いて区別
        if (conn.gender === "f") {
          el("circle", { "class": "port-hole", cx: pp.x, cy: pp.y, r: r * 0.42 }, g);
        }
        // 役割名ラベル(辺の内側に表示)
        var n = INWARD[pp.port.side];
        if (!n) {
          var dx = pp.cx - pp.x, dy = pp.cy - pp.y;
          var len = Math.hypot(dx, dy) || 1;
          n = [dx / len, dy / len];
        } else {
          n = LP.rotatePoint(n[0], n[1], 0, 0, item.rotation || 0);
        }
        var fs = 7.5 / zc;
        var textW = pp.port.label.length * fs * 0.62;
        var off = 7 / zc + Math.abs(n[0]) * textW / 2 + Math.abs(n[1]) * fs / 2;
        var lbl = el("text", {
          "class": "port-label", x: pp.x + n[0] * off, y: pp.y + n[1] * off
        }, g);
        lbl.textContent = pp.port.label;
        lbl.style.fontSize = fs + "px";
      });
    });
  }

  // ---- ケーブル ----
  function portXY(cableEnd) {
    var item = LP.findItem(cableEnd.itemId);
    if (!item) { return null; }
    var tpl = LP.findTemplate(LP.state.doc, item.templateId);
    if (!tpl) { return null; }
    var positions = LP.portPositions(item, tpl);
    for (var i = 0; i < positions.length; i++) {
      if (positions[i].port.id === cableEnd.portId) {
        return [positions[i].x, positions[i].y];
      }
    }
    return null;
  }
  LP.portXY = portXY;

  // ケーブル長の説明文(最小長さ + 推奨標準長さ)
  LP.cableLengthText = function (cm) {
    var rec = LP.recommendedLength(cm);
    return "最小" + LP.formatLength(cm) +
      (rec ? " → 推奨" + LP.formatLength(rec) : " (標準長さ超過)");
  };

  function renderCables() {
    var g = layer("layer-cables");
    clear(g);
    var routes = LP.getRoutes();
    var paths = LP.routePaths(5 / zc);
    // 配列順に描画 = 後のケーブルほど上。下地(背景色の縁取り)で交差部の下側を途切れさせる
    LP.state.doc.cables.forEach(function (cable) {
      var def = LP.CABLE_TYPES[cable.type];
      var route = routes[cable.id];
      if (!def || !route) { return; }
      var grp = el("g", {
        "class": "cable" + (def.direct ? " direct" : "") +
          (isSelected("cable", cable.id) ? " selected" : "") +
          (LP.isGroupHidden("cable") ? " dimmed" : "")
      }, g);
      grp.dataset.cableId = cable.id;
      var d = paths[cable.id];
      if (!def.direct) { el("path", { "class": "casing", d: d }, grp); }
      el("path", { "class": "visible", d: d, stroke: def.color }, grp);
      var hit = el("path", { "class": "hit", d: d }, grp);
      if (def.direct) {
        el("title", null, hit).textContent = def.label;
        return;
      }
      var cm = LP.pxToCm(route.lengthPx, LP.state.doc.settings);
      el("title", null, hit).textContent = def.label + " " + LP.cableLengthText(cm);
      // 最も長い区間の中点に長さラベル
      var pts = route.points, best = 1, bestLen = -1;
      for (var i = 1; i < pts.length; i++) {
        var l = Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
        if (l > bestLen) { bestLen = l; best = i; }
      }
      var horiz = pts[best][1] === pts[best - 1][1];
      var label = el("text", {
        "class": "cable-length",
        x: (pts[best][0] + pts[best - 1][0]) / 2 + (horiz ? 0 : 4 / zc),
        y: (pts[best][1] + pts[best - 1][1]) / 2 + (horiz ? -5 / zc : 0)
      }, grp);
      if (!horiz) { label.style.textAnchor = "start"; }
      label.textContent = LP.formatLength(cm);
      label.style.fontSize = (10 / zc) + "px";
    });
  }

  // ---- グリッド点とスケール表示の更新(ズーム連動) ----
  function updateGrid() {
    var eff = LP.effectiveGrid(LP.state.doc.settings, LP.getZoom ? LP.getZoom() : 1);
    var pattern = document.getElementById("grid-dots");
    pattern.setAttribute("width", eff.px);
    pattern.setAttribute("height", eff.px);
    var pos = [[0, 0], [eff.px, 0], [0, eff.px], [eff.px, eff.px]];
    pattern.querySelectorAll(".grid-dot").forEach(function (d, i) {
      d.setAttribute("cx", pos[i][0]);
      d.setAttribute("cy", pos[i][1]);
      d.setAttribute("r", 1.5 / zc);
    });
    var scaleEl = document.getElementById("grid-scale");
    if (scaleEl) { scaleEl.textContent = "1グリッド = " + eff.cm + "cm"; }
  }

  // ---- 全体 ----
  LP.render = function () {
    zc = Math.max(1, LP.getZoom ? LP.getZoom() : 1);
    updateGrid();
    renderAreas();
    renderItems();
    renderCables();
    renderPorts();
    // モードに応じた canvas クラス(パン用クラスを消さないよう classList で操作)
    var canvas = document.getElementById("canvas");
    ["mode-area", "mode-place", "mode-connect"].forEach(function (c) {
      canvas.classList.remove(c);
    });
    canvas.classList.add("mode-" + LP.state.ui.mode);
  };

  // ---- グリッドパターン初期化 ----
  LP.initGrid = function () {
    var pattern = document.getElementById("grid-dots");
    pattern.setAttribute("width", LP.GRID_SIZE);
    pattern.setAttribute("height", LP.GRID_SIZE);
    var dot = pattern.querySelector(".grid-dot");
    dot.setAttribute("cx", 0);
    dot.setAttribute("cy", 0);
    dot.setAttribute("r", 1.5);
    // パターン原点に置くと切れるため4隅に点を複製
    [[0, 0], [LP.GRID_SIZE, 0], [0, LP.GRID_SIZE], [LP.GRID_SIZE, LP.GRID_SIZE]].forEach(function (p, i) {
      if (i === 0) { return; }
      var d = dot.cloneNode();
      d.setAttribute("cx", p[0]);
      d.setAttribute("cy", p[1]);
      pattern.appendChild(d);
    });
  };

  // ---- トースト ----
  var toastTimer = null;
  LP.toast = function (message) {
    var t = document.getElementById("toast");
    t.textContent = message;
    t.classList.add("show");
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  };
})(window.LP = window.LP || {});
