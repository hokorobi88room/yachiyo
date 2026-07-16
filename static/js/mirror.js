/* ==========================================================================
   八千代 -yachiyo-  |  mirror.js
   八咫鏡は「映すだけ」。ことばも波紋もホバー演出も持たない。

   ★ 映すのは **桜の花びらだけ**。
     太陽や月は鏡の「向こう側」の空にあるので、こちらを向いた鏡には映らない
     （＝天体の反射は出さない）。鏡の手前を舞う花びらだけが、鏡に映り込む。

   反射のモデル（凸面鏡）:
     八咫鏡はごくわずかに凸。凸面鏡は正立・縮小の虚像を作り、
     鏡の中心から見た方位角はそのままに、動径だけが中心へ圧縮される
     （クリスマスの玉に手前の景色が映るのと同じ写像）。

         ρ = (2/π)·atan(|d| / K)          … 0〜1 へ単調に圧縮
         像の位置 = 鏡の中心 + ρ·R·(d/|d|)

     鏡像なので左右は反転する（scaleX(-1)）。

   ★ 追従:
     舞っている花びら **一枚ずつに、鏡の中の像を1対1で対応づける**（要素の同一性で結ぶ）。
     こうしないと、花びらが生まれたり消えたりするたびに対応がずれて、
     鏡の中の桜が手前の桜と別々に動いてしまう。

   ★ 像の生き死に（この設計の芯。像は**どの経路でも連続にしか変化しない**）:

     像の不透明度の目標値   target = ALBEDO × 実物のいまの不透明度 × edge(縁の減衰)
     像の不透明度の実際値   op    → target へ **時定数 τ=120ms の低域通過**で追いつく
                                     op += (target - op) × (1 - e^(-dt/τ))

     こうすると、
       1. 実物が CSS アニメで淡くなる → 像も同じ呼吸で淡くなる（追従）
       2. 実物が突然現れる／追跡が0.5秒の待機から復帰する → 像は 0 から
          なめらかに立ち上がる（出現のポップが**原理的に**出ない）
       3. 実物の DOM が消える（animationend・replaceChildren・どんな理由でも）
          → 像は「亡霊」になり、**最後の速度のまま慣性で流れつつ** target=0 へ
          同じ低域通過で沈んで消える（消滅のポップも**原理的に**出ない）
     つまり不透明度は常に一階の連続関数で、不連続な代入がコード上存在しない。

     速度は毎フレームの位置差分から推定し、3割ずつ混ぜて平滑化（vx,vy）。
     亡霊の寿命は GHOST_MS。実物が透明(op<0.02)で死んだ場合は亡霊も即座に片づく
     （通常の舞い終わりはこちら＝コスト0）。

   DOM 契約（index.html）:
     [data-mirror] / [data-mirror-scene]。手前の花びらは .hero 直下の .yachiyo__petal。
   ========================================================================== */
(function () {
  "use strict";

  var mirror = document.querySelector("[data-mirror]");
  if (!mirror) return;

  var scene = mirror.querySelector("[data-mirror-scene]");
  if (!scene) return;

  var hero = document.querySelector(".hero");
  if (!hero) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  var SCALE = 0.32;      // 花びらの位置 → 鏡の中の位置。方向はそのまま（＝位置を同期）縮小だけかける
  var FADE_START = 0.6;  // 中心からこの割合を越えたら、縁(1.0)へ向けてフェードアウト

  var raf = 0;
  var running = false;

  var ALBEDO = 0.78;     // 基準の反射率（磨いた青銅：完全鏡面より少し淡い）
  var TAU = 0.12;        // 追従の低域通過の時定数（秒）。急変をこの呼吸に均す
  var TAU_GHOST = 0.22;  // 亡霊の沈む時定数。追従より遅く＝「見えていたのに消された」
                         // 最悪ケースでもフレーム間変化 ≦0.05 に収まる（数値検証済み）
  var GHOST_MS = 900;    // 亡霊の寿命上限（τ=0.22 なら 0.8s 弱で 0.02 を割る）
  var V_MIX = 0.3;       // 速度推定の平滑化（毎フレーム3割だけ新しい観測を混ぜる）

  /* 手前の花びら（実物）→ 鏡の中の像の状態 の 1対1 対応。
     状態: { img, x, y, vx, vy, op, size }（x,y は鏡面中心からの px・op は適用中の値） */
  var links = new Map();
  /* 実物が消えたあとの像（亡霊）。慣性で流れながら target=0 へ沈む。 */
  var ghosts = [];
  var lastT = 0;

  /* 手前の花びらの位置 → 鏡の中の像の位置。
     方向はそのまま（同じ側に映る＝位置が同期）、中心へ SCALE だけ縮小する。
     像が鏡面の縁（R）に近づくほど淡くなり、縁でちょうど消える（clip でブツっと切らない）。 */
  function reflect(dx, dy, R) {
    var x = dx * SCALE;
    var y = dy * SCALE;
    var r = Math.sqrt(x * x + y * y);
    var norm = R > 0 ? r / R : 1;                 // 0=中心, 1=縁
    var edge = norm >= 1 ? 0
             : (norm <= FADE_START ? 1
                : 1 - (norm - FADE_START) / (1 - FADE_START));
    return { x: x, y: y, norm: norm, edge: edge };
  }

  function makeImg(src) {
    var el = document.createElement("img");
    el.className = "mirror__img mirror__img--petal";
    el.alt = "";
    el.setAttribute("aria-hidden", "true");
    if (src) el.src = src;
    el.style.opacity = "0";
    scene.appendChild(el);
    return el;
  }

  var slowTimer = 0;

  function frame(now) {
    raf = 0;
    now = now || performance.now();
    /* dt（秒）。初回・復帰直後・スロー確認明けは大きく空くので 0.1s に飼いならす */
    var dt = lastT ? Math.min(Math.max((now - lastT) / 1000, 1 / 240), 0.1) : 1 / 60;
    lastT = now;
    /* 低域通過の係数。dt が揺れてもフレームレート非依存で同じ速さに収束する */
    var k = 1 - Math.exp(-dt / TAU);
    var kg = 1 - Math.exp(-dt / TAU_GHOST);

    var sceneRect = scene.getBoundingClientRect();
    if (!sceneRect.width) { if (running) schedule(); return; }
    var mcx = sceneRect.left + sceneRect.width / 2;
    var mcy = sceneRect.top + sceneRect.height / 2;
    var R = sceneRect.width / 2;

    var petals = hero.querySelectorAll(".yachiyo__petal");

    /* 何も映すものが無く、消え残りの像も無いあいだは 60fps を空回りさせない。
       0.5秒ごとの在庫確認に落とし、次の一枚が生まれたら自然に追従へ戻る。
       （復帰初回の像は op=0 から低域通過で立ち上がるので、ポップは出ない） */
    if (!petals.length && !links.size && !ghosts.length) {
      lastT = 0;
      if (running) slowTimer = window.setTimeout(schedule, 500);
      return;
    }

    /* --- 読みフェーズ -----------------------------------------------------
       レイアウトの読取り（rect・opacity）を先に全部済ませる。style の書込みと
       交互にやると、1枚ごとに強制再計算が走るため。 */
    var alive = new Set();
    var jobs = [];
    for (var i = 0; i < petals.length; i++) {
      var real = petals[i];
      alive.add(real);
      var rect = real.getBoundingClientRect();
      if (!rect.width) continue;
      var cs = getComputedStyle(real);
      // 実物のいまの不透明度（CSSアニメの淡れに追従する）
      var realOp = parseFloat(cs.opacity);
      /* 実物のいまの回転角。アニメ中の transform は matrix(a,b,c,d,e,f) で返るので、
         atan2(b, a) が回転（花びらは回転＋平行移動のみ）。像は左右反転しない設計なので
         同じ角度をそのまま使う＝**葉先の向きが実物と完全に一致**する。 */
      var rot = 0;
      var tm = cs.transform;
      if (tm && tm.indexOf("matrix(") === 0) {
        var mv = tm.slice(7, -1).split(",");
        rot = Math.atan2(parseFloat(mv[1]), parseFloat(mv[0]));
      }
      jobs.push({ real: real, rect: rect, op: isNaN(realOp) ? 1 : realOp, rot: rot });
    }

    /* --- 書きフェーズ（追跡中の像） --------------------------------------- */
    for (var j = 0; j < jobs.length; j++) {
      var job = jobs[j];
      var cx = job.rect.left + job.rect.width / 2;
      var cy = job.rect.top + job.rect.height / 2;
      var q = reflect(cx - mcx, cy - mcy, R);

      var st = links.get(job.real);
      if (!st) {
        st = { img: makeImg(job.real.getAttribute("src")),
               x: q.x, y: q.y, vx: 0, vy: 0, op: 0, rot: job.rot, size: 0 };
        links.set(job.real, st);
      }

      /* 速度を差分から推定して平滑化（亡霊になったときの慣性に使う） */
      st.vx = st.vx + ((q.x - st.x) / dt - st.vx) * V_MIX;
      st.vy = st.vy + ((q.y - st.y) / dt - st.vy) * V_MIX;
      st.x = q.x;
      st.y = q.y;
      st.rot = job.rot;

      /* 不透明度は目標へ低域通過で追いつく（急変を τ の呼吸に均す） */
      var target = ALBEDO * job.op * q.edge;
      st.op += (target - st.op) * k;

      // 縁へ向かうほど気持ち小さく（遠近感）
      st.size = job.rect.width * (0.6 - 0.16 * Math.min(q.norm, 1));
      st.img.style.width = st.size.toFixed(1) + "px";
      st.img.style.height = st.size.toFixed(1) + "px";
      // 位置は花びらと同じ側（同期）。鏡だが左右反転はしない（“同じ場所に映る”読みを優先）。
      // 回転は実物と同じ角（葉先の向きを一致させる）。
      st.img.style.transform =
        "translate(-50%, -50%) translate(" + st.x.toFixed(1) + "px, " + st.y.toFixed(1) + "px)" +
        " rotate(" + st.rot.toFixed(3) + "rad)";
      st.img.style.opacity = st.op.toFixed(3);
    }

    /* --- 実物が消えた像は「亡霊」へ --------------------------------------
       ほぼ透明で死んだ通常の舞い終わりは即時に片づけ、見えているのに
       消された場合だけ、慣性で流れながら沈む余韻に回す。 */
    links.forEach(function (st, real) {
      if (alive.has(real)) return;
      links.delete(real);
      if (st.op < 0.02) {
        st.img.remove();
      } else {
        st.born = now;
        ghosts.push(st);
      }
    });

    /* --- 亡霊の積分（慣性移動 ＋ target=0 への低域通過） ------------------- */
    for (var g = ghosts.length - 1; g >= 0; g--) {
      var gh = ghosts[g];
      gh.x += gh.vx * dt;
      gh.y += gh.vy * dt;
      gh.op += (0 - gh.op) * kg;
      if (gh.op < 0.02 || now - gh.born > GHOST_MS) {
        gh.img.remove();
        ghosts.splice(g, 1);
        continue;
      }
      gh.img.style.transform =
        "translate(-50%, -50%) translate(" + gh.x.toFixed(1) + "px, " + gh.y.toFixed(1) + "px)" +
        " rotate(" + gh.rot.toFixed(3) + "rad)";
      gh.img.style.opacity = gh.op.toFixed(3);
    }

    if (running) schedule();
  }

  function schedule() {
    if (!running || raf) return;
    raf = window.requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    schedule();
  }

  function stop() {
    running = false;
    lastT = 0;
    if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
    if (slowTimer) { window.clearTimeout(slowTimer); slowTimer = 0; }
  }

  /* 像を余韻なしで全部消す。見えていない文脈（非表示タブ・ヒーロー圏外・
     reduced-motion）だけで呼ぶので、ポップは誰の目にも入らない。 */
  function clearAll() {
    links.forEach(function (st) { st.img.remove(); });
    links.clear();
    for (var i = 0; i < ghosts.length; i++) ghosts[i].img.remove();
    ghosts.length = 0;
  }

  var inView = true;

  /* 花びらは reduced-motion では舞わない（yachiyo.js が出さない）ので、
     追いかけるのは動きが許されているときだけ。止めるときは像も消す。 */
  function sync() {
    stop();
    if (!reduce.matches && inView && document.visibilityState !== "hidden") {
      start();
    } else {
      clearAll();
    }
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      inView = !!(entries[0] && entries[0].isIntersecting);
      sync();
    }, { threshold: 0 }).observe(hero);
  }

  document.addEventListener("visibilitychange", sync);
  if (reduce.addEventListener) reduce.addEventListener("change", sync);
  else if (reduce.addListener) reduce.addListener(sync);

  sync();
})();
