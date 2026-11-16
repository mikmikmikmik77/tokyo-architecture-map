/* 도쿄 건축 투어 — 앱 동작
 *  - 카드는 처음 한 번만 그리고, 탭/필터는 보이기·숨기기와 순서 바꾸기만 합니다.
 *  - 구글 지도 스크립트는 지도나 스트리트뷰를 처음 열 때만 불러옵니다.
 *  - 길찾기는 앱 안에서 그리지 않고 구글맵 앱(Maps URLs)으로 넘깁니다.
 */
(function () {
  "use strict";

  const CONFIG = window.APP_CONFIG || {};
  const DATA = window.TOUR_DATA;
  const PLACES = window.PLACES || {};
  const PHOTOS = window.PHOTOS || {};
  const SKETCH_DATA = window.SKETCH_DATA || { landmarks: {}, short: {} };
  const Sketch = window.Sketch;
  const REGIONS = DATA.regions;
  const BUILDINGS = DATA.buildings.filter((b) => PLACES[b.id]);
  const BY_ID = new Map(BUILDINGS.map((b) => [b.id, b]));
  const $ = (id) => document.getElementById(id);
  // 약도 번호: 권역 안에서 1부터. 카드와 약도의 같은 번호가 같은 건물입니다.
  const NUM = new Map();
  REGIONS.forEach((r) => BUILDINGS.filter((b) => b.regionId === r.id).forEach((b, i) => NUM.set(b.id, i + 1)));

  /* ───────── 저장소 (폰에 남는 기록) ───────── */
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem("tokyoArch." + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem("tokyoArch." + key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    }
  };

  const state = {
    region: store.get("region", "all"),
    onlyFav: !!store.get("onlyFav", false),
    onlyTodo: !!store.get("onlyTodo", false),
    sortNear: false,
    view: "list",
    visited: new Set(store.get("visited", [])),
    fav: new Set(store.get("fav", [])),
    pos: null,          // {lat, lng}
    sortedAt: null,     // 마지막으로 정렬한 위치
    sheetId: null
  };
  if (!REGIONS.some((r) => r.id === state.region)) state.region = "all";

  /* ───────── 도우미 ───────── */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rad = (d) => (d * Math.PI) / 180;
  function distanceM(a, b) {
    const R = 6371000;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function bearing(from, to) {
    const p1 = rad(from.lat), p2 = rad(to.lat), dl = rad(to.lng - from.lng);
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }
  function fmtDist(m) {
    if (m < 1000) return Math.max(10, Math.round(m / 10) * 10) + "m";
    if (m < 10000) return (m / 1000).toFixed(1) + "km";
    return Math.round(m / 1000).toLocaleString("ko-KR") + "km";
  }

  let toastTimer = null;
  function toast(msg, ms) {
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms || 3200);
  }

  /* ───────── 길찾기 링크 (구글 공식 Maps URLs) ─────────
   * https://www.google.com/maps/dir/?api=1&destination=…&travelmode=walking|transit
   * 출발지(origin)를 비우면 구글맵이 "내 현재 위치"에서 출발합니다.
   * 도착지는 기본적으로 건물 이름(일본어 정식 명칭)으로 넘겨 정문 쪽으로 안내받고,
   * 이름 검색이 믿기 어려운 건물(PLACES 의 q 가 null)은 좌표로 넘깁니다.
   */
  function dirUrl(id, mode, forceCoord) {
    const p = PLACES[id];
    const dest = !forceCoord && p.q ? p.q : p.lat + "," + p.lng;
    return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(dest) + "&travelmode=" + mode;
  }

  /* ───────── 아이콘 ───────── */
  const ICON = {
    walk: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4" r="2.2" fill="currentColor"/><path d="m9 22 2.2-7.5L9 12l1-5 3.2 1 2 3.2 3 1M13.8 14.5 16 22M10 7 6.5 9v3.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    transit: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M5 10.5h14M8 21l2-4M16 21l-2-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="8.7" cy="13.8" r="1.2" fill="currentColor"/><circle cx="15.3" cy="13.8" r="1.2" fill="currentColor"/></svg>',
    map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.1-6.5-11A6.5 6.5 0 0 1 12 3.500 6.500 6.500 0 0 1 18.500 10c0 4.900-6.500 11-6.500 11z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.3" fill="currentColor"/></svg>',
    sv: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="6" r="2.6" fill="currentColor"/><path d="M8.500 13.500c0-2 1.500-3.200 3.500-3.200s3.500 1.200 3.500 3.200V15H8.500z" fill="currentColor"/><ellipse cx="12" cy="18" rx="8" ry="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.600 2.600 5.300 5.900.9-4.300 4.100 1 5.800L12 17l-5.200 2.700 1-5.800L3.500 9.800l5.900-.9z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m7.800 12.300 2.900 2.900 5.500-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  /* ───────── 카드/시트 HTML ───────── */
  function metaHTML(b, withNo) {
    const sure = PLACES[b.id].grade !== "X" && PLACES[b.id].grade !== "C";
    return '<div class="meta">' +
      (withNo ? '<span class="no' + (sure ? "" : " unsure") + '" role="img" aria-label="약도 번호 ' + NUM.get(b.id) + '">' + NUM.get(b.id) + "</span>" : "") +
      '<span class="badge">' + esc(b.regionName) + "</span>" +
      '<span class="dist" data-dist hidden></span>' +
      '<span class="flag done">방문 완료</span>' +
      '<span class="flag fav">즐겨찾기</span>' +
      (PLACES[b.id].grade === "X" ? '<span class="flag warn">핀 위치 미확인</span>' : "") +
      (PLACES[b.id].grade === "C" ? '<span class="flag warn">핀 위치 대략</span>' : "") +
      "</div>";
  }
  function headHTML(b) {
    return '<h2 class="name">' + esc(b.nameKo) + "</h2>" +
      '<p class="sub">' + esc(b.nameJa) + " | " + esc(b.nameEn) + "</p>" +
      '<p class="architect"><b>건축가</b>' + esc(b.architect) + "</p>";
  }
  // 대표 사진(위키미디어 공용). 없는 건물은 아무것도 그리지 않습니다.
  function photoHTML(b) {
    const ph = PHOTOS[b.id];
    if (!ph) return "";
    const tall = ph.h > ph.w;
    return '<figure class="photo' + (tall ? " tall" : "") + '">' +
      '<img src="' + esc(ph.file) + '" width="' + ph.w + '" height="' + ph.h + '" loading="lazy" decoding="async"' +
      ' alt="' + esc(b.nameKo) + ' 외관 사진" onerror="this.closest(\'figure\').hidden=true">' +
      "<figcaption>사진: " + esc(ph.artist) + " · " + esc(ph.license) +
      ' · <a target="_blank" rel="noopener" href="' + esc(ph.source) + '">출처</a></figcaption></figure>';
  }
  const pointsHTML = (b) => '<ul class="points">' + b.points.map((p) => "<li>" + esc(p) + "</li>").join("") + "</ul>";
  const spotHTML = (b) => '<p class="keyspot"><b>뷰포인트</b>' + esc(b.keySpot) + "</p>";
  function goHTML(b) {
    return '<p class="go-label">구글맵 앱으로 길찾기 (내 위치에서 출발)</p>' +
      '<div class="go">' +
      '<a class="btn primary" target="_blank" rel="noopener" href="' + esc(dirUrl(b.id, "walking")) + '">' + ICON.walk + "도보</a>" +
      '<a class="btn dark" target="_blank" rel="noopener" href="' + esc(dirUrl(b.id, "transit")) + '">' + ICON.transit + "대중교통</a>" +
      "</div>";
  }
  function actBtn(act, icon, label, pressed) {
    return '<button type="button" class="act" data-act="' + act + '"' +
      (pressed == null ? "" : ' aria-pressed="' + pressed + '"') + ">" + icon + "<span>" + label + "</span></button>";
  }
  function actsHTML(b, inSheet) {
    return '<div class="acts"' + (inSheet ? ' style="grid-template-columns:repeat(3,1fr)"' : "") + ">" +
      (inSheet ? "" : actBtn("map", ICON.map, "지도")) +
      actBtn("sv", ICON.sv, "스트리트뷰") +
      actBtn("fav", ICON.star, "즐겨찾기", state.fav.has(b.id)) +
      actBtn("visit", ICON.check, state.visited.has(b.id) ? "방문 완료" : "방문 체크", state.visited.has(b.id)) +
      "</div>";
  }
  function altGoHTML(b) {
    if (!PLACES[b.id].q) {
      return '<p class="alt-go">이 건물은 이름 검색이 부정확할 수 있어서, 길찾기가 지도 핀 좌표로 안내해요.</p>';
    }
    return '<p class="alt-go">길찾기가 엉뚱한 곳을 가리키면 핀 좌표로 열기: ' +
      '<a target="_blank" rel="noopener" href="' + esc(dirUrl(b.id, "walking", true)) + '">도보</a> · ' +
      '<a target="_blank" rel="noopener" href="' + esc(dirUrl(b.id, "transit", true)) + '">대중교통</a></p>';
  }
  function cardHTML(b) {
    return '<article class="card" data-id="' + b.id + '">' +
      metaHTML(b, true) + headHTML(b) + photoHTML(b) + pointsHTML(b) + spotHTML(b) + goHTML(b) + actsHTML(b, false) +
      "</article>";
  }
  function sheetHTML(b) {
    return '<button type="button" class="close" data-act="close-sheet" aria-label="정보 닫기">✕</button>' +
      metaHTML(b) + headHTML(b) + photoHTML(b) + spotHTML(b) +
      "<details><summary>감상 포인트 " + b.points.length + "가지 보기</summary>" + pointsHTML(b) + "</details>" +
      goHTML(b) + actsHTML(b, true) + altGoHTML(b);
  }

  /* ───────── 처음 한 번만 그리기 ───────── */
  const cardEls = new Map();
  function renderOnce() {
    $("tabs").innerHTML = REGIONS.map((r) => {
      const n = r.id === "all" ? BUILDINGS.length : BUILDINGS.filter((b) => b.regionId === r.id).length;
      return '<button type="button" class="tab" role="tab" data-region="' + r.id + '" aria-selected="false">' +
        esc(r.name) + "<small>" + n + "</small></button>";
    }).join("");
    $("cards").innerHTML = BUILDINGS.map(cardHTML).join("");
    $("cards").querySelectorAll(".card").forEach((el) => cardEls.set(el.dataset.id, el));
    BUILDINGS.forEach((b) => syncFlags(b.id));
  }

  /* 방문/즐겨찾기 표시를 해당 카드·시트·핀에만 반영 */
  function syncFlags(id) {
    const done = state.visited.has(id), fav = state.fav.has(id);
    const targets = [cardEls.get(id)];
    if (state.sheetId === id) targets.push($("sheet"));
    targets.forEach((el) => {
      if (!el) return;
      el.classList.toggle("is-done", done);
      el.classList.toggle("is-fav", fav);
      const v = el.querySelector('[data-act="visit"]'), f = el.querySelector('[data-act="fav"]');
      if (v) { v.setAttribute("aria-pressed", done); v.querySelector("span").textContent = done ? "방문 완료" : "방문 체크"; }
      if (f) f.setAttribute("aria-pressed", fav);
    });
    mapUI.syncPin(id);
    sketchUI.syncDot(id);
  }
  function updateProgress() {
    const n = BUILDINGS.filter((b) => state.visited.has(b.id)).length;
    $("progress").textContent = "방문 " + n + " / " + BUILDINGS.length;
  }

  /* ───────── 권역 약도 ─────────
   * 권역 탭을 누르면 카드 목록 맨 위에 그 권역만 담은 약도를 보여줍니다. (전체보기에서는 숨김)
   * 약도는 sketch.js 가 SVG 로 직접 그리므로 인터넷이 없어도 보입니다. 권역마다 한 번만 그려 두고 다시 씁니다.
   * 필터(즐겨찾기만·안 가본 곳만)와 상관없이 그 권역의 건물을 모두 보여줘야 '어디를 뺄지' 고를 수 있습니다.
   */
  const shortName = (b) => (SKETCH_DATA.short && SKETCH_DATA.short[b.id]) || b.nameKo.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const sketchUI = {
    cache: new Map(),   // 권역 id → { L(약도 계산 결과), html }
    shown: null,

    make(rid) {
      if (sketchUI.cache.has(rid)) return sketchUI.cache.get(rid);
      const blds = BUILDINGS.filter((b) => b.regionId === rid).map((b) => ({
        id: b.id, num: NUM.get(b.id), name: shortName(b), lat: PLACES[b.id].lat, lng: PLACES[b.id].lng, grade: PLACES[b.id].grade
      }));
      const lms = ((SKETCH_DATA.landmarks || {})[rid] || []).filter((l) => l.lat != null && l.lng != null)
        .map((l) => ({ id: l.id, type: l.type, name: l.name, lat: l.lat, lng: l.lng }));
      const L = Sketch.build({ W: 360, buildings: blds, landmarks: lms });
      const hasSt = lms.some((l) => l.type === "station"), hasSg = lms.some((l) => l.type !== "station");
      const hasUnsure = blds.some((b) => b.grade === "X" || b.grade === "C");
      const hasLine = L.edges.length > 0;
      const regionName = REGIONS.find((r) => r.id === rid).name;
      const html =
        '<div class="sk-wrap"><svg class="sk" viewBox="0 0 ' + L.W + " " + L.H + '" role="img" aria-label="' + esc(regionName) +
        ' 약도. 북쪽이 위이고 거리 비율은 실제와 같아요. 건물 ' + blds.length + '곳의 위치 관계를 보여줘요.">' +
        L.svg + '<g id="sk-me"></g></svg></div>' +
        '<ul class="sk-legend" aria-label="약도 기호">' +
        '<li><i class="lg b">1</i>건축물 <small>(카드 번호)</small></li>' +
        (hasSt ? '<li><i class="lg st">역</i>역</li>' : "") +
        (hasSg ? '<li><i class="lg sg"></i>명소</li>' : "") +
        (hasUnsure ? '<li><i class="lg u">?</i>위치 불확실</li>' : "") +
        '<li><i class="lg me"></i>내 위치 <small>(위치를 켜면)</small></li></ul>' +
        (hasLine ? '<p class="sk-note">선 위 숫자는 걸어서 걸리는 시간 어림이에요. 직선 거리를 분속 80m로 나눈 값이라, 실제 길은 더 걸릴 수 있어요. 실선은 도보 ' +
          Sketch.CLOSE_MIN + "분 이내, 점선은 그보다 먼 연결이에요.</p>" : "") +
        (L.summary.length ? '<div class="sk-sum">' + L.summary.map((t) => "<p>" + esc(t) + "</p>").join("") + "</div>" : "");
      const rec = { L, html };
      sketchUI.cache.set(rid, rec);
      return rec;
    },

    sync() {
      const on = state.region !== "all" && !!Sketch;
      $("cards").classList.toggle("numbered", state.region !== "all");
      $("sketch").hidden = !on;
      if (!on) { sketchUI.shown = null; return; }
      if (sketchUI.shown === state.region) return;
      sketchUI.shown = state.region;
      const rec = sketchUI.make(state.region);
      $("sketch-sum").textContent = "권역 약도 · " + REGIONS.find((r) => r.id === state.region).name;
      $("sketch-body").innerHTML = rec.html;
      BUILDINGS.forEach((b) => { if (b.regionId === state.region) sketchUI.syncDot(b.id); });
      sketchUI.syncMe();
    },
    syncDot(id) {
      const g = $("sketch-body").querySelector('[data-sk="' + id + '"]');
      if (g) g.classList.toggle("is-done", state.visited.has(id));
    },
    syncMe() {
      const slot = $("sk-me");
      if (!slot || !sketchUI.shown) return;
      slot.innerHTML = state.pos ? Sketch.meMarkup(sketchUI.cache.get(sketchUI.shown).L, state.pos) : "";
    },
    // 약도의 번호 점을 누르면 그 건물의 카드로 이동
    tap(id) {
      const card = cardEls.get(id);
      if (!card) return;
      if (card.hidden) return toast("지금 필터 때문에 이 건물 카드가 숨겨져 있어요. 필터를 풀면 보여요.", 3600);
      card.scrollIntoView({ block: "start", behavior: "smooth" });
      card.classList.remove("flash");
      void card.offsetWidth;
      card.classList.add("flash");
    }
  };

  /* ───────── 필터 · 정렬 ───────── */
  const passFilters = (b) => (!state.onlyFav || state.fav.has(b.id)) && (!state.onlyTodo || !state.visited.has(b.id));
  const inRegion = (b) => state.region === "all" || b.regionId === state.region;

  function applyFilters() {
    let shown = 0;
    BUILDINGS.forEach((b) => {
      const ok = inRegion(b) && passFilters(b);
      cardEls.get(b.id).hidden = !ok;
      if (ok) shown++;
    });
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", t.dataset.region === state.region));
    const dock = document.querySelector(".dock");
    dock.querySelector('[data-toggle="fav"]').setAttribute("aria-pressed", state.onlyFav);
    dock.querySelector('[data-toggle="todo"]').setAttribute("aria-pressed", state.onlyTodo);
    dock.querySelector('[data-toggle="near"]').setAttribute("aria-pressed", state.sortNear);

    $("empty").hidden = shown > 0;
    if (!shown) {
      const why = [];
      if (state.onlyFav) why.push("즐겨찾기");
      if (state.onlyTodo) why.push("안 가본 곳");
      $("empty-text").textContent = why.length
        ? "'" + why.join(" + ") + "' 조건에 맞는 건축물이 이 권역에 없어요."
        : "표시할 건축물이 없어요.";
      $("clear-filters").hidden = !why.length;
    }
    const note = $("sort-note");
    note.hidden = !state.sortNear;
    if (state.sortNear) note.textContent = "내 위치에서 가까운 순으로 보는 중 · 거리는 직선 기준이에요";
    mapUI.syncVisibility();
    sketchUI.sync();
  }

  function applyOrder() {
    const list = BUILDINGS.slice();
    if (state.sortNear && state.pos) {
      list.sort((a, b) => distanceM(state.pos, PLACES[a.id]) - distanceM(state.pos, PLACES[b.id]));
      state.sortedAt = state.pos;
    }
    const box = $("cards");
    list.forEach((b) => box.appendChild(cardEls.get(b.id)));
  }

  function updateDistances() {
    const targets = [];
    cardEls.forEach((el, id) => targets.push([el, id]));
    if (state.sheetId) targets.push([$("sheet"), state.sheetId]);
    targets.forEach(([el, id]) => {
      const d = el.querySelector("[data-dist]");
      if (!d) return;
      if (state.pos) { d.textContent = "직선 " + fmtDist(distanceM(state.pos, PLACES[id])); d.hidden = false; }
      else d.hidden = true;
    });
  }

  function setRegion(id) {
    state.region = id;
    store.set("region", id);
    applyFilters();
    $("list").scrollTop = 0;
    const tab = document.querySelector('.tab[data-region="' + id + '"]');
    if (tab && tab.scrollIntoView) tab.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    if (state.view === "map") { mapUI.closeSheet(); mapUI.fit(); }
  }

  function toggleFlag(kind, id) {
    const set = kind === "visit" ? state.visited : state.fav;
    const on = !set.has(id);
    if (on) set.add(id); else set.delete(id);
    const saved = store.set(kind === "visit" ? "visited" : "fav", Array.from(set));
    syncFlags(id);
    updateProgress();
    const hiddenByFilter = (kind === "visit" && on && state.onlyTodo) || (kind === "fav" && !on && state.onlyFav);
    applyFilters();
    if (!saved) toast("이 브라우저에서는 기록을 저장할 수 없어요. (시크릿 모드인지 확인해 주세요)");
    else if (hiddenByFilter && state.view === "list") toast(kind === "visit" ? "방문 완료! '안 가본 곳만' 보는 중이라 목록에서 빠졌어요." : "즐겨찾기에서 뺐어요.");
  }

  /* ───────── 내 위치 ───────── */
  const geo = {
    watchId: null,
    wanted: false,
    request() {
      return new Promise((resolve, reject) => {
        if (!("geolocation" in navigator)) return reject({ code: 0 });
        navigator.geolocation.getCurrentPosition(
          (p) => { geo.wanted = true; geo.onPos(p); geo.watch(); resolve(state.pos); },
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
        );
      });
    },
    watch() {
      if (geo.watchId != null || !geo.wanted || document.hidden) return;
      geo.watchId = navigator.geolocation.watchPosition(geo.onPos, () => {}, { enableHighAccuracy: true, maximumAge: 10000 });
    },
    stop() {
      if (geo.watchId != null) { navigator.geolocation.clearWatch(geo.watchId); geo.watchId = null; }
    },
    onPos(p) {
      state.pos = { lat: p.coords.latitude, lng: p.coords.longitude };
      updateDistances();
      // 읽는 도중 카드가 튀지 않게, 120m 이상 움직였을 때만 순서를 다시 맞춥니다.
      if (state.sortNear && (!state.sortedAt || distanceM(state.sortedAt, state.pos) > 120)) applyOrder();
      mapUI.syncMe();
      sketchUI.syncMe();
    },
    message(err) {
      const code = err && err.code;
      if (code === 1) return "위치 권한이 꺼져 있어요. 기본 순서로 보여드릴게요.";
      if (code === 0) return "이 브라우저는 위치 기능을 지원하지 않아요. 기본 순서로 보여드릴게요.";
      return "지금은 위치를 찾지 못했어요. 잠시 뒤 다시 눌러 주세요.";
    }
  };
  document.addEventListener("visibilitychange", () => { if (document.hidden) geo.stop(); else geo.watch(); });

  async function toggleNear() {
    const btn = document.querySelector('[data-toggle="near"]');
    if (state.sortNear) {
      state.sortNear = false;
      store.set("sortNear", false);
      applyOrder(); applyFilters();
      $("list").scrollTop = 0;
      return;
    }
    if (btn.dataset.busy) return;
    btn.dataset.busy = "1";
    toast("내 위치를 찾는 중…", 15000);
    try {
      await geo.request();
      state.sortNear = true;
      store.set("sortNear", true);
      applyOrder(); applyFilters();
      $("list").scrollTop = 0;
      toast("가까운 순으로 정렬했어요.", 1800);
    } catch (err) {
      state.sortNear = false;
      store.set("sortNear", false);
      applyOrder(); applyFilters();
      toast(geo.message(err), 4500);
    } finally {
      delete btn.dataset.busy;
    }
  }

  /* ───────── 구글 지도 스크립트: 필요할 때 한 번만 ───────── */
  let mapsPromise = null;
  let authFailed = false;
  function loadMaps() {
    if (mapsPromise) return mapsPromise;
    const key = String(CONFIG.GOOGLE_MAPS_API_KEY || "").trim();
    mapsPromise = new Promise((resolve, reject) => {
      if (!/^AIza[\w-]{20,}$/.test(key)) return reject({ type: "nokey" });
      if (navigator.onLine === false) return reject({ type: "offline" });
      const cb = "__gmReady" + Date.now();
      const s = document.createElement("script");
      const timer = setTimeout(() => { s.remove(); reject({ type: "timeout" }); }, 20000);
      window[cb] = () => { clearTimeout(timer); delete window[cb]; resolve(window.google.maps); };
      window.gm_authFailure = () => { authFailed = true; mapUI.showMsg("auth"); svUI.authFailed(); };
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key) +
        "&v=weekly&loading=async&language=ko&region=JP&callback=" + cb;
      s.async = true;
      s.onerror = () => { clearTimeout(timer); s.remove(); reject({ type: navigator.onLine === false ? "offline" : "network" }); };
      document.head.appendChild(s);
    });
    mapsPromise.catch(() => { mapsPromise = null; });   // 실패하면 다음에 다시 시도할 수 있게
    return mapsPromise;
  }

  const MSG = {
    loading: ["지도를 불러오는 중…", "", false],
    nokey: ["지도 키가 아직 없어요", "config.js 파일에 구글 지도 API 키를 넣으면 지도와 스트리트뷰가 열려요.\n목록, 길찾기, 방문 체크는 지금도 쓸 수 있어요.", false],
    offline: ["오프라인이에요", "구글 지도는 인터넷이 있어야 열려요.\n목록과 방문 체크는 그대로 쓸 수 있고, 연결되면 지도가 자동으로 다시 열려요.", true],
    network: ["지도를 불러오지 못했어요", "데이터 연결이 불안정한 것 같아요. 잠시 뒤 다시 시도해 주세요.", true],
    timeout: ["지도가 너무 늦게 열려요", "데이터 연결이 느린 것 같아요. 잠시 뒤 다시 시도해 주세요.", true],
    auth: ["지도 키를 확인해 주세요", "API 키가 잘못됐거나, 이 사이트 주소에서 쓸 수 없게 제한돼 있어요.\nREADME의 '키 제한' 설정을 확인해 주세요.", false],
    error: ["지도를 여는 중 문제가 생겼어요", "잠시 뒤 다시 시도해 주세요.", true]
  };

  /* ───────── 전체 지도 ───────── */
  const mapUI = {
    map: null,
    markers: new Map(),   // id → {marker, el}
    me: null,
    Marker: null,
    msgType: null,
    pendingFocus: null,

    showMsg(type) {
      mapUI.msgType = type;
      const [title, text, retry] = MSG[type] || MSG.error;
      $("map-msg-title").textContent = title;
      $("map-msg-text").textContent = text;
      $("map-retry").hidden = !retry;
      $("map-msg").hidden = false;
    },
    hideMsg() { mapUI.msgType = null; $("map-msg").hidden = true; },

    async open(focusId) {
      if (focusId) mapUI.pendingFocus = focusId;
      if (mapUI.map) {
        if (authFailed) return mapUI.showMsg("auth");
        if (mapUI.pendingFocus) mapUI.focus(mapUI.pendingFocus); else if (!state.sheetId) mapUI.fit();
        mapUI.pendingFocus = null;
        return;
      }
      if (mapUI.loading) return;
      mapUI.loading = true;
      mapUI.showMsg("loading");
      try {
        const gmaps = await loadMaps();
        const [{ Map: GMap }, { AdvancedMarkerElement }] = await Promise.all([
          gmaps.importLibrary("maps"), gmaps.importLibrary("marker")
        ]);
        mapUI.Marker = AdvancedMarkerElement;
        mapUI.map = new GMap($("map"), {
          center: { lat: 35.681, lng: 139.745 },
          zoom: 12,
          mapId: CONFIG.MAP_ID || "DEMO_MAP_ID",
          disableDefaultUI: true,
          gestureHandling: "greedy",
          clickableIcons: false,
          keyboardShortcuts: false
        });
        mapUI.map.addListener("click", () => mapUI.closeSheet());
        BUILDINGS.forEach((b) => mapUI.addPin(b));
        mapUI.syncVisibility();
        mapUI.syncMe();
        if (authFailed) { mapUI.showMsg("auth"); return; }
        mapUI.hideMsg();
        $("legend").hidden = false;
        $("locate").hidden = false;
        if (mapUI.pendingFocus) mapUI.focus(mapUI.pendingFocus); else mapUI.fit();
        mapUI.pendingFocus = null;
      } catch (err) {
        mapUI.showMsg((err && err.type) || "error");
      } finally {
        mapUI.loading = false;
      }
    },

    addPin(b) {
      const el = document.createElement("div");
      el.className = "pin";
      const marker = new mapUI.Marker({
        map: mapUI.map,
        position: { lat: PLACES[b.id].lat, lng: PLACES[b.id].lng },
        content: el,
        title: b.nameKo,
        gmpClickable: true
      });
      const onTap = () => mapUI.focus(b.id);
      if (marker.addEventListener) marker.addEventListener("gmp-click", onTap);
      else marker.addListener("click", onTap);
      mapUI.markers.set(b.id, { marker, el });
      mapUI.syncPin(b.id);
    },
    syncPin(id) {
      const m = mapUI.markers.get(id);
      if (!m) return;
      const done = state.visited.has(id), fav = state.fav.has(id), sel = state.sheetId === id;
      m.el.className = "pin" + (done ? " is-done" : "") + (fav ? " is-fav" : "") + (sel ? " is-selected" : "");
      m.el.textContent = done ? "✓" : fav ? "★" : "";
      m.marker.zIndex = sel ? 100 : done ? 1 : 10;
    },
    syncVisibility() {
      if (!mapUI.map) return;
      BUILDINGS.forEach((b) => {
        const m = mapUI.markers.get(b.id);
        const show = passFilters(b) || state.sheetId === b.id;
        const want = show ? mapUI.map : null;
        if (m.marker.map !== want) m.marker.map = want;
      });
    },
    syncMe() {
      if (!mapUI.map || !state.pos) return;
      if (!mapUI.me) {
        const el = document.createElement("div");
        el.className = "me-dot";
        mapUI.me = new mapUI.Marker({ map: mapUI.map, position: state.pos, content: el, title: "내 위치", zIndex: 1000 });
      } else {
        mapUI.me.position = state.pos;
      }
    },
    fit() {
      if (!mapUI.map) return;
      let list = BUILDINGS.filter((b) => inRegion(b) && passFilters(b));
      if (!list.length) list = BUILDINGS.filter(inRegion);
      if (list.length === 1) {
        mapUI.map.setCenter(PLACES[list[0].id]);
        mapUI.map.setZoom(16);
        return;
      }
      const bounds = new google.maps.LatLngBounds();
      list.forEach((b) => bounds.extend(PLACES[b.id]));
      mapUI.map.fitBounds(bounds, { top: 70, bottom: 40, left: 36, right: 36 });
    },
    focus(id) {
      const b = BY_ID.get(id);
      if (!b) return;
      const prev = state.sheetId;
      state.sheetId = id;
      const sheet = $("sheet");
      sheet.innerHTML = sheetHTML(b);
      sheet.hidden = false;
      sheet.scrollTop = 0;
      $("mapview").classList.add("has-sheet");
      syncFlags(id);
      updateDistances();
      if (prev && prev !== id) mapUI.syncPin(prev);
      mapUI.syncVisibility();
      if (mapUI.map) {
        if (mapUI.map.getZoom() < 15) mapUI.map.setZoom(16);
        mapUI.map.panTo(PLACES[id]);
        // 시트에 가려지지 않게 핀을 화면 위쪽으로 올려 줍니다.
        const shift = Math.round(sheet.offsetHeight / 2);
        if (shift) mapUI.map.panBy(0, shift);
      }
    },
    closeSheet() {
      if (!state.sheetId) return;
      const prev = state.sheetId;
      state.sheetId = null;
      $("sheet").hidden = true;
      $("sheet").innerHTML = "";
      $("mapview").classList.remove("has-sheet");
      mapUI.syncPin(prev);
      mapUI.syncVisibility();
    },
    async locate() {
      const fab = $("locate");
      if (fab.classList.contains("busy")) return;
      fab.classList.add("busy");
      try {
        const pos = await geo.request();
        mapUI.syncMe();
        mapUI.map.panTo(pos);
        if (mapUI.map.getZoom() < 15) mapUI.map.setZoom(15);
      } catch (err) {
        toast(geo.message(err).replace(" 기본 순서로 보여드릴게요.", ""), 4500);
      } finally {
        fab.classList.remove("busy");
      }
    }
  };

  /* ───────── 스트리트뷰 ─────────
   * 건물 좌표에 파노라마가 없을 수 있으므로, 가까운 야외 파노라마를 반경을 넓혀 가며 찾고
   * 찾은 지점에서 건물 쪽을 바라보게 방향(heading)을 계산합니다. 없으면 안내 문구를 보여줍니다.
   */
  const svUI = {
    pano: null,
    openId: null,
    token: 0,

    msg(title, text, b) {
      $("sv-msg-title").textContent = title;
      $("sv-msg-text").textContent = text;
      $("sv-msg-actions").innerHTML = b ? goHTML(b) : "";
      $("sv-msg").hidden = false;
    },
    authFailed() { if (svUI.openId) svUI.msg(MSG.auth[0], MSG.auth[1]); },

    find(svc, lib, location, radius) {
      return new Promise((resolve, reject) => {
        const req = { location, radius, preference: lib.StreetViewPreference.NEAREST, sources: [lib.StreetViewSource.OUTDOOR] };
        const p = svc.getPanorama(req, (data, status) => {
          if (status === lib.StreetViewStatus.OK && data && data.location) resolve(data);
          else if (status === lib.StreetViewStatus.ZERO_RESULTS) resolve(null);
          else reject({ type: navigator.onLine === false ? "offline" : "network" });
        });
        if (p && p.catch) p.catch(() => {});
      });
    },

    async open(id) {
      const b = BY_ID.get(id);
      if (!b) return;
      const token = ++svUI.token;
      svUI.openId = id;
      $("sv-title").textContent = b.nameKo;
      $("sv-sub").textContent = "가까운 거리 사진을 찾는 중…";
      $("sv").hidden = false;
      if (svUI.pano) svUI.pano.setVisible(false);
      svUI.msg(MSG.loading[0].replace("지도", "스트리트뷰"), "");
      try {
        const gmaps = await loadMaps();
        const lib = await gmaps.importLibrary("streetView");
        if (token !== svUI.token) return;
        if (authFailed) return svUI.authFailed();
        const target = { lat: PLACES[id].lat, lng: PLACES[id].lng };
        const svc = new lib.StreetViewService();
        let data = null;
        for (const radius of [50, 120, 300]) {
          data = await svUI.find(svc, lib, target, radius);
          if (token !== svUI.token) return;
          if (data) break;
        }
        if (!data) {
          $("sv-sub").textContent = "스트리트뷰 없음";
          return svUI.msg("근처에 스트리트뷰가 없어요",
            "이 건물 주변 300m 안에는 거리 사진이 없어요.\n대신 구글맵 앱에서 위치를 확인해 보세요.", b);
        }
        const at = { lat: data.location.latLng.lat(), lng: data.location.latLng.lng() };
        const far = distanceM(at, target);
        const pov = { heading: bearing(at, target), pitch: far < 60 ? 18 : 8 };
        if (!svUI.pano) {
          svUI.pano = new lib.StreetViewPanorama($("pano"), {
            pano: data.location.pano, pov, zoom: 0,
            addressControl: false, fullscreenControl: false, motionTracking: false,
            motionTrackingControl: false, showRoadLabels: false, zoomControl: false
          });
        } else {
          svUI.pano.setPano(data.location.pano);
          svUI.pano.setPov(pov);
          svUI.pano.setZoom(0);
        }
        svUI.pano.setVisible(true);
        $("sv-msg").hidden = true;
        $("sv-sub").textContent = "건물에서 약 " + fmtDist(far) + " 떨어진 지점 · 건물 방향을 보고 있어요";
      } catch (err) {
        if (token !== svUI.token) return;
        const m = MSG[(err && err.type) || "error"] || MSG.error;
        $("sv-sub").textContent = "";
        svUI.msg(m[0].replace("지도", "스트리트뷰"), m[1].replace(/지도/g, "스트리트뷰"), err && err.type === "nokey" ? null : b);
      }
    },
    close() {
      svUI.token++;
      svUI.openId = null;
      $("sv").hidden = true;
      if (svUI.pano) svUI.pano.setVisible(false);
    }
  };

  /* ───────── 화면 전환 (폰의 '뒤로' 버튼이 앱을 닫지 않고 한 단계만 돌아가게) ───────── */
  function showView(view, focusId) {
    state.view = view;
    document.body.classList.toggle("view-map", view === "map");
    $("list").hidden = view !== "list";
    $("mapview").hidden = view !== "map";
    document.querySelectorAll(".dock [data-view]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === view));
    if (view === "map") mapUI.open(focusId);
  }
  function go(view, focusId) {
    if (view === state.view) { if (view === "map") mapUI.open(focusId); return; }
    if (view === "map") { history.pushState({ view: "map" }, ""); showView("map", focusId); }
    else if (history.state && history.state.view === "map") history.back();
    else showView("list");
  }
  function openSV(id) {
    history.pushState({ view: state.view, sv: id }, "");
    svUI.open(id);
  }
  window.addEventListener("popstate", (e) => {
    const st = e.state || {};
    if (!st.sv && svUI.openId) svUI.close();
    const view = st.view === "map" ? "map" : "list";
    if (view !== state.view) showView(view);
  });

  /* ───────── 이벤트 (한 곳에서 위임 처리) ───────── */
  function onAction(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "close-sheet") return mapUI.closeSheet();
    const holder = btn.closest("[data-id]");
    const id = holder ? holder.dataset.id : state.sheetId;
    if (!id) return;
    if (act === "fav" || act === "visit") toggleFlag(act, id);
    else if (act === "map") go("map", id);
    else if (act === "sv") openSV(id);
  }

  function bind() {
    $("tabs").addEventListener("click", (e) => {
      const t = e.target.closest(".tab");
      if (t) setRegion(t.dataset.region);
    });
    $("cards").addEventListener("click", onAction);
    $("sketch-body").addEventListener("click", (e) => {
      const g = e.target.closest("[data-sk]");
      if (g) sketchUI.tap(g.dataset.sk);
    });
    $("sketch").open = !!store.get("sketchOpen", true);
    $("sketch").addEventListener("toggle", () => store.set("sketchOpen", $("sketch").open));
    $("sheet").addEventListener("click", onAction);
    document.querySelector(".dock").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.view) return go(b.dataset.view);
      const t = b.dataset.toggle;
      if (t === "near") return toggleNear();
      if (t === "fav") { state.onlyFav = !state.onlyFav; store.set("onlyFav", state.onlyFav); }
      if (t === "todo") { state.onlyTodo = !state.onlyTodo; store.set("onlyTodo", state.onlyTodo); }
      applyFilters();
      $("list").scrollTop = 0;
      if (state.view === "map" && !state.sheetId) mapUI.fit();
    });
    $("clear-filters").addEventListener("click", () => {
      state.onlyFav = state.onlyTodo = false;
      store.set("onlyFav", false); store.set("onlyTodo", false);
      applyFilters();
    });
    $("map-retry").addEventListener("click", () => mapUI.open());
    $("locate").addEventListener("click", () => mapUI.locate());
    $("sv-close").addEventListener("click", () => {
      if (history.state && history.state.sv) history.back(); else svUI.close();
    });

    const syncOnline = () => {
      const off = navigator.onLine === false;
      $("offline-banner").hidden = !off;
      if (!off && state.view === "map" && !mapUI.map && ["offline", "network", "timeout"].includes(mapUI.msgType)) mapUI.open();
    };
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    syncOnline();
  }

  /* ───────── 시작 ───────── */
  async function restoreNear() {
    // 지난번에 '가까운 순'을 켜 뒀고 위치 권한이 이미 허용돼 있을 때만 조용히 다시 켭니다.
    // (앱을 열자마자 권한 창이 뜨지 않게)
    if (!store.get("sortNear", false)) return;
    try {
      if (!navigator.permissions) return;
      const st = await navigator.permissions.query({ name: "geolocation" });
      if (st.state !== "granted") return;
      await geo.request();
      state.sortNear = true;
      applyOrder(); applyFilters();
    } catch (e) { /* 기본 순서 유지 */ }
  }

  function init() {
    try { history.replaceState(null, ""); } catch (e) {}
    renderOnce();
    bind();
    updateProgress();
    applyFilters();
    restoreNear();
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
  }
  init();
})();
