/* 部品・ケーブルリスト: 構成から自動集計・チェック保存・テキストコピー */
(function (LP) {
  "use strict";

  // 部品・機器の集計: templateId → {name, category, count}
  function aggregateItems() {
    var map = {};
    LP.state.doc.items.forEach(function (item) {
      var tpl = LP.findTemplate(LP.state.doc, item.templateId);
      if (!tpl) { return; }
      if (!map[tpl.id]) { map[tpl.id] = { key: tpl.id, name: tpl.name, category: tpl.category, count: 0 }; }
      map[tpl.id].count += 1;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  // ケーブルの集計(直結は除く): type → {name, count, lengths[]}
  function aggregateCables() {
    var map = {};
    LP.state.doc.cables.forEach(function (cable) {
      var def = LP.CABLE_TYPES[cable.type];
      if (!def || def.direct) { return; }
      var key = "cable:" + cable.type;
      if (!map[key]) { map[key] = { key: key, name: def.label, count: 0, lengths: [] }; }
      map[key].count += 1;
      var route = LP.getRoutes()[cable.id]; // 配線経路に沿った長さ
      if (route) {
        map[key].lengths.push(LP.pxToCm(route.lengthPx, LP.state.doc.settings));
      }
    });
    Object.keys(map).forEach(function (k) {
      map[k].lengths.sort(function (a, b) { return a - b; });
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  // 電源未接続の機器名一覧
  function unpoweredNames() {
    var names = [];
    LP.state.doc.items.forEach(function (item) {
      var tpl = LP.findTemplate(LP.state.doc, item.templateId);
      if (tpl && LP.isUnpowered(item, tpl)) { names.push(item.label || tpl.name); }
    });
    return names;
  }

  function isChecked(key) {
    return LP.state.doc.checklist.checked.indexOf(key) >= 0;
  }

  function toggleChecked(key) {
    LP.commit(function (s) {
      var arr = s.doc.checklist.checked;
      var idx = arr.indexOf(key);
      if (idx >= 0) { arr.splice(idx, 1); } else { arr.push(key); }
    });
  }

  function makeRow(entry, detail) {
    var row = document.createElement("label");
    row.className = "checklist-row" + (isChecked(entry.key) ? " checked" : "");
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = isChecked(entry.key);
    cb.addEventListener("change", function () { toggleChecked(entry.key); });
    row.appendChild(cb);
    var name = document.createElement("span");
    name.className = "cname";
    name.textContent = entry.name + (detail ? " " + detail : "");
    row.appendChild(name);
    var count = document.createElement("span");
    count.className = "count";
    count.textContent = "×" + entry.count;
    row.appendChild(count);
    return row;
  }

  // 例: "(15cm, 30cm ×2)" … 推奨標準長さごとの本数
  function cableDetail(entry) {
    if (entry.lengths.length === 0) { return ""; }
    var counts = {}, order = [];
    entry.lengths.forEach(function (cm) {
      var rec = LP.recommendedLength(cm);
      var key = rec ? LP.formatLength(rec) : LP.formatLength(cm) + "以上";
      if (!(key in counts)) { order.push(key); counts[key] = 0; }
      counts[key] += 1;
    });
    return "(" + order.map(function (k) {
      return k + (counts[k] > 1 ? " ×" + counts[k] : "");
    }).join(", ") + ")";
  }

  LP.renderChecklist = function () {
    var body = document.getElementById("checklist-body");
    body.textContent = "";
    var items = aggregateItems();
    var cables = aggregateCables();

    if (items.length === 0 && cables.length === 0) {
      var empty = document.createElement("div");
      empty.className = "checklist-empty";
      empty.textContent = "部品・機器を配置すると必要な部品とケーブルが集計されます。";
      body.appendChild(empty);
      return;
    }

    var groups = LP.CATEGORIES.map(function (cat) {
      return {
        title: cat.label,
        entries: items.filter(function (e) { return e.category === cat.key; }),
        detail: null
      };
    });
    groups.push({ title: "ケーブル(推奨長さ)", entries: cables, detail: cableDetail });

    groups.forEach(function (grp) {
      if (grp.entries.length === 0) { return; }
      var div = document.createElement("div");
      div.className = "checklist-group";
      var h = document.createElement("h3");
      h.textContent = grp.title;
      div.appendChild(h);
      grp.entries.forEach(function (entry) {
        div.appendChild(makeRow(entry, grp.detail ? grp.detail(entry) : ""));
      });
      body.appendChild(div);
    });

    var unpowered = unpoweredNames();
    if (unpowered.length > 0) {
      var warn = document.createElement("div");
      warn.className = "checklist-warn";
      warn.textContent = "⚡ 電源未接続: " + unpowered.join(", ");
      body.appendChild(warn);
    }
  };

  // テキスト形式(共有・買い出し用)
  function checklistText() {
    var lines = [];
    aggregateItems().forEach(function (e) {
      lines.push((isChecked(e.key) ? "☑ " : "☐ ") + e.name + " ×" + e.count);
    });
    aggregateCables().forEach(function (e) {
      var detail = cableDetail(e);
      lines.push((isChecked(e.key) ? "☑ " : "☐ ") + e.name + " ×" + e.count +
        (detail ? " " + detail : ""));
    });
    return lines.join("\n");
  }

  LP.initChecklist = function () {
    document.getElementById("btn-copy-checklist").addEventListener("click", function () {
      var text = checklistText();
      if (!text) {
        LP.toast("コピーする部品がありません");
        return;
      }
      // file:// では navigator.clipboard が使えない場合があるためフォールバック付き
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (e) { /* 無視 */ }
        document.body.removeChild(ta);
        LP.toast("リストをコピーしました");
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          LP.toast("リストをコピーしました");
        }, fallback);
      } else {
        fallback();
      }
    });
    document.getElementById("btn-toggle-checklist").addEventListener("click", function () {
      var panel = document.getElementById("checklist-panel");
      panel.classList.toggle("collapsed");
      this.textContent = panel.classList.contains("collapsed") ? "▲" : "▼";
    });
  };
})(window.LP = window.LP || {});
