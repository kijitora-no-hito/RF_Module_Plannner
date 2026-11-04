/* 定数定義: コネクタ種別・ケーブル種別・嵌合ルール・グリッド */
(function (LP) {
  "use strict";

  LP.GRID_SIZE = 25;          // グリッド点の間隔(px)
  LP.SCALE_CM_PER_GRID = 1;   // グリッド1マスの実寸(cm)

  // コネクタ種別
  // family: 嵌合系統(同じ系統同士のみ嵌合) / gender: "m"=オス(プラグ) "f"=メス(ジャック)
  LP.CONNECTORS = {
    "sma-f":    { label: "SMA(メス)",       short: "SMA-F",    family: "sma",   gender: "f", color: "#d4a017" },
    "sma-m":    { label: "SMA(オス)",       short: "SMA-M",    family: "sma",   gender: "m", color: "#d4a017" },
    "rpsma-f":  { label: "RP-SMA(メス)",    short: "RP-SMA-F", family: "rpsma", gender: "f", color: "#e67e22" },
    "rpsma-m":  { label: "RP-SMA(オス)",    short: "RP-SMA-M", family: "rpsma", gender: "m", color: "#e67e22" },
    "ufl-f":    { label: "U.FL(基板側)",    short: "U.FL",     family: "ufl",   gender: "f", color: "#9b59b6" },
    "ufl-m":    { label: "U.FL(プラグ)",    short: "U.FL-P",   family: "ufl",   gender: "m", color: "#9b59b6" },
    "n-f":      { label: "N型(メス)",       short: "N-F",      family: "n",     gender: "f", color: "#8d6e63" },
    "n-m":      { label: "N型(オス)",       short: "N-M",      family: "n",     gender: "m", color: "#8d6e63" },
    "bnc-f":    { label: "BNC(メス)",       short: "BNC-F",    family: "bnc",   gender: "f", color: "#607d8b" },
    "bnc-m":    { label: "BNC(オス)",       short: "BNC-M",    family: "bnc",   gender: "m", color: "#607d8b" },
    "usb-a-f":  { label: "USB-A(メス)",     short: "USB-A",    family: "usb-a", gender: "f", color: "#27ae60" },
    "usb-a-m":  { label: "USB-A(オス)",     short: "USB-A-M",  family: "usb-a", gender: "m", color: "#27ae60" },
    "usb-c-f":  { label: "USB-C(メス)",     short: "USB-C",    family: "usb-c", gender: "f", color: "#145a32" },
    "usb-c-m":  { label: "USB-C(オス)",     short: "USB-C-M",  family: "usb-c", gender: "m", color: "#145a32" },
    "usb-mb-f": { label: "microUSB(メス)",  short: "µUSB",     family: "usb-mb", gender: "f", color: "#52be80" },
    "usb-mb-m": { label: "microUSB(オス)",  short: "µUSB-M",   family: "usb-mb", gender: "m", color: "#52be80" },
    "dc-f":     { label: "DCジャック",      short: "DC-J",     family: "dc",    gender: "f", color: "#222222" },
    "dc-m":     { label: "DCプラグ",        short: "DC-P",     family: "dc",    gender: "m", color: "#222222" },
    "lan-f":    { label: "LAN(RJ45ジャック)", short: "LAN",    family: "lan",   gender: "f", color: "#2980b9" },
    "lan-m":    { label: "LAN(RJ45プラグ)", short: "LAN-P",    family: "lan",   gender: "m", color: "#2980b9" }
  };

  // 給電方向(ポート単位の pwr 属性): "in"=受電 / "out"=給電
  LP.PWR_LABELS = { "in": "受電", "out": "給電" };

  // 信号方向(ポート単位の sig 属性): クロック出力どうしの接続などを防ぐ。未指定は双方向
  LP.SIG_LABELS = { "in": "信号入力", "out": "信号出力" };

  // 配置カテゴリ(パレット見出し・表示切替・チェックリストの分類)
  LP.CATEGORIES = [
    { key: "antenna", label: "アンテナ" },
    { key: "rf",      label: "RF部品" },
    { key: "clock",   label: "リファレンスクロック" },
    { key: "device",  label: "機器・モジュール" },
    { key: "power",   label: "電源" }
  ];

  LP.categoryLabel = function (key) {
    for (var i = 0; i < LP.CATEGORIES.length; i++) {
      if (LP.CATEGORIES[i].key === key) { return LP.CATEGORIES[i].label; }
    }
    return key;
  };

  // 市販ケーブルの標準長さ(cm)。必要長さ以上で最短のものを推奨する
  LP.STANDARD_LENGTHS_CM = [10, 15, 20, 30, 50, 100, 150, 200, 300, 500, 1000];

  // ケーブル種別: ends = [端Aのコネクタ, 端Bのコネクタ](ケーブル側のコネクタ)
  // direct: true は「直結」(機器同士のコネクタを直接嵌合。ケーブル扱いしない)
  LP.CABLE_TYPES = {
    "coax-sma-mm":    { label: "同軸 SMA(オス)-SMA(オス)",       group: "RF",   color: "#b8860b", ends: ["sma-m", "sma-m"] },
    "coax-sma-mf":    { label: "同軸延長 SMA(オス)-SMA(メス)",   group: "RF",   color: "#caa43a", ends: ["sma-m", "sma-f"] },
    "coax-rpsma-mm":  { label: "同軸 RP-SMA(オス)-RP-SMA(オス)", group: "RF",   color: "#e67e22", ends: ["rpsma-m", "rpsma-m"] },
    "coax-sma-rpsma": { label: "同軸 SMA(オス)-RP-SMA(オス)",    group: "RF",   color: "#d35400", ends: ["sma-m", "rpsma-m"] },
    "pigtail-ufl-sma":{ label: "ピグテール U.FL-SMA(メス)",      group: "RF",   color: "#9b59b6", ends: ["ufl-m", "sma-f"] },
    "coax-sma-n":     { label: "同軸 SMA(オス)-N(オス)",         group: "RF",   color: "#8d6e63", ends: ["sma-m", "n-m"] },
    "coax-sma-bnc":   { label: "同軸 SMA(オス)-BNC(オス)",       group: "RF",   color: "#607d8b", ends: ["sma-m", "bnc-m"] },
    "usb-a-c":        { label: "USB A-C",                        group: "USB",  color: "#27ae60", ends: ["usb-a-m", "usb-c-m"] },
    "usb-c-c":        { label: "USB C-C",                        group: "USB",  color: "#145a32", ends: ["usb-c-m", "usb-c-m"] },
    "usb-a-mb":       { label: "USB A-microB",                   group: "USB",  color: "#52be80", ends: ["usb-a-m", "usb-mb-m"] },
    "usb-ext-a":      { label: "USB延長 A(オス)-A(メス)",        group: "USB",  color: "#82c91e", ends: ["usb-a-m", "usb-a-f"] },
    "usb-dc":         { label: "USB-DC電源ケーブル",             group: "電源", color: "#444444", ends: ["usb-a-m", "dc-m"] },
    "dc-ext":         { label: "DC延長ケーブル",                 group: "電源", color: "#222222", ends: ["dc-m", "dc-f"] },
    "lan":            { label: "LANケーブル",                    group: "その他", color: "#2980b9", ends: ["lan-m", "lan-m"] },
    "direct":         { label: "直結(直付け・差し込み)",         group: "その他", color: "#888888", direct: true }
  };

  // コネクタ a と b が嵌合するか(同系統かつオス/メスの組み合わせ)
  LP.mates = function (a, b) {
    var ca = LP.CONNECTORS[a], cb = LP.CONNECTORS[b];
    if (!ca || !cb) { return false; }
    return ca.family === cb.family && ca.gender !== cb.gender;
  };

  // 嵌合しない理由(ユーザー向けの説明)
  function mismatchReason(a, b) {
    var ca = LP.CONNECTORS[a], cb = LP.CONNECTORS[b];
    if (ca.family === cb.family) {
      return ca.label + " と " + cb.label + " は" +
        (ca.gender === "m" ? "オス" : "メス") + "同士のため嵌合しません";
    }
    var rf = ["sma", "rpsma"];
    if (rf.indexOf(ca.family) >= 0 && rf.indexOf(cb.family) >= 0) {
      return "SMA と RP-SMA は中心ピンの有無が逆のため嵌合しません(" + ca.label + " / " + cb.label + ")";
    }
    return ca.label + " と " + cb.label + " は形状が異なり嵌合しません";
  }

  // portType に接続し得るケーブル端インデックス(0/1)の配列
  LP.compatibleEnds = function (cableType, portType) {
    var def = LP.CABLE_TYPES[cableType];
    if (!def) { return []; }
    if (def.direct) { return [0]; }
    var result = [];
    if (LP.mates(def.ends[0], portType)) { result.push(0); }
    if (LP.mates(def.ends[1], portType)) { result.push(1); }
    return result;
  };

  // 1点目(pendingPort, 使用端 pendingEndIndex)から targetPort へ接続できるか
  // pendingPort / targetPort はポート定義 {type, pwr}
  // 戻り値: null = 接続可 / 文字列 = 不可の理由
  LP.connectError = function (cableType, pendingEndIndex, pendingPort, targetPort) {
    var def = LP.CABLE_TYPES[cableType];
    if (def.direct) {
      if (!LP.mates(pendingPort.type, targetPort.type)) {
        return mismatchReason(pendingPort.type, targetPort.type);
      }
    } else {
      var need = def.ends[1 - pendingEndIndex];
      if (!LP.mates(need, targetPort.type)) {
        return def.label + " の反対側は接続できません: " + mismatchReason(need, targetPort.type);
      }
    }
    if (pendingPort.pwr && targetPort.pwr && pendingPort.pwr === targetPort.pwr) {
      return pendingPort.pwr === "out"
        ? "給電側どうしの接続です(受電側のポートに接続してください)"
        : "受電側どうしの接続です(どちらにも電源が来ません)";
    }
    if (pendingPort.sig && targetPort.sig && pendingPort.sig === targetPort.sig) {
      return pendingPort.sig === "out"
        ? "信号出力どうしの接続です(クロック出力などは入力側のポートへ接続してください)"
        : "信号入力どうしの接続です(どちらにも信号が来ません)";
    }
    return null;
  };

  LP.STORAGE_KEY = "rf-planner:v1:autosave";
  LP.SCHEMA_VERSION = 1;
})(window.LP = window.LP || {});
