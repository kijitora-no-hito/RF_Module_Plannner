/* 左パレット: 部品・機器一覧・ケーブル一覧・カスタム登録ダイアログ */
(function (LP) {
  "use strict";

  function portsSummary(tpl) {
    return tpl.ports.map(function (p) {
      return p.label + ": " + LP.CONNECTORS[p.type].label +
        (p.pwr ? "(" + LP.PWR_LABELS[p.pwr] + ")" : "") +
        (p.sig ? "(" + LP.SIG_LABELS[p.sig] + ")" : "");
    }).join("\n") + (tpl.note ? "\n\n" + tpl.note : "");
  }

  // コネクタ短縮名の集計(例: "SMA-F×3 USB-C×1")
  function connectorBadge(tpl) {
    var counts = {}, order = [];
    tpl.ports.forEach(function (p) {
      var s = LP.CONNECTORS[p.type].short;
      if (!(s in counts)) { order.push(s); counts[s] = 0; }
      counts[s] += 1;
    });
    return order.map(function (s) { return s + "×" + counts[s]; }).join(" ");
  }

  function makeItemButton(tpl) {
    // 複製ボタンを内包するため button の入れ子を避けて div にする
    var btn = document.createElement("div");
    btn.className = "palette-item";
    btn.dataset.templateId = tpl.id;
    if (LP.state.ui.mode === "place" && LP.state.ui.placingTemplateId === tpl.id) {
      btn.classList.add("selected");
    }
    btn.title = portsSummary(tpl);

    var sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = tpl.color;
    btn.appendChild(sw);

    var text = document.createElement("span");
    text.className = "pi-text";
    var name = document.createElement("span");
    name.className = "pi-name";
    name.textContent = tpl.name;
    text.appendChild(name);
    if (tpl.ports.length > 0) {
      var info = document.createElement("span");
      info.className = "ports-info";
      info.textContent = connectorBadge(tpl);
      text.appendChild(info);
    }
    btn.appendChild(text);

    // 複製して編集ボタン
    var dup = document.createElement("button");
    dup.type = "button";
    dup.className = "dup-btn";
    dup.textContent = "⧉";
    dup.title = "複製して編集";
    dup.addEventListener("click", function (ev) {
      ev.stopPropagation();
      LP.openTemplateDialog(tpl);
    });
    btn.appendChild(dup);

    btn.addEventListener("click", function () {
      LP.commit(function (s) {
        s.ui.mode = "place";
        s.ui.placingTemplateId =
          (s.ui.placingTemplateId === tpl.id) ? null : tpl.id;
        s.ui.cableType = null;
        s.ui.pendingPort = null;
      });
    });
    return btn;
  }

  function makeCableButton(type) {
    var def = LP.CABLE_TYPES[type];
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "palette-item";
    if (LP.state.ui.mode === "connect" && LP.state.ui.cableType === type) {
      btn.classList.add("selected");
    }
    var sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = def.color;
    btn.appendChild(sw);
    var name = document.createElement("span");
    name.className = "pi-name";
    name.textContent = def.label;
    btn.appendChild(name);
    btn.title = def.direct
      ? "機器のコネクタ同士を直接嵌合させます(アンテナを機器に直付けする場合など)"
      : LP.CONNECTORS[def.ends[0]].label + " ⇔ " + LP.CONNECTORS[def.ends[1]].label;

    btn.addEventListener("click", function () {
      LP.commit(function (s) {
        s.ui.mode = "connect";
        s.ui.cableType = (s.ui.cableType === type) ? null : type;
        s.ui.placingTemplateId = null;
        s.ui.pendingPort = null;
      });
    });
    return btn;
  }

  // パレットのセクション(カテゴリ + ケーブル)を生成(初期化時に1回だけ)
  function makeSection(group, title) {
    var sec = document.createElement("section");
    sec.className = "palette-section";
    sec.dataset.group = group;
    var h2 = document.createElement("h2");
    h2.appendChild(document.createTextNode(title));
    var label = document.createElement("label");
    label.className = "group-toggle";
    label.title = "チェックを外すとキャンバス上で半透過表示になります";
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.dataset.group = group;
    cb.addEventListener("change", function () {
      LP.commit(function (s) {
        var arr = s.doc.settings.hiddenGroups;
        var idx = arr.indexOf(group);
        if (cb.checked && idx >= 0) { arr.splice(idx, 1); }
        if (!cb.checked && idx < 0) { arr.push(group); }
      });
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode("表示"));
    h2.appendChild(label);
    sec.appendChild(h2);
    var items = document.createElement("div");
    items.className = "palette-items";
    sec.appendChild(items);
    return sec;
  }

  LP.initPaletteSections = function () {
    var box = document.getElementById("palette-sections");
    LP.CATEGORIES.forEach(function (cat) {
      box.appendChild(makeSection(cat.key, cat.label));
    });
    box.appendChild(makeSection("cable", "ケーブル・接続"));
  };

  function sectionItems(group) {
    return document.querySelector('.palette-section[data-group="' + group + '"] .palette-items');
  }

  function syncGroupToggles() {
    document.querySelectorAll(".group-toggle input").forEach(function (cb) {
      cb.checked = !LP.isGroupHidden(cb.dataset.group);
    });
  }

  LP.renderPalette = function () {
    syncGroupToggles();
    LP.CATEGORIES.forEach(function (cat) { sectionItems(cat.key).textContent = ""; });
    LP.allTemplates(LP.state.doc).forEach(function (tpl) {
      var box = sectionItems(tpl.category) || sectionItems("device");
      box.appendChild(makeItemButton(tpl));
    });

    // ケーブルは group ごとに小見出しを付ける
    var cab = sectionItems("cable");
    cab.textContent = "";
    var lastGroup = null;
    Object.keys(LP.CABLE_TYPES).forEach(function (type) {
      var group = LP.CABLE_TYPES[type].group;
      if (group !== lastGroup) {
        var h = document.createElement("div");
        h.className = "palette-subhead";
        h.textContent = group;
        cab.appendChild(h);
        lastGroup = group;
      }
      cab.appendChild(makeCableButton(type));
    });

    // モード別ヒント
    var hint = document.getElementById("palette-hint");
    var mode = LP.state.ui.mode;
    if (mode === "area") {
      hint.textContent = "グリッド点をクリックしてエリア(筐体・ベース板など)を作図。最初の点をもう一度クリック / Enter で確定、Esc でキャンセル。";
    } else if (mode === "place") {
      hint.textContent = LP.state.ui.placingTemplateId
        ? "キャンバスの空き場所をクリックして配置。既存アイテムはそのままドラッグで移動可。Esc で解除。"
        : "部品をクリックで選択。ドラッグ移動、右上の丸ハンドルか R で90°回転、右下ハンドルでサイズ変更、Delete で削除、ダブルクリックで名前変更。";
    } else if (mode === "connect") {
      hint.textContent = LP.state.ui.cableType
        ? "緑枠のポートを2つクリックして接続(オス/メス・コネクタ形状をチェックします)。Esc でキャンセル。"
        : "ケーブルを選択すると接続できるポートが緑枠で表示されます。ケーブルをクリック → Delete で削除。";
    }
  };

  // ---- テンプレート登録ダイアログ ----
  var dialog, portsBox;

  function option(sel, value, text, selected) {
    var opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    if (selected) { opt.selected = true; }
    sel.appendChild(opt);
  }

  function addPortRow(port, count) {
    port = port || { type: "sma-f", label: "", side: "" };
    var row = document.createElement("div");
    row.className = "tpl-port-row";

    var type = document.createElement("select");
    type.className = "f-type";
    Object.keys(LP.CONNECTORS).forEach(function (t) {
      option(type, t, LP.CONNECTORS[t].label, t === port.type);
    });

    var label = document.createElement("input");
    label.type = "text";
    label.className = "f-label";
    label.placeholder = "役割名(IN等)";
    label.value = port.label || "";

    var side = document.createElement("select");
    side.className = "f-side";
    [["", "自動"], ["l", "左"], ["r", "右"], ["t", "上"], ["b", "下"]].forEach(function (s) {
      option(side, s[0], s[1], s[0] === (port.side || ""));
    });

    var pwr = document.createElement("select");
    pwr.className = "f-pwr";
    [["", "電源なし"], ["in", "受電"], ["out", "給電"]].forEach(function (s) {
      option(pwr, s[0], s[1], s[0] === (port.pwr || ""));
    });

    var sig = document.createElement("select");
    sig.className = "f-sig";
    [["", "双方向"], ["in", "信号入力"], ["out", "信号出力"]].forEach(function (s) {
      option(sig, s[0], s[1], s[0] === (port.sig || ""));
    });

    var num = document.createElement("input");
    num.type = "number";
    num.className = "f-count";
    num.min = "1";
    num.max = "16";
    num.value = String(count || 1);
    num.title = "個数(2以上は役割名に連番を付加)";

    var del = document.createElement("button");
    del.type = "button";
    del.textContent = "✕";
    del.addEventListener("click", function () { row.remove(); });

    [type, label, side, pwr, sig, num, del].forEach(function (e) { row.appendChild(e); });
    portsBox.appendChild(row);
  }

  // base を渡すと「複製して編集」
  LP.openTemplateDialog = function (base) {
    dialog = document.getElementById("template-dialog");
    portsBox = document.getElementById("tpl-ports");
    portsBox.textContent = "";
    document.getElementById("template-dialog-title").textContent =
      base ? "「" + base.name + "」を複製して登録" : "部品・機器を登録";
    document.getElementById("tpl-name").value = base ? base.name + " (カスタム)" : "";
    document.getElementById("tpl-category").value = base ? base.category : "device";
    document.getElementById("tpl-color").value = base ? base.color : "#4a6fa5";
    document.getElementById("tpl-width").value = base ? LP.pxToCm(base.width) : "";
    document.getElementById("tpl-height").value = base ? LP.pxToCm(base.height) : "";
    if (base) {
      base.ports.forEach(function (p) { addPortRow(p, 1); });
    }
    dialog.showModal();
  };

  function collectPorts() {
    var ports = [];
    var n = 1;
    portsBox.querySelectorAll(".tpl-port-row").forEach(function (row) {
      var type = row.querySelector(".f-type").value;
      var label = row.querySelector(".f-label").value.trim() || LP.CONNECTORS[type].short;
      var side = row.querySelector(".f-side").value;
      var pwr = row.querySelector(".f-pwr").value;
      var sig = row.querySelector(".f-sig").value;
      var count = parseInt(row.querySelector(".f-count").value, 10) || 0;
      for (var i = 0; i < count; i++) {
        var p = { id: "p" + n, type: type, label: label + (count > 1 ? String(i + 1) : "") };
        if (side) { p.side = side; }
        if (pwr) { p.pwr = pwr; }
        if (sig) { p.sig = sig; }
        ports.push(p);
        n += 1;
      }
    });
    return ports;
  }

  LP.initTemplateDialog = function () {
    dialog = document.getElementById("template-dialog");
    portsBox = document.getElementById("tpl-ports");

    var catSel = document.getElementById("tpl-category");
    LP.CATEGORIES.forEach(function (c) { option(catSel, c.key, c.label, c.key === "device"); });

    document.getElementById("btn-add-template").addEventListener("click", function () {
      LP.openTemplateDialog(null);
    });
    document.getElementById("btn-add-port").addEventListener("click", function () {
      addPortRow(null, 1);
    });
    document.getElementById("btn-tpl-cancel").addEventListener("click", function () {
      dialog.close();
    });
    document.getElementById("template-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var name = document.getElementById("tpl-name").value.trim();
      if (!name) { return; }
      var tpl = {
        id: LP.newId("tpl"),
        name: name,
        category: catSel.value,
        builtin: false,
        color: document.getElementById("tpl-color").value,
        ports: collectPorts()
      };
      // サイズ(cm)指定がなければポート数に応じて自動調整
      var wcm = parseFloat(document.getElementById("tpl-width").value);
      var hcm = parseFloat(document.getElementById("tpl-height").value);
      var n = tpl.ports.length;
      var gridPerCm = LP.GRID_SIZE / LP.SCALE_CM_PER_GRID;
      tpl.width = wcm > 0 ? wcm * gridPerCm : Math.max(50, 20 + n * 12);
      tpl.height = hcm > 0 ? hcm * gridPerCm : Math.max(30, 20 + Math.floor(n / 2) * 8);
      LP.commit(function (s) { s.doc.templates.push(tpl); });
      dialog.close();
      LP.toast("「" + name + "」を登録しました");
    });
  };
})(window.LP = window.LP || {});
