/* デフォルト部品・機器テンプレート定義 (サイズは px、25px = 1cm) */
(function (LP) {
  "use strict";

  // ポート定義: P(コネクタ, 役割名, 配置辺 "l"|"r"|"t"|"b", 給電方向 "in"|"out")
  function P(type, label, side, pwr) {
    var p = { type: type, label: label, side: side };
    if (pwr) { p.pwr = pwr; }
    return p;
  }

  // 信号方向付きポート(クロック出力/入力など): S(コネクタ, 役割名, 配置辺, 信号方向 "in"|"out")
  function S(type, label, side, sig) {
    var p = P(type, label, side);
    p.sig = sig;
    return p;
  }

  // note: パレット・キャンバスのツールチップに表示する補足
  function T(id, name, category, width, height, color, ports, note) {
    ports.forEach(function (p, i) { p.id = "p" + (i + 1); });
    var tpl = {
      id: id, name: name, category: category, builtin: true,
      width: width, height: height, color: color, ports: ports
    };
    if (note) { tpl.note = note; }
    return tpl;
  }

  LP.DEFAULT_TEMPLATES = [
    // ---- アンテナ ----
    T("tpl-whip", "ホイップアンテナ(SMA)", "antenna", 24, 100, "#7f8c8d", [
      P("sma-m", "ANT", "b")
    ]),
    T("tpl-gps-ant", "GPSアンテナ(アクティブ)", "antenna", 75, 75, "#2c3e50", [
      P("sma-m", "ANT", "b")
    ]),
    T("tpl-wifi-ant", "無線LANアンテナ(RP-SMA)", "antenna", 24, 100, "#566573", [
      P("rpsma-m", "ANT", "b")
    ]),

    // ---- RF部品 ----
    T("tpl-splitter", "RFスプリッター", "rf", 75, 50, "#b7950b", [
      P("sma-f", "IN", "l"),
      P("sma-f", "OUT1", "r"),
      P("sma-f", "OUT2", "r")
    ]),
    T("tpl-tee-fff", "T型分岐 抵抗なし(F-F-F)", "rf", 60, 45, "#c9a227", [
      P("sma-f", "A", "l"),
      P("sma-f", "B", "r"),
      P("sma-f", "C", "b")
    ], "単純な分岐(並列接続)。整合が取れないため反射に注意。クロック分配には抵抗分配器か分配アンプを推奨"),
    T("tpl-tee-mff", "T型分岐 抵抗なし(M-F-F)", "rf", 60, 45, "#c9a227", [
      P("sma-m", "A", "l"),
      P("sma-f", "B", "r"),
      P("sma-f", "C", "b")
    ], "単純な分岐(並列接続)。機器のSMAメスに直挿しできるタイプ"),
    T("tpl-res-splitter", "T型分岐 抵抗あり(抵抗分配器)", "rf", 75, 45, "#8e7417", [
      P("sma-f", "IN", "l"),
      P("sma-f", "OUT1", "r"),
      P("sma-f", "OUT2", "b")
    ], "抵抗型分配(50Ω整合)。各出力は約-6dB、広帯域だが出力間のアイソレーションは小さい"),
    T("tpl-bias-tee", "RFバイアスティー", "rf", 90, 30, "#a04000", [
      P("sma-f", "RF", "l"),
      P("sma-f", "RF+DC", "r")
    ]),
    T("tpl-bias-tee-dc", "RFバイアスティー(DC入力付)", "rf", 90, 40, "#873600", [
      P("sma-f", "RF", "l"),
      P("sma-f", "RF+DC", "r"),
      P("dc-f", "DC IN", "t", "in")
    ]),
    T("tpl-lna", "LNA(低雑音アンプ)", "rf", 75, 40, "#1a5276", [
      P("sma-f", "IN", "l"),
      P("sma-f", "OUT", "r"),
      P("usb-c-f", "PWR", "t", "in")
    ]),
    T("tpl-bpf", "バンドパスフィルタ", "rf", 75, 25, "#6c3483", [
      P("sma-f", "IN", "l"),
      P("sma-f", "OUT", "r")
    ]),
    T("tpl-att", "アッテネータ", "rf", 50, 20, "#7d6608", [
      P("sma-m", "IN", "l"),
      P("sma-f", "OUT", "r")
    ]),
    T("tpl-sma-ff", "SMA中継アダプタ(F-F)", "rf", 30, 20, "#9a7d0a", [
      P("sma-f", "A", "l"),
      P("sma-f", "B", "r")
    ]),

    // ---- リファレンスクロック ----
    T("tpl-ocxo", "OCXO(10MHz)", "clock", 110, 50, "#1f3a5f", [
      S("sma-f", "10M OUT", "r", "out"),
      P("dc-f", "DC IN", "l", "in")
    ], "恒温槽付水晶発振器。ウォームアップに数分かかり、起動時は電流が多い"),
    T("tpl-gpsdo", "GPSDO", "clock", 125, 90, "#154360", [
      P("sma-f", "ANT", "l"),
      S("sma-f", "10M OUT1", "r", "out"),
      S("sma-f", "10M OUT2", "r", "out"),
      S("sma-f", "PPS", "r", "out"),
      P("usb-c-f", "PWR", "b", "in")
    ], "GPS同期発振器。アンテナ端子からアクティブアンテナへ給電するものが多い"),
    T("tpl-rubidium", "ルビジウム発振器", "clock", 125, 75, "#4a235a", [
      S("sma-f", "10M OUT", "r", "out"),
      S("sma-f", "1PPS", "r", "out"),
      P("dc-f", "DC IN", "l", "in")
    ]),
    T("tpl-clock-dist", "クロック分配アンプ(1→4)", "clock", 100, 60, "#2e4053", [
      S("sma-f", "REF IN", "l", "in"),
      S("sma-f", "OUT1", "r", "out"),
      S("sma-f", "OUT2", "r", "out"),
      S("sma-f", "OUT3", "r", "out"),
      S("sma-f", "OUT4", "r", "out"),
      P("dc-f", "DC IN", "t", "in")
    ], "出力間のアイソレーションを確保してリファレンスを分配する"),

    // ---- 機器・モジュール ----
    T("tpl-gps", "GPSモジュール", "device", 75, 60, "#117a65", [
      P("sma-f", "ANT", "l"),
      P("usb-c-f", "USB", "r", "in")
    ]),
    T("tpl-sdr", "SDR受信機(USBドングル)", "device", 100, 30, "#34495e", [
      P("sma-f", "ANT", "l"),
      P("usb-a-m", "USB", "r", "in")
    ]),
    T("tpl-sdr-trx", "SDR送受信機(REF/PPS入力付)", "device", 150, 90, "#283747", [
      P("sma-f", "TX", "l"),
      P("sma-f", "RX", "l"),
      S("sma-f", "REF IN", "t", "in"),
      S("sma-f", "PPS IN", "t", "in"),
      P("usb-c-f", "USB", "r", "in")
    ]),
    T("tpl-lora", "LoRaモジュール", "device", 75, 50, "#1e8449", [
      P("sma-f", "ANT", "l"),
      P("usb-c-f", "USB", "r", "in")
    ]),
    T("tpl-wlan", "無線LANアダプタ", "device", 60, 25, "#5b2c6f", [
      P("rpsma-f", "ANT", "l"),
      P("usb-a-m", "USB", "r", "in")
    ]),
    T("tpl-esp32", "ESP32開発ボード(U.FL)", "device", 70, 30, "#21618c", [
      P("ufl-f", "ANT", "l"),
      P("usb-c-f", "USB", "r", "in")
    ]),
    T("tpl-nanovna", "NanoVNA", "device", 100, 75, "#4a235a", [
      P("sma-f", "CH0", "t"),
      P("sma-f", "CH1", "t"),
      P("usb-c-f", "USB", "b")
    ]),
    T("tpl-rpi", "Raspberry Pi", "device", 212, 140, "#922b21", [
      P("usb-a-f", "USB1", "r", "out"),
      P("usb-a-f", "USB2", "r", "out"),
      P("usb-a-f", "USB3", "r", "out"),
      P("usb-a-f", "USB4", "r", "out"),
      P("lan-f", "LAN", "r"),
      P("usb-c-f", "PWR", "b", "in")
    ]),
    T("tpl-pc", "PC", "device", 150, 100, "#4a6fa5", [
      P("lan-f", "LAN", "l"),
      P("usb-a-f", "USB1", "r", "out"),
      P("usb-a-f", "USB2", "r", "out"),
      P("usb-a-f", "USB3", "r", "out"),
      P("usb-c-f", "USB-C", "r", "out")
    ]),

    T("tpl-usb-hub", "USBハブ(バスパワー・4ポート)", "device", 100, 75, "#5d6d7e", [
      P("usb-a-m", "UP", "l", "in"),
      P("usb-a-f", "USB1", "r", "out"),
      P("usb-a-f", "USB2", "r", "out"),
      P("usb-a-f", "USB3", "r", "out"),
      P("usb-a-f", "USB4", "r", "out")
    ], "ケーブル直付けタイプ(UPはUSB-Aオス、PCへ直結)。合計消費電流は上流ポートの供給能力以内に"),
    T("tpl-usb-hub-sp", "USBハブ(セルフパワー・4ポート)", "device", 110, 80, "#4d5656", [
      P("usb-c-f", "UP", "l"),
      P("usb-a-f", "USB1", "r", "out"),
      P("usb-a-f", "USB2", "r", "out"),
      P("usb-a-f", "USB3", "r", "out"),
      P("usb-a-f", "USB4", "r", "out"),
      P("dc-f", "DC IN", "t", "in")
    ], "ACアダプタ給電。消費電流の多い機器(OCXO・LNAなど)をまとめる場合に"),

    // ---- 電源 ----
    T("tpl-usb-psu", "USB電源アダプタ", "power", 50, 50, "#e67e22", [
      P("usb-a-f", "USB-A", "r", "out"),
      P("usb-c-f", "USB-C", "r", "out")
    ]),
    T("tpl-battery", "モバイルバッテリー", "power", 100, 50, "#ca6f1e", [
      P("usb-a-f", "USB-A", "r", "out"),
      P("usb-c-f", "USB-C", "r", "out")
    ]),
    T("tpl-dc-psu", "DC電源アダプタ", "power", 60, 40, "#424949", [
      P("dc-m", "DC OUT", "r", "out")
    ])
  ];

  // テンプレート検索(デフォルト + カスタム)
  LP.findTemplate = function (doc, templateId) {
    var i;
    for (i = 0; i < LP.DEFAULT_TEMPLATES.length; i++) {
      if (LP.DEFAULT_TEMPLATES[i].id === templateId) { return LP.DEFAULT_TEMPLATES[i]; }
    }
    for (i = 0; i < doc.templates.length; i++) {
      if (doc.templates[i].id === templateId) { return doc.templates[i]; }
    }
    return null;
  };

  LP.allTemplates = function (doc) {
    return LP.DEFAULT_TEMPLATES.concat(doc.templates);
  };
})(window.LP = window.LP || {});
