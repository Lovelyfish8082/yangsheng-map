/* 擴充功能：實地參觀檢查表、生活機能（OpenStreetMap Overpass）、照片、完整費用試算 */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ls = {
    get(k, d) { try { const v = localStorage.getItem('ysm:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ysm:' + k, JSON.stringify(v)); } catch (e) {} }
  };
  function toast(msg) { const t = $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600); }
  const fsPx = () => parseFloat(getComputedStyle(document.body).fontSize) || 20;

  // ====================== 實地參觀檢查表 ======================
  const VISIT = [
    ['環境', [['clean', '整體乾淨、沒有異味'], ['light', '採光、通風好'], ['access', '無障礙：扶手、止滑、輪椅進得去']]],
    ['房間', [['room', '房間大小、收納夠用'], ['bath', '浴室安全、緊急呼叫鈴']]],
    ['餐食', [['taste', '口味、軟硬合適'], ['menu', '菜色有變化、注重營養']]],
    ['工作人員', [['staff', '親切，叫得出住戶名字'], ['night', '晚上有人值班、緊急處理清楚']]],
    ['住戶與活動', [['mood', '住戶氣氛熱絡，公共空間有人'], ['act', '活動課程多、自己會想參加']]],
    ['周邊', [['transit', '交通、就醫方便'], ['walk', '有散步的地方、綠地']]],
    ['費用與合約', [['contract', '費用、退費、解約說明清楚']]]
  ];
  const VISIT_N = VISIT.reduce((n, g) => n + g[1].length, 0);
  const RATE = [['2', '👍 好'], ['1', '😐 普通'], ['0', '👎 不好']];
  const getVisit = id => ls.get('visit:' + id, { date: '', stars: 0, items: {} });
  function visitSummary(id) {
    const v = getVisit(id), vals = Object.values(v.items);
    if (!vals.length && !v.stars) return null;
    const c = k => vals.filter(x => x === k).length;
    return { stars: v.stars, good: c(2), meh: c(1), bad: c(0), done: vals.length, date: v.date };
  }
  function visitText(id) {
    const s = visitSummary(id); if (!s) return '還沒去參觀';
    return (s.stars ? '⭐'.repeat(s.stars) + ' ' : '') + `好 ${s.good}・普通 ${s.meh}・不好 ${s.bad}` + (s.date ? `（${s.date}）` : '');
  }
  function visitHTML(vid) {
    const v = getVisit(vid);
    return `<details class="x-sec" id="xVisit" ${Object.keys(v.items).length || v.stars ? 'open' : ''}>
      <summary><span class="k-ic">📝</span><span><b>實地參觀檢查表</b><small id="xVisitSum">${esc(visitText(vid))}</small></span></summary>
      <div class="x-body">
        <label class="x-date">參觀日期 <input type="date" id="xVDate" value="${esc(v.date)}"></label>
        ${VISIT.map(([g, items]) => `<h4 class="x-g">${esc(g)}</h4>${items.map(([k, q]) => `<div class="x-item"><p>${esc(q)}</p><div class="x-rate" data-k="${k}">${RATE.map(([val, t]) => `<button data-v="${val}" class="${String(v.items[k]) === val ? 'on' : ''}">${t}</button>`).join('')}</div></div>`).join('')}`).join('')}
        <h4 class="x-g">整體喜歡程度</h4>
        <div class="x-stars">${[1, 2, 3, 4, 5].map(n => `<button data-s="${n}" class="${v.stars >= n ? 'on' : ''}" aria-label="${n} 顆星">★</button>`).join('')}</div>
        <p class="muted">評分會存在這支手機上，也會出現在「比較」頁。要問的問題可以看「知識+ → 參觀時要問的問題」。</p>
      </div></details>`;
  }
  function wireVisit(vid, root) {
    const save = v => { ls.set('visit:' + vid, v); $('#xVisitSum', root).textContent = visitText(vid); };
    $('#xVDate', root).onchange = e => { const v = getVisit(vid); v.date = e.target.value; save(v); };
    $$('.x-rate', root).forEach(box => box.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      const v = getVisit(vid), k = box.dataset.k, val = +b.dataset.v;
      if (v.items[k] === val) delete v.items[k]; else v.items[k] = val;
      $$('button', box).forEach(x => x.classList.toggle('on', v.items[k] != null && +x.dataset.v === v.items[k]));
      save(v);
    });
    $('.x-stars', root).onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      const v = getVisit(vid); const n = +b.dataset.s; v.stars = v.stars === n ? 0 : n;
      $$('.x-stars button', root).forEach(x => x.classList.toggle('on', +x.dataset.s <= v.stars));
      save(v);
    };
  }

  // ====================== 生活機能（OpenStreetMap） ======================
  const LIFE = [
    { k: 'hospital', ic: '🏥', n: '醫院', q: 'nwr["amenity"="hospital"]' },
    { k: 'clinic', ic: '🩺', n: '診所', q: 'nwr["amenity"~"^(clinic|doctors)$"]' },
    { k: 'pharmacy', ic: '💊', n: '藥局', q: 'nwr["amenity"="pharmacy"]' },
    { k: 'rail', ic: '🚇', n: '捷運／火車站', q: 'node["railway"="station"]' },
    { k: 'bus', ic: '🚌', n: '公車站', q: 'node["highway"="bus_stop"]' },
    { k: 'park', ic: '🌳', n: '公園', q: 'nwr["leisure"="park"]' },
    { k: 'market', ic: '🛒', n: '市場／超市', q: 'nwr["amenity"="marketplace"];nwr["shop"="supermarket"]' }
  ];
  const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  // 同時問幾個免費伺服器，哪個先回就用哪個；全部失敗才算失敗
  function overpass(query) {
    const ctls = [];
    const one = url => new Promise((res, rej) => {
      const ctl = new AbortController(); ctls.push(ctl);
      const t = setTimeout(() => { ctl.abort(); rej(new Error('逾時')); }, 60000);
      fetch(url + '?data=' + encodeURIComponent(query), { signal: ctl.signal })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(j => { clearTimeout(t); res(j); }, e => { clearTimeout(t); rej(e); });
    });
    return new Promise((res, rej) => {
      let fails = 0; const errs = [];
      ENDPOINTS.forEach(u => one(u).then(j => { ctls.forEach(c => { try { c.abort(); } catch (e) {} }); res(j); }, e => { errs.push(e.message); if (++fails === ENDPOINTS.length) rej(new Error(errs.join('、'))); }));
    });
  }
  const dist = (a, b, c, d) => { const R = 6371000, r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.sqrt(x * x + y * y) * R; };
  const elLatLng = e => e.lat != null ? [e.lat, e.lon] : e.center ? [e.center.lat, e.center.lon] : null;
  function classify(tags) {
    if (tags.amenity === 'hospital') return 'hospital';
    if (tags.amenity === 'clinic' || tags.amenity === 'doctors') return 'clinic';
    if (tags.amenity === 'pharmacy') return 'pharmacy';
    if (tags.railway === 'station') return 'rail';
    if (tags.highway === 'bus_stop') return 'bus';
    if (tags.leisure === 'park') return 'park';
    if (tags.amenity === 'marketplace' || tags.shop === 'supermarket') return 'market';
    return null;
  }
  const RADIUS = 1000, HOSP_RADIUS = 3000;
  async function lifeFor(v, force) {
    const key = 'life:' + v.id, cached = ls.get(key, null);
    if (!force && cached && Date.now() - cached.t < 30 * 864e5) return cached;
    // 用方框查詢比「半徑」快很多，距離再自己算
    const box = m => { const dy = m / 111000, dx = m / (111000 * Math.cos(v.lat * Math.PI / 180)); return `(${(v.lat - dy).toFixed(5)},${(v.lng - dx).toFixed(5)},${(v.lat + dy).toFixed(5)},${(v.lng + dx).toFixed(5)})`; };
    const parts = LIFE.map(c => c.q.split(';').map(q => `${q}${box(c.k === 'hospital' ? HOSP_RADIUS : RADIUS)};`).join('')).join('');
    const data = await overpass(`[out:json][timeout:55];(${parts});out center tags;`);
    const out = { t: Date.now(), cat: {} };
    LIFE.forEach(c => out.cat[c.k] = { count: 0, near: null });
    (data.elements || []).forEach(e => {
      const k = classify(e.tags || {}); const ll = elLatLng(e); if (!k || !ll) return;
      const d = Math.round(dist(v.lat, v.lng, ll[0], ll[1]));
      const lim = k === 'hospital' ? HOSP_RADIUS : RADIUS; if (d > lim) return;
      const c = out.cat[k]; c.count++;
      const name = (e.tags.name || '').trim();
      if (!c.near || d < c.near.d || (!c.near.name && name && d < c.near.d + 150)) c.near = { d, name };
    });
    ls.set(key, out);
    return out;
  }
  const walk = d => d < 1000 ? `${d} 公尺・走路約 ${Math.max(1, Math.round(d / 70))} 分` : `${(d / 1000).toFixed(1)} 公里`;
  function gmapLinks(v) {
    const q = w => `https://www.google.com/maps/search/${encodeURIComponent(w)}/@${v.lat},${v.lng},16z`;
    return `<div class="x-gm"><p>用 Google 地圖看附近：</p>${[['🏥', '醫院'], ['🩺', '診所'], ['🚇', '捷運站'], ['🚌', '公車站'], ['🌳', '公園'], ['🛒', '市場']].map(([i, w]) => `<a class="btn" href="${q(w)}" target="_blank" rel="noopener">${i} ${w}</a>`).join('')}</div>`;
  }
  function lifeTable(v, r) {
    return `<div class="x-life">${LIFE.map(c => {
      const x = r.cat[c.k] || { count: 0 };
      const range = c.k === 'hospital' ? '3 公里內' : '1 公里內';
      return `<div class="${x.count ? '' : 'none'}"><span class="k-ic">${c.ic}</span><span><b>${c.n}</b>
        <small>${x.count ? `${range} ${x.count} 個・最近：${esc(x.near.name || '（未命名）')}，${walk(x.near.d)}` : `${range}沒有找到`}</small></span></div>`;
    }).join('')}</div>
      ${gmapLinks(v)}
      <p class="muted">資料來自 OpenStreetMap 開放地圖，可能有遺漏，僅供參考。距離為直線距離。
      <button class="small" id="xLifeRe">重新查詢</button></p>`;
  }
  function lifeHTML() {
    return `<details class="x-sec" id="xLife"><summary><span class="k-ic">🏙️</span><span><b>附近生活機能</b><small>最近的醫院、車站，以及用 Google 地圖看附近</small></span></summary>
      <div class="x-body" id="xLifeBody"><p class="muted">打開後會自動查詢…</p></div></details>`;
  }
  function wireLife(v, root) {
    const det = $('#xLife', root), body = $('#xLifeBody', root); det.open = true;
    const start = () => { body.innerHTML = gmapLinks(v) + '<p class="muted">想看列表（幾公尺、走路幾分鐘）可以試試開放地圖查詢。這是免費服務，常常很忙，可能要等一分鐘或查不到。</p><button class="small" id="xLifeRe">🔎 用開放地圖查詢清單</button>'; $('#xLifeRe', body).onclick = () => load(true); };
    const load = async force => {
      body.innerHTML = gmapLinks(v) + '<p class="muted">開放地圖查詢中，最多等一分鐘…</p>';
      try { const r = await lifeFor(v, force); body.innerHTML = fixed + lifeTable(v, r); $('#xLifeRe', body).onclick = () => load(true); }
      catch (e) { body.innerHTML = fixed + gmapLinks(v) + '<p>開放地圖這次查不到（免費服務太忙），請用上面的 Google 地圖按鈕，或晚點再試。</p><button class="small" id="xLifeRe">再試一次</button><p class="muted">（原因：' + esc(e.message) + '）</p>'; $('#xLifeRe', body).onclick = () => load(true); }
    };
    const cached = ls.get('life:' + v.id, null);
    const fixed = v.nearby ? `<div class="x-life x-fixed"><div><span class="k-ic">🏥</span><span><b>最近的醫院</b><small>${esc(v.nearby.hospital)}</small></span></div><div><span class="k-ic">🚇</span><span><b>最近的車站</b><small>${esc(v.nearby.station)}</small></span></div><p class="muted">依地圖估算的大約距離，實際以 Google 地圖為準。</p></div>` : '';
    const st0 = start; const start2 = () => { st0(); body.insertAdjacentHTML('afterbegin', fixed); };
    if (cached) { body.innerHTML = fixed + lifeTable(v, cached); $('#xLifeRe', body).onclick = () => load(true); } else start2();
  }
  function lifeShort(id) {
    const r = ls.get('life:' + id, null); if (!r) return null;
    const f = k => { const c = r.cat[k]; return c && c.count ? (c.near.d < 1000 ? c.near.d + 'm' : (c.near.d / 1000).toFixed(1) + 'km') : '無'; };
    return `醫院 ${f('hospital')}・捷運/火車 ${f('rail')}・公車 ${r.cat.bus ? r.cat.bus.count : 0} 站・公園 ${f('park')}・市場 ${f('market')}`;
  }

  // 地圖圖層
  let map, lifeLayer, layerOn = ls.get('lifeLayers', []), lastKey = '', fetching = false;
  function mapReady(m) {
    map = m; return; // 免費查詢服務太不穩定，地圖圖層暫時停用
    lifeLayer = L.layerGroup().addTo(map);
    const Ctl = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        const d = L.DomUtil.create('div', 'x-layerctl leaflet-bar');
        d.innerHTML = `<button class="x-layerbtn" aria-expanded="false">🏙️ 生活機能</button><div class="x-layerpanel" hidden>
          ${LIFE.map(c => `<label><input type="checkbox" value="${c.k}" ${layerOn.includes(c.k) ? 'checked' : ''}> ${c.ic} ${c.n}</label>`).join('')}
          <p class="x-hint">放大地圖到街道才會顯示</p></div>`;
        L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
        const btn = d.querySelector('.x-layerbtn'), panel = d.querySelector('.x-layerpanel');
        btn.onclick = () => { panel.hidden = !panel.hidden; btn.setAttribute('aria-expanded', String(!panel.hidden)); };
        d.querySelectorAll('input').forEach(i => i.onchange = () => {
          layerOn = [...d.querySelectorAll('input:checked')].map(x => x.value); ls.set('lifeLayers', layerOn);
          btn.classList.toggle('on', layerOn.length > 0); lastKey = ''; refreshLayer(true);
        });
        btn.classList.toggle('on', layerOn.length > 0);
        return d;
      }
    });
    map.addControl(new Ctl());
    let t; map.on('moveend', () => { clearTimeout(t); t = setTimeout(() => refreshLayer(false), 500); });
    if (layerOn.length) setTimeout(() => refreshLayer(false), 800);
  }
  const MIN_ZOOM = 15;
  async function refreshLayer(userAction) {
    if (!map) return;
    if (!layerOn.length) { lifeLayer.clearLayers(); lastKey = ''; return; }
    if (map.getZoom() < MIN_ZOOM) { lifeLayer.clearLayers(); lastKey = ''; if (userAction) toast('請把地圖放大到街道，才會顯示生活機能'); return; }
    const b = map.getBounds().pad(0.15);
    const key = layerOn.join() + '|' + [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map(x => x.toFixed(3)).join();
    if (key === lastKey || fetching) return;
    lastKey = key; fetching = true;
    const bb = `(${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()})`;
    const q = LIFE.filter(c => layerOn.includes(c.k)).map(c => c.q.split(';').map(x => x + bb + ';').join('')).join('');
    try {
      if (userAction) toast('查詢中…');
      const data = await overpass(`[out:json][timeout:25];(${q});out center tags 400;`);
      lifeLayer.clearLayers();
      (data.elements || []).forEach(e => {
        const k = classify(e.tags || {}); const ll = elLatLng(e); if (!k || !ll || !layerOn.includes(k)) return;
        const c = LIFE.find(x => x.k === k);
        L.marker(ll, { icon: L.divIcon({ className: 'x-poi x-poi-' + k, html: c.ic, iconSize: [30, 30], iconAnchor: [15, 15] }), keyboard: false })
          .bindPopup(`<b>${esc(e.tags.name || c.n)}</b><br>${c.n}`).addTo(lifeLayer);
      });
      if (userAction && !(data.elements || []).length) toast('這個範圍沒有找到');
    } catch (e) { lastKey = ''; toast('生活機能查詢失敗，請稍後再試（' + e.message.slice(0, 40) + '）'); }
    fetching = false;
  }

  // ====================== 照片（存在這支手機） ======================
  let dbp;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('ysm-photos', 1);
      r.onupgradeneeded = () => { const s = r.result.createObjectStore('photos', { keyPath: 'id', autoIncrement: true }); s.createIndex('vid', 'vid'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function photosOf(vid) {
    const d = await db();
    return new Promise((res, rej) => { const q = d.transaction('photos').objectStore('photos').index('vid').getAll(vid); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); });
  }
  async function addPhoto(vid, blob) {
    const d = await db();
    return new Promise((res, rej) => { const tx = d.transaction('photos', 'readwrite'); tx.objectStore('photos').add({ vid, blob, t: Date.now() }); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  }
  async function delPhoto(id) {
    const d = await db();
    return new Promise((res, rej) => { const tx = d.transaction('photos', 'readwrite'); tx.objectStore('photos').delete(id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  }
  function shrink(file, max = 1600) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(b => b ? res(b) : rej(new Error('壓縮失敗')), 'image/jpeg', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('讀不到照片')); };
      img.src = url;
    });
  }
  let urls = [];
  function photoHTML(v) {
    const pano = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${v.lat},${v.lng}`;
    const imgs = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(v.name + ' 外觀')}`;
    return `<details class="x-sec" id="xPhoto" open><summary><span class="k-ic">📷</span><span><b>照片</b><small>看外觀，或存下自己參觀時拍的照片</small></span></summary>
      <div class="x-body">
        <div class="x-links"><a class="btn" href="${pano}" target="_blank" rel="noopener">🏢 看建築外觀（Google 街景）</a>
        <a class="btn" href="${imgs}" target="_blank" rel="noopener">🖼️ 看網路上的照片</a></div>
        <h4 class="x-g">我拍的照片</h4>
        <div class="x-gallery" id="xGallery"><p class="muted">讀取中…</p></div>
        <label class="btn primary x-add">＋ 新增照片（拍照或從相簿選）<input type="file" accept="image/*" multiple id="xFile" hidden></label>
        <p class="muted">照片只存在這支手機的 App 裡，家人的手機看不到；刪除 App 或清除瀏覽資料，照片也會不見。重要的照片請另外保留在相簿。</p>
      </div></details>`;
  }
  async function renderGallery(vid, root) {
    const g = $('#xGallery', root); if (!g) return;
    urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
    let list = [];
    try { list = await photosOf(vid); } catch (e) { g.innerHTML = '<p class="muted">這支手機不支援存照片。</p>'; return; }
    if (!list.length) { g.innerHTML = '<p class="muted">還沒有照片。</p>'; return; }
    g.innerHTML = list.sort((a, b) => a.t - b.t).map(p => { const u = URL.createObjectURL(p.blob); urls.push(u); return `<button data-id="${p.id}" data-u="${u}" style="background-image:url('${u}')" aria-label="看大圖"></button>`; }).join('');
    $$('button', g).forEach(b => b.onclick = () => viewer(b.dataset.u, +b.dataset.id, vid, root));
  }
  function viewer(u, id, vid, root) {
    const o = document.createElement('div'); o.className = 'x-viewer';
    o.innerHTML = `<img src="${u}" alt="照片"><div class="x-vbtns"><button class="btn" data-a="close">✕ 關閉</button><button class="btn" data-a="del">🗑️ 刪除這張</button></div>`;
    o.onclick = async e => {
      const a = e.target.dataset.a;
      if (a === 'close' || e.target === o) o.remove();
      if (a === 'del') { if (!confirm('確定要刪除這張照片？')) return; await delPhoto(id); o.remove(); renderGallery(vid, root); toast('已刪除'); }
    };
    document.body.appendChild(o);
  }
  function wirePhoto(vid, root) {
    renderGallery(vid, root);
    $('#xFile', root).onchange = async e => {
      const files = [...e.target.files]; if (!files.length) return;
      toast('儲存中…');
      try { for (const f of files) await addPhoto(vid, await shrink(f)); toast(`已存 ${files.length} 張照片`); }
      catch (err) { toast('照片儲存失敗：' + err.message); }
      e.target.value = ''; renderGallery(vid, root);
    };
  }

  // ====================== 完整費用試算 ======================
  const DEF = { vid: '', people: 1, rent: 3, meal: 0.6, util: 0.2, other: 0, dep: 30, depBack: true, depKeep: 0, rate: 1.5, inc: 3, years: 15, careFrom: 0, care: 3, assets: 0, income: 0, startAge: 75 };
  let calcState = Object.assign({}, DEF, ls.get('calc', {}));
  let villages = () => [];
  const wan = n => (Math.round(n * 10) / 10).toLocaleString() + ' 萬';
  function ensureCalcSheet() {
    let s = $('#calcSheet'); if (s) return s;
    s = document.createElement('div'); s.id = 'calcSheet'; s.className = 'sheet'; s.hidden = true;
    s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true');
    s.innerHTML = `<div class="sheet-inner"><button class="back" id="calcClose">← 回上一頁</button><h2>🧮 費用試算</h2>
      <p class="muted">把每個月會花的錢、保證金、以後可能要請看護，以及自己的存款都放進來，看看能住多久、總共要花多少。金額單位都是「萬元」。</p>
      <div id="calcForm"></div><div id="calcOut"></div>
      <div class="chart-wrap k-chart"><canvas id="calcChart"></canvas></div>
      <p class="muted">這是簡化的估算，實際費用以各機構報價與合約為準。保證金的「利息損失」是指這筆錢如果放銀行定存，大約能領到的利息。</p></div>`;
    document.body.appendChild(s);
    $('#calcClose', s).onclick = closeCalc;
    return s;
  }
  function field(id, label, val, unit, hint, step = 0.1) {
    return `<label class="c-f"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><span class="c-in"><input type="number" inputmode="decimal" id="c_${id}" value="${val}" min="0" step="${step}"> ${unit}</span></label>`;
  }
  function renderCalcForm() {
    const c = calcState, vs = villages().filter(v => v.monthly && v.monthly.min != null);
    $('#calcForm').innerHTML = `
      <label class="c-f c-sel"><span>套用某家的費用</span><select id="c_vid"><option value="">自己填</option>${vs.map(v => `<option value="${v.id}" ${c.vid === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
      <div class="c-grp"><h4>① 每個月的花費</h4>
        <label class="c-f"><span>幾個人住</span><span class="c-seg"><button data-p="1" class="${c.people === 1 ? 'on' : ''}">1 人</button><button data-p="2" class="${c.people === 2 ? 'on' : ''}">2 人</button></span></label>
        ${field('rent', '月費／房租／管理費', c.rent, '萬', '全戶每月')}
        ${field('meal', '伙食費', c.meal, '萬', '每人每月，已含在月費就填 0')}
        ${field('util', '水電、網路、洗衣', c.util, '萬', '全戶每月')}
        ${field('other', '其他自費', c.other, '萬', '例如陪診、復健、交通')}
        ${field('inc', '每年調漲', c.inc, '%', '', 0.5)}
      </div>
      <div class="c-grp"><h4>② 保證金</h4>
        ${field('dep', '保證金／押金', c.dep, '萬', '', 1)}
        <label class="c-f k-check"><input type="checkbox" id="c_depBack" ${c.depBack ? 'checked' : ''}> 離開時會退還</label>
        ${field('depKeep', '退還時扣掉', c.depKeep, '%', '依合約，例如折舊或手續費', 1)}
        ${field('rate', '定存利率', c.rate, '%', '用來算保證金的利息損失', 0.1)}
      </div>
      <div class="c-grp"><h4>③ 以後需要照顧</h4>
        ${field('careFrom', '第幾年開始需要看護', c.careFrom, '年', '不確定就填 0（不計算）', 1)}
        ${field('care', '看護費用', c.care, '萬', '每月，外籍看護約 3 萬、本國約 6～7 萬')}
      </div>
      <div class="c-grp"><h4>④ 我的財務</h4>
        ${field('years', '打算住幾年', c.years, '年', '', 1)}
        ${field('startAge', '入住時幾歲', c.startAge, '歲', '', 1)}
        ${field('assets', '可以用的存款', c.assets, '萬', '不想算就填 0', 10)}
        ${field('income', '每月收入', c.income, '萬', '退休金、年金、租金等')}
      </div>`;
    $('#c_vid').onchange = e => { applyVillage(e.target.value); };
    $$('.c-seg button').forEach(b => b.onclick = () => { calcState.people = +b.dataset.p; $$('.c-seg button').forEach(x => x.classList.toggle('on', x === b)); runCalc(); });
    $$('#calcForm input').forEach(i => i.addEventListener('input', runCalc));
  }
  function applyVillage(id) {
    const v = villages().find(x => x.id === id);
    calcState.vid = id || '';
    if (v) {
      const m = v.monthly.min, d = v.deposit && v.deposit.min != null ? v.deposit.min : 0;
      calcState.rent = Math.round(m / 1000) / 10;
      calcState.meal = 0; calcState.dep = Math.round(d / 1000) / 10;
      toast(`已套用 ${v.name} 的最低月費，伙食是否另計請再確認`);
    }
    renderCalcForm(); runCalc();
  }
  function readCalc() {
    const n = id => { const el = $('#c_' + id); return el ? Math.max(0, parseFloat(el.value) || 0) : calcState[id]; };
    ['rent', 'meal', 'util', 'other', 'inc', 'dep', 'depKeep', 'rate', 'careFrom', 'care', 'years', 'startAge', 'assets', 'income'].forEach(k => calcState[k] = n(k));
    calcState.depBack = $('#c_depBack') ? $('#c_depBack').checked : calcState.depBack;
    calcState.years = Math.min(40, Math.max(1, Math.round(calcState.years)));
    calcState.inc = Math.min(20, calcState.inc); calcState.depKeep = Math.min(100, calcState.depKeep);
    ls.set('calc', calcState);
    return calcState;
  }
  function simulate(c, years) {
    const monthly0 = c.rent + c.meal * c.people + c.util + c.other;
    const rows = []; let cumLive = 0, cumCare = 0, cumLost = 0, funds = c.assets - c.dep, runOut = null;
    for (let y = 1; y <= years; y++) {
      const g = Math.pow(1 + c.inc / 100, y - 1);
      const live = monthly0 * 12 * g;
      const care = c.careFrom > 0 && y >= c.careFrom ? c.care * 12 * g : 0;
      const lost = c.dep * c.rate / 100;
      cumLive += live; cumCare += care; cumLost += lost;
      funds += c.income * 12 - live - care;
      if (runOut == null && c.assets > 0 && funds < 0) runOut = y;
      rows.push({ y, live, care, cumLive, cumCare, cumLost, funds });
    }
    return { monthly0, rows, runOut };
  }
  let calcChart;
  function runCalc() {
    const c = readCalc();
    const s = simulate(c, c.years), last = s.rows[s.rows.length - 1];
    const depLoss = c.depBack ? c.dep * c.depKeep / 100 : c.dep;
    const total = last.cumLive + last.cumCare + depLoss;
    const firstMonth = s.monthly0 + (c.careFrom === 1 ? c.care : 0);
    let money = '';
    if (c.assets > 0 || c.income > 0) {
      const far = simulate(c, 40);
      const lastFunds = last.funds + (c.depBack ? c.dep - depLoss : 0);
      money = far.runOut
        ? `<div class="c-warn">💡 依這樣的花費，存款大約在<b>第 ${far.runOut} 年（${Math.round(c.startAge + far.runOut - 1)} 歲左右）用完</b>${far.runOut <= c.years ? '，比打算住的年數還早，要特別注意。' : '。'}</div>`
        : `<div class="c-ok">👍 依這樣的花費，<b>住 40 年存款都夠用</b>。</div>`;
      money += `<p>住滿 ${c.years} 年後（約 ${Math.round(c.startAge + c.years)} 歲），存款大約還剩 <b>${wan(lastFunds)}</b>${c.depBack && c.dep ? '（已加回退還的保證金）' : ''}。</p>`;
    }
    $('#calcOut').innerHTML = `<div class="k-out c-sum">
      <div class="c-big"><small>第一年每月要付</small><b>${wan(firstMonth)}</b><span>${c.people} 人・含月費、伙食、水電、自費</span></div>
      <div class="c-big"><small>住 ${c.years} 年總共花費</small><b>${wan(total)}</b><span>平均每年 ${wan(total / c.years)}</span></div>
      <ul class="c-list"><li>生活費（月費、伙食、水電、自費）：<b>${wan(last.cumLive)}</b></li>
      ${last.cumCare ? `<li>看護費用：<b>${wan(last.cumCare)}</b></li>` : ''}
      ${c.dep ? `<li>保證金 ${wan(c.dep)}：${c.depBack ? (c.depKeep ? `退還時扣 ${c.depKeep}%，損失 <b>${wan(depLoss)}</b>` : '離開時全額退還') : `<b>不退還</b>`}</li>
      <li>保證金放著的利息損失（不算在總花費裡）：約 ${wan(last.cumLost)}</li>` : ''}</ul>
      ${money}</div>`;
    drawCalc(c, s);
  }
  function drawCalc(c, s) {
    const el = $('#calcChart'); if (!el || !window.Chart) return;
    if (calcChart) calcChart.destroy();
    const fs = fsPx();
    el.parentElement.style.height = Math.max(300, Math.min(520, 240 + s.rows.length * 8)) + 'px';
    const ds = [
      { type: 'bar', label: '生活費累計', data: s.rows.map(r => Math.round(r.cumLive)), backgroundColor: css('--brand'), stack: 'a' },
      { type: 'bar', label: '看護費累計', data: s.rows.map(r => Math.round(r.cumCare)), backgroundColor: css('--vet'), stack: 'a' }
    ];
    if (c.assets > 0 || c.income > 0) ds.push({ type: 'line', label: '剩下的存款', data: s.rows.map(r => Math.round(r.funds)), borderColor: css('--public'), backgroundColor: css('--public'), borderWidth: 3, pointRadius: 2, tension: .2 });
    calcChart = new Chart(el, {
      data: { labels: s.rows.map(r => r.y + '年'), datasets: ds.filter(d => d.type === 'line' || d.data.some(x => x)) },
      options: {
        maintainAspectRatio: false, animation: false,
        plugins: { legend: { labels: { color: css('--ink'), font: { size: fs * .7 }, boxWidth: 16 } }, tooltip: { callbacks: { label: x => x.dataset.label + '：' + x.raw.toLocaleString() + ' 萬' } } },
        scales: {
          x: { stacked: true, ticks: { color: css('--muted'), font: { size: fs * .62 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, grid: { display: false } },
          y: { stacked: true, ticks: { color: css('--muted'), font: { size: fs * .62 }, callback: v => v + '萬', maxTicksLimit: 6 }, grid: { color: css('--line') } }
        }
      }
    });
  }
  let calcFromDetail = false;
  function openCalc(v) {
    const s = ensureCalcSheet();
    calcFromDetail = !!($('#detail') && !$('#detail').hidden);
    renderCalcForm();
    if (v && v.monthly && v.monthly.min != null && calcState.vid !== v.id) applyVillage(v.id); else runCalc();
    s.hidden = false; s.scrollTop = 0; document.body.style.overflow = 'hidden';
    history.pushState({ calc: 1 }, '', location.hash || '#');
  }
  let skipPop = false;
  function closeCalc(fromPop) {
    const s = $('#calcSheet'); if (!s || s.hidden) return;
    s.hidden = true; skipPop = true;
    if (!calcFromDetail) document.body.style.overflow = '';
    if (fromPop !== true) history.back();
  }
  window.addEventListener('popstate', () => { const s = $('#calcSheet'); if (s && !s.hidden) closeCalc(true); });

  // ====================== 掛到詳細頁 ======================
  function detail(v, body) {
    const box = document.createElement('div'); box.className = 'x-detail';
    box.innerHTML = `<button class="btn x-calcbtn" id="xCalc">🧮 試算住這裡要花多少</button>` + photoHTML(v) + lifeHTML() + visitHTML(v.id);
    const notes = [...body.querySelectorAll('h2')].find(h => h.textContent === '我的筆記');
    body.insertBefore(box, notes || null);
    $('#xCalc', box).onclick = () => openCalc(v);
    wirePhoto(v.id, box); wireLife(v, box); wireVisit(v.id, box);
  }

  window.YSMX = {
    detail, mapReady, openCalc, visitText, lifeShort,
    consumePop() { const s = skipPop; skipPop = false; return s; },
    setVillages(fn) { villages = fn; }
  };
})();
