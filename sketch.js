/* 권역 약도 — 앱이 직접 그리는 SVG 약도 (인터넷 없이도 보입니다)
 *  - 북쪽이 위, 거리 비율은 실제와 같고(가로·세로 같은 축척), 축척 막대를 함께 그립니다.
 *  - 건물은 번호 점, 역·명소는 다른 모양. 가까운 건물끼리 선으로 잇고 도보 시간 어림을 적습니다.
 *  - 아이콘(icon)이 붙은 대상은 점 대신 아이콘으로 그립니다. 건물은 아이콘 + 이름표 앞 번호 배지 + 이름.
 *    아이콘은 같은 좌표 위에 놓는 표식일 뿐이고, 위치·축척 계산은 아이콘이 있든 없든 같습니다.
 *  - 도보 시간 = 직선 거리 ÷ 분속 80m (일본 부동산 표시 기준). 실제 길보다 짧게 나올 수 있는 어림값입니다.
 *  - 위치가 불확실한 건물(grade X·C)은 점선 빈 점으로 그리고, 도보 시간 계산에서는 뺍니다.
 *  - 계산(투영, 가까운 건물 묶기, 이름표 겹침 피하기)은 여기서만 하고, 화면 연결은 app.js 가 합니다.
 */
(function (root) {
  "use strict";

  const WALK_M_PER_MIN = 80;   // 분속 80m
  const CLOSE_MIN = 8;         // 이 시간 이하로 이어진 건물끼리를 '한 묶음'으로 봅니다
  const R_EARTH = 6371000;
  const FS = 12;               // 건물 이름표 글자 크기 (SVG 단위 = 폰 화면 약 1px)
  const FS_SUB = 10;           // 랜드마크·보조 글자 크기
  const R_ICON = { b: 13, sg: 11, st: 10 };   // 아이콘 반지름(건물 26px, 명소 22px, 역 20px)
  const BADGE_R = 8, BADGE_W = 2 * BADGE_R + 4;   // 이름표 앞 번호 배지

  // 아이콘 그리기: { svg: 24×24 칸 SVG 조각 } 또는 { img: 이미지 파일 경로 }
  function iconMarkup(ic, x, y, r) {
    const a = 'x="' + f1(x - r) + '" y="' + f1(y - r) + '" width="' + 2 * r + '" height="' + 2 * r + '"';
    if (ic.img) return '<image class="sk-ic" href="' + esc(ic.img) + '" ' + a + "/>";
    return '<svg class="sk-ic" viewBox="0 0 24 24" ' + a + ">" + ic.svg + "</svg>";
  }

  /* ───────── 도우미 ───────── */
  const rad = (d) => (d * Math.PI) / 180;
  function distanceM(a, b) {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.sqrt(h));
  }
  function bearing(from, to) {
    const p1 = rad(from.lat), p2 = rad(to.lat), dl = rad(to.lng - from.lng);
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }
  const walkMin = (m) => Math.max(1, Math.round(m / WALK_M_PER_MIN));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const f1 = (n) => (Math.round(n * 10) / 10).toString();

  // 글자 폭 어림 (한글·한자는 1em, 영문 대문자·소문자·숫자는 그보다 좁게)
  function textW(s, fs) {
    let w = 0;
    for (const ch of String(s)) {
      const c = ch.codePointAt(0);
      if (c >= 0x2e80) w += 1;
      else if (ch === " ") w += 0.32;
      else if (/[A-Z]/.test(ch)) w += 0.68;
      else w += 0.57;
    }
    return w * fs;
  }

  // 조사 (받침이 있으면 은/이, 없으면 는/가)
  const DIGIT_JONG = { 0: 1, 1: 1, 3: 1, 6: 1, 7: 1, 8: 1 };
  function hasJong(s) {
    const ch = String(s).slice(-1), c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
    if (ch >= "0" && ch <= "9") return !!DIGIT_JONG[ch];
    return false;
  }
  const eunNeun = (s) => s + (hasJong(s) ? "은" : "는");

  const DIRS = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  const dirName = (deg) => DIRS[Math.round(deg / 45) % 8] + "쪽";

  // '약 6km' 처럼 말하기 좋게 줄인 거리
  function fmtApprox(m) {
    if (m < 950) return "약 " + Math.max(50, Math.round(m / 50) * 50) + "m";
    if (m < 2000) return "약 " + f1(m / 1000) + "km";
    return "약 " + Math.round(m / 1000).toLocaleString("ko-KR") + "km";
  }

  const isSure = (b) => b.grade !== "X" && b.grade !== "C";

  /* ───────── 가까운 건물 잇기(최소 신장 트리) + 묶기 ───────── */
  function analyze(list) {
    const n = list.length;
    const d = list.map((a) => list.map((b) => distanceM(a, b)));
    const edges = [];
    if (n > 1) {
      const inTree = new Array(n).fill(false);
      inTree[0] = true;
      for (let k = 1; k < n; k++) {
        let best = null;
        for (let i = 0; i < n; i++) {
          if (!inTree[i]) continue;
          for (let j = 0; j < n; j++) {
            if (inTree[j]) continue;
            if (!best || d[i][j] < best.m) best = { a: i, b: j, m: d[i][j] };
          }
        }
        inTree[best.b] = true;
        edges.push({ a: best.a, b: best.b, m: best.m, min: walkMin(best.m) });
      }
    }
    // 가까운 선(CLOSE_MIN 이하)으로 이어진 것끼리 한 묶음
    const parent = list.map((_, i) => i);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    edges.forEach((e) => { if (e.min <= CLOSE_MIN) parent[find(e.a)] = find(e.b); });
    const groups = new Map();
    list.forEach((_, i) => {
      const g = find(i);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(i);
    });
    return { d, edges, clusters: Array.from(groups.values()) };
  }

  /* 한 줄 요약: 가까운 것끼리 묶어서 "A·B는 서로 도보 약 3분이고, C는 거기서 도보 약 18분이에요." */
  function summarize(sure, unsure, names) {
    const out = [];
    const nm = (i) => names[sure[i].id];
    if (sure.length >= 2) {
      const { d, clusters } = analyze(sure);
      // 가장 큰 묶음부터, 그다음은 이미 말한 곳에서 가장 가까운 묶음 순서로
      const left = clusters.slice().sort((x, y) => y.length - x.length || x[0] - y[0]);
      const order = [left.shift()];
      const clauses = [];
      const first = order[0];
      if (first.length === 1) {
        clauses.push({ text: eunNeun(nm(first[0])) + " 가까이에 다른 건물이 없어서 혼자 떨어져 있", kind: "alone" });
      } else {
        let maxM = 0;
        first.forEach((i) => first.forEach((j) => { if (i < j) maxM = Math.max(maxM, d[i][j]); }));
        const joined = first.map(nm).join("·");
        clauses.push({
          text: eunNeun(joined) + " 서로 도보 약 " + walkMin(maxM) + "분" + (first.length > 2 ? " 이내" : ""),
          kind: first.length > 2 ? "in" : "min"
        });
      }
      while (left.length) {
        let best = null;
        left.forEach((c, ci) => {
          order.forEach((o, oi) => {
            c.forEach((i) => o.forEach((j) => {
              if (!best || d[i][j] < best.m) best = { ci, oi, i, j, m: d[i][j] };
            }));
          });
        });
        const c = left.splice(best.ci, 1)[0];
        const prevIsLast = best.oi === order.length - 1;
        order.push(c);
        const from = prevIsLast ? "거기" : nm(best.j);
        clauses.push({ text: eunNeun(c.map(nm).join("·")) + " " + from + (prevIsLast ? "서" : "에서") + " 도보 약 " + walkMin(best.m) + "분", kind: "min" });
      }
      const last = clauses.length - 1;
      out.push(clauses.map((c, i) => {
        if (c.kind === "alone") return c.text + (i === last ? "어요" : "고,");
        if (c.kind === "in") return c.text + (i === last ? "예요" : "이고,");
        return c.text + (i === last ? "이에요" : "이고,");
      }).join(" ")+ ".");
    }
    if (unsure.length) {
      out.push("※ " + eunNeun(unsure.map((b) => names[b.id]).join("·")) + " 위치가 확실하지 않아 도보 시간 계산에서 뺐어요.");
    }
    return out;
  }

  /* ───────── 이름표 자리 찾기 ───────── */
  const rectOverlap = (a, b) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  };
  // 선분이 사각형을 지나는지 (이름표가 선 위에 놓이는 것을 덜 좋은 자리로 취급)
  function segHitsRect(s, r) {
    const xs = [r.x, r.x + r.w], ys = [r.y, r.y + r.h];
    const inside = (x, y) => x > xs[0] && x < xs[1] && y > ys[0] && y < ys[1];
    if (inside(s.x1, s.y1) || inside(s.x2, s.y2)) return true;
    const t = (a1, b1, a2, b2, a3, b3, a4, b4) => {
      const den = (a1 - a2) * (b3 - b4) - (b1 - b2) * (a3 - a4);
      if (!den) return false;
      const u = ((a1 - a3) * (b3 - b4) - (b1 - b3) * (a3 - a4)) / den;
      const v = -((a1 - a2) * (b1 - b3) - (b1 - b2) * (a1 - a3)) / den;
      return u >= 0 && u <= 1 && v >= 0 && v <= 1;
    };
    return t(s.x1, s.y1, s.x2, s.y2, xs[0], ys[0], xs[1], ys[0]) || t(s.x1, s.y1, s.x2, s.y2, xs[0], ys[1], xs[1], ys[1]) ||
      t(s.x1, s.y1, s.x2, s.y2, xs[0], ys[0], xs[0], ys[1]) || t(s.x1, s.y1, s.x2, s.y2, xs[1], ys[0], xs[1], ys[1]);
  }
  function score(rect, ctx, pref) {
    let s = pref;
    const m = 2;   // 이름표 사이 최소 여백
    const padded = { x: rect.x - m, y: rect.y - m, w: rect.w + 2 * m, h: rect.h + 2 * m };
    ctx.rects.forEach((o) => { const a = rectOverlap(padded, o); if (a) s += 200 + a * 4; });
    // 프레임 밖으로 나가면 크게 감점
    const ox = Math.max(0, 4 - rect.x) + Math.max(0, rect.x + rect.w - (ctx.W - 4));
    const oy = Math.max(0, 4 - rect.y) + Math.max(0, rect.y + rect.h - (ctx.H - 4));
    if (ox || oy) s += 1000 + (ox + oy) * 20;
    ctx.segs.forEach((sg) => { if (segHitsRect(sg, rect)) s += 60; });
    return s;
  }

  // 점 옆 이름표 후보 (동·서·북·남·대각, 점차 멀리 + 지시선)
  function labelCandidates(it, w, h) {
    const out = [];
    [0, 14, 28, 44].forEach((extra, k) => {
      const d = it.r + 3 + extra, dd = d * 0.72;
      [
        { x: it.x + d, y: it.y - h / 2, a: "start" },
        { x: it.x - d - w, y: it.y - h / 2, a: "end" },
        { x: it.x - w / 2, y: it.y - d - h, a: "middle" },
        { x: it.x - w / 2, y: it.y + d, a: "middle" },
        { x: it.x + dd, y: it.y - dd - h, a: "start" },
        { x: it.x - dd - w, y: it.y - dd - h, a: "end" },
        { x: it.x + dd, y: it.y + dd, a: "start" },
        { x: it.x - dd - w, y: it.y + dd, a: "end" }
      ].forEach((c, i) => out.push({ x: c.x, y: c.y, a: c.a, lead: extra > 0, pref: k * 12 + i * 1.5 }));
    });
    return out;
  }

  /* ───────── 약도 만들기 ─────────
   * o = { W, buildings:[{id,num,name,lat,lng,grade,icon?}], landmarks:[{id,type,name,lat,lng,icon?}] }
   *     icon = { svg } 또는 { img }. 없으면 번호 점/마름모/'역' 네모로 그립니다.
   * 돌려주는 값: { W, H, svg(내부 마크업), summary:[문장], proj, rects, center }
   */
  function build(o) {
    const W = o.W || 360;
    const blds = o.buildings, lms = o.landmarks || [];
    const all = blds.concat(lms);
    const names = {};
    blds.forEach((b) => { names[b.id] = b.name; });

    // 1) 투영: 위도·경도 → 미터 → 화면 (북쪽이 위, 가로·세로 같은 비율)
    const lats = all.map((p) => p.lat), lngs = all.map((p) => p.lng);
    const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2, lng0 = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    const mPerDegLat = (Math.PI / 180) * R_EARTH, mPerDegLng = mPerDegLat * Math.cos(rad(lat0));
    const toM = (p) => ({ x: (p.lng - lng0) * mPerDegLng, y: (lat0 - p.lat) * mPerDegLat });
    const ms = all.map(toM);
    const spanX = Math.max(80, Math.max(...ms.map((m) => m.x)) - Math.min(...ms.map((m) => m.x)));
    const spanY = Math.max(80, Math.max(...ms.map((m) => m.y)) - Math.min(...ms.map((m) => m.y)));
    const PADX = 50, TOP = 34, BOTTOM = 58, HMAX = 480, HMIN = 240;
    let s = Math.min((W - 2 * PADX) / spanX, (HMAX - TOP - BOTTOM) / spanY, 1.1);   // 화면 단위 / m
    const contentH = spanY * s;
    const H = Math.round(Math.max(HMIN, contentH + TOP + BOTTOM));
    const cx = (Math.min(...ms.map((m) => m.x)) + Math.max(...ms.map((m) => m.x))) / 2;
    const cy = (Math.min(...ms.map((m) => m.y)) + Math.max(...ms.map((m) => m.y))) / 2;
    const areaMidY = TOP + (H - TOP - BOTTOM) / 2;
    const proj = { W, H, s, lat0, lng0, mPerDegLat, mPerDegLng, cx, cy, ox: W / 2, oy: areaMidY };
    const toXY = (p) => { const m = toM(p); return { x: proj.ox + (m.x - cx) * s, y: proj.oy + (m.y - cy) * s }; };

    const items = [];
    blds.forEach((b) => {
      const p = toXY(b);
      items.push({ kind: "b", ref: b, x: p.x, y: p.y, r: b.icon ? R_ICON.b : 11, sure: isSure(b), icon: b.icon || null });
    });
    lms.forEach((l) => {
      const p = toXY(l);
      const kind = l.type === "station" ? "st" : "sg";
      items.push({ kind, ref: l, x: p.x, y: p.y, r: l.icon ? R_ICON[kind] : 8, icon: l.icon || null });
    });

    // 2) 가까운 건물 잇기
    const sure = blds.filter(isSure), unsure = blds.filter((b) => !isSure(b));
    const sureItems = items.filter((i) => i.kind === "b" && i.sure);
    const an = sure.length >= 2 ? analyze(sure) : { edges: [] };
    const segs = [];
    const edges = an.edges.map((e) => {
      const A = sureItems[e.a], B = sureItems[e.b];
      const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
      const ux = (B.x - A.x) / len, uy = (B.y - A.y) / len;
      const ga = A.icon ? A.r + 2 : 11, gb = B.icon ? B.r + 2 : 11;   // 아이콘은 선이 닿지 않게 조금 띄움
      const seg = { x1: A.x + ux * ga, y1: A.y + uy * ga, x2: B.x - ux * gb, y2: B.y - uy * gb };
      segs.push(seg);
      return { e, seg, A, B, near: e.min <= CLOSE_MIN, mx: (A.x + B.x) / 2, my: (A.y + B.y) / 2, ux, uy, len };
    });

    // 2-1) 아이콘끼리 겹칠 때: 건물은 제 좌표에 그대로 두고, 역·명소 아이콘만 옆으로 살짝 비켜 놓습니다.
    //      실제 위치에는 작은 점을 찍고 아이콘까지 가는 선을 그어, 위치 정보는 그대로 남깁니다.
    const placed = items.filter((i) => i.kind === "b");
    items.filter((i) => i.kind !== "b").forEach((it) => {
      const hitsItem = (x, y) => placed.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + it.r + 3);
      if (it.icon && hitsItem(it.x, it.y)) {
        const box = (x, y) => ({ x: x - it.r - 1, y: y - it.r - 1, w: 2 * it.r + 2, h: 2 * it.r + 2 });
        let best = null;
        for (let d = 6; d <= 80 && !best; d += 4) {
          for (let k = 0; k < 16; k++) {
            const a = (k * Math.PI) / 8, x = it.x + d * Math.cos(a), y = it.y + d * Math.sin(a);
            if (x < it.r + 6 || x > W - it.r - 6 || y < it.r + 6 || y > H - it.r - 6) continue;
            if (hitsItem(x, y) || segs.some((sg) => segHitsRect(sg, box(x, y)))) continue;
            // 같은 거리라면 가장 가까운 건물에서 멀어지는 쪽을 고릅니다.
            const far = Math.min(...placed.map((o) => Math.hypot(o.x - x, o.y - y)));
            if (!best || far > best.far) best = { x, y, far };
          }
        }
        if (best) { it.anchor = { x: it.x, y: it.y }; it.x = best.x; it.y = best.y; }
      }
      placed.push(it);
    });

    // 3) 이름표 자리 정하기 (점·축척 막대·방위표를 피해서)
    const rects = [];   // 이미 차지한 자리
    items.forEach((it) => rects.push({ x: it.x - it.r - 1, y: it.y - it.r - 1, w: 2 * it.r + 2, h: 2 * it.r + 2, fixed: true }));
    // 방위표(오른쪽 위)와 축척 막대(왼쪽 아래) 자리
    rects.push({ x: W - 40, y: 6, w: 34, h: 34, fixed: true });
    const scaleOpts = [50, 100, 200, 250, 500, 1000, 2000, 5000];
    let scaleM = scaleOpts[0];
    scaleOpts.forEach((m) => { if (m * s <= 120) scaleM = m; });
    const scalePx = scaleM * s;
    const scaleLabel = scaleM >= 1000 ? scaleM / 1000 + "km" : scaleM + "m";
    const scaleRect = { x: 10, y: H - 34, w: Math.max(scalePx, textW(scaleLabel, FS_SUB)) + 8, h: 28, fixed: true };
    rects.push(scaleRect);
    const ctx = { W, H, rects, segs };

    function put(it, lines, fsList) {
      const badge = it.kind === "b" && it.icon ? BADGE_W : 0;   // 아이콘 건물은 이름 앞에 번호 배지 자리
      const w = Math.max(...lines.map((t, i) => textW(t, fsList[i]))) + 6 + badge;
      const h = lines.reduce((a, t, i) => a + fsList[i] + 3, 0) + 2;
      let best = null;
      labelCandidates(it, w, h).forEach((c) => {
        const sc = score({ x: c.x, y: c.y, w, h }, ctx, c.pref);
        if (!best || sc < best.sc) best = { c, sc };
      });
      const rect = { x: best.c.x, y: best.c.y, w, h };
      rects.push(rect);
      return { rect, anchor: best.c.a, lead: best.c.lead, lines, fsList, badge };
    }
    const nameOf = (it) => it.ref.name;
    // 건물 이름표 → 랜드마크 이름표 순서 (건물이 더 중요)
    // 위치 불확실한 건물이 먼저 자리를 잡으면 안 되므로, 확실한 건물부터 정하되 점이 몰린 곳은 가까운 순으로 처리
    const order = items.filter((i) => i.kind === "b").sort((a, b) => Number(b.sure) - Number(a.sure))
      .concat(items.filter((i) => i.kind !== "b"));
    order.forEach((it) => {
      if (it.kind === "b") {
        const note = it.ref.grade === "X" ? "위치 미확인" : it.ref.grade === "C" ? "위치 대략" : null;
        it.label = note ? put(it, [nameOf(it), note], [FS, FS_SUB]) : put(it, [nameOf(it)], [FS]);
      } else {
        it.label = put(it, [nameOf(it)], [FS_SUB]);
      }
    });

    // 4) 선 위 도보 시간표 (선 위·옆 자리를 찾아 겹치지 않게)
    edges.forEach((ed) => {
      const t = "약 " + ed.e.min + "분";
      const w = textW(t, FS_SUB) + 10, h = 15;
      let best = null;
      const nx = -ed.uy, ny = ed.ux;
      [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8].forEach((f, fi) => {
        [0, 1, -1, 2, -2, 3, -3].forEach((side, si) => {
          const off = side * (h / 2 + 4);
          const px = ed.A.x + (ed.B.x - ed.A.x) * f + nx * off, py = ed.A.y + (ed.B.y - ed.A.y) * f + ny * off;
          const rect = { x: px - w / 2, y: py - h / 2, w, h };
          const sc = score(rect, ctx, fi * 3 + Math.abs(side) * 4);
          if (!best || sc < best.sc) best = { rect, sc };
        });
      });
      rects.push(best.rect);
      ed.tag = { rect: best.rect, text: t };
    });

    // 5) SVG 그리기
    const g = [];
    g.push('<rect class="sk-frame" x="0.5" y="0.5" width="' + (W - 1) + '" height="' + (H - 1) + '" rx="12"/>');
    edges.forEach((ed) => {
      g.push('<line class="sk-edge ' + (ed.near ? "near" : "far") + '" x1="' + f1(ed.seg.x1) + '" y1="' + f1(ed.seg.y1) +
        '" x2="' + f1(ed.seg.x2) + '" y2="' + f1(ed.seg.y2) + '"/>');
    });
    // 지시선(이름표를 멀리 둔 경우)
    items.forEach((it) => {
      const L = it.label;
      if (!L || !L.lead) return;
      const r = L.rect;
      const tx = Math.min(Math.max(it.x, r.x), r.x + r.w), ty = Math.min(Math.max(it.y, r.y), r.y + r.h);
      const len = Math.hypot(tx - it.x, ty - it.y) || 1;
      g.push('<line class="sk-lead" x1="' + f1(it.x + ((tx - it.x) / len) * it.r) + '" y1="' + f1(it.y + ((ty - it.y) / len) * it.r) +
        '" x2="' + f1(tx) + '" y2="' + f1(ty) + '"/>');
    });
    edges.forEach((ed) => {
      const r = ed.tag.rect;
      g.push('<g class="sk-time"><rect x="' + f1(r.x) + '" y="' + f1(r.y) + '" width="' + f1(r.w) + '" height="' + f1(r.h) +
        '" rx="7.5"/><text x="' + f1(r.x + r.w / 2) + '" y="' + f1(r.y + r.h / 2) + '">' + esc(ed.tag.text) + "</text></g>");
    });
    // 랜드마크
    items.forEach((it) => {
      if (it.kind !== "b" && it.icon) {
        if (it.anchor) {
          const A = it.anchor, len = Math.hypot(it.x - A.x, it.y - A.y) || 1;
          g.push('<g class="sk-lm ic ' + it.kind + '"><line class="sk-pin" x1="' + f1(A.x) + '" y1="' + f1(A.y) + '" x2="' +
            f1(it.x - ((it.x - A.x) / len) * it.r) + '" y2="' + f1(it.y - ((it.y - A.y) / len) * it.r) + '"/><circle class="sk-pin-pt" cx="' +
            f1(A.x) + '" cy="' + f1(A.y) + '" r="2.5"/></g>');
        }
        g.push('<g class="sk-lm ic ' + it.kind + '" data-lm="' + esc(it.ref.id) + '"><circle class="sk-mask" cx="' + f1(it.x) + '" cy="' + f1(it.y) +
          '" r="' + it.r + '"/>' + iconMarkup(it.icon, it.x, it.y, it.r) + "</g>");
      } else if (it.kind === "st") {
        g.push('<g class="sk-lm st" data-lm="' + esc(it.ref.id) + '"><rect x="' + f1(it.x - 7) + '" y="' + f1(it.y - 7) +
          '" width="14" height="14" rx="3.5"/><text x="' + f1(it.x) + '" y="' + f1(it.y + 0.5) + '">역</text></g>');
      } else if (it.kind === "sg") {
        g.push('<g class="sk-lm sg" data-lm="' + esc(it.ref.id) + '"><path d="M' + f1(it.x) + " " + f1(it.y - 8) + "L" + f1(it.x + 8) + " " + f1(it.y) +
          "L" + f1(it.x) + " " + f1(it.y + 8) + "L" + f1(it.x - 8) + " " + f1(it.y) + 'Z"/></g>');
      }
    });
    // 건물 점 (위치 불확실하면 점선 빈 점)
    items.filter((i) => i.kind === "b").forEach((it) => {
      const b = it.ref;
      if (it.icon) {
        // 아이콘 + (이름표 맨 앞) 번호 배지. 둘 다 같은 묶음이라 방문 완료 색이 함께 바뀌고, 어느 쪽을 눌러도 카드로 갑니다.
        const r = it.label.rect, bx = r.x + 3 + BADGE_R, by = r.y + 1 + FS / 2 + 1.5;
        g.push('<g class="sk-b ic' + (it.sure ? "" : " unsure") + '" data-sk="' + esc(b.id) + '">' +
          '<circle class="sk-hit" cx="' + f1(it.x) + '" cy="' + f1(it.y) + '" r="22"/>' +
          '<rect class="sk-hit" x="' + f1(r.x - 4) + '" y="' + f1(r.y - 8) + '" width="' + f1(r.w + 8) + '" height="' + f1(r.h + 16) + '"/>' +
          '<circle class="sk-mask" cx="' + f1(it.x) + '" cy="' + f1(it.y) + '" r="' + it.r + '"/>' +
          (it.sure ? "" : '<circle class="sk-ring" cx="' + f1(it.x) + '" cy="' + f1(it.y) + '" r="' + (it.r + 4) + '"/>') +
          iconMarkup(it.icon, it.x, it.y, it.r) +
          '<circle class="sk-dot" cx="' + f1(bx) + '" cy="' + f1(by) + '" r="' + BADGE_R + '"/>' +
          '<text class="sk-n" x="' + f1(bx) + '" y="' + f1(by + 0.5) + '">' + b.num + "</text></g>");
        return;
      }
      g.push('<g class="sk-b' + (it.sure ? "" : " unsure") + '" data-sk="' + esc(b.id) + '">' +
        '<circle class="sk-hit" cx="' + f1(it.x) + '" cy="' + f1(it.y) + '" r="22"/>' +
        (it.sure ? "" : '<circle class="sk-ring" cx="' + f1(it.x) + '" cy="' + f1(it.y) + '" r="16"/>') +
        '<circle class="sk-dot" cx="' + f1(it.x) + '" cy="' + f1(it.y) + '" r="11"/>' +
        '<text class="sk-n" x="' + f1(it.x) + '" y="' + f1(it.y + 0.5) + '">' + b.num + "</text></g>");
    });
    // 이름표
    items.forEach((it) => {
      const L = it.label;
      const cls = it.kind === "b" ? "sk-t" : "sk-t lm";
      if (L.badge) L.anchor = "start";   // 번호 배지가 있으면 [배지][이름] 순서로 왼쪽부터
      const ax = L.badge ? L.rect.x + 3 + L.badge
        : L.anchor === "start" ? L.rect.x + 3 : L.anchor === "end" ? L.rect.x + L.rect.w - 3 : L.rect.x + L.rect.w / 2;
      let y = L.rect.y + 1;
      const parts = L.lines.map((t, i) => {
        y += L.fsList[i];
        const out = '<text class="' + (i ? "sk-t sub" : cls) + '" x="' + f1(ax) + '" y="' + f1(y) + '" text-anchor="' + L.anchor +
          '" font-size="' + L.fsList[i] + '">' + esc(t) + "</text>";
        y += 3;
        return out;
      });
      g.push(parts.join(""));
    });
    // 방위표(N)와 축척 막대
    g.push('<g class="sk-north" transform="translate(' + (W - 22) + ' 22)"><path d="M0-12 5 3 0 0-5 3Z"/><text x="0" y="16">N</text></g>');
    const bx = 14, by = H - 22;
    g.push('<g class="sk-scale"><path d="M' + f1(bx) + " " + f1(by - 5) + "V" + f1(by) + "H" + f1(bx + scalePx) + "V" + f1(by - 5) +
      '"/><text x="' + f1(bx) + '" y="' + f1(by + 12) + '">' + scaleLabel + "</text></g>");

    return {
      W, H, proj, rects, toXY,
      svg: g.join(""),
      summary: summarize(sure, unsure, names),
      scale: { m: scaleM, label: scaleLabel },
      edges: edges.map((e) => ({ a: sure[e.e.a].id, b: sure[e.e.b].id, min: e.e.min, m: Math.round(e.e.m) })),
      center: { lat: lat0, lng: lng0 }
    };
  }

  /* ───────── 내 위치 ─────────
   * 약도 안이면 파란 점. 밖이면 점은 숨기고 가장자리에 방향과 거리만 적습니다.
   */
  function meMarkup(L, pos) {
    if (!L || !pos) return "";
    const W = L.W, H = L.H, pr = L.proj;
    const mx = (pos.lng - pr.lng0) * pr.mPerDegLng, my = (pr.lat0 - pos.lat) * pr.mPerDegLat;
    const x = pr.ox + (mx - pr.cx) * pr.s, y = pr.oy + (my - pr.cy) * pr.s;
    if (x >= 10 && x <= W - 10 && y >= 10 && y <= H - 10) {
      return '<g class="sk-me"><circle class="halo" cx="' + f1(x) + '" cy="' + f1(y) + '" r="13"/><circle class="pt" cx="' + f1(x) + '" cy="' + f1(y) + '" r="7"/></g>';
    }
    // 약도 밖: 약도 중심에서 내 위치까지의 방향·거리
    const dist = distanceM(L.center, pos), brg = bearing(L.center, pos);
    const text = "내 위치: " + dirName(brg) + "으로 " + fmtApprox(dist);
    const w = textW(text, FS_SUB + 1) + 14, h = 20;
    // 중심에서 내 위치 방향으로 뻗은 선이 프레임과 만나는 점
    const dx = Math.sin(rad(brg)), dy = -Math.cos(rad(brg));
    const tx = dx ? (dx > 0 ? (W - 14 - W / 2) / dx : (14 - W / 2) / dx) : Infinity;
    const ty = dy ? (dy > 0 ? (H - 14 - H / 2) / dy : (14 - H / 2) / dy) : Infinity;
    const t = Math.min(Math.abs(tx), Math.abs(ty));
    const ax = W / 2 + dx * t, ay = H / 2 + dy * t;   // 화살표 끝(가장자리)
    // 말풍선은 화살표 안쪽에 두고, 이름표와 덜 겹치는 자리를 고릅니다.
    let best = null;
    const horizontalEdge = Math.abs(ty) <= Math.abs(tx);   // 위·아래 가장자리에 닿는가
    [0, 1].forEach((row) => {
      [0, 1, -1, 2, -2, 3, -3, 4, -4].forEach((k, ki) => {
        const inner = 8 + row * (h + 4);
        let px, py;
        if (horizontalEdge) { px = ax - w / 2 + k * 36; py = dy > 0 ? ay - h - inner : ay + inner; }
        else { py = ay - h / 2 + k * 36; px = dx > 0 ? ax - w - inner : ax + inner; }
        px = Math.min(Math.max(px, 4), W - 4 - w); py = Math.min(Math.max(py, 4), H - 4 - h);
        let sc = ki + row * 6;
        L.rects.forEach((o) => { const a2 = rectOverlap({ x: px - 2, y: py - 2, w: w + 4, h: h + 4 }, o); if (a2) sc += 100 + a2; });
        if (!best || sc < best.sc) best = { px, py, sc };
      });
    });
    const ang = brg;
    return '<g class="sk-me far"><g transform="translate(' + f1(ax) + " " + f1(ay) + ") rotate(" + f1(ang) + ')"><path d="M0-8 7 6 0 2-7 6Z"/></g>' +
      '<rect x="' + f1(best.px) + '" y="' + f1(best.py) + '" width="' + f1(w) + '" height="' + h + '" rx="10"/>' +
      '<text x="' + f1(best.px + w / 2) + '" y="' + f1(best.py + h / 2) + '">' + esc(text) + "</text></g>";
  }

  const api = { build, meMarkup, analyze, summarize, walkMin, distanceM, bearing, textW, fmtApprox, dirName, eunNeun, rectOverlap, WALK_M_PER_MIN, CLOSE_MIN };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Sketch = api;
})(typeof window !== "undefined" ? window : globalThis);
