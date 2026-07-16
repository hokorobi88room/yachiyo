/* ==========================================================================
   八千代 -yachiyo-  |  yachiyo.js
   ヒーロー背景「八千代」の補助：
     ・桜の花びらを [data-petals] にゆっくり生成（10秒に1〜2枚、上品に）
     ・花びらは画面下端で消えず、**水面（.yachiyo__water）に着水して漂う**。
       水面の定員（MAX_FLOAT）を超えたら、いちばん古い一枚から静かに沈む
       ＝DOMも処理も一定量から増えない（保存と軽さの両立）。
     ・クリック（タップ）した場所からも花びらが生まれて舞い落ちる。
     ・夜（sky-night）だけ、水辺で蛍がほわっと灯る（3〜4秒に一度）。
     （天体の位置は sky.js が時刻から決める。カーソル追従はしない）
   reduced-motion では花びらも蛍も出さない（＝朝の静止画）。
   レイヤーとキーフレーム本体は yachiyo.css 側。
   ========================================================================== */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var stage = document.querySelector("[data-petals]");
  var hero = document.querySelector(".hero");
  var yachiyo = document.querySelector("[data-yachiyo]");
  var petalSrc = stage ? stage.getAttribute("data-petal-src") : null;
  var timer = null;
  var fireflyTimer = null;

  /* ---- ④ 桜の花びら ---------------------------------------------------- */

  var floats = [];        // 水面に浮いている花びら（古い順）
  var MAX_FLOAT = 12;     // 水面の定員。超えたら古い一枚から静かに沈む
  var MAX_FALLING = 10;   // 同時に舞う枚数の上限（クリック連打の暴走よけ）

  /* 水面の上端（着水点の基準）。CSS .yachiyo__water の height:
     clamp(90px, 20vh, 200px) と同じ計算にすること。 */
  function waterTopY() {
    var h = stage ? stage.clientHeight : 0;
    var water = Math.min(Math.max(90, h * 0.2), 200);
    return h - water;
  }

  /* 1枚生む。fromX/fromY（px・stage基準）を与えるとそこから、無ければ画面上端から。 */
  function spawnPetal(fromX, fromY) {
    if (!stage || !petalSrc) return;
    if (stage.childElementCount - floats.length > MAX_FALLING) return;

    var img = document.createElement("img");
    img.className = "yachiyo__petal";
    img.src = petalSrc;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");

    var size = 14 + Math.random() * 12;        // 14–26px
    img.style.width = size.toFixed(1) + "px";
    img.style.height = size.toFixed(1) + "px";
    img.style.setProperty("--sway", (Math.random() * 120 - 60).toFixed(0) + "px");
    img.style.setProperty("--spin", (140 + Math.random() * 220).toFixed(0) + "deg");

    /* 着水点：水面の上端から少し沈んだ帯のどこか（奥行きが出る） */
    var stageH = stage.clientHeight || 1;
    var target = waterTopY() + (stageH - waterTopY()) * (0.05 + Math.random() * 0.3) - size / 2;

    var startY;
    if (fromY != null) {
      /* クリック生まれ：その場から。水面より下をつついたら、その場で着水させる */
      startY = Math.min(fromY, target - 8);
      img.style.left = Math.round(fromX - size / 2) + "px";
      img.style.top = Math.round(startY) + "px";
      img.style.setProperty("--from", "0px");
    } else {
      /* 環境生まれ：画面上端の少し上から（--from の既定 -10vh を使う） */
      startY = 0;
      img.style.left = (Math.random() * 100).toFixed(2) + "%";
      img.style.top = "0px";
    }

    /* 落下距離に比例した時間で降ろす（全高で 10–17 秒相当） */
    var dist = Math.max(40, target - startY);
    var full = 10 + Math.random() * 7;
    img.style.setProperty("--fall", dist.toFixed(0) + "px");
    img.style.animationDuration =
      Math.max(3.5, full * dist / Math.max(1, waterTopY())).toFixed(1) + "s";

    img.addEventListener("animationend", function () { landPetal(img); });
    stage.appendChild(img);
  }

  /* 着水の波紋：花びらの足元に、広がって消える輪をふたつ（時間差で）置く。
     scale + opacity のみ＝合成だけで安い。消えたら自分で片づく。 */
  function ripple(x, y) {
    if (!stage) return;
    for (var i = 0; i < 2; i++) {
      var r = document.createElement("span");
      r.className = "yachiyo__ripple";
      r.style.left = x.toFixed(1) + "px";
      r.style.top = y.toFixed(1) + "px";
      r.style.animationDelay = (i * 0.28) + "s";
      r.addEventListener("animationend", function () { this.remove(); });
      stage.appendChild(r);
    }
  }

  /* 着水：落下の終着位置に left/top を固定し、漂いのアニメへ切り替える。
     回転は落下の終角（--spin）から連続するので、切り替えの瞬間は見えない。
     同時に、足元へ「ほわわ…」と波紋を広げる。 */
  function landPetal(img) {
    if (!img.isConnected || !stage) return;
    var sr = stage.getBoundingClientRect();
    var r = img.getBoundingClientRect();
    var lx = r.left - sr.left;
    var ly = r.top - sr.top;
    img.style.left = lx.toFixed(1) + "px";
    img.style.top = ly.toFixed(1) + "px";
    img.style.animationDuration = (5 + Math.random() * 2.5).toFixed(1) + "s";
    img.classList.add("yachiyo__petal--afloat");
    ripple(lx + r.width / 2, ly + r.height * 0.8);
    floats.push(img);
    while (floats.length > MAX_FLOAT) sinkPetal(floats.shift());
  }

  /* 沈む：水中へ落ちるように、下へ滑りながら淡く消える（keyframe petal-sink）。
     鏡の中の像も opacity に追従して一緒に消える。 */
  function sinkPetal(img) {
    if (!img || !img.isConnected) return;
    img.classList.remove("yachiyo__petal--afloat");
    /* 漂い用の inline duration（5〜7.5s）が沈みのキーフレームにも効いてしまうので戻す */
    img.style.animationDuration = "2s";
    img.classList.add("yachiyo__petal--sink");
    img.addEventListener("animationend", function () { img.remove(); }, { once: true });
    window.setTimeout(function () { if (img.isConnected) img.remove(); }, 3000);  // 保険
  }

  function loop() {
    // 非表示タブでは生成しない（復帰時に数枚が一斉に降り出すのを防ぐ）
    if (document.visibilityState !== "hidden") spawnPetal();
    timer = window.setTimeout(loop, 6000 + Math.random() * 4000); // 6〜10秒ごと
  }

  function startPetals() {
    if (reduce.matches || !stage) return;
    timer = window.setTimeout(loop, 1500);     // 最初の一枚は少し遅らせて自然に
    startFireflies();
  }

  function stopPetals() {
    if (timer) { window.clearTimeout(timer); timer = null; }
    if (stage) { stage.replaceChildren(); }
    floats.length = 0;
    stopFireflies();
  }

  /* ---- クリック（タップ）した場所から花びらが舞い落ちる ------------------ */
  function onPoke(e) {
    if (reduce.matches || !stage) return;
    if (e.target.closest("a, button")) return;   // リンク・ボタンの邪魔はしない
    var r = stage.getBoundingClientRect();
    var x = e.clientX - r.left;
    var y = e.clientY - r.top;
    if (x < 0 || x > r.width || y < 0 || y > r.height) return;
    spawnPetal(x, Math.max(0, y));   // 触れたところから一枚だけ、ふわり
  }

  /* ---- ⑤ 蛍（夜だけ）。水辺で、3〜4秒に一度ほわっと灯って消える ---------- */
  function spawnFirefly() {
    if (!yachiyo) return;
    if (!document.documentElement.classList.contains("sky-night")) return;
    if (document.visibilityState === "hidden") return;
    var el = document.createElement("span");
    el.className = "yachiyo__firefly";
    el.style.left = (4 + Math.random() * 92).toFixed(1) + "%";
    /* 水面とその少し上（水辺の草むらのつもり）に出す */
    el.style.bottom = (3 + Math.random() * 24).toFixed(1) + "%";
    el.style.animationDuration = (2.6 + Math.random() * 1.2).toFixed(1) + "s";
    el.addEventListener("animationend", function () { el.remove(); });
    yachiyo.appendChild(el);
  }

  function fireflyLoop() {
    spawnFirefly();
    fireflyTimer = window.setTimeout(fireflyLoop, 2600 + Math.random() * 1800);
  }

  function startFireflies() {
    if (reduce.matches || !yachiyo || fireflyTimer) return;
    fireflyTimer = window.setTimeout(fireflyLoop, 2000);
  }

  function stopFireflies() {
    if (fireflyTimer) { window.clearTimeout(fireflyTimer); fireflyTimer = null; }
    if (yachiyo) {
      var flies = yachiyo.querySelectorAll(".yachiyo__firefly");
      for (var i = 0; i < flies.length; i++) flies[i].remove();
    }
  }

  /* ---- ポインタ視差は廃止 ------------------------------------------------
     天体はカーソルではなく「見ている人の時刻」に連動して動く（sky.js）。
     カーソルを追わせると、時刻で決まっているはずの太陽の位置が揺らいでしまう。 */

  /* ---- 見えていないあいだは止める（画面外／非表示タブ） ------------------ */
  var visible = true;

  function sync() {
    var on = visible && !document.hidden;
    if (hero) hero.classList.toggle("is-paused", !on);   // CSS の無限アニメを一時停止
    if (on) {
      if (!timer) startPetals();
    } else {
      stopPetals();
    }
  }

  function watchVisibility() {
    if (hero && "IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        sync();
      }, { threshold: 0 }).observe(hero);
    }
    document.addEventListener("visibilitychange", sync);
  }

  function init() {
    startPetals();
  }

  /* reduced-motion の切替に追従（設定変更しても破綻しない） */
  function onReduceChange() {
    stopPetals();
    if (!reduce.matches) init();
  }
  if (reduce.addEventListener) reduce.addEventListener("change", onReduceChange);
  else if (reduce.addListener) reduce.addListener(onReduceChange);   // 旧Safari

  function boot() {
    init();
    watchVisibility();   // 監視の登録は一度だけ（reduced-motion 切替では張り直さない）
    if (hero) hero.addEventListener("pointerdown", onPoke);
  }

  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
