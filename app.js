/* 養生村地圖 v2 — 純前端，資料在 data/villages.json */
(function () {
  'use strict';

  // ---------- 儲存（localStorage 可能被擋，全部包 try/catch） ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ysm:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ysm:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };

  // 舊版只存一個中心點與常用地點，轉成新的「我的地點」清單
  function loadPlaces() {
    let places = store.get('places', null);
    if (places) return places;
    places = [];
    const old = store.get('center', null);
    if (old && old.name && old.name !== '政大附近') places.push({ id: 'p' + Date.now(), name: old.name, lat: old.lat, lng: old.lng, on: true });
    (store.get('myPlaces', []) || []).forEach((p, i) => {
      if (!places.some(x => x.name === p.name)) places.push({ id: 'p' + (Date.now() + i + 1), name: p.name, lat: p.lat, lng: p.lng, on: false });
    });
    store.set('places', places);
    return places;
  }

  const state = {
    villages: [],
    places: loadPlaces(),
    routes: store.get('routes', {}),
    favs: store.get('favs', []),
    notes: store.get('notes', {}),
    compare: store.get('compare', []),
    filters: { cities: [], type: 'all', monthly: null, deposit: null, sort: 'distance' },
    picking: false
  };

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- 格式 ----------
  function wan(n) {
    if (n == null) return null;
    if (n >= 10000) return (Math.round(n / 100) / 100).toString() + ' 萬';
    return n.toLocaleString('zh-TW') + ' 元';
  }
  function range(r) {
    if (!r || (r.min == null && r.max == null)) return null;
    if (r.min != null && r.max != null && r.min !== r.max) return wan(r.min) + '～' + wan(r.max);
    if (r.min != null && r.max == null) return wan(r.min) + ' 起';
    return wan(r.min != null ? r.min : r.max);
  }
  function mid(r) {
    if (!r || r.min == null) return null;
    return r.max != null ? (r.min + r.max) / 2 : r.min;
  }
  // 成立年度與成立幾年（依今天的年份自動計算）
  function foundedText(v) {
    if (!v.founded) return v.founded_note ? '待查證（' + v.founded_note + '）' : '待查證';
    const age = new Date().getFullYear() - v.founded;
    if (age <= 0) return v.founded + ' 年' + (v.founded_note ? '（' + v.founded_note + '）' : '（新開幕）');
    return v.founded + ' 年・已成立 ' + age + ' 年';
  }
  const foundedShort = v => {
    if (!v.founded) return null;
    const age = new Date().getFullYear() - v.founded;
    return age <= 0 ? v.founded + ' 年' + (v.founded_note ? '啟用' : '新開') : '成立 ' + age + ' 年';
  };
  const typeName = t => ({ public: '公辦民營', private: '私立', nonprofit: '財團法人' }[t] || t);
  const typeClass = t => (t === 'public' ? 'public' : 'private');

  function km(a, b) {
    const R = 6371, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // ---------- 我的地點與車程 ----------
  const activePlaces = () => state.places.filter(p => p.on);
  const routeKey = (p, v) => p.lat.toFixed(5) + ',' + p.lng.toFixed(5) + '>' + v.id;

  // 有路線資料就用路線，否則用直線距離估算（市區平均車速約 30 公里）
  function trip(p, v) {
    const r = state.routes[routeKey(p, v)];
    if (r) return { km: r.km, min: r.min, real: true };
    const road = km(p, v) * 1.35;
    return { km: road, min: road / 30 * 60 + 5, real: false };
  }
  function minText(m) {
    m = Math.max(5, Math.round(m / 5) * 5);
    if (m < 60) return m + ' 分鐘';
    const h = Math.floor(m / 60), r = m % 60;
    return h + ' 小時' + (r ? ' ' + r + ' 分' : '');
  }
  const tripText = (p, v) => { const t = trip(p, v); return '約 ' + t.km.toFixed(1) + ' 公里・開車約 ' + minText(t.min); };
  function nearest(v) {
    const ps = activePlaces();
    if (!ps.length) return null;
    return Math.min(...ps.map(p => trip(p, v).min));
  }
  function directionsUrl(p, v) {
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + p.lat + ',' + p.lng +
      '&destination=' + encodeURIComponent(v.name + ' ' + v.city + v.district);
  }

  // 用 OSRM 免費路線服務一次算出「每個地點 → 每間養生村」的開車距離與時間（不含塞車）
  async function fetchRoutes() {
    const ps = activePlaces().filter(p => state.villages.some(v => !state.routes[routeKey(p, v)]));
    if (!ps.length || !state.villages.length) return;
    const coords = ps.map(p => p.lng + ',' + p.lat).concat(state.villages.map(v => v.lng + ',' + v.lat)).join(';');
    const src = ps.map((_, i) => i).join(';');
    const dst = state.villages.map((_, i) => i + ps.length).join(';');
    const url = 'https://router.project-osrm.org/table/v1/driving/' + coords + '?sources=' + src + '&destinations=' + dst + '&annotations=duration,distance';
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.code !== 'Ok') return;
      ps.forEach((p, i) => state.villages.forEach((v, j) => {
        const d = data.durations[i][j], m = data.distances[i][j];
        if (d != null && m != null) state.routes[routeKey(p, v)] = { min: d / 60, km: m / 1000 };
      }));
      store.set('routes', state.routes);
      refreshDistances();
    } catch (e) { /* 離線或服務忙碌時就用估算值 */ }
  }
  function refreshDistances() {
    rerenderCurrent();
    if (!$('#detail').hidden && state.openId) openDetail(state.openId, true);
  }

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- 字體大小 ----------
  const SIZES = ['', 'big', 'huge'], SIZE_LABEL = ['字 大', '字 特大', '字 一般'];
  let sizeIdx = store.get('size', 0);
  function applySize() {
    document.documentElement.classList.remove('big', 'huge');
    if (SIZES[sizeIdx]) document.documentElement.classList.add(SIZES[sizeIdx]);
    $('#fontBtn').textContent = SIZE_LABEL[sizeIdx];
    if (map) setTimeout(() => map.invalidateSize(), 50);
  }

  // ---------- 分頁 ----------
  function show(view) {
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    $$('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
    if (view === 'map' && map) setTimeout(() => map.invalidateSize(), 50);
    if (view === 'list') renderList();
    if (view === 'compare') renderCompare();
    if (view === 'charts') renderCharts();
    if (view === 'fav') renderFavs();
    window.scrollTo(0, 0);
  }

  // ---------- 地圖 ----------
  let map, placeLayer, pickBanner;
  function initMap() {
    map = L.map('map', { zoomControl: true, tap: true }).setView([25.04, 121.5], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    placeLayer = L.layerGroup().addTo(map);

    state.villages.forEach(v => {
      const color = v.type === 'public' ? '#1f5f8b' : '#c2571a';
      const m = L.circleMarker([v.lat, v.lng], {
        radius: 13, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1
      }).addTo(map);
      m.bindPopup(() => {
        const div = document.createElement('div');
        const ps = activePlaces();
        div.innerHTML = '<b>' + esc(v.name) + '</b><br>' + esc(v.district) +
          '<br>每月：' + esc(range(v.monthly) || '請電洽') +
          (ps.length ? '<ul class="dist-list">' + ps.map(p => '<li>離 <b>' + esc(p.name) + '</b><br><span class="drive">' + esc(tripText(p, v)) + '</span></li>').join('') + '</ul>' : '') +
          '<button type="button">看詳細</button>';
        div.querySelector('button').onclick = () => openDetail(v.id);
        return div;
      }, { maxWidth: 260 });
    });

    map.on('click', e => {
      if (!state.picking) return;
      state.picking = false;
      if (pickBanner) { pickBanner.remove(); pickBanner = null; }
      addPlace(e.latlng.lat, e.latlng.lng);
    });
    drawPlaces();
    fitAll();
  }
  function fitAll() {
    const pts = state.villages.map(v => [v.lat, v.lng]).concat(activePlaces().map(p => [p.lat, p.lng]));
    map.fitBounds(pts, { padding: [30, 30] });
  }
  function drawPlaces() {
    const ps = activePlaces();
    $('#centerLabel').textContent = ps.length ? ps.map(p => p.name).join('、') : '尚未設定，按右邊新增';
    if (!map) return;
    placeLayer.clearLayers();
    ps.forEach(p => {
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: '',
          html: '<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);white-space:nowrap">' +
            '<span style="background:#1d1d1b;color:#fff;font-size:14px;padding:1px 6px;border-radius:6px">' + esc(p.name) + '</span>' +
            '<span style="font-size:28px;line-height:30px">🏠</span></div>',
          iconSize: [0, 0]
        })
      }).addTo(placeLayer);
    });
  }

  // ---------- 我的地點 ----------
  function placesChanged(msg) {
    store.set('places', state.places);
    drawPlaces();
    renderPlaceList();
    rerenderCurrent();
    if (msg) toast(msg);
    fetchRoutes();
  }
  function addPlace(lat, lng, suggested) {
    const input = $('#placeName');
    let name = (input.value || '').trim() || suggested || '';
    if (!name) name = '地點 ' + (state.places.length + 1);
    state.places.push({ id: 'p' + Date.now(), name, lat, lng, on: true });
    input.value = '';
    $('#addrInput').value = '';
    $('#addrResults').innerHTML = '';
    placesChanged('已新增「' + name + '」');
    if (map) fitAll();
  }
  function renderPlaceList() {
    const box = $('#placeList');
    box.innerHTML = '';
    if (!state.places.length) { box.innerHTML = '<p>還沒有地點。用下面的方式新增，例如「政大家」「兒子家」。</p>'; return; }
    state.places.forEach(p => {
      const row = document.createElement('div');
      row.className = 'place-row';
      row.innerHTML = '<button class="big toggle' + (p.on ? ' on' : '') + '" aria-pressed="' + p.on + '">' + (p.on ? '☑ ' : '☐ ') + esc(p.name) + '</button>' +
        '<button class="small" data-act="rename">改名</button><button class="small" data-act="del">刪除</button>';
      row.querySelector('.toggle').onclick = () => { p.on = !p.on; placesChanged(); };
      row.querySelector('[data-act=rename]').onclick = () => {
        const n = (prompt('新的名稱', p.name) || '').trim();
        if (n) { p.name = n; placesChanged(); }
      };
      row.querySelector('[data-act=del]').onclick = () => {
        if (!confirm('確定刪除「' + p.name + '」？')) return;
        state.places = state.places.filter(x => x !== p); placesChanged('已刪除');
      };
      box.appendChild(row);
    });
  }
  function openCenterSheet() { renderPlaceList(); openSheet('centerSheet'); }
  function openSheet(id) { const s = $('#' + id); s.hidden = false; document.body.style.overflow = 'hidden'; s.scrollTop = 0; }
  function closeSheet(id) { $('#' + id).hidden = true; document.body.style.overflow = ''; }

  // 地址搜尋：OpenStreetMap 的免費 Nominatim 服務
  async function searchAddress() {
    const q = $('#addrInput').value.trim();
    const box = $('#addrResults');
    if (!q) { toast('請先輸入地址'); return; }
    box.innerHTML = '<p class="muted">搜尋中…</p>';
    const tryQuery = async query => {
      const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=tw&accept-language=zh-TW&q=' + encodeURIComponent(query);
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      return res.json();
    };
    try {
      let hits = await tryQuery(q);
      // 台灣地址常查不到門牌，退一步用「路名＋段」再找一次
      if (!hits.length) {
        const shorter = q.replace(/\d+(-\d+)?號.*$/, '').replace(/\d+巷.*$/, '').replace(/\d+弄.*$/, '');
        if (shorter && shorter !== q) hits = await tryQuery(shorter);
      }
      box.innerHTML = '';
      if (!hits.length) { box.innerHTML = '<p>找不到這個地址。可以只輸入「區＋路名」，或改用「在地圖上點一個位置」。</p>'; return; }
      box.insertAdjacentHTML('beforeend', '<p class="muted">請點選正確的那一個：</p>');
      hits.forEach(h => {
        const b = document.createElement('button');
        b.className = 'big addr-hit';
        b.textContent = '📍 ' + h.display_name.split(',').slice(0, 4).reverse().join(' ').trim();
        b.onclick = () => addPlace(+h.lat, +h.lon, q.slice(0, 12));
        box.appendChild(b);
      });
    } catch (e) {
      box.innerHTML = '<p>搜尋失敗，請確認網路，或改用「在地圖上點一個位置」。</p>';
    }
  }

  // ---------- 篩選 ----------
  function inRange(r, f) {
    if (!f) return true;
    if (!r || r.min == null) return false;
    const lo = r.min, hi = r.max != null ? r.max : r.min;
    return hi >= f.lo && lo <= f.hi;
  }
  function filtered() {
    const f = state.filters;
    let list = state.villages.filter(v => {
      if (f.cities.length && !f.cities.includes(v.city)) return false;
      if (f.type === 'public' && v.type !== 'public') return false;
      if (f.type === 'private' && v.type === 'public') return false;
      if (!inRange(v.monthly, f.monthly)) return false;
      if (!inRange(v.deposit, f.deposit)) return false;
      return true;
    });
    if (f.sort === 'distance' && activePlaces().length) list.sort((a, b) => nearest(a) - nearest(b));
    else list.sort((a, b) => (a.monthly.min == null ? 1e12 : a.monthly.min) - (b.monthly.min == null ? 1e12 : b.monthly.min));
    return list;
  }
  function parseRange(v) {
    if (v === 'all') return null;
    const [a, b] = v.split('-');
    return { lo: (+a || 0) * 10000, hi: b === '' ? Infinity : (+b) * 10000 - 1 };
  }
  function readCustom(g) {
    const lo = parseFloat($('[data-end=lo]', g).value), hi = parseFloat($('[data-end=hi]', g).value);
    if (isNaN(lo) && isNaN(hi)) return null;
    return { lo: isNaN(lo) ? 0 : lo * 10000, hi: isNaN(hi) ? Infinity : hi * 10000 };
  }

  function distLines(v) {
    const ps = activePlaces();
    if (!ps.length) return '<div class="where">' + esc(v.city + v.district) + '</div>';
    return '<div class="where">' + esc(v.city + v.district) + '</div><ul class="dist-list">' +
      ps.map(p => '<li>離 <b>' + esc(p.name) + '</b> <span class="drive">' + esc(tripText(p, v)) + '</span></li>').join('') + '</ul>';
  }

  function card(v) {
    const el = document.createElement('article');
    el.className = 'card';
    const fav = state.favs.includes(v.id), inCmp = state.compare.includes(v.id);
    el.innerHTML =
      '<h3>' + esc(v.name) + '</h3>' + distLines(v) +
      '<div><span class="badge ' + typeClass(v.type) + '">' + esc(typeName(v.type)) + '</span>' +
      (v.status === 'upcoming' ? '<span class="badge warn">籌備中</span>' : '') +
      (foundedShort(v) ? '<span class="badge">🏛 ' + esc(foundedShort(v)) + '</span>' : '') +
      (v.confidence === 'unverified' ? '<span class="badge warn">資料待查證</span>' : '') +
      v.tags.filter(t => t !== '籌備中' && t !== '待查證' && t !== typeName(v.type)).slice(0, 3).map(t => '<span class="badge">' + esc(t) + '</span>').join('') + '</div>' +
      '<div class="money"><div><small>每月約</small><b>' + esc(range(v.monthly) || '請電洽') + '</b></div>' +
      '<div><small>入住先付</small><b>' + esc(range(v.deposit) || '請電洽') + '</b></div></div>' +
      '<div class="row">' +
      '<button class="btn primary" data-act="detail">看詳細</button>' +
      '<button class="btn" data-act="cmp">' + (inCmp ? '✓ 已加入比較' : '加入比較') + '</button>' +
      '<button class="btn" data-act="fav" aria-label="收藏">' + (fav ? '❤️ 已收藏' : '🤍 收藏') + '</button>' +
      '</div>';
    el.querySelector('[data-act=detail]').onclick = () => openDetail(v.id);
    el.querySelector('[data-act=cmp]').onclick = () => { toggleCompare(v.id); rerenderCurrent(); };
    el.querySelector('[data-act=fav]').onclick = () => { toggleFav(v.id); rerenderCurrent(); };
    return el;
  }
  function rerenderCurrent() {
    const el = $('.view.active');
    if (!el) return;
    const active = el.id.replace('view-', '');
    if (active === 'list') renderList();
    if (active === 'fav') renderFavs();
    if (active === 'compare') renderCompare();
  }

  function renderList() {
    const list = filtered();
    const priced = state.filters.monthly || state.filters.deposit;
    $('#resultCount').textContent = '找到 ' + list.length + ' 處' + (priced ? '（價格未公開的不列入）' : '') +
      (state.filters.sort === 'distance' && !activePlaces().length ? '・先到地圖頁「📍 我的地點」新增地點，才能依距離排序' : '');
    const box = $('#cards'); box.innerHTML = '';
    list.forEach(v => box.appendChild(card(v)));
    if (!list.length) box.innerHTML = '<p>沒有符合的地方，試試放寬條件。</p>';
  }
  function renderFavs() {
    const box = $('#favCards'); box.innerHTML = '';
    const list = state.villages.filter(v => state.favs.includes(v.id));
    list.forEach(v => box.appendChild(card(v)));
    if (!list.length) box.innerHTML = '<p>還沒有收藏。在列表或詳細頁按「🤍 收藏」。</p>';
  }

  function toggleFav(id) {
    const i = state.favs.indexOf(id);
    if (i >= 0) { state.favs.splice(i, 1); toast('已取消收藏'); } else { state.favs.push(id); toast('已收藏'); }
    store.set('favs', state.favs);
  }
  function toggleCompare(id) {
    const i = state.compare.indexOf(id);
    if (i >= 0) { state.compare.splice(i, 1); toast('已移出比較'); }
    else {
      if (state.compare.length >= 3) { toast('最多比較 3 間，請先移除一間'); return; }
      state.compare.push(id); toast('已加入比較（' + state.compare.length + '/3）');
    }
    store.set('compare', state.compare);
    updateCmpCount();
  }
  function updateCmpCount() { $('#cmpCount').textContent = state.compare.length ? '(' + state.compare.length + ')' : ''; }

  // ---------- 詳細頁 ----------
  function openDetail(id, keepScroll) {
    const v = state.villages.find(x => x.id === id);
    if (!v) return;
    state.openId = id;
    const fav = state.favs.includes(v.id), inCmp = state.compare.includes(v.id);
    const nav = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(v.name + ' ' + v.city + v.district);
    const shareUrl = location.href.split('#')[0] + '#/v/' + v.id;
    const shareText = v.name + '（' + v.city + v.district + '）每月約 ' + (range(v.monthly) || '請電洽') + '\n' + shareUrl;
    const line = 'https://line.me/R/share?text=' + encodeURIComponent(shareText);
    const ps = activePlaces();
    const anyEstimate = ps.some(p => !trip(p, v).real);
    const distBox = '<div class="dist-box"><h3>距離與開車時間</h3>' +
      (ps.length
        ? ps.map(p => '<div class="dist-item">離 <b>' + esc(p.name) + '</b><br>' + esc(tripText(p, v)) +
          '<br><a href="' + esc(directionsUrl(p, v)) + '" target="_blank" rel="noopener">🚗 從' + esc(p.name) + '導航過去</a></div>').join('') +
          '<p class="muted">' + (anyEstimate ? '開車時間為估算值。' : '開車時間為一般路況，不含塞車。') + '實際以 Google 地圖為準。</p>'
        : '<p>還沒有設定地點。<button class="small" id="dAddPlace">📍 新增我的地點</button></p>') +
      '</div>';
    const b = $('#detailBody');
    const scroll = $('#detail').scrollTop;
    b.innerHTML =
      '<h2 id="dTitle">' + esc(v.name) + '</h2>' +
      '<div class="where">' + esc(v.city + v.district) + '</div>' +
      '<div><span class="badge ' + typeClass(v.type) + '">' + esc(typeName(v.type)) + '</span>' +
      v.tags.filter(t => t !== typeName(v.type)).map(t => '<span class="badge">' + esc(t) + '</span>').join('') + '</div>' +
      '<div class="big-nums two">' +
      '<div><small>每月大約</small><b>' + esc(range(v.monthly) || '請電洽') + '</b><span>' + esc(v.monthly.text) + '</span></div>' +
      '<div><small>入住要先付</small><b>' + esc(range(v.deposit) || '請電洽') + '</b><span>' + esc(v.deposit.text) + '</span></div>' +
      '</div>' + distBox +
      '<div class="stack-btns">' +
      (v.phone ? '<a class="btn primary" href="tel:' + esc(v.phone.replace(/-/g, '')) + '">📞 打電話 ' + esc(v.phone) + '</a>' : '') +
      '<a class="btn" href="' + esc(nav) + '" target="_blank" rel="noopener">🧭 用 Google 地圖查看</a>' +
      '<a class="btn" href="' + esc(line) + '" target="_blank" rel="noopener">💬 用 LINE 傳給家人</a>' +
      '</div>' +
      '<div class="row" style="margin-top:10px">' +
      '<button class="btn" id="dFav">' + (fav ? '❤️ 已收藏' : '🤍 收藏') + '</button>' +
      '<button class="btn" id="dCmp">' + (inCmp ? '✓ 已加入比較' : '加入比較') + '</button>' +
      '</div>' +
      '<h2>基本資料</h2>' +
      '<dl class="info">' +
      '<div><dt>成立年度</dt><dd>' + esc(foundedText(v)) + (v.founded_source ? '　<a href="' + esc(v.founded_source) + '" target="_blank" rel="noopener">來源</a>' : (v.founded_by === 'family' ? '　<span class="muted">（家人提供）</span>' : '')) + '</dd></div>' +
      '<div><dt>地址</dt><dd>' + esc(v.address) + '</dd></div>' +
      '<div><dt>房型</dt><dd>' + esc(v.rooms) + '</dd></div>' +
      '<div><dt>醫療資源</dt><dd>' + esc(v.medical) + '</dd></div>' +
      '<div><dt>入住資格</dt><dd>' + esc(v.eligibility) + '</dd></div>' +
      '</dl>' +
      '<p class="source">' + (v.source
        ? '資料來源：<a href="' + esc(v.source) + '" target="_blank" rel="noopener">' + esc(v.source_name) + '</a>・' + esc(v.verified_at) + ' 整理・' + (v.confidence === 'media' ? '媒體報導，尚未向園區確認' : '已確認')
        : '目前沒有可靠的公開資料，請直接電洽。') +
      (v.coord_approx ? '<br>地圖位置為大約位置，距離與車程會有些誤差。' : '') + '</p>' +
      '<h2>我的筆記</h2>' +
      '<textarea id="dNote" placeholder="例如：參訪心得、電話問到的價格、喜不喜歡">' + esc(state.notes[v.id] || '') + '</textarea>' +
      '<p class="muted">筆記會自動存在這支手機上。</p>';
    $('#dFav').onclick = () => { toggleFav(v.id); openDetail(v.id, true); };
    $('#dCmp').onclick = () => { toggleCompare(v.id); openDetail(v.id, true); };
    $('#dNote').oninput = e => { state.notes[v.id] = e.target.value; store.set('notes', state.notes); };
    const addBtn = $('#dAddPlace');
    if (addBtn) addBtn.onclick = () => { closeDetail(); openCenterSheet(); };
    openSheet('detail');
    if (keepScroll) $('#detail').scrollTop = scroll;
    if (location.hash !== '#/v/' + v.id) history.pushState(null, '', '#/v/' + v.id);
  }
  function closeDetail() {
    closeSheet('detail');
    state.openId = null;
    if (location.hash.startsWith('#/v/')) history.pushState(null, '', location.pathname + location.search);
    rerenderCurrent();
  }

  // ---------- 比較 ----------
  function renderCompare() {
    const box = $('#compareBox');
    const list = state.compare.map(id => state.villages.find(v => v.id === id)).filter(Boolean);
    if (!list.length) { box.innerHTML = '<p>還沒有選擇。到「📋 列表」按「加入比較」。</p>'; return; }
    const cheapest = (key) => {
      const vals = list.map(v => v[key].min).filter(x => x != null);
      return vals.length > 1 ? Math.min(...vals) : null;
    };
    const cm = cheapest('monthly'), cd = cheapest('deposit');
    const rows = [
      ['地區', v => v.city + v.district],
      ['類型', v => typeName(v.type)],
      ['成立年度', v => foundedText(v)]
    ];
    activePlaces().forEach(p => rows.push(['離' + p.name, v => tripText(p, v)]));
    rows.push(
      ['每月', v => (range(v.monthly) || '請電洽') + (cm != null && v.monthly.min === cm ? '<span class="best">最省</span>' : ''), true],
      ['入住先付', v => (range(v.deposit) || '請電洽') + (cd != null && v.deposit.min === cd ? '<span class="best">最省</span>' : ''), true],
      ['費用說明', v => v.monthly.text],
      ['房型', v => v.rooms],
      ['醫療', v => v.medical],
      ['資格', v => v.eligibility],
      ['特色', v => v.tags.join('、')]
    );
    let html = '<div class="cmp-wrap"><table class="cmp"><thead><tr>' +
      list.map(v => '<th>' + esc(v.name) + '<br><button class="small" data-rm="' + v.id + '">移除</button></th>').join('') +
      '</tr></thead><tbody>';
    rows.forEach(([label, fn, raw]) => {
      const cells = list.map(v => raw ? fn(v) : esc(fn(v)));
      const plain = list.map(v => String(fn(v)).replace(/<[^>]+>/g, ''));
      const differ = new Set(plain).size > 1 && list.length > 1;
      html += '<tr class="lbl"><th colspan="' + list.length + '">' + esc(label) + '</th></tr>' +
        '<tr>' + cells.map(c => '<td class="' + (differ ? 'diff' : '') + '">' + c + '</td>').join('') + '</tr>';
    });
    html += '</tbody></table></div><p class="muted">淡橘色底＝各家不一樣的地方。</p>';
    box.innerHTML = html;
    $$('[data-rm]', box).forEach(b => b.onclick = () => { toggleCompare(b.dataset.rm); renderCompare(); });
  }

  // ---------- 圖表 ----------
  const charts = {};
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  // 在每條長條的右端寫上金額
  const valueLabels = {
    id: 'valueLabels',
    afterDatasetsDraw(chart, args, opts) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(chart.data.datasets.length - 1);
      ctx.save();
      ctx.font = '600 ' + opts.size + 'px ' + Chart.defaults.font.family;
      ctx.fillStyle = opts.color;
      ctx.textBaseline = 'middle';
      meta.data.forEach((bar, i) => ctx.fillText(opts.texts[i] || '', bar.x + 8, bar.y));
      ctx.restore();
    }
  };
  // 名稱太長時拆成兩行，避免大字體時被切掉
  const twoLines = name => name.length > 5 ? [name.slice(0, Math.ceil(name.length / 2)), name.slice(Math.ceil(name.length / 2))] : name;
  function renderCharts() {
    if (!window.Chart) { $('#monthlyWrap').innerHTML = '<p>圖表需要網路才能顯示。</p>'; return; }
    const fs = parseInt(cssVar('--fs'), 10) || 20;
    const ink = cssVar('--ink'), grid = cssVar('--line');
    const small = Math.round(fs * 0.7);
    Chart.defaults.font.size = small;
    Chart.defaults.color = ink;
    // 標籤要留空間：依字體大小與螢幕寬度估算右側留白
    const padRight = Math.round(fs * 5.2);

    const withFee = state.villages.filter(v => v.monthly.min != null)
      .sort((a, b) => mid(a.monthly) - mid(b.monthly));
    const colors = withFee.map(v => v.type === 'public' ? cssVar('--public') : cssVar('--private'));
    const shortWan = n => (Math.round(n / 1000) / 10) + '萬';
    const monthLabel = v => {
      const r = v.monthly;
      if (r.max != null && r.max !== r.min) return shortWan(r.min) + '～' + shortWan(r.max);
      return shortWan(r.min) + (r.max == null ? '起' : '');
    };

    $('#monthlyWrap').style.height = (withFee.length * (fs * 2.6) + 60) + 'px';
    if (charts.m) charts.m.destroy();
    charts.m = new Chart($('#monthlyChart'), {
      type: 'bar',
      plugins: [valueLabels],
      data: {
        labels: withFee.map(v => twoLines(v.name)),
        datasets: [{
          data: withFee.map(v => [v.monthly.min, v.monthly.max != null ? v.monthly.max : v.monthly.min]),
          backgroundColor: colors, borderColor: colors, borderWidth: 2, borderSkipped: false,
          minBarLength: 8, barThickness: Math.round(fs * 0.9), borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y', maintainAspectRatio: false, animation: false,
        layout: { padding: { right: padRight } },
        plugins: {
          legend: { display: false },
          valueLabels: { size: small, color: ink, texts: withFee.map(monthLabel) },
          tooltip: { callbacks: { label: c => '每月 ' + range(withFee[c.dataIndex].monthly) } }
        },
        scales: {
          x: { grid: { color: grid }, ticks: { maxRotation: 0, maxTicksLimit: 4, callback: val => (val / 10000) + '萬' } },
          y: { grid: { display: false } }
        },
        onClick: (e, els) => { if (els.length) openDetail(withFee[els[0].index].id); }
      }
    });

    const ten = withFee.map(v => {
      const monthly = mid(v.monthly) * 120;
      const dep = mid(v.deposit) || 0;
      const interest = dep * 0.02 * 10;
      return { v, monthly, interest, total: monthly + interest };
    }).sort((a, b) => a.total - b.total);
    $('#tenYearWrap').style.height = (ten.length * (fs * 2.6) + 80) + 'px';
    if (charts.t) charts.t.destroy();
    charts.t = new Chart($('#tenYearChart'), {
      type: 'bar',
      plugins: [valueLabels],
      data: {
        labels: ten.map(x => twoLines(x.v.name)),
        datasets: [
          { label: '月費 × 120 個月', data: ten.map(x => x.monthly), backgroundColor: ten.map(x => x.v.type === 'public' ? cssVar('--public') : cssVar('--private')), stack: 's', barThickness: Math.round(fs * 0.9) },
          { label: '保證金少賺的利息', data: ten.map(x => x.interest), backgroundColor: cssVar('--muted'), stack: 's', barThickness: Math.round(fs * 0.9) }
        ]
      },
      options: {
        indexAxis: 'y', maintainAspectRatio: false, animation: false,
        layout: { padding: { right: padRight * 0.8 } },
        plugins: {
          legend: { position: 'top' },
          valueLabels: { size: small, color: ink, texts: ten.map(x => Math.round(x.total / 10000) + '萬') },
          tooltip: { callbacks: { label: c => c.dataset.label + '：' + wan(Math.round(c.raw)), footer: items => '合計約 ' + wan(Math.round(ten[items[0].dataIndex].total)) } }
        },
        scales: {
          x: { stacked: true, grid: { color: grid }, ticks: { maxRotation: 0, maxTicksLimit: 4, callback: val => (val / 10000) + '萬' } },
          y: { stacked: true, grid: { display: false } }
        },
        onClick: (e, els) => { if (els.length) openDetail(ten[els[0].index].v.id); }
      }
    });
  }

  // ---------- 啟動 ----------
  function bindFilters() {
    $$('.filter-group').forEach(g => {
      const key = g.dataset.key;
      const chips = $$('.chip', g);
      const custom = $('.custom', g);
      chips.forEach(c => c.onclick = () => {
        const v = c.dataset.v;
        if (g.dataset.multi) {
          if (v === 'all') { state.filters[key] = []; }
          else {
            const arr = state.filters[key];
            const i = arr.indexOf(v);
            if (i >= 0) arr.splice(i, 1); else arr.push(v);
          }
          chips.forEach(x => x.classList.toggle('on', x.dataset.v === 'all' ? !state.filters[key].length : state.filters[key].includes(x.dataset.v)));
          chips.forEach(x => x.setAttribute('aria-pressed', x.classList.contains('on')));
        } else {
          chips.forEach(x => x.classList.remove('on')); c.classList.add('on');
          if (g.dataset.range) {
            if (custom) custom.hidden = v !== 'custom';
            state.filters[key] = v === 'custom' ? readCustom(g) : parseRange(v);
            if (v === 'custom') { const first = $('input', custom); if (first) first.focus(); }
          } else state.filters[key] = v;
        }
        renderList();
      });
      if (custom) $$('input', custom).forEach(inp => inp.oninput = () => { state.filters[key] = readCustom(g); renderList(); });
    });
  }
  function bind() {
    $$('.tabbar button').forEach(b => b.onclick = () => show(b.dataset.view));
    $('#fontBtn').onclick = () => { sizeIdx = (sizeIdx + 1) % 3; store.set('size', sizeIdx); applySize(); if ($('#view-charts').classList.contains('active')) renderCharts(); };
    $('#centerBtn').onclick = openCenterSheet;
    $('#detailClose').onclick = closeDetail;
    $$('[data-close]').forEach(b => b.onclick = () => closeSheet(b.closest('.sheet').id));
    $('#addrBtn').onclick = searchAddress;
    $('#addrInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchAddress(); } });
    $('#gpsBtn').onclick = () => {
      if (!navigator.geolocation) { toast('這支手機不支援定位'); return; }
      toast('定位中…');
      navigator.geolocation.getCurrentPosition(
        p => { addPlace(p.coords.latitude, p.coords.longitude, '我現在的位置'); },
        () => toast('無法取得位置，請允許定位或改用其他方式'),
        { enableHighAccuracy: false, timeout: 10000 }
      );
    };
    $('#pickBtn').onclick = () => {
      closeSheet('centerSheet'); show('map'); state.picking = true;
      if (!pickBanner) {
        pickBanner = document.createElement('div'); pickBanner.className = 'pick-banner';
        pickBanner.textContent = '請在地圖上點一下要新增的位置';
        $('#map').appendChild(pickBanner);
      }
    };
    bindFilters();
    window.addEventListener('popstate', () => {
      const m = location.hash.match(/^#\/v\/(.+)$/);
      if (m) openDetail(m[1]); else if (!$('#detail').hidden) { closeSheet('detail'); state.openId = null; rerenderCurrent(); }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (!$('#detail').hidden) closeDetail(); closeSheet('centerSheet'); }
    });
  }

  async function start() {
    applySize();
    bind();
    try {
      const res = await fetch('data/villages.json', { cache: 'no-cache' });
      const data = await res.json();
      state.villages = data.villages;
    } catch (e) {
      document.querySelector('main').innerHTML = '<p>資料載入失敗，請確認網路後重新整理。</p>';
      return;
    }
    state.compare = state.compare.filter(id => state.villages.some(v => v.id === id));
    updateCmpCount();
    if (window.L) initMap(); else $('#map').innerHTML = '<p style="padding:16px">地圖需要網路才能顯示，可以先用「📋 列表」。</p>';
    drawPlaces();
    renderList();
    const m = location.hash.match(/^#\/v\/(.+)$/);
    if (m) openDetail(m[1]);
    fetchRoutes();
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  start();
})();
