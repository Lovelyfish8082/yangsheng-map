/* 知識+：養生村入門知識、比較、試算、參觀清單、自我檢測 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const ls = {
    get(k, d) { try { const v = localStorage.getItem('ysm:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ysm:' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- 1. 光譜：誰適合住哪裡 ----------
  const STAGES = ['健康\n能自理', '需要一點\n幫忙', '需要別人\n照顧', '需要醫療\n護理'];
  // full：主要收住；part：部分可以（看有沒有照護區或轉介）
  const PLACES = [
    { n: '養生村／銀髮住宅', full: [0], part: [1], note: '以健康、能自理為主；少數有照護區' },
    { n: '公辦老人公寓', full: [0], part: [], note: '能自理、預算較有限' },
    { n: '榮民之家', full: [0, 1, 2], part: [], note: '分安養、養護、失智區，要符合資格' },
    { n: '安養機構', full: [0], part: [1], note: '法規上收能自理、但需要有人看顧的長輩' },
    { n: '養護機構', full: [1, 2], part: [], note: '日常生活需要別人協助' },
    { n: '長照機構／失智照顧', full: [2, 3], part: [], note: '失能、失智，需長期照顧' },
    { n: '護理之家', full: [3], part: [2], note: '需要專業護理（管路、傷口等）' },
    { n: '住在家＋長照服務', full: [0, 1, 2], part: [3], note: '居家服務、日照中心、喘息服務' }
  ];
  function spectrumHTML() {
    const head = STAGES.map((s, i) => `<div class="sp-h sp-h${i}">${esc(s).replace('\n', '<br>')}</div>`).join('');
    const rows = PLACES.map(p => {
      const cells = STAGES.map((_, i) => `<i class="${p.full.includes(i) ? 'on' : p.part.includes(i) ? 'part' : ''}"></i>`).join('');
      return `<div class="sp-row"><div class="sp-name"><b>${esc(p.n)}</b><small>${esc(p.note)}</small></div><div class="sp-bar">${cells}</div></div>`;
    }).join('');
    return `<div class="spectrum"><div class="sp-row sp-headrow"><div class="sp-name"></div><div class="sp-bar">${head}</div></div>${rows}</div>
      <p class="legend-k"><i class="on"></i>主要收住　<i class="part"></i>部分可以（要問清楚）</p>`;
  }

  // ---------- 2. 比較 ----------
  const TYPES = [
    { n: '養生村', who: '健康、能自理的退休族', age: '多數 50～65 歲以上', fee: '約 1.6 萬～10 萬以上', dementia: '多數不行', care: '健康管理、緊急送醫；照護多需另購', lo: 1.6, hi: 10 },
    { n: '公辦老人公寓', who: '能自理、預算有限', age: '多數 65 歲以上', fee: '約 0.8 萬～2.5 萬', dementia: '不行', care: '生活服務為主，名額少要排隊', lo: 0.8, hi: 2.5 },
    { n: '榮民之家', who: '榮民或眷屬（部分開放一般民眾）', age: '依各家規定', fee: '約 1.2 萬～3.2 萬', dementia: '有失智區', care: '安養、養護、失智分區', lo: 1.2, hi: 3.2 },
    { n: '養護機構', who: '生活需要別人協助', age: '多數 65 歲以上', fee: '約 2 萬～4 萬', dementia: '部分可以', care: '24 小時照顧服務員', lo: 2, hi: 4 },
    { n: '護理之家', who: '需要專業護理', age: '沒有年齡限制', fee: '約 3 萬～6 萬以上（醫療另計）', dementia: '可以（失智專區）', care: '護理師 24 小時', lo: 3, hi: 6.5 }
  ];
  function compareHTML() {
    return `<div class="k-types">${TYPES.map(t => `<div class="k-type">
      <h4>${esc(t.n)}</h4>
      <dl><dt>適合誰</dt><dd>${esc(t.who)}</dd><dt>年齡</dt><dd>${esc(t.age)}</dd><dt>每月</dt><dd>${esc(t.fee)}</dd>
      <dt>失智可住</dt><dd>${esc(t.dementia)}</dd><dt>照顧</dt><dd>${esc(t.care)}</dd></dl></div>`).join('')}</div>
      <h4 class="k-sub">每月費用大約範圍（萬元）</h4>
      <div class="chart-wrap k-chart"><canvas id="kFeeChart"></canvas></div>
      <p class="muted">費用是各家公開資料整理的大約範圍，實際以各機構報價為準。</p>`;
  }

  // ---------- 3. 錢怎麼算 ----------
  const COSTS = [
    ['🏠', '月租／管理費', '每月固定付，各家算法不同'],
    ['🍚', '伙食費', '有的含在月費，有的另計或用餐券'],
    ['💰', '保證金／押金', '從 2 個月租金到數百萬都有，問清楚怎麼退'],
    ['💡', '水電、網路、洗衣', '常常另外收'],
    ['🩺', '看護、陪診、復健', '大多不含在月費，需要時加購'],
    ['📈', '每年調漲', '問清楚多久調一次、最多漲多少']
  ];
  function costHTML() {
    return `<div class="k-costs">${COSTS.map(([i, t, d]) => `<div><span>${i}</span><b>${esc(t)}</b><small>${esc(d)}</small></div>`).join('')}</div>
      <h4 class="k-sub">住幾年總共要花多少？</h4>
      <p>完整試算可以放進月費、伙食、保證金退還、每年調漲、以後請看護的費用，以及自己的存款和退休金，算出總花費和存款能撐多久。</p>
      <button class="btn primary" id="kOpenCalc">🧮 打開完整費用試算</button>`;
  }
  // ---------- 4. 挑選 8 點 ----------
  const POINTS = [
    ['✅', '入住條件', '幾歲可以住？要不要體檢？慢性病、行動不便收不收？'],
    ['🏥', '醫療資源', '離醫院多遠？晚上有狀況誰處理？救護車多久到？'],
    ['🔄', '生病後能不能繼續住', '失能、失智後可以留下嗎？有沒有照護區或轉介？'],
    ['🧮', '總花費', '月費之外，伙食、水電、看護、每年調漲都要算'],
    ['📝', '合約與保證金', '保證金怎麼退？多久退？有沒有信託？提前解約怎麼算？'],
    ['🎨', '生活與社交', '活動多不多？住戶有沒有在參加？餐點合不合胃口？'],
    ['🚗', '離家人遠近', '家人方便來看嗎？就醫、回老家交通方便嗎？'],
    ['🏢', '業者與營運', '經營多久？住滿率高嗎？還沒蓋好的要特別小心']
  ];
  const pointsHTML = () => `<div class="k-points">${POINTS.map(([i, t, d], n) => `<div><span class="k-num">${n + 1}</span><span class="k-ic">${i}</span><b>${esc(t)}</b><small>${esc(d)}</small></div>`).join('')}</div>`;

  // ---------- 5. 參觀清單 ----------
  const CHECK = [
    ['入住條件', ['幾歲以上可以入住？要不要指定醫院體檢？', '有慢性病、用助行器可以住嗎？', '夫妻可以同住嗎？一方需要照顧時怎麼辦？', '可以先試住嗎？試住怎麼收費？']],
    ['費用與合約', ['月費包含哪些？哪些要另外付？（伙食、水電、洗衣）', '多久調漲一次？過去幾年漲多少？', '保證金多少？什麼時候、什麼情況退？要扣什麼？', '保證金有沒有交付信託或銀行履約保證？', '提前搬走或過世，合約怎麼處理？', '可以把合約帶回家給家人或律師看嗎？']],
    ['醫療與照護', ['合作醫院是哪家？多遠？', '晚上有醫護人員嗎？緊急狀況誰處理？', '失能或失智後可以繼續住嗎？要搬去哪裡？', '陪診、看護怎麼收費？']],
    ['參觀時親自看', ['走廊、房間有沒有異味？採光通風好不好？', '浴室有扶手、止滑嗎？輪椅進得去嗎？', '工作人員叫得出住戶名字嗎？態度好嗎？', '公共空間有住戶在活動嗎？氣氛如何？', '留下來吃一餐，口味、軟硬合適嗎？']]
  ];
  function checklistHTML() {
    const done = ls.get('kchk', {});
    let total = 0, got = 0;
    const groups = CHECK.map(([g, items], gi) => `<fieldset class="k-chk"><legend>${esc(g)}</legend>${items.map((q, qi) => {
      const id = gi + '-' + qi; total++; if (done[id]) got++;
      return `<label><input type="checkbox" data-k="${id}" ${done[id] ? 'checked' : ''}><span>${esc(q)}</span></label>`;
    }).join('')}</fieldset>`).join('');
    return `<p class="k-prog" id="kChkProg">已問 ${got}／${total} 題</p>${groups}
      <button class="small" id="kChkClear">全部清除，重新開始</button>
      <p class="muted">打勾的紀錄只存在這支手機上。建議每家至少去 2 次，其中一次留下來吃飯或試住。</p>`;
  }

  // ---------- 6. 我適合嗎 ----------
  const QUIZ = [
    { q: '自己吃飯、穿衣、洗澡、上廁所都沒問題？', k: 'body' },
    { q: '可以自己走路（可用拐杖），不需要別人扶？', k: 'body' },
    { q: '記憶力還不錯，不太會迷路或忘記吃藥？', k: 'body' },
    { q: '慢性病（如血壓、血糖）控制穩定？', k: 'body' },
    { q: '喜歡跟人聊天、參加活動或上課？', k: 'life' },
    { q: '願意搬離現在的家，住到新環境？', k: 'life' },
    { q: '覺得煮飯、打掃、家務越來越累？', k: 'life' },
    { q: '家人支持你搬去養生村？', k: 'life' },
    { q: '每月拿得出 3 萬元以上當生活費？', k: 'money' },
    { q: '可以先拿出一筆保證金（幾十萬）？', k: 'money' }
  ];
  function quizHTML() {
    const a = ls.get('kquiz', {});
    return `<p>每題按「是」或「不是」，做完會出現建議。</p>
      <ol class="k-quiz">${QUIZ.map((x, i) => `<li><p>${esc(x.q)}</p><div class="k-yn">
        <button data-q="${i}" data-a="1" class="${a[i] === 1 ? 'on' : ''}">是</button><button data-q="${i}" data-a="0" class="${a[i] === 0 ? 'on' : ''}">不是</button></div></li>`).join('')}</ol>
      <div id="kQuizOut" class="k-out" aria-live="polite"></div>
      <button class="small" id="kQuizClear">重新作答</button>`;
  }
  function quizResult() {
    const a = ls.get('kquiz', {});
    const n = Object.keys(a).length;
    const out = $('#kQuizOut');
    if (n < QUIZ.length) { out.innerHTML = `還有 <b>${QUIZ.length - n}</b> 題沒回答。`; return; }
    const no = k => QUIZ.filter((x, i) => x.k === k && a[i] === 0).length;
    let t, d;
    if (no('body') >= 2 || a[0] === 0) { t = '比較適合有照顧服務的地方'; d = '日常生活已經需要人幫忙，養生村大多不收或之後住不下去。可以考慮養護機構、榮民之家養護區，或住在家裡搭配長照服務（撥 1966 長照專線詢問）。'; }
    else if (no('money') >= 1) { t = '可以看看平價的選擇'; d = '身體狀況適合，但預算要注意。可以優先看公辦老人公寓（朱崙、中山、大龍、五股、陽明）、榮民之家（如果符合資格），或長庚養生文化村這類月費較低的地方。在「列表」裡把每月費用選「3 萬以下」就能找到。'; }
    else if (no('life') >= 2) { t = '先試住再決定'; d = '身體和經濟都可以，但對搬家、團體生活還有些猶豫。建議先參觀、試住幾天，或先在家使用社區據點、日照活動，感受看看再決定。'; }
    else { t = '很適合考慮養生村'; d = '身體健康、喜歡社交，經濟也能負擔，趁現在還健康搬進去，最容易適應，也比較容易通過入住條件。可以用「參觀時要問的問題」清單，多看幾家比較。'; }
    if (no('body') === 1 && !(no('body') >= 2 || a[0] === 0)) d += ' 有一項身體狀況要注意，記得問清楚之後需要照顧時能不能繼續住。';
    out.innerHTML = `<b class="k-result">${t}</b><p>${d}</p><small>這只是簡單參考，不是醫療評估。實際能不能入住，以各機構評估為準。</small>`;
  }

  // ---------- 7. 迷思 ----------
  const MYTHS = [
    ['養生村是醫療機構嗎？', '不是。養生村是給能自理長輩住的退休住宅，有健康管理和緊急送醫，但不是醫院或護理之家。「養生村」也不是法定名稱，要看業者實際登記的類型。'],
    ['住進去之後生病、失能，還能繼續住嗎？', '不一定。要看那裡有沒有照護區，或跟醫院、護理之家有沒有轉介合作。一定要在簽約前問清楚，最好寫在合約裡。'],
    ['保證金一定退得回來嗎？', '要看合約。退還條件、多久退、會扣哪些費用都不一樣，有的要住滿一定期間才全額退。保證金金額大的，最好確認有沒有信託或銀行履約保證。'],
    ['月費就是全部的花費嗎？', '通常不是。伙食、水電、洗衣，還有看護、陪診、復健常常另外算，每年也可能調漲。比較時要算「每月總花費」。'],
    ['住養生村可以預防失智嗎？', '法規上不能這樣宣稱。多跟人互動、規律運動對健康有幫助，但效果要看自己有沒有真的去參加活動。'],
    ['有高血壓、糖尿病就不能住？', '不一定。慢性病只要控制穩定、能照顧自己，大多可以入住，各家會用體檢或面談評估。'],
    ['等真的老了、需要人照顧再搬就好？', '養生村大多只收健康能自理的長輩，等到需要照顧時反而住不進去。趁還健康時搬，也比較容易適應新環境、交到朋友。'],
    ['公辦老人公寓比較便宜，為什麼不都選它？', '公辦的月費低，但名額少、要排隊，房間和服務比較簡單，失能後通常也要搬走。可以先登記排隊，同時看其他選擇。']
  ];
  const mythsHTML = () => `<div class="k-myths">${MYTHS.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`;

  const SOURCES = [
    ['健悅管理顧問：全台養生村費用比較', 'https://healjoy-housing.com/retirement-village-compare/'],
    ['史蒂夫的選擇：養生村完整整理', 'https://stevechoice.org/retirement-village/'],
    ['TVBS 健康 2.0：養生村怎麼選', 'https://health.tvbs.com.tw/life/358897'],
    ['衛福部：老人福利機構設立標準', 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0050039'],
    ['Next Avenue：評估退休社區的重點（英文）', 'https://www.nextavenue.org/sizing-continuing-care-retirement-community/']
  ];

  const SECTIONS = [
    ['what', '🏡', '養生村是什麼？', '一張圖看懂養生村和其他地方的差別', () => `<p>養生村是給<b>身體健康、生活能自理</b>的長輩住的退休住宅，通常有餐點、健康管理、活動課程和緊急送醫，讓長輩不用再煩惱家務，又有朋友作伴。</p><p>它<b>不是醫院、也不是照顧機構</b>。下面這張圖，從左到右是身體越來越需要幫忙，看看每種地方適合哪個階段：</p>${spectrumHTML()}`],
    ['diff', '⚖️', '跟其他地方差在哪？', '適合誰、幾歲、月費、失智能不能住', compareHTML],
    ['cost', '💰', '錢怎麼算？', '費用有哪些＋完整費用試算', costHTML],
    ['pick', '🔍', '挑選要看哪 8 點', '比較養生村時最重要的事', pointsHTML],
    ['visit', '📋', '參觀時要問的問題', '可以打勾，參觀時拿出來對照', checklistHTML],
    ['quiz', '🙋', '我適合住養生村嗎？', '10 題自我檢測', quizHTML],
    ['myth', '💡', '常見迷思', '保證金一定退？生病還能住嗎？', mythsHTML]
  ];

  let charts = {};
  function drawBar(id, labels, vals, title) {
    const el = document.getElementById(id); if (!el || !window.Chart) return;
    if (charts[id]) charts[id].destroy();
    const fs = parseFloat(getComputedStyle(document.body).fontSize) || 20;
    el.parentElement.style.height = Math.max(240, labels.length * (fs + 10) + 60) + 'px';
    charts[id] = new Chart(el, {
      type: 'bar',
      data: { labels, datasets: [{ data: vals, backgroundColor: css('--brand'), borderRadius: 6 }] },
      options: {
        indexAxis: 'y', maintainAspectRatio: false, animation: false,
        layout: { padding: { right: 60 } },
        plugins: { legend: { display: false }, title: { display: !!title, text: title, color: css('--ink'), font: { size: fs * .8 } }, tooltip: { enabled: false } },
        scales: { x: { ticks: { color: css('--muted'), font: { size: fs * .7 }, maxTicksLimit: 4 }, grid: { color: css('--line') } }, y: { ticks: { color: css('--ink'), font: { size: fs * .75 } }, grid: { display: false } } }
      },
      plugins: [labelPlugin(v => v.toLocaleString() + ' 萬')]
    });
  }
  function labelPlugin(fmt) {
    return { id: 'kLabels', afterDatasetsDraw(ch) {
      const ctx = ch.ctx, fs = parseFloat(getComputedStyle(document.body).fontSize) || 20;
      ctx.save(); ctx.fillStyle = css('--ink'); ctx.font = `700 ${fs * .7}px sans-serif`; ctx.textBaseline = 'middle';
      ch.getDatasetMeta(0).data.forEach((bar, i) => ctx.fillText(fmt(ch.data.datasets[0].data[i]), bar.x + 6, bar.y));
      ctx.restore();
    } };
  }
  function drawFee() {
    const el = document.getElementById('kFeeChart'); if (!el || !window.Chart) return;
    if (charts.fee) charts.fee.destroy();
    const fs = parseFloat(getComputedStyle(document.body).fontSize) || 20;
    el.parentElement.style.height = Math.max(260, TYPES.length * (fs * 2 + 14) + 40) + 'px';
    charts.fee = new Chart(el, {
      type: 'bar',
      data: { labels: TYPES.map(t => t.n), datasets: [{ data: TYPES.map(t => [t.lo, t.hi]), backgroundColor: TYPES.map((t, i) => i === 0 ? css('--brand') : css('--public')), borderRadius: 6 }] },
      options: {
        indexAxis: 'y', maintainAspectRatio: false, animation: false, layout: { padding: { right: 70 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { min: 0, max: 11, ticks: { color: css('--muted'), font: { size: fs * .7 }, callback: v => v + '萬' }, grid: { color: css('--line') } }, y: { ticks: { color: css('--ink'), font: { size: fs * .75 } }, grid: { display: false } } }
      },
      plugins: [{ id: 'kRange', afterDatasetsDraw(ch) {
        const ctx = ch.ctx; ctx.save(); ctx.fillStyle = css('--ink'); ctx.font = `700 ${fs * .68}px sans-serif`; ctx.textBaseline = 'middle';
        ch.getDatasetMeta(0).data.forEach((bar, i) => { const t = TYPES[i]; ctx.fillText(t.lo + '～' + (t.hi >= 6.5 && i === 4 ? '6萬+' : t.hi >= 10 ? '10萬+' : t.hi + '萬'), bar.x + 6, bar.y); });
        ctx.restore();
      } }]
    });
  }

  let built = false;
  function build() {
    const box = $('#knowBody'); if (!box) return;
    const open = ls.get('kopen', []);
    box.innerHTML = SECTIONS.map(([id, ic, t, sub, fn]) => `<details class="k-sec" data-sec="${id}" ${open.includes(id) ? 'open' : ''}>
      <summary><span class="k-ic">${ic}</span><span><b>${esc(t)}</b><small>${esc(sub)}</small></span></summary>
      <div class="k-body">${fn()}</div></details>`).join('') +
      `<details class="k-sec k-src"><summary><span class="k-ic">📚</span><span><b>資料來源</b><small>整理自以下文章與資料</small></span></summary><div class="k-body"><ul>${SOURCES.map(([t, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join('')}</ul><p class="muted">內容為一般性整理，不是醫療、法律或財務建議。</p></div></details>`;
    built = true;
    wire();
    refreshOpen();
  }
  function refreshOpen() {
    document.querySelectorAll('.k-sec[open]').forEach(d => {
      if (d.dataset.sec === 'diff') drawFee();
      if (d.dataset.sec === 'quiz') quizResult();
    });
  }
  function wire() {
    document.querySelectorAll('.k-sec').forEach(d => d.addEventListener('toggle', () => {
      ls.set('kopen', [...document.querySelectorAll('.k-sec[open]')].map(x => x.dataset.sec).filter(Boolean));
      if (d.open) refreshOpen();
    }));
    $('#kOpenCalc').onclick = () => window.YSMX && window.YSMX.openCalc();
    $('#knowBody').addEventListener('change', e => {
      const k = e.target.dataset.k; if (!k) return;
      const done = ls.get('kchk', {}); if (e.target.checked) done[k] = 1; else delete done[k]; ls.set('kchk', done);
      const all = document.querySelectorAll('.k-chk input'); $('#kChkProg').textContent = `已問 ${[...all].filter(x => x.checked).length}／${all.length} 題`;
    });
    $('#kChkClear').onclick = () => { ls.set('kchk', {}); document.querySelectorAll('.k-chk input').forEach(x => x.checked = false); $('#kChkProg').textContent = `已問 0／${document.querySelectorAll('.k-chk input').length} 題`; };
    $('#knowBody').addEventListener('click', e => {
      const b = e.target.closest('.k-yn button'); if (!b) return;
      const a = ls.get('kquiz', {}); a[b.dataset.q] = +b.dataset.a; ls.set('kquiz', a);
      b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      quizResult();
    });
    $('#kQuizClear').onclick = () => { ls.set('kquiz', {}); document.querySelectorAll('.k-yn button').forEach(x => x.classList.remove('on')); quizResult(); };
  }

  window.renderKnow = function () { if (!built) build(); else refreshOpen(); };
})();
