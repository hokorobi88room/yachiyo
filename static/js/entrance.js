/* ==========================================================================
   八千代 -yachiyo-  |  entrance.js
   鳥居エントランスの補助（CONCEPT §2）。トップページでのみ読み込まれる。

   ★退場そのものは entrance.css の @keyframes ent-leave が担う（JS不要）。
     このファイルが落ちても、オーバーレイは必ず不可視・非操作になる。
   ここで面倒を見るのは:
   - 初回/再訪の記録（sessionStorage）と、再訪時の即時撤去
   - クリック/タップ/Esc・Enter・Space による早期スキップ
   - 演出中のスクロールロックと、背後のフォーカス封じ（inert）
   ========================================================================== */
(function () {
  "use strict";

  var overlay = document.querySelector("[data-entrance]");
  if (!overlay) return;                         // partial 未読込でも無害

  var body = document.body;
  var root = document.documentElement;

  // 演出中にフォーカスが背後へ抜けないよう inert にする要素
  var bgEls = [
    document.querySelector(".skip-link"),
    document.querySelector(".site-header"),
    document.getElementById("main"),
    document.querySelector(".site-footer"),
    document.querySelector(".to-top")
  ].filter(Boolean);

  function setInert(on) {
    for (var i = 0; i < bgEls.length; i++) {
      if (on) bgEls[i].setAttribute("inert", "");
      else bgEls[i].removeAttribute("inert");
    }
  }

  try {
    run();
  } catch (e) {
    cleanup();                                  // 例外時も本編を塞がない
  }

  function run() {
    var reduced = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // 初回/再訪の判定（sessionStorage が使えない環境でも動く）
    var KEY = "yachiyo:entered";
    var revisit = false;
    try {
      revisit = !!window.sessionStorage.getItem(KEY);
      window.sessionStorage.setItem(KEY, "1");
    } catch (e) { /* プライベートモード等は初回扱い */ }

    // 同一セッションの再訪（内部リンク遷移含む）は演出せず即本編＝初回のみ体験。
    // ※ head のインライン判定が既に .ent-skip で隠しているので、ここは掃除だけ。
    if (revisit) { cleanup(); return; }

    // 背後をロック（スクロールとフォーカスの両方）
    body.classList.add("entrance-lock");
    root.classList.add("entrance-lock");
    setInert(true);

    // 表示時間は css の総尺と揃える（reduced は静止0.5秒＋フェード）
    var HOLD = reduced ? 1100 : 3400;

    var done = false;
    var timer = window.setTimeout(finish, HOLD);
    var hardCap = window.setTimeout(finish, HOLD + 2500);   // 保険：必ず抜ける

    overlay.addEventListener("click", skip);
    overlay.addEventListener("touchstart", skip, { passive: true });
    document.addEventListener("keydown", onKey, true);

    function onKey(ev) {
      var k = ev.key;
      if (k === "Escape" || k === "Enter" || k === " " || k === "Spacebar") skip();
    }

    function skip() {
      window.clearTimeout(timer);
      finish();
    }

    function finish() {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      window.clearTimeout(hardCap);

      overlay.removeEventListener("click", skip);
      overlay.removeEventListener("touchstart", skip);
      document.removeEventListener("keydown", onKey, true);

      // やわらかくフェードして除去（CSS の ent-leave より早く抜けるとき用）
      overlay.classList.add("is-leaving");
      body.classList.remove("entrance-lock");
      root.classList.remove("entrance-lock");
      setInert(false);

      var removed = false;
      function remove() {
        if (removed) return;
        removed = true;
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }
      overlay.addEventListener("transitionend", remove, { once: true });
      window.setTimeout(remove, 800);           // transition が来ない場合の保険
    }
  }

  function cleanup() {
    if (body) body.classList.remove("entrance-lock");
    if (root) root.classList.remove("entrance-lock");
    setInert(false);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }
})();
