/* 養生村地圖 v1 — 純前端，資料在 data/villages.json */
(function () {
  'use strict';

  // ---------- 儲存（localStorage 可能被擋，全部包 try/catch） ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ysm:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ysm:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };

  const PRESETS = [
    { name: '政大附近', lat: 24.9875, lng: 121.5770 },
    { name: '台北車站', lat: 25.0478, lng: 121.5170 },
    { name: '板橋車站', lat: 25.0143, lng: 121.4633 },
    { name: '桃園車站', lat: 24.9893, lng: 121.3136 }
  ];

  const state = {
    villages: [],
    center: store.get('center', PRESETS[0]),
    myPlaces: store.get('myPlaces', []),
    favs: store.get('favs', []),
    notes: store.get('notes', {}),
    compare: store.get('compare', []),
    filters: { city: 'all', type: 'all', budget: 'all', deposit: 'all', sort: 'distance' },
    picking: false
  };

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- 格式 ----------
  function wan(n) {
    if (n == null) return null;
    if (n >= 10000) {
      const w = n / 10000;
      return (Math.round(w * 100) / 100).toString() + ' 萬';
    }
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
  const typeName = t => ({ public: '公辦民營', private: '私立', nonprofit: '財團法人' }[t] || t);
  const typeClass = t => (t === 'public' ? 'public' : 'private');

  function km(a, b) {
    const R = 6371, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const distText = v => '約 ' + km(state.center, v).toFixed(1) + ' 公里';

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
  let map, centerMarker, pickBanner;
  const markers = {};
  function initMap() {
    map = L.map('map', { zoomControl: true, tap: true }).setView([25.04, 121.5], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    state.villages.forEach(v => {
      const color = v.type === 'public' ? '#1f5f8b' : '#c2571a';
      const m = L.circleMarker([v.lat, v.lng], {
        radius: 13, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1
      }).addTo(map);
      m.bindPopup(() => {
        const div = document.createElement('div');
        div.innerHTML = '<b>' + esc(v.name) + '</b><br>' + esc(v.district) +
          '<br>每月：' + esc(range(v.monthly) || '請電洽') +
          '<br>' + esc(distText(v)) + '<br><button type="button">看詳細</button>';
        div.querySelector('button').onclick = () => openDetail(v.id);
        return div;
      });
      markers[v.id] = m;
    });

    map.on('click', e => {
      if (!state.picking) return;
      state.picking = false;
      if (pickBanner) { pickBanner.remove(); pickBanner = null; }
      const name = '我選的地點';
      setCenter({ name, lat: e.latlng.lat, lng: e.latlng.lng });
      askSavePlace(e.latlng);
    });
    drawCenter();
    fitAll();
  }
  function fitAll() {
    const pts = state.villages.map(v => [v.lat, v.lng]).concat([[state.center.lat, state.center.lng]]);
    map.fitBounds(pts, { padding: [30, 30] });
  }
  function drawCenter() {
    if (!map) return;
    if (centerMarker) centerMarker.remove();
    centerMarker = L.marker([state.center.lat, state.center.lng], {
      icon: L.divIcon({ className: '', html: '<div style="font-size:30px;line-height:30px">🏠</div>', iconSize: [30, 30], iconAnchor: [15, 28] })
    }).addTo(map).bindPopup('距離從這裡算：' + esc(state.center.name));
    $('#centerLabel').textContent = state.center.name;
  }
  function setCenter(c) {
    state.center = { name: c.name, lat: c.lat, lng: c.lng };
    store.set('center', state.center);
    drawCenter();
    renderList();
    toast('距離改從「' + c.name + '」計算');
  }
  function askSavePlace(latlng) {
    const pop = document.createElement('div');
    pop.innerHTML = '<b>已改從這裡算距離</b><button type="button">存成常用地點</button>';
    pop.querySelector('button').onclick = () => {
      const name = (prompt('幫這個地點取個名字（例如：女兒家）', '') || '').trim();
      if (!name) return;
      state.myPlaces.push({ name, lat: latlng.lat, lng: latlng.lng });
      store.set('myPlaces', state.myPlaces);
      setCenter({ name, lat: latlng.lat, lng: latlng.lng });
      map.closePopup();
    };
    L.popup().setLatLng(latlng).setContent(pop).openOn(map);
  }

  // ---------- 換地點 ----------
  function openCenterSheet() {
    const box = $('#centerPresets');
    box.innerHTML = '';
    const all = PRESETS.map(p => ({ ...p, mine: false })).concat(state.myPlaces.map(p => ({ ...p, mine: true })));
    all.forEach((p, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'row';
      const b = document.createElement('button');
      b.className = 'big' + (p.name === state.center.name ? ' chip on' : '');
      b.textContent = (p.mine ? '⭐ ' : '🏠 ') + p.name;
      b.onclick = () => { setCenter(p); closeSheet('centerSheet'); };
      wrap.appendChild(b);
      if (p.mine) {
        const del = document.createElement('button');
        del.className = 'small'; del.style.flex = '0 0 auto'; del.textContent = '刪除';
        del.onclick = () => {
          state.myPlaces = state.myPlaces.filter(x => !(x.name === p.name && x.lat === p.lat));
          store.set('myPlaces', state.myPlaces); openCenterSheet();
        };
        wrap.appendChild(del);
      }
      box.appendChild(wrap);
    });
    openSheet('centerSheet');
  }
  function openSheet(id) { const s = $('#' + id); s.hidden = false; document.body.style.overflow = 'hidden'; s.scrollTop = 0; }
  function closeSheet(id) { $('#' + id).hidden = true; document.body.style.overflow = ''; }

  // ---------- 篩選 ----------
  function filtered() {
    const f = state.filters;
    let list = state.villages.filter(v => {
      if (f.city !== 'all' && v.city !== f.city) return false;
      if (f.type === 'public' && v.type !== 'public') return false;
      if (f.type === 'private' && v.type === 'public') return false;
      if (f.budget !== 'all') { if (v.monthly.min == null || v.monthly.min > +f.budget) return false; }
      if (f.deposit !== 'all') { if (v.deposit.min == null || v.deposit.min > +f.deposit) return false; }
      return true;
    });
    if (f.sort === 'distance') list.sort((a, b) => km(state.center, a) - km(state.center, b));
    else list.sort((a, b) => (a.monthly.min == null ? 1e12 : a.monthly.min) - (b.monthly.min == null ? 1e12 : b.monthly.min));
    return list;
  }

  function card(v) {
    const el = document.createElement('article');
    el.className = 'card';
    const fav = state.favs.includes(v.id), inCmp = state.compare.includes(v.id);
    el.innerHTML =
      '<h3>' + esc(v.name) + '</h3>' +
      '<div class="where">' + esc(v.city + v.district) + '・' + esc(distText(v)) + '</div>' +
      '<div><span class="badge ' + typeClass(v.type) + '">' + esc(typeName(v.type)) + '</span>' +
      (v.status === 'upcoming' ? '<span class="badge warn">籌備中</span>' : '') +
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
    const active = $('.view.active').id.replace('view-', '');
    if (active === 'list') renderList();
    if (active === 'fav') renderFavs();
  }

  function renderList() {
    const list = filtered();
    $('#resultCount').textContent = '找到 ' + list.length + ' 處';
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
  function openDetail(id) {
    const v = state.villages.find(x => x.id === id);
    if (!v) return;
    const fav = state.favs.includes(v.id), inCmp = state.compare.includes(v.id);
    const nav = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(v.name + ' ' + v.city + v.district);
    const shareUrl = location.href.split('#')[0] + '#/v/' + v.id;
    const shareText = v.name + '（' + v.city + v.district + '）每月約 ' + (range(v.monthly) || '請電洽') + '\n' + shareUrl;
    const line = 'https://line.me/R/share?text=' + encodeURIComponent(shareText);
    const b = $('#detailBody');
    b.innerHTML =
      '<h2 id="dTitle">' + esc(v.name) + '</h2>' +
      '<div class="where">' + esc(v.city + v.district) + '</div>' +
      '<div><span class="badge ' + typeClass(v.type) + '">' + esc(typeName(v.type)) + '</span>' +
      v.tags.filter(t => t !== typeName(v.type)).map(t => '<span class="badge">' + esc(t) + '</span>').join('') + '</div>' +
      '<div class="big-nums">' +
      '<div><small>每月大約</small><b>' + esc(range(v.monthly) || '請電洽') + '</b><span>' + esc(v.monthly.text) + '</span></div>' +
      '<div><small>入住要先付</small><b>' + esc(range(v.deposit) || '請電洽') + '</b><span>' + esc(v.deposit.text) + '</span></div>' +
      '<div><small>離「' + esc(state.center.name) + '」</small><b>' + esc(distText(v)) + '</b><span>直線距離</span></div>' +
      '</div>' +
      '<div class="stack-btns">' +
      (v.phone ? '<a class="btn primary" href="tel:' + esc(v.phone.replace(/-/g, '')) + '">📞 打電話 ' + esc(v.phone) + '</a>' : '') +
      '<a class="btn" href="' + esc(nav) + '" target="_blank" rel="noopener">🧭 導航（Google 地圖）</a>' +
      '<a class="btn" href="' + esc(line) + '" target="_blank" rel="noopener">💬 用 LINE 傳給家人</a>' +
      '</div>' +
      '<div class="row" style="margin-top:10px">' +
      '<button class="btn" id="dFav">' + (fav ? '❤️ 已收藏' : '🤍 收藏') + '</button>' +
      '<button class="btn" id="dCmp">' + (inCmp ? '✓ 已加入比較' : '加入比較') + '</button>' +
      '</div>' +
      '<h2>基本資料</h2>' +
      '<dl class="info">' +
      '<div><dt>地址</dt><dd>' + esc(v.address) + '</dd></div>' +
      '<div><dt>房型</dt><dd>' + esc(v.rooms) + '</dd></div>' +
      '<div><dt>醫療資源</dt><dd>' + esc(v.medical) + '</dd></div>' +
      '<div><dt>入住資格</dt><dd>' + esc(v.eligibility) + '</dd></div>' +
      '</dl>' +
      '<p class="source">' + (v.source
        ? '資料來源：<a href="' + esc(v.source) + '" target="_blank" rel="noopener">' + esc(v.source_name) + '</a>・' + esc(v.verified_at) + ' 整理・' + (v.confidence === 'media' ? '媒體報導，尚未向園區確認' : '已確認')
        : '目前沒有可靠的公開資料，請直接電洽。') +
      (v.coord_approx ? '<br>地圖位置為大約位置。' : '') + '</p>' +
      '<h2>我的筆記</h2>' +
      '<textarea id="dNote" placeholder="例如：參訪心得、電話問到的價格、喜不喜歡">' + esc(state.notes[v.id] || '') + '</textarea>' +
      '<p class="muted">筆記會自動存在這支手機上。</p>';
    $('#dFav').onclick = () => { toggleFav(v.id); openDetail(v.id); };
    $('#dCmp').onclick = () => { toggleCompare(v.id); openDetail(v.id); };
    $('#dNote').oninput = e => { state.notes[v.id] = e.target.value; store.set('notes', state.notes); };
    openSheet('detail');
    if (location.hash !== '#/v/' + v.id) history.pushState(null, '', '#/v/' + v.id);
  }
  function closeDetail() {
    closeSheet('detail');
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
      ['距離', v => distText(v)],
      ['每月', v => (range(v.monthly) || '請電洽') + (cm != null && v.monthly.min === cm ? '<span class="best">最省</span>' : ''), true],
      ['入住先付', v => (range(v.deposit) || '請電洽') + (cd != null && v.deposit.min === cd ? '<span class="best">最省</span>' : ''), true],
      ['費用說明', v => v.monthly.text],
      ['房型', v => v.rooms],
      ['醫療', v => v.medical],
      ['資格', v => v.eligibility],
      ['特色', v => v.tags.join('、')]
    ];
    let html = '<div class="cmp-wrap"><table class="cmp" style="--n:' + list.length + '"><thead><tr>' +
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
  function renderCharts() {
    if (!window.Chart) { $('#monthlyWrap').innerHTML = '<p>圖表需要網路才能顯示。</p>'; return; }
    const fs = parseInt(cssVar('--fs'), 10) || 20;
    const ink = cssVar('--ink'), grid = cssVar('--line');
    Chart.defaults.font.size = Math.round(fs * 0.75);
    Chart.defaults.color = ink;

    const withFee = state.villages.filter(v => v.monthly.min != null)
      .sort((a, b) => mid(a.monthly) - mid(b.monthly));
    const colors = withFee.map(v => v.type === 'public' ? cssVar('--public') : cssVar('--private'));

    const h1 = withFee.length * (fs * 2.2) + 60;
    $('#monthlyWrap').style.height = h1 + 'px';
    if (charts.m) charts.m.destroy();
    charts.m = new Chart($('#monthlyChart'), {
      type: 'bar',
      data: {
        labels: withFee.map(v => v.name),
        datasets: [{
          data: withFee.map(v => [v.monthly.min, v.monthly.max != null ? v.monthly.max : v.monthly.min]),
          backgroundColor: colors, borderColor: colors, borderWidth: 2, borderSkipped: false,
          minBarLength: 8, barThickness: Math.round(fs * 0.9), borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y', maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => { const v = withFee[c.dataIndex]; return '每月 ' + range(v.monthly); } } }
        },
        scales: {
          x: { grid: { color: grid }, ticks: { callback: val => (val / 10000) + ' 萬' }, title: { display: true, text: '每月費用（萬元）' } },
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
    const h2 = ten.length * (fs * 2.2) + 80;
    $('#tenYearWrap').style.height = h2 + 'px';
    if (charts.t) charts.t.destroy();
    charts.t = new Chart($('#tenYearChart'), {
      type: 'bar',
      data: {
        labels: ten.map(x => x.v.name),
        datasets: [
          { label: '月費 × 120 個月', data: ten.map(x => x.monthly), backgroundColor: ten.map(x => x.v.type === 'public' ? cssVar('--public') : cssVar('--private')), stack: 's', barThickness: Math.round(fs * 0.9) },
          { label: '保證金少賺的利息', data: ten.map(x => x.interest), backgroundColor: cssVar('--muted'), stack: 's', barThickness: Math.round(fs * 0.9) }
        ]
      },
      options: {
        indexAxis: 'y', maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: { callbacks: { label: c => c.dataset.label + '：' + wan(Math.round(c.raw)), footer: items => '合計約 ' + wan(Math.round(ten[items[0].dataIndex].total)) } }
        },
        scales: {
          x: { stacked: true, grid: { color: grid }, ticks: { callback: val => (val / 10000) + ' 萬' }, title: { display: true, text: '10 年總花費（萬元）' } },
          y: { stacked: true, grid: { display: false } }
        },
        onClick: (e, els) => { if (els.length) openDetail(ten[els[0].index].v.id); }
      }
    });
  }

  // ---------- 啟動 ----------
  function bind() {
    $$('.tabbar button').forEach(b => b.onclick = () => show(b.dataset.view));
    $('#fontBtn').onclick = () => { sizeIdx = (sizeIdx + 1) % 3; store.set('size', sizeIdx); applySize(); if ($('#view-charts').classList.contains('active')) renderCharts(); };
    $('#centerBtn').onclick = openCenterSheet;
    $('#detailClose').onclick = closeDetail;
    $$('[data-close]').forEach(b => b.onclick = () => closeSheet(b.closest('.sheet').id));
    $('#gpsBtn').onclick = () => {
      if (!navigator.geolocation) { toast('這支手機不支援定位'); return; }
      toast('定位中…');
      navigator.geolocation.getCurrentPosition(
        p => { setCenter({ name: '我現在的位置', lat: p.coords.latitude, lng: p.coords.longitude }); closeSheet('centerSheet'); },
        () => toast('無法取得位置，請允許定位或改用地圖點選'),
        { enableHighAccuracy: false, timeout: 10000 }
      );
    };
    $('#pickBtn').onclick = () => {
      closeSheet('centerSheet'); show('map'); state.picking = true;
      if (!pickBanner) {
        pickBanner = document.createElement('div'); pickBanner.className = 'pick-banner';
        pickBanner.textContent = '請在地圖上點一下要當中心的位置';
        $('#map').appendChild(pickBanner);
      }
    };
    $$('.filter-group').forEach(g => {
      $$('.chip', g).forEach(c => c.onclick = () => {
        $$('.chip', g).forEach(x => x.classList.remove('on')); c.classList.add('on');
        state.filters[g.dataset.key] = c.dataset.v; renderList();
      });
    });
    window.addEventListener('popstate', () => {
      const m = location.hash.match(/^#\/v\/(.+)$/);
      if (m) openDetail(m[1]); else if (!$('#detail').hidden) { closeSheet('detail'); rerenderCurrent(); }
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
    renderList();
    const m = location.hash.match(/^#\/v\/(.+)$/);
    if (m) openDetail(m[1]);
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  start();
})();
