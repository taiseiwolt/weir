# 管理マスタオーバーホール Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** weir-admin.html をオーバーホール — KPIダッシュボード/CS管理ページ削除、ダッシュボードDB連動化、法人管理DB永続化、操作ログページ追加、手数料設定UI追加

**Architecture:** 単一ファイル `weir-admin.html` の大規模改修。既存のSupabase Client（`sb`変数）を使ったDB連携パターンを踏襲。KPI/CSの~480行を削除し、操作ログ/手数料設定の新機能を追加。ダッシュボードのハードコードデータをaudit_logs/ordersテーブルからのDB取得に置換。

**Tech Stack:** HTML/Vanilla JS, Supabase JS Client v2, Chart.js

**File:** `weir-admin.html` (3532行 → 修正後 ~3300行)

---

## Task 1: KPIダッシュボード・CS管理の完全削除

**Files:**
- Modify: `weir-admin.html:96-98` (sidebar menu items)
- Modify: `weir-admin.html:385` (updateSidebar mapping)
- Modify: `weir-admin.html:417-418` (renderPage routing)
- Delete: `weir-admin.html:2939-3159` (KPI dashboard code ~220 lines)
- Delete: `weir-admin.html:3161-3424` (CS management code ~264 lines)
- Modify: `weir-admin.html:3520-3530` (chat widget + CS hash navigation)

- [ ] **Step 1: サイドバーからKPI・CSメニュー削除**

Lines 96-97のKPIダッシュボード・CS管理のnav-itemを削除:

```html
<!-- DELETE these two lines -->
  <div class="nav-item" data-page="kpi" onclick="goTo('kpi')"><span class="icon">📈</span><span class="label">KPIダッシュボード</span></div>
  <div class="nav-item" data-page="cs" onclick="goTo('cs')"><span class="icon">💬</span><span class="label">CS管理</span></div>
```

- [ ] **Step 2: updateSidebar mappingからkpi/cs削除**

Line 385の`sidebarPage`オブジェクトから`kpi:'kpi',cs:'cs'`を削除:

```javascript
// Before:
const sidebarPage={dashboard:'dashboard',corps:'corps',brands:'brands',stores:'stores',users:'users',system:'system',ai:'ai',cost:'cost',billing:'billing',compensation:'compensation',kpi:'kpi',cs:'cs',bulk:'bulk',corp:'corps',brand:'brands',store:'stores'}[currentView.type]||currentView.type;

// After:
const sidebarPage={dashboard:'dashboard',corps:'corps',brands:'brands',stores:'stores',users:'users',system:'system',ai:'ai',cost:'cost',billing:'billing',compensation:'compensation',bulk:'bulk',corp:'corps',brand:'brands',store:'stores'}[currentView.type]||currentView.type;
```

- [ ] **Step 3: renderPageからkpi/csルーティング削除**

Lines 417-418を削除:

```javascript
// DELETE these two lines
  else if(v.type==='kpi'){el.innerHTML=renderKPIDashboard();initKPIDashboard();}
  else if(v.type==='cs'){el.innerHTML=renderCSManagement();initCSManagement();}
```

- [ ] **Step 4: KPIダッシュボードコード全体を削除**

Lines 2939-3159（`// ===== KPI DASHBOARD =====` から `loadTechKPIs`関数の末尾`}`まで）を完全削除。含まれる関数:
- `kpiChartDaily`, `kpiChartGMV` 変数
- `kpiData` 変数
- `renderKPIDashboard()`, `renderKPICardsSkeleton()`, `initKPIDashboard()`
- `getKPIDateRange()`, `onKPIStoreChange()`, `onKPIPeriodChange()`
- `loadKPIData()`, `pctChange()`, `updateKPICard()`
- `renderKPICharts()`, `loadProductKPIs()`, `loadTechKPIs()`

- [ ] **Step 5: CS管理コード全体を削除**

Lines 3161-3424（`// ===== CS MANAGEMENT =====` から `switchTab`フック末尾まで）を完全削除。含まれる関数:
- `CS_API` 定数
- `renderCSManagement()`, `initCSManagement()`
- `loadCSEscalations()`, `loadCSAllSessions()`, `showCSDetail()`, `resolveCS()`
- `escHtml()` ← **注意: この関数はAI品質管理(renderAI)でも使われている(L719)ので削除しない**
- `loadCSAnalytics()`, `loadCSPolicies()`, `showAddPolicyForm()`, `editPolicy()`, `savePolicy()`, `deletePolicy()`

`escHtml()`がCS管理セクション内(L3285)で定義されているが他でも使用されているため、削除する前に適切な場所に移動する。具体的にはLine 148付近（ヘルパー関数群の近く）に移動してからCS管理セクションを削除する。

- [ ] **Step 6: チャットウィジェット・CSハッシュナビゲーション削除**

Lines 3520-3530を削除:

```html
<!-- DELETE this entire block -->
<script src="weir-chat-widget.js"></script>
<script>
(function(){
  new WeirChatWidget({
    contextType: 'merchant',
    supabaseClient: typeof sb !== 'undefined' ? sb : null,
    apiBase: 'https://weir.co.jp',
  });
  if(location.hash === '#cs') goTo('cs');
})();
</script>
```

- [ ] **Step 7: 動作確認**

ブラウザでweir-admin.htmlを開き:
- サイドバーにKPIダッシュボード・CS管理が表示されないこと
- ダッシュボード・法人管理・その他ページが正常に表示されること
- JSコンソールにエラーが出ないこと（escHtml未定義エラーなど）

- [ ] **Step 8: コミット**

```bash
git add weir-admin.html
git commit -m "refactor: remove KPI dashboard and CS management pages from admin master"
```

---

## Task 2: サイドバーに操作ログメニュー追加 + フッター/サポートボタン削除

**Files:**
- Modify: `weir-admin.html` sidebar section (~L94-99)
- Modify: `weir-admin.html` updateSidebar mapping
- Modify: `weir-admin.html` renderPage routing

- [ ] **Step 1: サイドバーに操作ログメニュー追加**

Line 98（CS管理削除後）の位置、`compensation`の次に操作ログメニューを追加:

```html
  <div class="nav-item" data-page="auditlog" onclick="goTo('auditlog')"><span class="icon">📋</span><span class="label">操作ログ</span></div>
```

- [ ] **Step 2: updateSidebar mappingに追加**

```javascript
const sidebarPage={dashboard:'dashboard',corps:'corps',brands:'brands',stores:'stores',users:'users',system:'system',ai:'ai',cost:'cost',billing:'billing',compensation:'compensation',auditlog:'auditlog',bulk:'bulk',corp:'corps',brand:'brands',store:'stores'}[currentView.type]||currentView.type;
```

- [ ] **Step 3: renderPageに操作ログルーティング追加**

`renderPage()`関数内、`compensation`の次に追加:

```javascript
  else if(v.type==='auditlog'){el.innerHTML=renderAuditLogPage();loadAuditLogs();}
```

- [ ] **Step 4: フッター/サポートボタン確認**

現状のweir-admin.htmlにはフッターHTML・サポートボタンHTML自体が存在しない（チャットウィジェットはTask 1で削除済み）。追加の作業不要。

- [ ] **Step 5: コミット**

```bash
git add weir-admin.html
git commit -m "feat: add audit log menu to sidebar, remove chat widget"
```

---

## Task 3: 操作ログページ実装

**Files:**
- Modify: `weir-admin.html` — 新しいセクション追加（CS管理削除跡に配置）

- [ ] **Step 1: 操作ログページのレンダリング関数を実装**

`// ===== AUDIT LOG =====` セクションをCS管理削除後の位置に追加:

```javascript
// ===== AUDIT LOG =====
let auditLogPage=1;
const AUDIT_PAGE_SIZE=50;

function renderAuditLogPage(){
  return '<div class="page-title">操作ログ</div><div class="page-subtitle">プラットフォーム全体の操作履歴</div>'+
  '<div class="toolbar" style="margin-bottom:16px">'+
    '<select id="auditLogLevel" onchange="loadAuditLogs()" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit">'+
      '<option value="">全レベル</option><option value="INFO">INFO</option><option value="WARN">WARN</option><option value="ERR">ERR</option>'+
    '</select>'+
    '<input type="date" id="auditDateFrom" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px" onchange="loadAuditLogs()">'+
    '<span style="color:var(--text-light)">〜</span>'+
    '<input type="date" id="auditDateTo" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px" onchange="loadAuditLogs()">'+
    '<input type="text" id="auditKeyword" placeholder="キーワード検索..." class="sinput" style="width:200px" oninput="debounceAuditSearch()">'+
    '<button class="btn btn-secondary btn-sm" onclick="auditLogPage=1;loadAuditLogs()" style="margin-left:auto">🔄 更新</button>'+
  '</div>'+
  '<div class="card" style="padding:0"><div id="auditLogBody" style="padding:20px;color:#888;text-align:center">読み込み中...</div></div>'+
  '<div id="auditLogPager" style="display:flex;justify-content:center;gap:8px;margin-top:16px"></div>';
}

let _auditDebounce=null;
function debounceAuditSearch(){clearTimeout(_auditDebounce);_auditDebounce=setTimeout(()=>{auditLogPage=1;loadAuditLogs();},400);}

async function loadAuditLogs(){
  const el=document.getElementById('auditLogBody');
  if(!el)return;
  el.innerHTML='<div style="text-align:center;padding:24px;color:#888">読み込み中...</div>';
  try{
    const level=document.getElementById('auditLogLevel')?.value||'';
    const dateFrom=document.getElementById('auditDateFrom')?.value||'';
    const dateTo=document.getElementById('auditDateTo')?.value||'';
    const keyword=(document.getElementById('auditKeyword')?.value||'').trim();

    let q=sb.from('audit_logs').select('*',{count:'exact'}).order('created_at',{ascending:false});
    if(level)q=q.eq('log_level',level);
    if(dateFrom)q=q.gte('created_at',dateFrom+'T00:00:00');
    if(dateTo)q=q.lte('created_at',dateTo+'T23:59:59');
    if(keyword)q=q.or('action.ilike.%'+keyword+'%,actor_email.ilike.%'+keyword+'%,entity_type.ilike.%'+keyword+'%');
    const from=(auditLogPage-1)*AUDIT_PAGE_SIZE;
    q=q.range(from,from+AUDIT_PAGE_SIZE-1);

    const {data:logs,count,error}=await q;
    if(error)throw error;
    if(!logs||!logs.length){el.innerHTML='<div class="empty-state">該当するログはありません</div>';renderAuditPager(0);return;}

    const levelColors={INFO:'background:#e6f9f0;color:#00b894',WARN:'background:#ffeaa7;color:#d68910',ERR:'background:#fab1a0;color:#d63031'};
    let h='<table class="data-table"><thead><tr><th>日時</th><th>レベル</th><th>操作</th><th>対象</th><th>実行者</th><th>詳細</th></tr></thead><tbody>';
    for(const log of logs){
      const dt=log.created_at?new Date(log.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'—';
      const lv=log.log_level||'INFO';
      const lvStyle=levelColors[lv]||levelColors.INFO;
      const details=log.details?JSON.stringify(log.details).substring(0,80):'—';
      h+='<tr>'+
        '<td style="font-size:11px;color:var(--text-light);white-space:nowrap">'+escHtml(dt)+'</td>'+
        '<td><span class="log-badge" style="'+lvStyle+'">'+escHtml(lv)+'</span></td>'+
        '<td style="font-weight:600">'+escHtml(log.action||'')+'</td>'+
        '<td>'+escHtml((log.entity_type||'')+(log.entity_id?' / '+log.entity_id.substring(0,8):''))+'</td>'+
        '<td>'+escHtml(log.actor_email||log.user_email||'—')+'</td>'+
        '<td style="font-size:11px;color:var(--text-light);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+escHtml(details)+'">'+escHtml(details)+'</td>'+
      '</tr>';
    }
    h+='</tbody></table>';
    el.innerHTML=h;
    renderAuditPager(count||0);
  }catch(e){el.innerHTML='<div style="color:var(--danger);padding:24px">読み込みエラー: '+escHtml(e.message)+'</div>';}
}

function renderAuditPager(total){
  const pager=document.getElementById('auditLogPager');
  if(!pager)return;
  const pages=Math.ceil(total/AUDIT_PAGE_SIZE);
  if(pages<=1){pager.innerHTML='';return;}
  let h='';
  for(let i=1;i<=Math.min(pages,10);i++){
    h+='<button class="btn btn-sm '+(i===auditLogPage?'btn-primary':'btn-secondary')+'" onclick="auditLogPage='+i+';loadAuditLogs()">'+i+'</button>';
  }
  if(pages>10)h+='<span style="padding:8px;color:var(--text-light)">... '+pages+'ページ</span>';
  pager.innerHTML=h;
}
```

- [ ] **Step 2: 動作確認**

ブラウザで操作ログページを開き:
- audit_logsテーブルからログが取得・表示されること
- レベル/期間/キーワードフィルタが動作すること
- ページネーションが動作すること

- [ ] **Step 3: コミット**

```bash
git add weir-admin.html
git commit -m "feat: add audit log page with filtering and pagination"
```

---

## Task 4: ダッシュボードKPIカードDB連動化

**Files:**
- Modify: `weir-admin.html` — `renderDashboard()` 関数 (L432-478) を完全書き換え
- Modify: `weir-admin.html` — `renderDashCharts()` 関数 (L479) を書き換え
- Modify: `weir-admin.html` — `renderPage()` 関数にダッシュボード初期化フック追加

- [ ] **Step 1: ダッシュボードのレンダリング関数を書き換え**

既存の `renderDashboard()` (L432-478) を以下に置き換え。KPIカードはサービス別4カテゴリ×7指標のグリッド。追加サービスはグレーアウト+Coming Soonバッジ。

```javascript
// ===== DASHBOARD =====
function renderDashboard(){
  const KPI_CATS=[
    {key:'pickup',name:'お持ち帰り',color:'#0F6E56',orderType:'pickup',feeRate:0.040},
    {key:'delivery',name:'デリバリー',color:'#993C1D',orderType:'delivery',feeRate:0.040},
    {key:'dinein',name:'店内注文',color:'#185FA5',orderType:'dinein',feeRate:0.038},
    {key:'additional',name:'追加サービス',color:'#534AB7',orderType:null,feeRate:0},
  ];
  function kpiCard(label,value,color,disabled){
    const opacity=disabled?'opacity:.45;pointer-events:none;':'';
    const badge=disabled?'<span style="position:absolute;top:6px;right:8px;background:#dfe6e9;color:#636e72;font-size:8px;padding:1px 6px;border-radius:4px;font-weight:700">Coming Soon</span>':'';
    return '<div style="background:#fff;border-radius:10px;padding:14px;border-left:4px solid '+color+';box-shadow:0 1px 3px rgba(0,0,0,.06);position:relative;'+opacity+'">'+badge+'<div style="font-size:10px;color:var(--text-light);margin-bottom:4px">'+label+'</div><div style="font-size:18px;font-weight:800">'+(disabled?'—':value)+'</div></div>';
  }
  function renderSection(cat){
    const disabled=!cat.orderType;
    return '<div style="margin-bottom:24px"><div style="font-size:13px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px"><span style="width:12px;height:12px;border-radius:3px;background:'+cat.color+';display:inline-block"></span>'+cat.name+(disabled?' <span style="background:#dfe6e9;color:#636e72;font-size:9px;padding:1px 6px;border-radius:4px;font-weight:700;margin-left:4px">Coming Soon</span>':'')+'</div>'+
      '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:12px" id="dashKpi-'+cat.key+'">'+
      ['\u6CD5\u4EBA\u6570','\u30D6\u30E9\u30F3\u30C9\u6570','\u5E97\u8217\u6570','\u6708\u9593\u6CE8\u6587\u6570','\u6708\u9593GMV','\u624B\u6570\u6599\u53CE\u5165','MRR'].map(l=>kpiCard(l,'—',cat.color,disabled)).join('')+
      '</div></div>';
  }
  return '<div class="page-title">ダッシュボード</div><div class="page-subtitle">Weirプラットフォーム全体のKPI概要</div>'+
  KPI_CATS.map(c=>renderSection(c)).join('')+
  '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">'+
    '<div class="card"><div class="card-title">🎯 プロダクトKPI</div><table class="data-table"><thead><tr><th>指標</th><th>値</th><th>備考</th></tr></thead><tbody id="dashProductKPI"></tbody></table></div>'+
    '<div class="card"><div class="card-title">⚙️ 技術KPI</div><table class="data-table"><thead><tr><th>指標</th><th>値</th><th>備考</th></tr></thead><tbody id="dashTechKPI"></tbody></table></div>'+
  '</div>'+
  '<div class="card" style="background:linear-gradient(135deg,#f8f6ff 0%,#eff8ff 100%);border:1px solid #d4c5f9;margin-bottom:16px">'+
    '<div class="card-title" style="color:#5b4a9e">🤖 月次AIコメント</div>'+
    '<div style="display:flex;gap:10px;align-items:center;margin-bottom:14px">'+
      '<select id="aiMonthlyStore" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:12px;min-width:200px"><option value="">店舗を選択</option>'+STORES.map(s=>{const br=getBrandForStore(s);return '<option value="'+s.id+'">'+(br?br.name+' ':'')+s.name+'</option>';}).join('')+'</select>'+
      '<input type="month" id="aiMonthlyMonth" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:12px" value="2026-03">'+
      '<button class="btn btn-sm" style="background:#5b4a9e;color:#fff" onclick="aiGenerateMonthlyComment()" id="aiMonthlyBtn">🤖 AIコメントを生成</button>'+
    '</div>'+
    '<div id="aiMonthlyResult" style="font-size:13px;line-height:1.8;color:#333"></div>'+
  '</div>'+
  '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">'+
    '<div class="card"><div class="card-title">📈 法人別GMV</div><div id="dashGMV" style="max-height:300px;overflow-y:auto"></div></div>'+
    '<div class="card"><div class="card-title">🕐 直近アクティビティ</div><div id="dashActivity" style="max-height:300px;overflow-y:auto;color:#888;text-align:center">読み込み中...</div></div>'+
  '</div>';
}
```

- [ ] **Step 2: ダッシュボード初期化関数を追加**

```javascript
async function initDashboard(){
  await Promise.all([loadDashKPIs(),loadDashActivity(),renderDashGMV()]);
}

async function loadDashKPIs(){
  const from=dateRange.from+'T00:00:00';
  const to=dateRange.to+'T23:59:59';
  // Fetch orders for the period
  const {data:orders,error}=await sb.from('orders').select('id,store_id,total_amount,payment_status,customer_id,created_at,application_fee_amount,order_type').gte('created_at',from).lte('created_at',to);
  if(error){console.error('Dashboard KPI error:',error);return;}
  const allOrders=orders||[];

  const types=['pickup','delivery','dinein'];
  for(const t of types){
    const typeOrders=allOrders.filter(o=>o.order_type===t);
    // Find stores with orders of this type
    const storeIds=[...new Set(typeOrders.map(o=>o.store_id))];
    const storesMatch=STORES.filter(s=>storeIds.includes(s._uuid));
    const brandIds=[...new Set(storesMatch.map(s=>s.brandId))];
    const brandsMatch=BRANDS.filter(b=>brandIds.includes(b.id));
    const corpIds=[...new Set(brandsMatch.map(b=>b.corpId))];
    const corpsMatch=CORPS.filter(c=>corpIds.includes(c.id));

    const orderCount=typeOrders.length;
    const gmv=typeOrders.reduce((s,o)=>s+(o.total_amount||0),0);
    const feeRate=t==='dinein'?0.038:0.040;
    const fee=Math.round(gmv*feeRate);
    const mrr=fee;

    const el=document.getElementById('dashKpi-'+t);
    if(el){
      const color=t==='pickup'?'#0F6E56':t==='delivery'?'#993C1D':'#185FA5';
      const vals=[corpsMatch.length,brandsMatch.length,storesMatch.length,orderCount.toLocaleString(),Y(gmv),Y(fee),Y(mrr)];
      const labels=['法人数','ブランド数','店舗数','月間注文数','月間GMV','手数料収入','MRR'];
      el.innerHTML=vals.map((v,i)=>'<div style="background:#fff;border-radius:10px;padding:14px;border-left:4px solid '+color+';box-shadow:0 1px 3px rgba(0,0,0,.06)"><div style="font-size:10px;color:var(--text-light);margin-bottom:4px">'+labels[i]+'</div><div style="font-size:18px;font-weight:800">'+v+'</div></div>').join('');
    }
  }
  // Product KPI
  const prodEl=document.getElementById('dashProductKPI');
  if(prodEl){
    const custCounts={};
    allOrders.forEach(o=>{if(o.customer_id){custCounts[o.customer_id]=(custCounts[o.customer_id]||0)+1;}});
    const uniq=Object.keys(custCounts).length;
    const rep=Object.values(custCounts).filter(c=>c>=2).length;
    const repeatRate=uniq>0?(rep/uniq*100).toFixed(1)+'%':'—';
    let aiRate='—';
    try{
      const {count:aiAll}=await sb.from('ai_interactions').select('id',{count:'exact',head:true});
      const {count:aiPub}=await sb.from('ai_interactions').select('id',{count:'exact',head:true}).eq('status','published');
      if(aiAll>0)aiRate=((aiPub||0)/aiAll*100).toFixed(1)+'%';
    }catch(e){}
    prodEl.innerHTML=
      '<tr><td>リピート率（月次）</td><td>'+repeatRate+'</td><td>当月2回以上注文した顧客比率</td></tr>'+
      '<tr><td>エンドユーザー再訪率</td><td><span style="color:var(--text-light)">—</span></td><td>アクセスログ実装後に計測</td></tr>'+
      '<tr><td>AI生成コンテンツ採用率</td><td>'+aiRate+'</td><td>published ÷ 全件数</td></tr>'+
      '<tr><td>CS問い合わせ件数</td><td><span style="color:var(--text-light)">—</span></td><td>手動入力（将来自動化）</td></tr>';
  }
  // Tech KPI
  const techEl=document.getElementById('dashTechKPI');
  if(techEl){
    const total=allOrders.length;
    const paid=allOrders.filter(o=>o.payment_status==='paid').length;
    const rate=total>0?(paid/total*100).toFixed(1)+'%':'—';
    techEl.innerHTML=
      '<tr><td>決済成功率</td><td>'+rate+'</td><td>paid ÷ 全注文数 × 100</td></tr>'+
      '<tr><td>サイト稼働率</td><td><span style="color:var(--text-light)">—</span></td><td>monitor-usage結果から計算</td></tr>'+
      '<tr><td>API応答時間</td><td><span style="color:var(--text-light)">—</span></td><td><a href="https://vercel.com/taiseiwolt/aiden-demo/analytics" target="_blank" style="color:var(--accent);text-decoration:none;font-size:11px">Vercel Analytics →</a></td></tr>'+
      '<tr><td>障害件数</td><td><span style="color:var(--text-light)">—</span></td><td>手動入力</td></tr>';
  }
}

async function loadDashActivity(){
  const el=document.getElementById('dashActivity');
  if(!el)return;
  try{
    const {data:logs,error}=await sb.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(30);
    if(error)throw error;
    if(!logs||!logs.length){el.innerHTML='<div class="empty-state">アクティビティはありません</div>';return;}
    const badgeColors={INFO:'background:#e6f9f0;color:#00b894',WARN:'background:#ffeaa7;color:#d68910',ERR:'background:#fab1a0;color:#d63031'};
    el.innerHTML=logs.map(log=>{
      const dt=log.created_at?new Date(log.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
      const lv=log.log_level||'INFO';
      const style=badgeColors[lv]||badgeColors.INFO;
      const action=log.action||'';
      const detail=log.details?(' — '+(typeof log.details==='object'?JSON.stringify(log.details).substring(0,50):String(log.details).substring(0,50))):'';
      return '<div class="log-row"><span class="log-time">'+escHtml(dt)+'</span><span class="log-badge" style="'+style+'">'+escHtml(lv)+'</span>'+escHtml(action)+escHtml(detail)+'</div>';
    }).join('');
  }catch(e){el.innerHTML='<div style="color:var(--danger)">読み込みエラー</div>';}
}

function renderDashGMV(){
  const el=document.getElementById('dashGMV');
  if(!el)return;
  // GMV is from orders, not in-memory revenue. For now use in-memory until orders have store mapping.
  const d=CORPS.map(c=>({n:c.name.replace(/株式会社|有限会社/g,''),v:getStoresForCorp(c).reduce((s,x)=>s+x.revenue,0)}));
  const mx=Math.max(...d.map(x=>x.v),1);
  el.innerHTML=d.map(x=>'<div class="chart-bar-row"><div class="chart-bar-label">'+x.n.substring(0,8)+'</div><div class="chart-bar-track"><div class="chart-bar-fill" style="width:'+(mx>0?(x.v/mx*100).toFixed(0):0)+'%;background:var(--accent)"><span class="chart-bar-val">'+Y(x.v)+'</span></div></div></div>').join('')||'<div class="empty-state">データなし</div>';
}
```

- [ ] **Step 3: renderPage()のダッシュボードフックを更新**

```javascript
// Before (L407, L424):
  if(v.type==='dashboard')el.innerHTML=dateFilterHtml()+renderDashboard();
  ...
  if(v.type==='dashboard')renderDashCharts();

// After:
  if(v.type==='dashboard'){el.innerHTML=dateFilterHtml()+renderDashboard();initDashboard();}
  ...
  // Remove: if(v.type==='dashboard')renderDashCharts();
```

旧`renderDashCharts()`関数(L479)も削除する（`renderDashGMV()`で置き換え済み）。

- [ ] **Step 4: 動作確認**

- ダッシュボードを開き、KPIカードが表示されること
- pickup/delivery/dineinカテゴリにDB値が入ること
- 追加サービスカテゴリがグレーアウト+Coming Soonバッジ付きで「—」表示になること
- 直近アクティビティがaudit_logsからDB取得されること
- 法人別GMVが表示されること
- 期間フィルタが動作すること
- プロダクトKPI/技術KPIテーブルが表示されること
- 月次AIコメントセクションが表示されること

- [ ] **Step 5: コミット**

```bash
git add weir-admin.html
git commit -m "feat: replace hardcoded dashboard with DB-driven KPI cards and activity feed"
```

---

## Task 5: 法人管理CRUD DB永続化 — アカウント管理

**Files:**
- Modify: `weir-admin.html` — `loadAllData()` にaccountsテーブル読み込み追加
- Modify: `weir-admin.html` — `saveAccount()`, `saveEditAccount()`, `deleteAccount()` をDB永続化

**前提:** accountsテーブルがDBに存在する想定。Phase 0で作成済みか確認が必要。存在しない場合は、corporations.idに紐づくstaffアカウントテーブルを使うか、Supabase Authのusers情報を使う。

- [ ] **Step 1: loadAllData()でアカウント読み込み**

`loadAllData()`関数の`ACCOUNTS=[];`部分を以下に変更:

```javascript
  // Load staff accounts
  const {data:accRaw}=await sb.from('staff_accounts').select('*');
  ACCOUNTS=(accRaw||[]).map(r=>{
    const corpDid=Object.entries(uuidToDisplayId).find(([uuid])=>uuid===r.corporation_id);
    return {
      _uuid:r.id, id:r.display_id||r.id,
      name:r.name||'', email:r.email||'', role:r.role||'staff',
      corpId:corpDid?corpDid[1]:'', status:r.status||'active',
      lastLogin:r.last_login_at?(r.last_login_at.split('T')[0]):'—'
    };
  });
```

**注意:** `staff_accounts`テーブルが存在しない場合は`ACCOUNTS=[];`のまま残し、インメモリ操作を維持する。この場合、DB永続化はPhase 2以降とする。

- [ ] **Step 2: saveAccount()をDB永続化**

```javascript
async function saveAccount(){
  const name=document.getElementById('addAccName').value.trim();
  const email=document.getElementById('addAccEmail').value.trim();
  if(!name||!email){showToast('⚠️ 氏名とメールは必須です');return;}
  const role=document.getElementById('addAccRole').value;
  const corpId=document.getElementById('addAccCorp').value;
  const corp=CORPS.find(c=>c.id===corpId);
  try{
    const {data,error}=await sb.from('staff_accounts').insert({
      name:name, email:email, role:role,
      corporation_id:corp?corp._uuid:null, status:'active'
    }).select().single();
    if(error)throw error;
    ACCOUNTS.push({_uuid:data.id,id:data.display_id||data.id,name:name,email:email,role:role,corpId:corpId,status:'active',lastLogin:'—'});
    logAudit('add_account','staff_accounts',data.id,{name,email,role,corpId});
    closeModal();showToast('✅ アカウントを追加しました');renderPage();
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 3: saveEditAccount()をDB永続化**

```javascript
async function saveEditAccount(accId){
  const a=ACCOUNTS.find(x=>x.id===accId);
  if(!a)return;
  const name=document.getElementById('editAccName').value.trim();
  const email=document.getElementById('editAccEmail').value.trim();
  const role=document.getElementById('editAccRole').value;
  if(!name||!email){showToast('⚠️ 氏名とメールは必須です');return;}
  try{
    const {error}=await sb.from('staff_accounts').update({name:name,email:email,role:role}).eq('id',a._uuid);
    if(error)throw error;
    a.name=name;a.email=email;a.role=role;
    logAudit('edit_account','staff_accounts',a._uuid,{name,email,role});
    closeModal();showToast('✅ アカウントを更新しました');renderPage();
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 4: deleteAccount()をDB永続化**

```javascript
async function deleteAccount(accId){
  const a=ACCOUNTS.find(x=>x.id===accId);
  if(!a)return;
  if(!confirm(a.name+'のアカウントを削除しますか？'))return;
  try{
    const {error}=await sb.from('staff_accounts').delete().eq('id',a._uuid);
    if(error)throw error;
    ACCOUNTS.splice(ACCOUNTS.indexOf(a),1);
    logAudit('delete_account','staff_accounts',a._uuid,{name:a.name});
    showToast('✅ アカウントを削除しました');renderPage();
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 5: staff_accountsテーブル存在確認**

```bash
# Run this to check if staff_accounts exists
grep -r "staff_accounts\|create.*account" supabase/migrations/ sql/
```

テーブルが存在しない場合は、このTaskのDB永続化コードをtry-catchでラップし、テーブルが無い場合はインメモリにフォールバックする安全策を実装する。

- [ ] **Step 6: コミット**

```bash
git add weir-admin.html
git commit -m "feat: persist account CRUD to staff_accounts table"
```

---

## Task 6: 法人詳細 — タブ順序変更・パンくず修正・利用サービス削除

**Files:**
- Modify: `weir-admin.html` — `renderCorpPage()` (L1231-1243)

- [ ] **Step 1: パンくず `›` → `>` を修正**

既にLine 1233で`>`を使用しているので修正不要。brandPage(L1248)も`>`。storePageも確認:

```javascript
// 確認: 全てのbreadcrumbで › ではなく > が使われていること
// L1233: '<span class="sep">></span>' — OK
```

- [ ] **Step 2: タブ順序変更**

Line 1237のタブ順序を「基本情報→サービス設定→ブランド一覧→店舗一覧→アカウント一覧」に変更。現在の順序は既にこの通りなので変更不要:

```javascript
// 現在: 基本情報→サービス設定→ブランド一覧→店舗一覧→アカウント一覧
// → 要求通り。変更不要。
```

- [ ] **Step 3: 利用サービス欄の削除**

仕様書の「利用サービス欄: 削除」は、法人一覧テーブルの列を指す可能性がある。現在の法人一覧テーブル(L484-487)には「法人ID/法人名/代表者/ブランド/店舗/ステータス」があり、「利用サービス」列は存在しない。変更不要。

- [ ] **Step 4: コミット（変更がある場合のみ）**

パンくずに `›` が使われている箇所を修正した場合のみコミット。

---

## Task 7: 法人詳細 — 手数料設定タブ追加 (fee_schedulesテーブル連携)

**Files:**
- Modify: `weir-admin.html` — `renderCorpPage()` にタブ追加
- Add new functions: `loadFeeSchedules()`, `saveFeeSchedule()`, `deleteFeeSchedule()`

- [ ] **Step 1: 法人詳細ページにタブ追加**

`renderCorpPage()`のタブHTML(L1237)に手数料設定タブを追加:

```javascript
// タブバーの末尾（アカウント一覧の後）に追加:
'<div class="tab" onclick="switchTab(\'corp\',this,\'fees\')">手数料設定</div>'
```

- [ ] **Step 2: 手数料設定タブコンテンツを追加**

`renderCorpPage()`のreturn文末尾（最後の`</div>`の前）に追加:

```javascript
  '<div class="tab-content" id="corp-fees"><div class="card"><div class="card-title">💰 手数料スケジュール <span class="ct-right"><button class="btn btn-primary btn-sm" onclick="openAddFeeModal(\''+c._uuid+'\',\''+c.id+'\')">＋ 期間限定料率追加</button></span></div>'+
    '<div id="feeScheduleList-'+c.id+'" style="color:#888;text-align:center;padding:20px">読み込み中...</div>'+
  '</div></div>'
```

- [ ] **Step 3: 手数料管理関数を実装**

```javascript
// ===== FEE SCHEDULES =====
async function loadFeeSchedules(corpUuid,corpDisplayId){
  const el=document.getElementById('feeScheduleList-'+corpDisplayId);
  if(!el)return;
  try{
    const {data:fees,error}=await sb.from('fee_schedules').select('*').eq('corporation_id',corpUuid).order('fee_type').order('effective_from',{ascending:true});
    if(error)throw error;
    if(!fees||!fees.length){el.innerHTML='<div class="empty-state">手数料スケジュールが設定されていません</div>';return;}
    const typeLabels={dinein:'店内注文',takeout:'テイクアウト',delivery:'デリバリー'};
    const today=new Date().toISOString().slice(0,10);
    let h='<table class="data-table"><thead><tr><th>チャネル</th><th class="r">料率</th><th>種別</th><th>開始日</th><th>終了日</th><th>ステータス</th><th></th></tr></thead><tbody>';
    for(const f of fees){
      const label=typeLabels[f.fee_type]||f.fee_type;
      const rate=(f.rate*100).toFixed(2)+'%';
      const kind=f.is_base?'<span style="font-size:10px;background:#e6f9f0;color:#00b894;padding:2px 6px;border-radius:4px;font-weight:700">ベース</span>':'<span style="font-size:10px;background:#fff3e0;color:#e17055;padding:2px 6px;border-radius:4px;font-weight:700">期間限定</span>';
      const from=f.effective_from||'—';
      const to=f.effective_to||'永久';
      // Status: past(grey), current(blue), future(purple)
      let status,statusStyle;
      if(f.effective_to&&f.effective_to<today){status='過去';statusStyle='background:#dfe6e9;color:#636e72';}
      else if(f.effective_from<=today&&(!f.effective_to||f.effective_to>=today)){status='現在';statusStyle='background:#0984e315;color:#0984e3';}
      else{status='未来';statusStyle='background:#6c5ce715;color:#6c5ce7';}
      const actions=f.is_base?
        '<button class="btn btn-secondary btn-sm" onclick="openEditFeeModal(\''+f.id+'\',\''+corpUuid+'\',\''+corpDisplayId+'\')">編集</button>':
        '<button class="btn btn-secondary btn-sm" style="margin-right:4px" onclick="openEditFeeModal(\''+f.id+'\',\''+corpUuid+'\',\''+corpDisplayId+'\')">編集</button><button class="btn btn-secondary btn-sm" style="color:var(--danger)" onclick="deleteFeeSchedule(\''+f.id+'\',\''+corpUuid+'\',\''+corpDisplayId+'\')">削除</button>';
      h+='<tr><td>'+label+'</td><td class="r" style="font-weight:800">'+rate+'</td><td>'+kind+'</td><td>'+from+'</td><td>'+to+'</td><td><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;'+statusStyle+'">'+status+'</span></td><td>'+actions+'</td></tr>';
    }
    h+='</tbody></table>';
    el.innerHTML=h;
  }catch(e){el.innerHTML='<div style="color:var(--danger)">読み込みエラー: '+escHtml(e.message)+'</div>';}
}

function openAddFeeModal(corpUuid,corpDisplayId){
  openModal('<button class="modal-close" onclick="closeModal()">✕</button><h3>💰 期間限定料率追加</h3>'+
  '<div class="form-grid">'+
    '<div class="form-group"><label>チャネル <span style="color:var(--danger)">*</span></label><select id="feeType"><option value="dinein">店内注文</option><option value="takeout">テイクアウト</option><option value="delivery">デリバリー</option></select></div>'+
    '<div class="form-group"><label>料率（%）<span style="color:var(--danger)">*</span></label><input type="number" id="feeRate" step="0.01" min="0" max="100" placeholder="例: 3.80"></div>'+
    '<div class="form-group"><label>開始日 <span style="color:var(--danger)">*</span></label><input type="date" id="feeFrom"></div>'+
    '<div class="form-group"><label>終了日 <span style="color:var(--danger)">*</span></label><input type="date" id="feeTo"></div>'+
  '</div>'+
  '<div class="btn-group"><button class="btn btn-primary" onclick="saveFeeSchedule(\''+corpUuid+'\',\''+corpDisplayId+'\')">追加</button><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button></div>');
}

function openEditFeeModal(feeId,corpUuid,corpDisplayId){
  // Fetch the fee data first
  sb.from('fee_schedules').select('*').eq('id',feeId).single().then(({data:f,error})=>{
    if(error||!f){showToast('⚠️ データ取得エラー');return;}
    openModal('<button class="modal-close" onclick="closeModal()">✕</button><h3>💰 料率編集</h3>'+
    '<div class="form-grid">'+
      '<div class="form-group"><label>チャネル</label><input type="text" value="'+(f.fee_type==='dinein'?'店内注文':f.fee_type==='takeout'?'テイクアウト':'デリバリー')+'" readonly style="background:#f5f6fa;color:var(--text-light)"></div>'+
      '<div class="form-group"><label>料率（%）<span style="color:var(--danger)">*</span></label><input type="number" id="editFeeRate" step="0.01" min="0" max="100" value="'+(f.rate*100).toFixed(2)+'"></div>'+
      '<div class="form-group"><label>開始日</label><input type="date" id="editFeeFrom" value="'+(f.effective_from||'')+'"'+(f.is_base?' readonly style="background:#f5f6fa"':'')+'></div>'+
      '<div class="form-group"><label>終了日</label><input type="date" id="editFeeTo" value="'+(f.effective_to||'')+'"'+(f.is_base?' readonly style="background:#f5f6fa"':'')+'></div>'+
    '</div>'+
    '<div class="btn-group"><button class="btn btn-primary" onclick="updateFeeSchedule(\''+feeId+'\',\''+corpUuid+'\',\''+corpDisplayId+'\')">保存</button><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button></div>');
  });
}

async function saveFeeSchedule(corpUuid,corpDisplayId){
  const feeType=document.getElementById('feeType').value;
  const rate=parseFloat(document.getElementById('feeRate').value);
  const from=document.getElementById('feeFrom').value;
  const to=document.getElementById('feeTo').value;
  if(!feeType||isNaN(rate)||!from||!to){showToast('⚠️ 全項目を入力してください');return;}
  try{
    const {error}=await sb.from('fee_schedules').insert({
      corporation_id:corpUuid, fee_type:feeType, rate:rate/100,
      is_base:false, effective_from:from, effective_to:to
    });
    if(error)throw error;
    logAudit('add_fee_schedule','fee_schedules',null,{corpId:corpDisplayId,feeType,rate});
    closeModal();showToast('✅ 期間限定料率を追加しました');
    loadFeeSchedules(corpUuid,corpDisplayId);
  }catch(e){showToast('⚠️ '+e.message);}
}

async function updateFeeSchedule(feeId,corpUuid,corpDisplayId){
  const rate=parseFloat(document.getElementById('editFeeRate').value);
  const from=document.getElementById('editFeeFrom')?.value;
  const to=document.getElementById('editFeeTo')?.value;
  if(isNaN(rate)){showToast('⚠️ 料率を入力してください');return;}
  try{
    const update={rate:rate/100};
    if(from)update.effective_from=from;
    if(to)update.effective_to=to;
    const {error}=await sb.from('fee_schedules').update(update).eq('id',feeId);
    if(error)throw error;
    logAudit('update_fee_schedule','fee_schedules',feeId,{rate});
    closeModal();showToast('✅ 料率を更新しました');
    loadFeeSchedules(corpUuid,corpDisplayId);
  }catch(e){showToast('⚠️ '+e.message);}
}

async function deleteFeeSchedule(feeId,corpUuid,corpDisplayId){
  if(!confirm('この期間限定料率を削除しますか？'))return;
  try{
    const {error}=await sb.from('fee_schedules').delete().eq('id',feeId);
    if(error)throw error;
    logAudit('delete_fee_schedule','fee_schedules',feeId,{});
    showToast('✅ 期間限定料率を削除しました');
    loadFeeSchedules(corpUuid,corpDisplayId);
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 4: タブ切り替え時に手数料データ読み込み**

`switchTab`関数にフックを追加。既存のswitchTab(L388-393)の末尾に:

```javascript
function switchTab(prefix,el,tabId){
  el.parentElement.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));el.classList.add('active');
  const container=document.getElementById('content');
  container.querySelectorAll('.tab-content').forEach(tc=>{if(tc.id&&tc.id.startsWith(prefix+'-'))tc.classList.remove('active');});
  const tgt=document.getElementById(prefix+'-'+tabId);if(tgt)tgt.classList.add('active');
  // Fee schedule lazy load
  if(prefix==='corp'&&tabId==='fees'){
    const c=CORPS.find(x=>x.id===currentView.id);
    if(c)loadFeeSchedules(c._uuid,c.id);
  }
}
```

- [ ] **Step 5: 動作確認**

- 法人詳細を開き、手数料設定タブをクリック
- ベース料率3件（dinein 3.80%, takeout 4.00%, delivery 4.00%）が表示されること
- ベース料率の「現在」ステータスが青で表示されること
- 期間限定料率の追加・編集・削除が動作すること
- 期間限定料率に過去/現在/未来のステータスが正しく表示されること

- [ ] **Step 6: コミット**

```bash
git add weir-admin.html
git commit -m "feat: add fee schedule management to corporation detail page"
```

---

## Task 8: システム設定のハードコードログをDB取得に置換

**Files:**
- Modify: `weir-admin.html` — `renderSystem()` (L709-715)

- [ ] **Step 1: システムログセクションをDB取得に変更**

`renderSystem()`関数のシステムログ部分(L714)のハードコードされた5件のログを、プレースホルダー+DB取得に変更:

```javascript
// 旧: ハードコードされたlog-row 5件
// 新: プレースホルダーを表示し、後からDB取得
  '<div class="card"><div class="card-title">📋 システムログ <span class="ct-right"><button class="btn btn-secondary btn-sm" onclick="goTo(\'auditlog\')">全件表示 →</button></span></div><div id="sysLogPreview" style="color:#888;text-align:center">読み込み中...</div></div>';
```

`renderPage()`にシステム設定用の初期化フックを追加:

```javascript
  if(v.type==='system')loadSystemLogPreview();
```

```javascript
async function loadSystemLogPreview(){
  const el=document.getElementById('sysLogPreview');
  if(!el)return;
  try{
    const {data:logs,error}=await sb.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(5);
    if(error)throw error;
    if(!logs||!logs.length){el.innerHTML='<div class="empty-state">ログはありません</div>';return;}
    const badgeColors={INFO:'background:#e6f9f0;color:#00b894',WARN:'background:#ffeaa7;color:#d68910',ERR:'background:#fab1a0;color:#d63031'};
    el.innerHTML=logs.map(log=>{
      const dt=log.created_at?new Date(log.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
      const lv=log.log_level||'INFO';
      const style=badgeColors[lv]||badgeColors.INFO;
      return '<div class="log-row"><span class="log-time">'+escHtml(dt)+'</span><span class="log-badge" style="'+style+'">'+escHtml(lv)+'</span>'+escHtml(log.action||'')+'</div>';
    }).join('');
  }catch(e){el.innerHTML='<div class="empty-state">読み込みエラー</div>';}
}
```

- [ ] **Step 2: コミット**

```bash
git add weir-admin.html
git commit -m "feat: replace hardcoded system logs with DB-driven audit log preview"
```

---

## Task 9: 最終統合テスト・lint・push

**Files:**
- `weir-admin.html`

- [ ] **Step 1: npm run lint**

```bash
npm run lint
```

console.logが残っていないか確認。エラーがあれば修正。

- [ ] **Step 2: git pull --rebase**

```bash
git pull --rebase origin main
```

コンフリクトがあれば解消。

- [ ] **Step 3: ブラウザ動作確認（本番URL）**

https://weir.co.jp/weir-admin.html で以下を確認:
- [ ] ダッシュボード: KPIカード4カテゴリ×7指標が表示、追加サービスはグレーアウト
- [ ] ダッシュボード: 直近アクティビティがDB取得
- [ ] ダッシュボード: 法人別GMVが表示
- [ ] ダッシュボード: プロダクトKPI/技術KPIテーブルが表示
- [ ] ダッシュボード: 月次AIコメントが動作
- [ ] ダッシュボード: 期間フィルタが全セクションに適用
- [ ] サイドバー: KPIダッシュボード/CS管理がない
- [ ] サイドバー: 操作ログメニューがある
- [ ] 操作ログ: ログ一覧が表示、フィルタ動作
- [ ] 法人管理: CRUD操作がDB永続化（リロード後もデータ残存）
- [ ] 法人詳細: 手数料設定タブが動作
- [ ] 法人詳細: タブ順序が正しい
- [ ] 全ページ: フッター/サポートボタンなし
- [ ] 全ページ: JSコンソールエラーなし

- [ ] **Step 4: デプロイ・push**

```bash
git push origin main
vercel --prod
```

- [ ] **Step 5: 完了報告**

変更内容サマリ + 本番URLページごとPASS/FAIL結果
