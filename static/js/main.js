/* ==========================================================================
   八千代 -yachiyo-  |  main.js
   サイト共通の挙動。DOM契約（base.html）のフックだけを狙い、
   要素が無くてもエラーにならない防御的実装にする。
   - ハンバーガー（600px未満） [data-nav-burger] / [data-nav]
   - カテゴリ ドロップダウン開閉  [data-nav-toggle] / [data-nav-menu] / [data-nav-group]
   - スティッキーヘッダーの影     [data-header] に .is-scrolled
   - ヘッダー高を --header-h に公開（フォント適用・リサイズに追従）
   - トップへ戻る                 [data-to-top]（.is-visible）
   - スクロール促し               [data-scroll-cue]
   - 著作年の当年更新             [data-year]（静的化でビルド年に固定されるため）
   モーションは prefers-reduced-motion を尊重（スムーズ→auto）。
   ========================================================================== */
(function () {
  "use strict";

  var MQ_MOBILE = "(max-width: 599.98px)";

  var mqReduce = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  function reduced() { return !!mqReduce.matches; }
  function behavior() { return reduced() ? "auto" : "smooth"; }

  function isMobile() {
    return !!(window.matchMedia && window.matchMedia(MQ_MOBILE).matches);
  }

  // スクロール系はフレームに1回だけ処理する
  function rafThrottle(fn) {
    var ticking = false;
    return function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        fn();
      });
    };
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  ready(function () {
    initNav();
    initHeaderShrink();
    initHeaderHeightVar();
    initToTop();
    initScrollCue();
    initYear();
  });

  /* --- 0. ヘッダー高を CSS 変数に公開 -------------------------------------- */
  // ヒーローが --header-h を差し引くことで、ヘッダー＋ヒーローが“ちょうど1画面”に収まる。
  // tokens.css に既定値 71px があるので JS 実行前もズレないが、Webフォント適用後・
  // リサイズ後の実寸に追従させるためここで測り直す。
  function initHeaderHeightVar() {
    var header = document.querySelector("[data-header]");
    if (!header) return;
    var root = document.documentElement;
    var last = -1;

    function apply() {
      var h = Math.round(header.offsetHeight);
      if (h === last || h <= 0) return;      // 値が変わらないときは書かない
      last = h;
      root.style.setProperty("--header-h", h + "px");
    }
    apply();

    // Webフォントの swap でヘッダー高が変わるので、適用後に測り直す
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(apply).catch(function () { /* 無視 */ });
    }
    // ナビの折返しやハンバーガー開閉でも高さが変わる
    if (window.ResizeObserver) {
      new window.ResizeObserver(rafThrottle(apply)).observe(header);
    } else {
      window.addEventListener("resize", rafThrottle(apply), { passive: true });
      window.addEventListener("orientationchange", apply);
    }
  }

  /* --- 1. ハンバーガー ＋ カテゴリのドロップダウン --------------------------- */
  function initNav() {
    var header = document.querySelector("[data-header]");
    var nav = document.querySelector("[data-nav]");
    var burger = document.querySelector("[data-nav-burger]");
    var toggle = document.querySelector("[data-nav-toggle]");
    var menu = document.querySelector("[data-nav-menu]");
    var group = document.querySelector("[data-nav-group]");

    /* 1-a. ハンバーガー（モバイルのみ。JS がある時だけナビを畳む） */
    if (header && nav && burger) {
      header.classList.add("has-js-nav");     // CSS 側はこのクラスが付いた時だけ畳む

      var navOpen = function () {
        return burger.getAttribute("aria-expanded") === "true";
      };
      var setNav = function (open) {
        burger.setAttribute("aria-expanded", open ? "true" : "false");
        nav.hidden = !open;
      };
      // モバイルでは既定で閉じる。デスクトップでは常に開いた（＝通常の水平ナビ）状態。
      var syncNav = function () {
        if (isMobile()) {
          if (!navOpen()) nav.hidden = true;
        } else {
          burger.setAttribute("aria-expanded", "false");
          nav.hidden = false;                 // 水平ナビは常に見える
        }
      };
      syncNav();
      window.addEventListener("resize", rafThrottle(syncNav), { passive: true });

      burger.addEventListener("click", function () {
        setNav(!navOpen());
      });

      // 外側クリック／Esc で閉じる（モバイルのみ意味を持つ）
      document.addEventListener("click", function (ev) {
        if (!isMobile() || !navOpen()) return;
        if (header.contains(ev.target)) return;
        setNav(false);
      });
      document.addEventListener("keydown", function (ev) {
        if (ev.key !== "Escape") return;
        if (!isMobile() || !navOpen()) return;
        setNav(false);
        burger.focus();
      });
    }

    /* 1-b. きづき（カテゴリ）のドロップダウン */
    if (!toggle || !menu) return;

    function isOpen() {
      return toggle.getAttribute("aria-expanded") === "true";
    }
    function open() {
      toggle.setAttribute("aria-expanded", "true");
      menu.hidden = false;
    }
    function close(focusBack) {
      toggle.setAttribute("aria-expanded", "false");
      menu.hidden = true;
      if (focusBack) toggle.focus();
    }

    toggle.addEventListener("click", function (ev) {
      ev.preventDefault();
      if (isOpen()) close(false); else open();
    });

    // 外側クリックで閉じる
    document.addEventListener("click", function (ev) {
      if (!isOpen()) return;
      var inside = group ? group.contains(ev.target)
                         : (toggle.contains(ev.target) || menu.contains(ev.target));
      if (!inside) close(false);
    });

    // メニュー内のリンクを選んだら閉じる（同一ページ内アンカーでも開きっぱなしにしない）
    menu.addEventListener("click", function (ev) {
      var link = ev.target && ev.target.closest ? ev.target.closest("a") : null;
      if (link) close(false);
    });

    // Tab でメニュー外へ出たら閉じる（キーボードで開きっぱなしにならないように）
    if (group) {
      group.addEventListener("focusout", function (ev) {
        if (!isOpen()) return;
        var next = ev.relatedTarget;
        if (next && group.contains(next)) return;   // まだグループ内
        close(false);
      });
    }

    // Esc で閉じてトグルへフォーカスを戻す
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && isOpen()) close(true);
    });
  }

  /* --- 2. スティッキーヘッダー（影だけ。高さは変えない＝レイアウトシフト無し）- */
  function initHeaderShrink() {
    var header = document.querySelector("[data-header]");
    if (!header) return;
    var THRESHOLD = 8;
    var state = null;
    var update = function () {
      var on = window.pageYOffset > THRESHOLD;
      if (on === state) return;               // 変化した時だけ触る
      state = on;
      header.classList.toggle("is-scrolled", on);
    };
    update();
    window.addEventListener("scroll", rafThrottle(update), { passive: true });
  }

  /* --- 3. トップへ戻る（鳥居ボタン） --------------------------------------- */
  function initToTop() {
    var btn = document.querySelector("[data-to-top]");
    if (!btn) return;

    // 既定は CSS の visibility:hidden で不可視・タブ順外。hidden 属性は使わない
    // （.to-top{display:grid} が UA の [hidden]{display:none} を上書きしてしまうため）。
    btn.removeAttribute("hidden");

    var visible = null;
    function threshold() {
      return Math.max(400, window.innerHeight * 0.6);
    }
    var update = function () {
      var on = window.pageYOffset > threshold();
      if (on === visible) return;             // 状態が変わった時だけ書き込む
      visible = on;
      btn.classList.toggle("is-visible", on);
    };
    update();
    window.addEventListener("scroll", rafThrottle(update), { passive: true });

    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      window.scrollTo({ top: 0, left: 0, behavior: behavior() });
      // フォーカスも本文先頭へ寄せる（tabindex="-1" は base.html が持つ）
      var main = document.getElementById("main");
      if (main) main.focus({ preventScroll: true });
    });
  }

  /* --- 4. スクロール促し（ヒーロー下の鳥居アイコン等） --------------------- */
  function initScrollCue() {
    var cues = document.querySelectorAll("[data-scroll-cue]");
    if (!cues.length) return;

    Array.prototype.forEach.call(cues, function (cue) {
      cue.addEventListener("click", function (ev) {
        ev.preventDefault();
        var target = resolveTarget(cue);
        if (target) {
          target.scrollIntoView({ behavior: behavior(), block: "start" });
          // 行き先をURLに残す（履歴は汚さないので replaceState）
          if (target.id && window.history && window.history.replaceState) {
            window.history.replaceState(null, "", "#" + target.id);
          }
        } else {
          window.scrollBy({ top: window.innerHeight * 0.9, left: 0, behavior: behavior() });
        }
      });
    });
  }

  // data-scroll-cue の値 → href の順に #セレクタを探す。無ければ次のセクションへ。
  function resolveTarget(cue) {
    var sel = cue.getAttribute("data-scroll-cue") || cue.getAttribute("href") || "";
    if (sel.charAt(0) === "#" && sel.length > 1) {
      var byId = document.querySelector(sel);
      if (byId) return byId;
    }
    var section = cue.closest ? cue.closest("section") : null;
    if (section && section.nextElementSibling) return section.nextElementSibling;
    return null;
  }

  /* --- 5. 著作年を閲覧時の年に更新 ----------------------------------------- */
  // 静的化するとビルド年が焼き込まれ、年をまたぐと古い年のまま残るため。
  function initYear() {
    var el = document.querySelector("[data-year]");
    if (!el) return;
    el.textContent = String(new Date().getFullYear());
  }
})();
