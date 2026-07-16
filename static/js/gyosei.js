/* ==========================================================================
   八千代 -yachiyo-  |  gyosei.js
   「きょうの、一首」の日替わり（CONCEPT §5.1-d）。

   Frozen-Flask で静的化すると、サーバが選んだ一首が“ビルドした日”のまま固まる。
   そこで、閲覧者のローカル日付（年内通算日）で選び直して差し替える。

     ・歌集は /data/gyosei.json（app.py が data/gyosei.txt から出す）。
       440首を HTML に埋め込むと index.html が 700KB になるので、**別ファイルを
       非同期で取りにいく**（最初の描画をブロックしない）。
     ・選び方はサーバ側 pick_today_gyosei() と同じ「通算日 % 首数」。
     ・JS が無い／落ちた／取得に失敗した場合は、サーバ選出の一首がそのまま残る（劣化しない）。

   歌の組み方:
     ・五七五七七（5句）は縦書きで、字下げ 0・1・2・0・1 字
     ・それ以外の形（漢詩・俳句・遺偈）は 0・1 の繰り返し
     ・欧文は縦書きにできないので横書きで出す（latin フラグ）
   ========================================================================== */
(function () {
  "use strict";

  var root = document.querySelector("[data-today-gyosei]");
  if (!root) return;

  var src = root.getAttribute("data-gyosei-src");
  if (!src || !window.fetch) return;      // 取りにいけない環境はサーバ選出のまま

  var INDENT_5 = [0, 1, 2, 0, 1];
  var INDENT_N = [0, 1, 0, 1, 0, 1, 0, 1];

  /* 1970-01-01 からの通日。サーバの (date.today() - date(1970,1,1)).days と同じ数え方。
     年内通算日（1〜366）で割ると、441首では 367首目以降が永久に選ばれない（剰余が
     常に通算日そのものになるため）。通日なら 441 日で一巡し、全首が必ず出る。
     ローカル時刻どうしの引き算だと夏時間の切替をまたぐ日で1日狂うので、
     暦日だけを取り出して UTC で引く（Date.UTC には夏時間が無い）。 */
  function dayNumber(d) {
    return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  }

  function put(sel, value) {
    var el = root.querySelector(sel);
    if (el && value) el.textContent = value;
  }

  /* 空の項目は行ごと隠す（よみの無い欧文・説明の無い天皇など） */
  function putOrHide(sel, value) {
    var el = root.querySelector(sel);
    if (!el) return;
    el.textContent = value || "";
    el.hidden = !value;
  }

  function renderPoem(el, g) {
    if (!el) return;
    var units = (g.units && g.units.length) ? g.units : [g.poem];
    var indent = (units.length === 5) ? INDENT_5 : INDENT_N;
    el.classList.toggle("gyosei--yoko", !!g.latin);

    var frag = document.createDocumentFragment();
    for (var i = 0; i < units.length; i++) {
      var ku = document.createElement("span");
      ku.className = "gyosei__ku gyosei__ku--i" + indent[i % indent.length];
      ku.textContent = units[i];
      frag.appendChild(ku);
    }
    el.textContent = "";
    el.appendChild(frag);
  }

  function render(g) {
    renderPoem(root.querySelector("[data-gyosei-poem]"), g);
    put("[data-gyosei-plain]", g.poem);      // 読み上げ・コピー用の一続きの原文
    put("[data-gyosei-meaning]", g.meaning);
    put("[data-gyosei-author]", g.author);

    putOrHide("[data-gyosei-kana]", g.kana);
    putOrHide("[data-gyosei-year]", g.year);
    putOrHide("[data-gyosei-who]", g.author_note);

    /* 見出しの「きょうの、○○」も種別に合わせる（御製／辞世／和歌／漢詩／遺偈） */
    var label = root.querySelector(".home-word__label");
    if (label && g.kind) label.textContent = "きょうの、" + g.kind;

    /* 年が無いときは中黒も出さない */
    var sep = root.querySelector(".home-word__sep");
    if (sep) sep.hidden = !g.year;
  }

  /* きょうの一首 → その解説記事（posts/waka-<idx>）へのリンクを差し替える。
     idx と記事スラッグは 1:1（記事は歌集の並びから機械生成）。
     href の書き換えだけにして、パス前置（/yachiyo/ 等）はサーバ出力のまま活かす。 */
  function renderLinks(i) {
    var n = ("00" + i).slice(-3);
    var as = root.querySelectorAll("[data-gyosei-link]");
    for (var k = 0; k < as.length; k++) {
      var href = as[k].getAttribute("href");
      if (href) as[k].setAttribute("href", href.replace(/waka-\d+/, "waka-" + n));
    }
  }

  window.fetch(src, { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (poems) {
      if (!Array.isArray(poems) || !poems.length) return;
      var i = dayNumber(new Date()) % poems.length;
      var g = poems[i];
      if (g && g.poem) { render(g); renderLinks(i); }
    })
    .catch(function () { /* 取れなければサーバ選出のまま。何もしない */ });
})();
