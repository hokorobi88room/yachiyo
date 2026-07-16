/* ==========================================================================
   八千代 -yachiyo-  |  sky.js
   空を「見ている人の時刻」に合わせる。天体の位置と、朝⇄夜空の配色の両方。

   ■ 天体
       6:00  画面の右端（＝東）から昇る
      12:00  中央・天頂
      18:00  左端（＝西）へ沈む
      夜は同じ弧を月がたどる（18:00 東 → 6:00 西）。その日の月齢の形に欠ける。

   ■ 配色（--night : 0=朝 / 1=夜空）
      6:00→7:00 で 1→0、18:00→19:00 で 0→1 へ **1時間かけて** 渡る。
      tokens.css がこの値で朝の組と夜空の組を混ぜるので、境目がなめらかに変わる。

   ■ 手動切替（ヘッダーのボタン）
      ・夜の時間帯に「朝」を選ぶ → 朝9時の空になる（太陽が東寄りの高さに出る）
      ・朝の時間帯に「夜」を選ぶ → 21時の空になる（月が出る）
      ・**保存しない**。次の日の出／日没をまたいだ時点で自動に戻る。

   公開するもの:
      :root --night / --sky-x / --sky-y / --ent-dx / --ent-dy
      <html> .sky-day / .sky-night / .is-dark
   ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var hero = document.querySelector(".hero");

  /* JS が生きているときだけ配色トグルを見せる（無効環境で押せない飾りボタンを残さない） */
  root.classList.add("has-theme-js");

  /* 手動で選んだモード（'light' | 'dark' | null=自動）。localStorage には保存しない。 */
  var override = null;
  /* override を設定したときの「本来の昼夜」。ここが変わったら自動に戻す。 */
  var overrideBase = null;

  /* --- 月齢 ---------------------------------------------------------------
     朔望月は 29.530588853 日。基準の朔: 2000-01-06 18:14 UTC。 */
  var SYNODIC = 29.530588853 * 86400000;
  var NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

  function moonPhase(now) {
    var p = ((now.getTime() - NEW_MOON) % SYNODIC) / SYNODIC;
    return p < 0 ? p + 1 : p;                 // 0=朔 0.25=上弦 0.5=望 0.75=下弦
  }

  /* 明るい部分の輪郭を1本のパスで描く。
     円盤の半径を 50 とすると、明暗境界（ターミネータ）は横半径 |50·cos(2πp)| の楕円弧。
     ・外周の弧 limb : 満ちていく間（p<0.5）は右半円、欠けていく間は左半円が明るい。
     ・境界の弧 term : 掃引の向きが「膨らむ側」を決める。満ち／欠けで反転する。
     明部の面積が理論値 (1-cos2πp)/2 と一致することを検算済み。 */
  function moonPath(p) {
    var e = Math.cos(2 * Math.PI * p) * 50;
    var rx = Math.max(0.01, Math.abs(e));     // rx=0 は退化するのでごく小さい値に
    var waxing = p < 0.5;
    var limb = waxing ? 1 : 0;
    var term = waxing ? (e > 0 ? 0 : 1) : (e > 0 ? 1 : 0);
    return "M50 0 A50 50 0 0 " + limb + " 50 100 A" + rx + " 50 0 0 " + term + " 50 0";
  }

  /* 満月の絵を1枚もらい、その日の月齢の形に**切り抜いて**出す。
     三日月の絵を何枚も用意しなくていい。切り抜きは上のパス（明部の輪郭）。 */
  var moonSeq = 0;
  var lastMoonKey = null;

  function drawMoon(p) {
    /* 1分ごとに呼ばれるが、月齢は1分でほとんど変わらない。
       同じ形なら DOM を作り直さない（無駄な再描画を避ける）。 */
    var key = p.toFixed(4);
    if (key === lastMoonKey) return;
    lastMoonKey = key;

    var moons = document.querySelectorAll("[data-moon]");
    for (var i = 0; i < moons.length; i++) {
      var src = moons[i].getAttribute("data-moon-src");
      var id = "moon-clip-" + (++moonSeq);
      moons[i].innerHTML =
        '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<defs><clipPath id="' + id + '"><path d="' + moonPath(p) + '"/></clipPath></defs>' +
          '<circle class="moon__dark" cx="50" cy="50" r="50"/>' +
          (src
            ? '<image href="' + src + '" x="0" y="0" width="100" height="100" ' +
              'preserveAspectRatio="xMidYMid slice" clip-path="url(#' + id + ')"/>'
            : '<path class="moon__lit" d="' + moonPath(p) + '" fill="#F4EFE4"/>') +
        "</svg>";

      /* 月の絵が 404 やデコード失敗でも「黒い円」で放置しない。
         絵なし側と同じ明色パス（moon__lit）に差し替えて、月であり続けさせる。 */
      (function (el, phase) {
        var im = el.querySelector("image");
        if (!im) return;
        im.addEventListener("error", function () {
          el.removeAttribute("data-moon-src");   // 以後の再描画も明色パスで
          el.innerHTML =
            '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
              '<circle class="moon__dark" cx="50" cy="50" r="50"/>' +
              '<path class="moon__lit" d="' + moonPath(phase) + '" fill="#F4EFE4"/>' +
            "</svg>";
        }, { once: true });
      })(moons[i], p);
    }
  }

  /* --- 夜の度合い（0=朝 / 1=夜空）。境目を1時間かけて渡る -------------------- */
  function nightness(h) {
    if (h >= 19 || h < 6) return 1;            // 夜
    if (h >= 7 && h < 18) return 0;            // 昼
    if (h >= 18) return h - 18;                // 18:00→19:00 で 0→1
    return 1 - (h - 6);                        // 6:00→7:00 で 1→0
  }

  /* --- 反映 ---------------------------------------------------------------- */
  function apply() {
    var now = new Date();
    var realH = now.getHours() + now.getMinutes() / 60;
    var autoNight = (realH < 6 || realH >= 18);

    /* 日の出／日没をまたいだら、手動指定を捨てて自動に戻す（保存しない設定）。
       ここで syncToggle() を呼ばないと、resize 経由の apply() で復帰したとき
       ボタンのラベルと aria-pressed が最大60秒ズレたままになる。 */
    if (override && overrideBase !== null && autoNight !== overrideBase) {
      override = null;
      overrideBase = null;
    }

    /* 昼夜（＝色と、太陽か月かの別）はモード切替に従う。
       ただし**位置は常に実時刻**にする。切替のたびに天体が飛ぶのはおかしいので、
       手動で夜にしても、月は「いま太陽がいる場所」にそのまま出る。 */
    var night = override ? (override === "dark") : autoNight;
    var n = override ? (override === "dark" ? 1 : 0) : nightness(realH);

    root.style.setProperty("--night", n.toFixed(3));
    /* 読み面（文字と地）は 0 か 1 だけ。連続に混ぜると文字が地に溶けて消える。 */
    root.style.setProperty("--ui-night", n >= 0.5 ? "1" : "0");
    root.classList.toggle("sky-night", night);
    root.classList.toggle("sky-day", !night);
    root.classList.toggle("is-dark", n >= 0.5);

    /* モバイルのアドレスバー色も昼夜に追従させる（値は tokens.css の --bg と同じ） */
    var tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute("content", n >= 0.5 ? "#1B2A4A" : "#FDF6E9");

    /* 天体の位置は実時刻の弧をたどる（6時=東端→12時=天頂→18時=西端）。
       昼は 6→18 時、夜は 18→翌6 時を 0..1 に正規化。 */
    var t = autoNight ? (((realH - 18) + 24) % 24) / 12 : (realH - 6) / 12;
    var x = 100 - t * 100;                     // 右（東）→ 左（西）
    var y = 80 - 72 * Math.sin(Math.PI * t);   // 地平 → 天頂 → 地平（少し高めの弧）
    /* ★ この2式は base.html の先読み inline script と**一字一句同一**にすること。
       片方だけ変えると初回フレームの位置がずれ、リロードのたび天体が動いて見える。 */

    root.style.setProperty("--sky-x", x.toFixed(2) + "%");
    root.style.setProperty("--sky-y", y.toFixed(2) + "%");

    if (night) drawMoon(moonPhase(now));

    /* エントランス（fixed の全画面）の天体は left:50% / top:46% が基準。
       そこからヒーローの天体までの「ずれ」を px で渡すと、くぐった先で位置が飛ばない。 */
    if (hero) {
      var r = hero.getBoundingClientRect();
      var bx = r.left + r.width * x / 100;
      var by = r.top + r.height * y / 100;
      root.style.setProperty("--ent-dx", (bx - window.innerWidth * 0.5).toFixed(1) + "px");
      root.style.setProperty("--ent-dy", (by - window.innerHeight * 0.46).toFixed(1) + "px");
    }
  }

  /* --- ヘッダーの切替ボタン ------------------------------------------------- */
  var toggle = document.querySelector("[data-theme-toggle]");

  function currentIsDark() {
    return root.classList.contains("is-dark");
  }

  function syncToggle() {
    if (!toggle) return;
    var dark = currentIsDark();
    /* aria-pressed は付けない。押すと何が起きるかをラベルそのもので示す
       （「押された状態」と「動作ラベル」を両方変えると読み上げが矛盾する）。 */
    var label = toggle.querySelector("[data-theme-label]");
    if (label) label.textContent = dark ? "朝にする" : "夜にする";
    toggle.setAttribute("title", dark ? "朝の配色に切り替える" : "夜の配色に切り替える");
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      var now = new Date();
      var realH = now.getHours() + now.getMinutes() / 60;
      overrideBase = (realH < 6 || realH >= 18);
      override = currentIsDark() ? "light" : "dark";
      apply();
      syncToggle();
    });
  }

  /* apply() のあとは必ずボタンの表示も合わせる（どの経路で呼ばれても） */
  function tick() {
    apply();
    syncToggle();
  }

  tick();

  /* 太陽はゆっくりしか動かないので1分ごとで十分。背景タブでは何もしない
     （drawMoon の SVG 再構築を毎分やらない）。戻ってきた瞬間に一度合わせ直す。 */
  window.setInterval(function () {
    if (document.visibilityState !== "hidden") tick();
  }, 60000);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "hidden") tick();
  });

  /* resize はモバイルのURLバー開閉で連発するため、150ms のデバウンスで間引く */
  var resizeTimer = 0;
  function onResize() {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(tick, 150);
  }
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("orientationchange", onResize);
})();
