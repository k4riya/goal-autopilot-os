/* ============================================================
   Goal Autopilot OS — アプリ本体 (状態管理 / ルーター / UI)
   データはすべて localStorage に保存。スマホ・PCで同一データ。
   ============================================================ */
'use strict';

/* ---------- ユーティリティ ---------- */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function dstr(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function jdate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? iso : `${d.getMonth() + 1}/${d.getDate()}`;
}
const uid = pre => pre + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

/* ---------- 状態 ---------- */
const DEFAULT_STATE = {
  theme: 'dark',
  projects: [],        // {id,name,category,catLabel,icon,kpiCat,purpose,deadline,situation,plan,memo,nextMove,createdAt}
  activeId: null,
  daily: {},           // { 'YYYY-MM-DD': { [pid]: { tasks:[{text,done}], deferred:[] } } }
  reviews: [],         // { id, pid, date, input, output }
  kpiLogs: [],         // { id, cat, name, value, date }
  plans: [],           // 生成プラン履歴
  lastPlan: null,
  draftTemplate: 'free'
};

let S;
function loadState() {
  try {
    const raw = localStorage.getItem('gaos_v1');
    S = raw ? Object.assign({}, DEFAULT_STATE, JSON.parse(raw)) : { ...DEFAULT_STATE };
  } catch { S = { ...DEFAULT_STATE }; }
}
function save() { localStorage.setItem('gaos_v1', JSON.stringify(S)); }

function activeProject() {
  return S.projects.find(p => p.id === S.activeId) || S.projects[0] || null;
}

/* ---------- 今日のタスク管理 ---------- */
function ensureToday(p) {
  const today = dstr();
  if (!S.daily[today]) S.daily[today] = {};
  if (!S.daily[today][p.id]) {
    // 昨日以前の「明日に回す」 + 最新レビュー候補 or プランの今日やること から種を作る
    const seeds = [];
    const dates = Object.keys(S.daily).filter(d => d < today).sort().reverse();
    for (const d of dates) {
      const e = S.daily[d][p.id];
      if (e && e.deferred && e.deferred.length) { seeds.push(...e.deferred); e.deferred = []; break; }
    }
    const latestRev = [...S.reviews].reverse().find(r => r.pid === p.id);
    const source = latestRev ? latestRev.output.todayCandidates : p.plan.today;
    for (const t of source) { if (seeds.length >= 3) break; if (!seeds.includes(t)) seeds.push(t); }
    S.daily[today][p.id] = { tasks: seeds.slice(0, 3).map(t => ({ text: t, done: false })), deferred: [] };
    save();
  }
  return S.daily[today][p.id];
}

function projectProgress(pid) {
  let done = 0, total = 0;
  for (const d of Object.keys(S.daily)) {
    const e = S.daily[d][pid];
    if (e) for (const t of e.tasks) { total++; if (t.done) done++; }
  }
  return { done, total, pct: total ? Math.round(done / total * 100) : 0 };
}

/* ---------- 共通部品 ---------- */
function ul(items) { return `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`; }
function ol(items) { return `<ol>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ol>`; }
function card(title, body, cls = '', open = false) {
  return `<div class="card ${cls}"><h2>${title}</h2>${body}</div>`;
}
function fold(title, body, cls = '', open = false) {
  return `<details class="card ${cls}" ${open ? 'open' : ''}><summary>${title}</summary><div class="mt8">${body}</div></details>`;
}
function progressBar(pct, label) {
  return `<div class="progress-wrap"><div class="progress-bar"><div style="width:${pct}%"></div></div><div class="progress-label">${label}</div></div>`;
}

/* ============================================================
   ページ描画
   ============================================================ */
const view = () => document.getElementById('view');

/* ---------- 1. トップページ ---------- */
function renderHome() {
  const p = activeProject();
  let statusHtml = '';
  if (p) {
    const entry = ensureToday(p);
    const done = entry.tasks.filter(t => t.done).length;
    const prog = projectProgress(p.id);
    statusHtml = `
      <div class="card accent">
        <h2>${p.icon} ${esc(p.name)}</h2>
        <p class="hint">期限: ${esc(p.deadline)} / カテゴリ: ${esc(p.catLabel)}</p>
        ${progressBar(prog.pct, `全体進捗 ${prog.pct}%(完了 ${prog.done} / ${prog.total} タスク)`)}
        <p>今日のタスク: <b>${done} / ${entry.tasks.length} 完了</b></p>
        <a class="btn btn-primary btn-block" href="#today">✅ 今日やることを開く</a>
      </div>`;
  }
  view().innerHTML = `
    <div class="hero">
      <h1>目標を入れるだけ。<br>あとは、今日やることまで自動で。</h1>
      <p class="sub">借金返済、副業、創作、転職、恋愛、健康。達成したいことを入力すると、AIが行動計画・KPI・週次PDCAまで作成します。</p>
      <a class="btn btn-primary" href="#input">🎯 目標を入力する</a>
    </div>
    ${statusHtml}
    <div class="feature-grid">
      <a class="card" href="#today"><div class="f-icon">✅</div><div class="f-title">今日やること</div><div class="f-desc">最重要タスク3つだけ表示</div></a>
      <a class="card" href="#pdca"><div class="f-icon">🔄</div><div class="f-title">週次PDCA</div><div class="f-desc">週1回の振り返りで計画を自動更新</div></a>
      <a class="card" href="#risk"><div class="f-icon">🚧</div><div class="f-title">危険行動チェック</div><div class="f-desc">遠回りになる行動を冷静に止める</div></a>
      <a class="card" href="#kpi"><div class="f-icon">📊</div><div class="f-title">KPIダッシュボード</div><div class="f-desc">数字で進捗を確認</div></a>
    </div>
    <p class="hint mt16" style="text-align:center">※ 本ツールは行動管理を支援するものであり、成果を保証するものではありません。データは端末内にのみ保存されます。</p>
  `;
}

/* ---------- 2. 目標クイック入力 ---------- */
function renderInput() {
  const tpl = S.draftTemplate || 'free';
  const chips = GA.TEMPLATE_ORDER.map(k => {
    const t = GA.TEMPLATES[k];
    return `<button type="button" class="chip ${k === tpl ? 'active' : ''}" onclick="App.pickTemplate('${k}')">${t.icon} ${t.label}</button>`;
  }).join('');
  view().innerHTML = `
    <h1 class="page-title">🎯 目標クイック入力</h1>
    <p class="page-desc">長文で雑に書いてOK。AIが整理して行動計画にします。入力は必須7つだけです。</p>
    <div class="section-label">テンプレート(任意)</div>
    <div class="chips">${chips}</div>
    <div class="example-box">💡 入力例:「250万円の借金を早く返したい。副業で月10万円作りたい。平日は夜2時間、休日は5時間使える。初期費用はあまりかけたくない。FXなどリスクの高いことは避けたい。」</div>
    <form id="goalForm" onsubmit="App.generate(event)">
      <div class="field"><label>達成したいこと<span class="req">必須</span></label>
        <textarea name="goal" required placeholder="例: 250万円の借金を完済したい。副業で月10万円作りたい。"></textarea></div>
      <div class="field"><label>期限<span class="req">必須</span></label>
        <input type="text" name="deadline" required placeholder="例: 2年以内 / 2027年12月 / 未定でもOK(仮期限を設定します)"></div>
      <div class="field"><label>今の状況<span class="req">必須</span></label>
        <textarea name="situation" required placeholder="例: 会社員で手取り22万。返済は月4万。副業経験なし。"></textarea></div>
      <div class="field"><label>使える時間<span class="req">必須</span></label>
        <input type="text" name="time" required placeholder="例: 平日夜2時間、休日5時間"></div>
      <div class="field"><label>使えるお金<span class="req">必須</span></label>
        <input type="text" name="money" required placeholder="例: 月5,000円まで / できるだけかけたくない"></div>
      <div class="field"><label>絶対に避けたいこと<span class="req">必須</span></label>
        <input type="text" name="avoid" required placeholder="例: FXなどリスクの高いこと、睡眠を削ること"></div>
      <div class="field"><label>優先したいこと<span class="req">必須</span></label>
        <input type="text" name="priority" required placeholder="例: 確実さ優先。本業に支障を出さない。"></div>
      <details class="card">
        <summary>任意項目(書くと精度が上がります)</summary>
        <div class="mt8">
          <div class="field"><label>不安なこと<span class="opt">任意</span></label><textarea name="worry" placeholder="例: 続けられるか不安"></textarea></div>
          <div class="field"><label>すでに試したこと<span class="opt">任意</span></label><textarea name="tried" placeholder="例: ポイ活は続かなかった"></textarea></div>
          <div class="field"><label>成功した時の状態<span class="opt">任意</span></label><textarea name="successImage" placeholder="例: 借金ゼロで月3万円貯金できている"></textarea></div>
          <div class="field"><label>失敗したくない理由<span class="opt">任意</span></label><textarea name="whyFail" placeholder="例: 家族に心配をかけたくない"></textarea></div>
          <div class="field"><label>現在の数字や実績<span class="opt">任意</span></label><textarea name="numbers" placeholder="例: 借金残高250万、金利15%、貯金10万"></textarea></div>
        </div>
      </details>
      <button type="submit" class="btn btn-primary btn-block mt16">🤖 AIプランを生成する</button>
    </form>
  `;
}

/* ---------- 3. AI自動プラン生成ページ ---------- */
function renderPlan() {
  const plan = S.lastPlan;
  if (!plan) {
    view().innerHTML = `
      <h1 class="page-title">🤖 AIプラン</h1>
      <div class="empty">まだプランがありません。<br><br><a class="btn btn-primary" href="#input">🎯 目標を入力する</a></div>`;
    return;
  }
  const warn = plan.warnings.length
    ? `<div class="card warn"><h2>⚠️ 先に確認してください</h2>${ul(plan.warnings)}</div>` : '';
  const saved = S.projects.some(p => p.plan && p.plan.id === plan.id);
  view().innerHTML = `
    <div class="row-between">
      <h1 class="page-title">🤖 AIプラン <span class="badge">${plan.icon} ${esc(plan.catLabel)}</span></h1>
      ${saved
        ? '<span class="badge good">✔ プロジェクト保存済み</span>'
        : `<button class="btn btn-good" onclick="App.saveAsProject()">📁 プロジェクトとして保存</button>`}
    </div>
    ${warn}
    <div class="cards-grid">
      <div class="card accent span2"><h2>📝 目標の要約</h2><p style="white-space:pre-wrap">${esc(plan.summary)}</p></div>
      <div class="card accent"><h2>🥇 最優先目標</h2><p><b>${esc(plan.top)}</b></p></div>
      <div class="card good"><h2>👣 最初の一歩</h2><p><b>${esc(plan.first)}</b></p><p class="hint">まずこれだけやれば今日はOKです。</p></div>
      <div class="card"><h2>✅ 今日やること(3つまで)</h2>${ol(plan.today)}</div>
      <div class="card"><h2>📅 今週の目標(5つまで)</h2>${ol(plan.week)}</div>
      <div class="card"><h2>🗓 1ヶ月目標</h2><p>${esc(plan.month)}</p></div>
      <div class="card span2"><h2>🗺 3ヶ月ロードマップ</h2>${ol(plan.roadmap)}</div>
      <div class="card"><h2>📊 測るべきKPI</h2>${ul(plan.kpis)}</div>
      <div class="card"><h2>🏁 成功条件</h2>${ul(plan.success)}</div>
    </div>
    ${fold('🚫 やらないこと', ul(plan.donts))}
    ${fold('⚠️ 危険行動(これをやったら一度停止)', ul(plan.risks), 'warn')}
    ${fold('🕳 失敗しやすいポイント', ul(plan.pitfalls))}
    ${fold('🔍 次に確認すべきこと', ul(plan.next))}
    ${fold('🧭 迷った時の判断基準', ul(plan.judge))}
    ${saved ? `<a class="btn btn-primary btn-block mt8" href="#today">✅ 今日やることへ進む</a>`
            : `<button class="btn btn-good btn-block mt8" onclick="App.saveAsProject()">📁 プロジェクトとして保存して開始する</button>`}
    <p class="hint">※ このプランは入力内容に基づく仮説です。週次PDCAで実際の数字を見ながら自動調整していきます。</p>
  `;
}

/* ---------- 4. 今日やること ---------- */
function renderToday() {
  const p = activeProject();
  if (!p) {
    view().innerHTML = `
      <h1 class="page-title">✅ 今日やること</h1>
      <div class="empty">プロジェクトがまだありません。<br>目標を入力してプランを作りましょう。<br><br><a class="btn btn-primary" href="#input">🎯 目標を入力する</a></div>`;
    return;
  }
  const entry = ensureToday(p);
  const done = entry.tasks.filter(t => t.done).length;
  const pct = entry.tasks.length ? Math.round(done / entry.tasks.length * 100) : 0;
  const selector = S.projects.length > 1 ? `
    <select onchange="App.setActive(this.value)" class="mt8" style="margin-bottom:12px">
      ${S.projects.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${x.icon} ${esc(x.name)}</option>`).join('')}
    </select>` : '';
  const tasksHtml = entry.tasks.map((t, i) => `
    <div class="task-item ${t.done ? 'done' : ''}">
      <input type="checkbox" ${t.done ? 'checked' : ''} onchange="App.toggleTask(${i})" aria-label="完了">
      <div class="task-text">${esc(t.text)}</div>
      ${t.done ? '' : `<button class="defer-btn" onclick="App.deferTask(${i})">明日へ</button>`}
    </div>`).join('');
  const caution = (p.plan.warnings && p.plan.warnings[0]) || p.plan.pitfalls[0];
  view().innerHTML = `
    <h1 class="page-title">✅ 今日やること <span class="badge muted">${dstr()}</span></h1>
    ${selector}
    <div class="card accent">
      <h2>🥇 今日の最重要タスク(3つだけ)</h2>
      ${tasksHtml || '<p class="hint">今日のタスクはありません。</p>'}
      ${progressBar(pct, `今日の進捗 ${done} / ${entry.tasks.length}`)}
      ${done === entry.tasks.length && entry.tasks.length > 0 ? '<p><b>🎉 今日の分は完了です。それ以上やらなくて大丈夫。しっかり休みましょう。</b></p>' : ''}
    </div>
    <div class="card good">
      <h2>⏱ 15分でできる小タスク</h2>
      <p class="hint">時間がない日・気が乗らない日は、これ1つでOKです。</p>
      ${ul(p.plan.quick)}
    </div>
    <div class="card"><h2>🚫 今日やらないこと</h2>${ul(p.plan.donts.slice(0, 3))}</div>
    <div class="card warn"><h2>⚠️ 今日の注意点</h2><p>${esc(caution)}</p></div>
    ${entry.deferred.length ? `<div class="card"><h2>⏭ 明日に回すこと</h2>${ul(entry.deferred)}</div>` : ''}
    <button class="btn btn-ghost btn-block" onclick="App.addTaskPrompt()">＋ タスクを追加(3つまで推奨)</button>
  `;
}

/* ---------- 5. プロジェクト管理 ---------- */
function renderProjects() {
  if (!S.projects.length) {
    view().innerHTML = `
      <h1 class="page-title">📁 プロジェクト</h1>
      <div class="empty">保存されたプロジェクトはありません。<br><br><a class="btn btn-primary" href="#input">🎯 目標を入力する</a></div>`;
    return;
  }
  const rows = S.projects.map(p => {
    const prog = projectProgress(p.id);
    return `<tr onclick="location.hash='#project/${p.id}'">
      <td>${p.icon} ${esc(p.name)} ${p.id === S.activeId ? '<span class="badge good">アクティブ</span>' : ''}</td>
      <td>${esc(p.catLabel)}</td><td>${esc(p.deadline)}</td>
      <td>${prog.pct}%</td><td>${esc(p.nextMove || p.plan.first).slice(0, 30)}</td></tr>`;
  }).join('');
  const cards = S.projects.map(p => {
    const prog = projectProgress(p.id);
    return `<div class="card" onclick="location.hash='#project/${p.id}'" style="cursor:pointer">
      <div class="row-between"><h2>${p.icon} ${esc(p.name)}</h2>${p.id === S.activeId ? '<span class="badge good">アクティブ</span>' : ''}</div>
      <p class="hint">${esc(p.catLabel)} / 期限: ${esc(p.deadline)}</p>
      ${progressBar(prog.pct, `進捗 ${prog.pct}%`)}
      <p class="hint">次の一手: ${esc(p.nextMove || p.plan.first)}</p></div>`;
  }).join('');
  view().innerHTML = `
    <h1 class="page-title">📁 プロジェクト</h1>
    <p class="page-desc">タップで詳細を開きます。「アクティブ」のプロジェクトが今日やることに表示されます。</p>
    <div class="pc-only table-wrap card"><table class="projects">
      <thead><tr><th>プロジェクト</th><th>カテゴリ</th><th>期限</th><th>進捗</th><th>次の一手</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="sp-only">${cards}</div>
    <a class="btn btn-primary btn-block" href="#input">＋ 新しい目標を追加</a>
    <style>@media(min-width:900px){.sp-only{display:none}} @media(max-width:899px){.pc-only{display:none}}</style>
  `;
}

function renderProjectDetail(pid) {
  const p = S.projects.find(x => x.id === pid);
  if (!p) { location.hash = '#projects'; return; }
  const prog = projectProgress(p.id);
  const doneTasks = [];
  for (const d of Object.keys(S.daily).sort().reverse()) {
    const e = S.daily[d][p.id];
    if (e) e.tasks.forEach(t => { if (t.done) doneTasks.push(`${d}: ${t.text}`); });
  }
  view().innerHTML = `
    <div class="row-between">
      <h1 class="page-title">${p.icon} ${esc(p.name)}</h1>
      ${p.id === S.activeId
        ? '<span class="badge good">アクティブ</span>'
        : `<button class="btn btn-sm" onclick="App.setActive('${p.id}');route()">アクティブにする</button>`}
    </div>
    <div class="cards-grid">
      <div class="card"><h2>📋 概要</h2>
        <p><b>カテゴリ:</b> ${esc(p.catLabel)}<br><b>目的:</b> ${esc(p.purpose)}<br><b>期限:</b> ${esc(p.deadline)}<br><b>現状:</b> ${esc(p.situation)}</p>
        ${progressBar(prog.pct, `進捗率 ${prog.pct}%(完了 ${prog.done} / ${prog.total})`)}</div>
      <div class="card"><h2>📊 KPI</h2>${ul(p.plan.kpis)}<a class="btn btn-sm" href="#kpi">📊 記録する</a></div>
      <div class="card accent"><h2>👉 次の一手</h2>
        <textarea id="nextMove" placeholder="次にやることをメモ">${esc(p.nextMove || '')}</textarea>
        <button class="btn btn-sm mt8" onclick="App.saveProjectField('${p.id}','nextMove')">保存</button></div>
      <div class="card"><h2>📝 メモ</h2>
        <textarea id="memo" placeholder="自由メモ">${esc(p.memo || '')}</textarea>
        <button class="btn btn-sm mt8" onclick="App.saveProjectField('${p.id}','memo')">保存</button></div>
    </div>
    ${fold('✅ 完了したタスク(' + doneTasks.length + ')', doneTasks.length ? ul(doneTasks.slice(0, 20)) : '<p class="hint">まだありません</p>')}
    ${fold('🚫 やらないこと', ul(p.plan.donts))}
    ${fold('⚠️ 危険行動', ul(p.plan.risks), 'warn')}
    ${fold('🤖 生成されたプラン全文を見る', `
      <p><b>最優先目標:</b> ${esc(p.plan.top)}</p>
      <h3>3ヶ月ロードマップ</h3>${ol(p.plan.roadmap)}
      <h3>1ヶ月目標</h3><p>${esc(p.plan.month)}</p>
      <h3>今週の目標</h3>${ol(p.plan.week)}
      <h3>成功条件</h3>${ul(p.plan.success)}
      <h3>迷った時の判断基準</h3>${ul(p.plan.judge)}`)}
    <div class="row-between mt16">
      <a class="btn" href="#projects">← 一覧に戻る</a>
      <button class="btn btn-danger" onclick="App.deleteProject('${p.id}')">🗑 削除</button>
    </div>
  `;
}

/* ---------- 6. 週次PDCAレビュー ---------- */
function renderPDCA() {
  const p = activeProject();
  if (!p) {
    view().innerHTML = `<h1 class="page-title">🔄 週次PDCA</h1>
      <div class="empty">先にプロジェクトを作成してください。<br><br><a class="btn btn-primary" href="#input">🎯 目標を入力する</a></div>`;
    return;
  }
  const pastRevs = S.reviews.filter(r => r.pid === p.id).slice(-5).reverse();
  const pastHtml = pastRevs.map(r => fold(
    `📄 ${r.date} のレビュー(評価: ${r.output.grade})`,
    `<p>${esc(r.output.gradeMsg)}</p><h3>来週の重点行動</h3>${ul(r.output.focus)}<h3>改善点</h3>${ul(r.output.improve)}`
  )).join('');
  view().innerHTML = `
    <h1 class="page-title">🔄 週次PDCAレビュー</h1>
    <p class="page-desc">週1回、5分で振り返り。空欄があってもOKです。対象: <b>${p.icon} ${esc(p.name)}</b></p>
    <div class="split">
      <form id="pdcaForm" onsubmit="App.runReview(event)">
        <div class="field"><label>今週やったこと</label><textarea name="did" placeholder="例: 出品ページを作った。営業5件送った。"></textarea></div>
        <div class="field"><label>今週の成果</label><textarea name="result" placeholder="例: 返信が2件きた"></textarea></div>
        <div class="field"><label>数字として進んだこと</label><input type="text" name="numbers" placeholder="例: 営業5件、返信2件、売上0円"></div>
        <div class="field"><label>進まなかった理由</label><input type="text" name="blocked" placeholder="例: 残業で平日に時間が取れなかった"></div>
        <div class="field"><label>効果があった行動</label><input type="text" name="worked" placeholder="例: 朝30分の作業"></div>
        <div class="field"><label>無駄だった行動</label><input type="text" name="wasted" placeholder="例: SNSのチェック"></div>
        <div class="field"><label>来週も続けたいこと</label><input type="text" name="keep" placeholder="例: 朝作業"></div>
        <div class="field"><label>来週やめたいこと</label><input type="text" name="stop" placeholder="例: 夜更かし"></div>
        <div class="field"><label>メンタル状態(1=つらい 〜 10=好調)</label>
          <select name="mental">${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}" ${n===5?'selected':''}>${n}</option>`).join('')}</select></div>
        <button type="submit" class="btn btn-primary btn-block">🤖 レビューを生成する</button>
      </form>
      <div id="reviewOut">${pastHtml || '<div class="empty">まだレビューがありません。<br>左のフォームから今週の振り返りを始めましょう。</div>'}</div>
    </div>
  `;
}

function renderReviewResult(out) {
  return `
    <div class="card accent"><h2>📊 今週の評価: ${out.grade}</h2><p>${esc(out.gradeMsg)}</p></div>
    <div class="card good"><h2>🎯 来週の重点行動</h2>${ol(out.focus)}</div>
    <div class="card"><h2>🔧 改善点</h2>${ul(out.improve)}</div>
    <div class="card"><h2>♻️ 継続すること</h2>${ul(out.keep)}</div>
    <div class="card"><h2>🛑 やめること</h2>${ul(out.stop)}</div>
    <div class="card"><h2>✅ 来週の「今日やること」候補</h2>${ol(out.todayCandidates)}<p class="hint">明日以降の「今日やること」に自動反映されます。</p></div>
    <div class="card warn"><h2>✏️ 目標の修正案</h2><p>${esc(out.revision)}</p></div>
    <div class="card"><h2>🥇 優先順位の見直し</h2><p>${esc(out.priority)}</p></div>
  `;
}

/* ---------- 7. 危険行動チェック ---------- */
function renderRisk() {
  const items = GA.RISK_CHECKLIST.map((r, i) => `
    <div class="risk-item">
      <input type="checkbox" id="rk${i}" onchange="document.getElementById('rmsg${i}').style.display=this.checked?'block':'none'">
      <div style="flex:1">
        <label for="rk${i}" style="cursor:pointer">${esc(r.label)}</label>
        <div class="risk-msg" id="rmsg${i}" style="display:none">${esc(r.msg)}</div>
      </div>
    </div>`).join('');
  view().innerHTML = `
    <h1 class="page-title">🚧 危険行動チェック</h1>
    <p class="page-desc">当てはまるものにチェックを入れてください。責めるためではなく、遠回りを防ぐためのチェックです。</p>
    ${items}
    <div class="card mt16">
      <h2>💬 今考えていることを書いてチェック</h2>
      <textarea id="riskText" placeholder="例: 貯金を全部使って仮想通貨に入れようか迷っている"></textarea>
      <button class="btn btn-primary mt8" onclick="App.scanRiskText()">チェックする</button>
      <div id="riskResult" class="mt8"></div>
    </div>
    <div class="card good"><h2>🧭 迷ったら</h2><p>今週の最重要目標に戻りましょう。判断に迷う時は「48時間置いてから決める」が最も失敗が少ない方法です。</p>
    ${activeProject() ? `<a class="btn btn-sm" href="#today">✅ 今日やることに戻る</a>` : ''}</div>
  `;
}

/* ---------- 8. テンプレ選択 ---------- */
function renderTemplates() {
  const cards = GA.TEMPLATE_ORDER.map(k => {
    const t = GA.TEMPLATES[k];
    return `<a class="card" href="#input" onclick="App.pickTemplate('${k}')" style="display:block;color:var(--text)">
      <div class="f-icon">${t.icon}</div><div class="f-title">${t.label}</div>
      <div class="f-desc">${esc(t.top)}</div></a>`;
  }).join('');
  view().innerHTML = `
    <h1 class="page-title">🗂 テンプレ選択</h1>
    <p class="page-desc">目標に近いテンプレを選ぶと、入力ページに移動します。迷ったら「自由入力」でOKです。</p>
    <div class="feature-grid">${cards}</div>
  `;
}

/* ---------- 9. KPIダッシュボード ---------- */
let kpiTab = null;
function renderKPI() {
  const p = activeProject();
  if (!kpiTab) kpiTab = p ? p.kpiCat : 'money';
  const tabs = Object.keys(GA.KPI_DEFS).map(k =>
    `<button class="chip ${k === kpiTab ? 'active' : ''}" onclick="App.setKpiTab('${k}')">${GA.KPI_DEFS[k].label}</button>`).join('');
  const rows = GA.KPI_DEFS[kpiTab].metrics.map(m => {
    const logs = S.kpiLogs.filter(l => l.cat === kpiTab && l.name === m.name).slice(-8);
    const latest = logs.length ? logs[logs.length - 1] : null;
    const max = Math.max(...logs.map(l => Math.abs(l.value)), 1);
    const spark = logs.map(l => `<i style="height:${Math.max(6, Math.round(Math.abs(l.value) / max * 100))}%" title="${l.date}: ${l.value}"></i>`).join('');
    return `<div class="kpi-row">
      <div class="kpi-name">${esc(m.name)}<div class="kpi-unit">${latest ? '最終記録 ' + jdate(latest.date) : '未記録'}</div></div>
      <div class="spark">${spark}</div>
      <div class="kpi-latest">${latest ? Number(latest.value).toLocaleString() : '—'}<span class="kpi-unit">${esc(m.unit)}</span></div>
      <input type="number" step="any" class="kpi-input" id="kpi_${esc(m.name)}" placeholder="値">
      <button class="btn btn-sm" onclick="App.logKpi('${kpiTab}','${esc(m.name)}')">記録</button>
    </div>`;
  }).join('');
  view().innerHTML = `
    <h1 class="page-title">📊 KPIダッシュボード</h1>
    <p class="page-desc">数値を入力して「記録」を押すと履歴が貯まり、推移が見えるようになります。</p>
    <div class="kpi-tabs">${tabs}</div>
    <div class="card">${rows}</div>
    <p class="hint">※ 借金残高や不安度のように「下がるのが良い」指標もあります。グラフは大きさの推移を示します。</p>
  `;
}

/* ---------- 10. 履歴 ---------- */
function renderHistory() {
  const plans = [...S.plans].reverse().slice(0, 20).map(pl =>
    `<div class="history-item"><div class="history-date">${jdate(pl.createdAt)} 生成</div>${pl.icon} ${esc(pl.catLabel)}:「${esc(pl.input.goal).slice(0, 60)}」</div>`).join('');
  const revs = [...S.reviews].reverse().slice(0, 20).map(r => {
    const p = S.projects.find(x => x.id === r.pid);
    return `<div class="history-item"><div class="history-date">${r.date}</div>週次レビュー(${p ? esc(p.name) : '削除済み'})— 評価 ${r.output.grade}${r.output.revision ? ' / 修正案あり' : ''}</div>`;
  }).join('');
  const doneTasks = [];
  for (const d of Object.keys(S.daily).sort().reverse()) {
    for (const pid of Object.keys(S.daily[d])) {
      const p = S.projects.find(x => x.id === pid);
      S.daily[d][pid].tasks.forEach(t => { if (t.done) doneTasks.push(`<div class="history-item"><div class="history-date">${d}</div>✅ ${esc(t.text)} ${p ? '(' + esc(p.name) + ')' : ''}</div>`); });
    }
  }
  const kpis = [...S.kpiLogs].reverse().slice(0, 30).map(l =>
    `<div class="history-item"><div class="history-date">${jdate(l.date)}</div>📊 ${esc(l.name)}: ${Number(l.value).toLocaleString()}</div>`).join('');
  view().innerHTML = `
    <h1 class="page-title">🕘 履歴</h1>
    ${fold(`🤖 生成されたプラン(${S.plans.length})`, plans || '<p class="hint">まだありません</p>', '', true)}
    ${fold(`🔄 週次レビュー(${S.reviews.length})`, revs || '<p class="hint">まだありません</p>')}
    ${fold(`✅ 完了したタスク(${doneTasks.length})`, doneTasks.slice(0, 30).join('') || '<p class="hint">まだありません</p>')}
    ${fold(`📊 KPIの記録(${S.kpiLogs.length})`, kpis || '<p class="hint">まだありません</p>')}
  `;
}

/* ============================================================
   アクション (onclick から呼ばれる)
   ============================================================ */
const App = {
  pickTemplate(k) { S.draftTemplate = k; save(); if (location.hash === '#input' || location.hash === '') route(); },

  generate(ev) {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const input = {};
    for (const [k, v] of f.entries()) input[k] = v.trim();
    input.template = S.draftTemplate;
    const plan = GA.generatePlan(input);
    S.lastPlan = plan;
    S.plans.push(plan);
    save();
    location.hash = '#plan';
  },

  saveAsProject() {
    const plan = S.lastPlan;
    if (!plan) return;
    const name = (plan.input.goal || '').slice(0, 24) || plan.catLabel;
    const p = {
      id: uid('prj'), name, category: plan.category, catLabel: plan.catLabel,
      icon: plan.icon, kpiCat: plan.kpiCat,
      purpose: plan.input.goal, deadline: plan.deadline, situation: plan.input.situation || '',
      plan, memo: '', nextMove: plan.first, createdAt: new Date().toISOString()
    };
    S.projects.push(p);
    S.activeId = p.id;
    save();
    ensureToday(p);
    location.hash = '#today';
  },

  setActive(pid) { S.activeId = pid; save(); if (location.hash === '#today') route(); },

  toggleTask(i) {
    const p = activeProject(); if (!p) return;
    const e = ensureToday(p);
    e.tasks[i].done = !e.tasks[i].done;
    save(); route();
  },

  deferTask(i) {
    const p = activeProject(); if (!p) return;
    const e = ensureToday(p);
    const [t] = e.tasks.splice(i, 1);
    e.deferred.push(t.text);
    save(); route();
  },

  addTaskPrompt() {
    const p = activeProject(); if (!p) return;
    const text = prompt('追加するタスク(具体的な行動で):');
    if (!text || !text.trim()) return;
    const e = ensureToday(p);
    e.tasks.push({ text: text.trim(), done: false });
    save(); route();
  },

  saveProjectField(pid, field) {
    const p = S.projects.find(x => x.id === pid); if (!p) return;
    const el = document.getElementById(field);
    if (el) { p[field] = el.value; save(); }
  },

  deleteProject(pid) {
    if (!confirm('このプロジェクトを削除しますか?(履歴のタスク記録も対象から外れます)')) return;
    S.projects = S.projects.filter(x => x.id !== pid);
    if (S.activeId === pid) S.activeId = S.projects[0] ? S.projects[0].id : null;
    save();
    location.hash = '#projects';
  },

  runReview(ev) {
    ev.preventDefault();
    const p = activeProject(); if (!p) return;
    const f = new FormData(ev.target);
    const rev = {};
    for (const [k, v] of f.entries()) rev[k] = v.trim();
    const out = GA.generateReview(rev, p);
    S.reviews.push({ id: out.id, pid: p.id, date: dstr(), input: rev, output: out });
    // 明日以降の「今日やること」の種を更新するため保存のみ(ensureTodayが参照)
    save();
    document.getElementById('reviewOut').innerHTML = renderReviewResult(out);
    document.getElementById('reviewOut').scrollIntoView({ behavior: 'smooth' });
  },

  scanRiskText() {
    const text = document.getElementById('riskText').value;
    const hits = GA.scanRisks(text);
    const out = document.getElementById('riskResult');
    if (!text.trim()) { out.innerHTML = ''; return; }
    out.innerHTML = hits.length
      ? hits.map(h => `<div class="risk-msg">${esc(h)}</div>`).join('')
      : '<div class="card good" style="margin:0"><p>明確な危険パターンは検出されませんでした。金額が大きい・取り返しがつかない決断の場合は、48時間置いてから実行しましょう。</p></div>';
  },

  setKpiTab(k) { kpiTab = k; route(); },

  logKpi(cat, name) {
    const el = document.getElementById('kpi_' + name);
    if (!el || el.value === '') return;
    S.kpiLogs.push({ id: uid('kpi'), cat, name, value: parseFloat(el.value), date: new Date().toISOString() });
    save(); route();
  },

  toggleTheme() {
    S.theme = S.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = S.theme;
    save();
  }
};

/* ============================================================
   ルーター
   ============================================================ */
const ROUTES = {
  home: renderHome, input: renderInput, plan: renderPlan, today: renderToday,
  projects: renderProjects, pdca: renderPDCA, risk: renderRisk,
  templates: renderTemplates, kpi: renderKPI, history: renderHistory
};

function route() {
  const hash = (location.hash || '#home').slice(1);
  const [name, param] = hash.split('/');
  document.querySelectorAll('[data-route]').forEach(a => {
    a.classList.toggle('active', a.dataset.route === name);
  });
  if (name === 'project' && param) { renderProjectDetail(param); }
  else { (ROUTES[name] || renderHome)(); }
  window.scrollTo(0, 0);
}

/* ---------- 起動 ---------- */
loadState();
document.documentElement.dataset.theme = S.theme;
document.getElementById('themeBtnSide').addEventListener('click', App.toggleTheme);
document.getElementById('themeBtnTop').addEventListener('click', App.toggleTheme);
window.addEventListener('hashchange', route);
route();

/* PWA: Service Worker 登録 (http/https のみ) */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
