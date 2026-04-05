# Phase 3: 店舗管理+ユーザー管理+BAN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 店舗管理の全タブDB永続化、ユーザー管理のハードコード排除+DB連携、BAN機能のDB永続化+MO画面チェックを実装する

**Architecture:** `aiden-admin.html`内の店舗管理・ユーザー管理・BAN管理セクションを改修。DBマイグレーション（store_tables作成 + user_bans拡張）→ 店舗一覧・詳細タブ改修 → ユーザー管理DB連携 → BAN DB永続化 + MO画面チェックの4段階。

**Tech Stack:** Vanilla JS, Supabase JS Client v2, PostgreSQL 15, RLS

---

## File Structure

- **Create:** `supabase/migrations/20260405200000_phase3_store_user_ban.sql` — store_tables作成 + user_bans拡張
- **Modify:** `aiden-admin.html` — 店舗管理・ユーザー管理・BAN管理の全セクション
- **Modify:** `aiden-order-checkout.html` — 注文確定前BANチェック追加

---

### Task 1: DBマイグレーション作成

**Files:**
- Create: `supabase/migrations/20260405200000_phase3_store_user_ban.sql`

- [ ] **Step 1: マイグレーションSQL作成**

```sql
-- ============================================================
-- Phase 3: Store/User/BAN Extensions
-- store_tables作成 + user_bans拡張
-- 2026-04-05
-- ============================================================

-- 1. store_tables（テーブル管理）
CREATE TABLE IF NOT EXISTS store_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  table_number INT NOT NULL,
  table_name TEXT,
  capacity INT NOT NULL DEFAULT 2,
  floor TEXT DEFAULT '1F',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(store_id, table_number)
);

CREATE INDEX IF NOT EXISTS store_tables_store_idx ON store_tables (store_id);

ALTER TABLE store_tables ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='store_tables' AND policyname='service_role_full_access') THEN
    CREATE POLICY "service_role_full_access" ON store_tables FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. user_bans 拡張（is_active, expires_at, unbanned_at, unban_reason追加）
ALTER TABLE user_bans ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE user_bans ADD COLUMN IF NOT EXISTS expires_at DATE;
ALTER TABLE user_bans ADD COLUMN IF NOT EXISTS unbanned_at DATE;
ALTER TABLE user_bans ADD COLUMN IF NOT EXISTS unban_reason TEXT;

-- anon/authenticatedユーザーがBANチェックできるようread policyを追加
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_bans' AND policyname='anon_read_active') THEN
    CREATE POLICY "anon_read_active" ON user_bans FOR SELECT TO anon
      USING (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_bans' AND policyname='authenticated_read_active') THEN
    CREATE POLICY "authenticated_read_active" ON user_bans FOR SELECT TO authenticated
      USING (is_active = true);
  END IF;
END $$;

-- 既存のis_active=nullレコードをtrueに更新
UPDATE user_bans SET is_active = true WHERE is_active IS NULL;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260405200000_phase3_store_user_ban.sql
git commit -m "feat: add Phase 3 migration (store_tables, user_bans extensions)"
```

---

### Task 2: 店舗一覧ページ改修

**Files:**
- Modify: `aiden-admin.html:650-656` (renderStoresList)

改修内容:
- 月間注文/月間売上列を削除
- ID列とブランド列の間に法人列を追加
- 店舗名とステータスの間に導入サービス列を追加
- 検索窓にoninput実装（店舗名・ブランド名・IDでフィルタ）

- [ ] **Step 1: renderStoresList関数を更新**

Replace the entire `renderStoresList` function with:

```js
function renderStoresList(){
  return '<div class="page-title">店舗管理</div><div class="page-subtitle">全店舗の一覧</div>'+
  '<div class="card" style="padding:0;overflow:hidden"><div style="padding:16px 20px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border)"><input class="menu-search" placeholder="🔍 店舗名・ブランド名・IDで検索..." style="width:280px" id="storeListSearch" oninput="filterStoresList()"><div style="margin-left:auto;display:flex;gap:8px"><button class="btn-outline btn-sm" onclick="downloadTemplate(\'store\')">📋 テンプレート</button><button class="btn-outline btn-sm" onclick="openBulkUpload(\'store\')">📥 一括登録</button><button class="btn btn-primary btn-sm" onclick="openAddStoreModal()">＋ 店舗追加</button></div></div>'+
  '<table class="data-table"><thead><tr><th>ID</th><th>法人</th><th>ブランド</th><th>店舗名</th><th>導入サービス</th><th>ステータス</th><th></th></tr></thead><tbody id="storeListBody">'+
  renderStoresRows(STORES)+
  '</tbody></table></div>';
}

function renderStoresRows(stores){
  return stores.map(s=>{
    const br=getBrandForStore(s);
    const cp=getCorpForStore(s);
    const svcs=SERVICES.filter(sv=>!sv.comingSoon&&getSvc(s.id,sv.key)).map(sv=>sv.icon).join('');
    return '<tr><td><code style="font-size:11px;background:#f5f6fa;padding:2px 6px;border-radius:4px">'+s.id+'</code></td><td>'+escHtml(cp?cp.name:'')+'</td><td>'+escHtml(br?br.name:'')+'</td><td style="font-weight:600">'+escHtml(s.name)+'</td><td style="font-size:14px">'+svcs+'</td><td>'+statusBadge(s.status)+'</td><td><button class="btn btn-secondary btn-sm" onclick="goToStore(\''+s.id+'\')">詳細</button></td></tr>';
  }).join('');
}

function filterStoresList(){
  var q=(document.getElementById('storeListSearch')?.value||'').toLowerCase();
  var body=document.getElementById('storeListBody');
  if(!body)return;
  if(!q){body.innerHTML=renderStoresRows(STORES);return;}
  var filtered=STORES.filter(function(s){
    var br=getBrandForStore(s);
    var fn=(br?br.name+' ':'')+s.name;
    return fn.toLowerCase().includes(q)||s.id.toLowerCase().includes(q);
  });
  body.innerHTML=renderStoresRows(filtered);
}
```

- [ ] **Step 2: Commit**

```bash
git add aiden-admin.html
git commit -m "feat: store list - add corp/service columns, remove revenue, add search filter"
```

---

### Task 3: 店舗詳細 — 売上タブ削除 + 営業時間DB連携 + 施設改善

**Files:**
- Modify: `aiden-admin.html:1777` (store tabs), `aiden-admin.html:1787` (store-sales tab), `aiden-admin.html:1849-1855` (initStoreTabs)

- [ ] **Step 1: 売上タブを削除**

renderStorePage内のtabsから売上タブを削除:
```
Remove: <div class="tab" onclick="switchTab('store',this,'sales')">売上</div>
Remove: the entire store-sales tab-content div
```

- [ ] **Step 2: 営業時間タブをDB連携に更新**

Replace the store-hours tab HTML with a DB-loading version:

```js
'<div class="tab-content" id="store-hours"><div class="card"><div class="card-title">営業時間 <span class="ct-right"><button class="btn btn-secondary btn-sm" onclick="applyAllStoreHours(\''+s._uuid+'\')">全日一括適用</button> <button class="btn btn-primary btn-sm" onclick="saveStoreHours(\''+s._uuid+'\')">保存</button></span></div><div class="hours-grid" id="storeHoursGrid"></div></div></div>'
```

- [ ] **Step 3: initStoreTabs更新 — store_hoursからDB読み込み**

Replace `initStoreTabs` function:

```js
async function initStoreTabs(){
  var s=STORES.find(x=>x.id===currentView.id);
  if(!s)return;
  // Load store hours from DB
  await loadStoreHours(s._uuid);
  // Load AI chart (hardcoded for now)
  var ae=document.getElementById('storeAIChart');
  if(ae){var d=[{n:'SNS投稿文',v:85},{n:'AI画像',v:62},{n:'口コミ返信',v:48},{n:'POP作成',v:21}];var mx=Math.max(...d.map(x=>x.v));ae.innerHTML=d.map(x=>'<div class="chart-bar-row"><div class="chart-bar-label">'+x.n+'</div><div class="chart-bar-track"><div class="chart-bar-fill" style="width:'+(x.v/mx*100).toFixed(0)+'%;background:var(--accent)"><span class="chart-bar-val">'+x.v+'回</span></div></div></div>').join('');}
}
```

- [ ] **Step 4: 営業時間CRUD関数追加**

```js
const DAYS_MAP={0:'日曜',1:'月曜',2:'火曜',3:'水曜',4:'木曜',5:'金曜',6:'土曜'};
const DAYS_ORDER=[1,2,3,4,5,6,0]; // 月〜日

async function loadStoreHours(storeUuid){
  var hg=document.getElementById('storeHoursGrid');
  if(!hg)return;
  try{
    var {data:hours,error}=await sb.from('store_hours').select('*').eq('store_id',storeUuid).order('day_of_week');
    if(error)throw error;
    var hourMap={};
    (hours||[]).forEach(function(h){hourMap[h.day_of_week]=h;});
    hg.innerHTML=DAYS_ORDER.map(function(d){
      var h=hourMap[d]||{};
      var open=h.open_time||'11:00';
      var close=h.close_time||'22:00';
      var closed=h.is_closed||false;
      return '<div class="day-label">'+DAYS_MAP[d]+'</div>'+
        '<input type="time" id="storeHour_'+d+'_open" value="'+open+'"'+( closed?' disabled style="opacity:0.4"':'')+'>'+
        '<input type="time" id="storeHour_'+d+'_close" value="'+close+'"'+( closed?' disabled style="opacity:0.4"':'')+'>'+
        '<label class="closed-check"><input type="checkbox" id="storeHour_'+d+'_closed"'+(closed?' checked':'')+' onchange="toggleDayClosed('+d+')"> 定休</label>';
    }).join('');
  }catch(e){
    hg.innerHTML=DAYS_ORDER.map(function(d){
      return '<div class="day-label">'+DAYS_MAP[d]+'</div><input type="time" value="11:00"><input type="time" value="22:00"><label class="closed-check"><input type="checkbox"> 定休</label>';
    }).join('');
  }
}

function toggleDayClosed(day){
  var closed=document.getElementById('storeHour_'+day+'_closed')?.checked;
  var open=document.getElementById('storeHour_'+day+'_open');
  var close=document.getElementById('storeHour_'+day+'_close');
  if(open){open.disabled=closed;open.style.opacity=closed?'0.4':'1';}
  if(close){close.disabled=closed;close.style.opacity=closed?'0.4':'1';}
}

function applyAllStoreHours(storeUuid){
  var firstOpen=document.getElementById('storeHour_1_open')?.value||'11:00';
  var firstClose=document.getElementById('storeHour_1_close')?.value||'22:00';
  var firstClosed=document.getElementById('storeHour_1_closed')?.checked||false;
  DAYS_ORDER.forEach(function(d){
    var o=document.getElementById('storeHour_'+d+'_open');
    var c=document.getElementById('storeHour_'+d+'_close');
    var cl=document.getElementById('storeHour_'+d+'_closed');
    if(o)o.value=firstOpen;if(c)c.value=firstClose;
    if(cl){cl.checked=firstClosed;toggleDayClosed(d);}
  });
  showToast('✅ 月曜の設定を全日に適用しました');
}

async function saveStoreHours(storeUuid){
  var rows=DAYS_ORDER.map(function(d){
    return {
      store_id:storeUuid,
      day_of_week:d,
      open_time:document.getElementById('storeHour_'+d+'_open')?.value||'11:00',
      close_time:document.getElementById('storeHour_'+d+'_close')?.value||'22:00',
      is_closed:document.getElementById('storeHour_'+d+'_closed')?.checked||false
    };
  });
  try{
    var {error}=await sb.from('store_hours').upsert(rows,{onConflict:'store_id,day_of_week'});
    if(error)throw error;
    logAudit('update_store_hours','store_hours',storeUuid,{});
    showToast('✅ 営業時間を保存しました');
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 5: 施設タブ改善 — プルダウン選択肢追加**

Replace the store-facility tab HTML in renderStorePage:

```js
'<div class="tab-content" id="store-facility"><div class="card"><div class="card-title">施設・設備 <span class="ct-right"><button class="btn btn-primary btn-sm" onclick="saveStoreFacility(\''+s._uuid+'\',\''+s.id+'\')">保存</button></span></div><div class="form-grid"><div class="form-group"><label>座席数</label><input type="number" id="facilitySeats" value="'+(s.seats||6)+'" min="1" max="1000"></div><div class="form-group"><label>喫煙</label><select id="facilitySmoking"><option value="no_smoking"'+(s.smoking==='all_smoking'||s.smoking==='partial'?'':' selected')+'>全席禁煙</option><option value="all_smoking"'+(s.smoking==='all_smoking'?' selected':'')+'>全席喫煙</option><option value="partial"'+(s.smoking==='partial'?' selected':'')+'>一部喫煙可</option></select></div><div class="form-group"><label>子連れ</label><select id="facilityChildren"><option value="allowed"'+(s.children==='allowed'?' selected':'')+'>同伴可</option><option value="not_allowed"'+(!s.children||s.children==='not_allowed'?' selected':'')+'>同伴不可</option><option value="consultation"'+(s.children==='consultation'?' selected':'')+'>要相談</option></select></div><div class="form-group"><label>サービス料</label><div style="display:flex;gap:8px"><select id="facilityChargeType" style="width:80px"><option value="percent"'+(!s.serviceChargeType||s.serviceChargeType==='percent'?' selected':'')+'>%</option><option value="fixed"'+(s.serviceChargeType==='fixed'?' selected':'')+'>¥</option></select><input type="number" id="facilityChargeValue" value="'+(s.serviceChargeValue||10)+'" min="0" style="flex:1"></div></div></div></div><div class="card" style="margin-top:16px"><div class="card-title">テーブル管理 <span class="ct-right"><button class="btn btn-primary btn-sm" onclick="showAddTableModal(\''+s._uuid+'\')">＋ 追加</button></span></div><table class="data-table"><thead><tr><th>テーブル番号</th><th>テーブル名</th><th>席数</th><th>フロア</th><th>ステータス</th><th></th></tr></thead><tbody id="storeTablesBody"><tr><td colspan="6" style="text-align:center;color:#999;font-size:12px;padding:16px">読み込み中...</td></tr></tbody></table></div></div>'
```

- [ ] **Step 6: saveStoreFacility関数追加**

```js
async function saveStoreFacility(storeUuid,storeDisplayId){
  var seats=parseInt(document.getElementById('facilitySeats')?.value)||6;
  var smoking=document.getElementById('facilitySmoking')?.value||'no_smoking';
  var children=document.getElementById('facilityChildren')?.value||'not_allowed';
  var chargeType=document.getElementById('facilityChargeType')?.value||'percent';
  var chargeValue=parseFloat(document.getElementById('facilityChargeValue')?.value)||0;
  try{
    var {error}=await sb.from('stores').update({
      seats:seats,smoking_policy:smoking,children_policy:children,
      service_charge_type:chargeType,service_charge_value:chargeValue
    }).eq('id',storeUuid);
    if(error)throw error;
    var s=STORES.find(x=>x.id===storeDisplayId);
    if(s){s.seats=seats;s.smoking=smoking;s.children=children;s.serviceChargeType=chargeType;s.serviceChargeValue=chargeValue;}
    logAudit('update_store_facility','stores',storeUuid,{seats,smoking,children});
    showToast('✅ 施設情報を保存しました');
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 7: loadAllData内のSTORESマッピング拡張**

STORES mapping（loadAllData内）に施設データを追加:

```js
// Add to existing STORES mapping after existing fields:
seats:r.seats||6, smoking:r.smoking_policy||'no_smoking',
children:r.children_policy||'not_allowed',
serviceChargeType:r.service_charge_type||'percent',
serviceChargeValue:r.service_charge_value||10,
```

- [ ] **Step 8: Commit**

```bash
git add aiden-admin.html
git commit -m "feat: store detail - remove sales tab, DB-backed hours, improved facility"
```

---

### Task 4: ユーザー管理 — 会員/ゲストDB連携 + アカウント編集修正

**Files:**
- Modify: `aiden-admin.html:111-123` (hardcoded constants), `aiden-admin.html:659-686` (renderUsers)

- [ ] **Step 1: ハードコードデータを空配列に変更 + DB読み込み追加**

Replace hardcoded BANS, MEMBERS, GUESTS constants:

```js
// Line 111: Replace const BANS=[...] with:
let BANS=[];

// Line 122: Replace const MEMBERS=[...] with:
let MEMBERS_DATA=[];

// Line 123: Replace const GUESTS=[...] with:
let GUESTS_DATA=[];
```

Add loadUsersData function (called when user tab is shown):

```js
async function loadUsersData(){
  try{
    var [membersRes,guestsRes,bansRes]=await Promise.all([
      sb.from('members').select('id,display_id,full_name,email,phone,rank,points_balance,brand_id,created_at').order('created_at',{ascending:false}).limit(100),
      sb.from('orders').select('guest_email,guest_phone,order_type,created_at,store_id').not('guest_email','is',null).order('created_at',{ascending:false}).limit(200),
      sb.from('user_bans').select('*').order('created_at',{ascending:false})
    ]);
    // Members
    MEMBERS_DATA=(membersRes.data||[]).map(function(m){
      var brand=BRANDS.find(function(b){return b._uuid===m.brand_id;});
      return {id:m.display_id||m.id.substring(0,8),_uuid:m.id,name:m.full_name||'—',email:m.email||'',phone:m.phone||'',rank:m.rank||'レギュラー',points:m.points_balance||0,brandName:brand?brand.name:'—',joined:(m.created_at||'').split('T')[0]};
    });
    // Guests: aggregate by email
    var guestMap={};
    (guestsRes.data||[]).forEach(function(o){
      var key=o.guest_email;
      if(!guestMap[key])guestMap[key]={email:key,orderCount:0,lastOrder:'',brandNames:new Set()};
      guestMap[key].orderCount++;
      var d=(o.created_at||'').split('T')[0];
      if(d>guestMap[key].lastOrder)guestMap[key].lastOrder=d;
      var store=STORES.find(function(s){return s._uuid===o.store_id;});
      if(store){var br=getBrandForStore(store);if(br)guestMap[key].brandNames.add(br.name);}
    });
    GUESTS_DATA=Object.values(guestMap).map(function(g,i){
      return {id:'GST-'+String(i+1).padStart(5,'0'),orderCount:g.orderCount,lastOrder:g.lastOrder,brandName:Array.from(g.brandNames).join(', ')||'—'};
    });
    // Bans
    BANS=(bansRes.data||[]).map(function(b){
      return {_uuid:b.id,id:b.id.substring(0,12),email:b.target_email||'',ban_type:b.scope_type==='global'?'global':'store_specific',scope_type:b.scope_type,scope_id:b.scope_id,target_type:b.target_type,target_id:b.target_id,reason:b.reason||'',banned_services:b.banned_services||[],ban_effect:b.ban_type,banned_at:(b.created_at||'').split('T')[0],expires_at:b.expires_at,is_active:b.is_active!==false,unbanned_at:b.unbanned_at,unban_reason:b.unban_reason};
    });
  }catch(e){/* silently handle missing tables */}
}
```

- [ ] **Step 2: renderUsers更新 — DB連携+検索+ページネーション**

Replace `renderUsers` function completely:

```js
let userMemberPage=0;let userGuestPage=0;const USER_PAGE_SIZE=10;
let memberSort={col:'joined',asc:false};let guestSort={col:'lastOrder',asc:false};

function renderUsers(){
  return '<div class="page-title">ユーザー管理</div><div class="page-subtitle">アカウント・エンドユーザー・BAN管理</div>'+
  '<div class="tabs" id="userTabs"><div class="tab active" onclick="switchTab(\'user\',this,\'accounts\')">アカウント管理</div><div class="tab" onclick="switchTab(\'user\',this,\'members\')">会員一覧</div><div class="tab" onclick="switchTab(\'user\',this,\'guests\')">ゲスト注文者</div><div class="tab" onclick="switchTab(\'user\',this,\'ban\')">BAN管理</div></div>'+
  // accounts tab
  '<div class="tab-content active" id="user-accounts"><div class="card"><div class="card-title">アカウント一覧（Owner/Admin/Staff） <span class="ct-right"><button class="btn-outline btn-sm" onclick="downloadTemplate(\'account\')">📋 テンプレート</button><button class="btn-outline btn-sm" onclick="openBulkUpload(\'account\')">📥 一括登録</button><button class="btn btn-primary btn-sm" onclick="openAddAccountModal()">＋ 追加</button></span></div>'+
  '<input class="menu-search" placeholder="🔍 氏名・メール・IDで検索..." style="width:280px;margin-bottom:12px" oninput="filterAccountsList(this.value)">'+
  '<table class="data-table"><thead><tr><th>ID</th><th>氏名</th><th>メール</th><th>権限</th><th>法人</th><th>最終ログイン</th><th></th></tr></thead><tbody id="accountListBody">'+
  ACCOUNTS.map(a=>{const cp=CORPS.find(c=>c.id===a.corpId);return '<tr><td><code style="font-size:11px;background:#f5f6fa;padding:2px 6px;border-radius:4px">'+a.id+'</code></td><td style="font-weight:600">'+escHtml(a.name)+'</td><td>'+escHtml(a.email)+'</td><td>'+roleBadge(a.role)+'</td><td>'+escHtml(cp?cp.name:'')+'</td><td>'+a.lastLogin+'</td><td><button class="btn btn-secondary btn-sm" style="margin-right:4px" onclick="openEditAccountModal(\''+a.id+'\')">編集</button><button class="btn btn-secondary btn-sm" style="color:var(--danger)" onclick="deleteAccount(\''+a.id+'\')">削除</button></td></tr>';}).join('')+
  '</tbody></table></div>'+
  '<div class="card"><div class="card-title">🔐 権限マトリクス</div><div class="perm-grid"><div class="ph">機能</div><div class="ph" style="text-align:center">Owner</div><div class="ph" style="text-align:center">Admin</div><div class="ph" style="text-align:center">Staff</div><div class="pl">店舗閲覧</div><div class="pc">✅</div><div class="pc">✅</div><div class="pc">✅</div><div class="pl">店舗編集</div><div class="pc">✅</div><div class="pc">✅</div><div class="pc">❌</div><div class="pl">メニュー管理</div><div class="pc">✅</div><div class="pc">✅</div><div class="pc">✅</div><div class="pl">売上レポート</div><div class="pc">✅</div><div class="pc">✅</div><div class="pc">❌</div><div class="pl">個人情報閲覧</div><div class="pc">✅</div><div class="pc">⚠️</div><div class="pc">❌</div><div class="pl">アカウント管理</div><div class="pc">✅</div><div class="pc">❌</div><div class="pc">❌</div><div class="pl">請求・決済</div><div class="pc">✅</div><div class="pc">❌</div><div class="pc">❌</div></div></div></div>'+
  // members tab
  '<div class="tab-content" id="user-members"><div class="card"><div class="card-title">会員一覧 <span class="ct-right"><button class="btn-outline btn-sm" onclick="exportMembers()">📥 エクスポート</button><span style="font-size:11px;color:var(--text-light);margin-left:8px" id="memberCount"></span></span></div>'+
  '<input class="menu-search" placeholder="🔍 氏名・メール・IDで検索..." style="width:280px;margin-bottom:12px" id="memberSearchInput" oninput="renderMembersList()">'+
  '<div id="memberListContainer"></div></div>'+
  '<div class="card"><div class="card-title">📧 メール認証管理 <span class="ct-right"><button class="btn btn-primary btn-sm" id="bulkVerifyBtn" onclick="sendBulkVerificationEmails()">未認証会員に一括送信</button></span></div>'+
  '<p style="font-size:11px;color:var(--text-light);margin-bottom:12px">登録済みの未認証会員に認証メールを一括送信します。送信後30日間の猶予期間が設定されます。</p>'+
  '<div id="bulkVerifyStatus" style="font-size:12px;margin-bottom:8px"></div>'+
  '<div id="bulkVerifyResult" style="display:none;padding:12px;border-radius:8px;font-size:12px;margin-top:8px"></div>'+
  '</div></div>'+
  // guests tab
  '<div class="tab-content" id="user-guests"><div class="card"><div class="card-title">ゲスト注文者 <span class="ct-right"><button class="btn-outline btn-sm" onclick="exportGuests()">📥 エクスポート</button><span style="font-size:11px;color:var(--text-light);margin-left:8px" id="guestCount"></span></span></div>'+
  '<p style="font-size:11px;color:var(--text-light);margin-bottom:16px">※ ゲストの個人情報（名前・メール・電話番号）は表示しません。注文回数とタイムスタンプのみ。</p>'+
  '<div id="guestListContainer"></div></div></div>'+
  // ban tab
  '<div class="tab-content" id="user-ban">'+renderBanTab()+'</div>';
}
```

- [ ] **Step 3: 会員/ゲスト一覧レンダリング+ソート+ページネーション関数追加**

```js
function renderMembersList(){
  var q=(document.getElementById('memberSearchInput')?.value||'').toLowerCase();
  var data=MEMBERS_DATA;
  if(q)data=data.filter(function(m){return m.name.toLowerCase().includes(q)||m.email.toLowerCase().includes(q)||m.id.toLowerCase().includes(q);});
  // Sort
  data.sort(function(a,b){
    var va=a[memberSort.col]||'',vb=b[memberSort.col]||'';
    if(typeof va==='number')return memberSort.asc?va-vb:vb-va;
    return memberSort.asc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va));
  });
  var total=data.length;
  var start=userMemberPage*USER_PAGE_SIZE;
  var page=data.slice(start,start+USER_PAGE_SIZE);
  var countEl=document.getElementById('memberCount');
  if(countEl)countEl.textContent='合計 '+total+'人';
  var el=document.getElementById('memberListContainer');
  if(!el)return;
  el.innerHTML='<table class="data-table"><thead><tr>'+
    '<th style="cursor:pointer" onclick="sortMembers(\'id\')">ID</th>'+
    '<th style="cursor:pointer" onclick="sortMembers(\'name\')">氏名</th>'+
    '<th>メール</th><th>電話番号</th><th style="cursor:pointer" onclick="sortMembers(\'brandName\')">ブランド</th>'+
    '<th style="cursor:pointer" onclick="sortMembers(\'rank\')">ランク</th>'+
    '<th class="r" style="cursor:pointer" onclick="sortMembers(\'points\')">ポイント</th>'+
    '<th style="cursor:pointer" onclick="sortMembers(\'joined\')">登録日</th>'+
    '</tr></thead><tbody>'+
  page.map(function(m){
    return '<tr><td><code style="font-size:11px;background:#f5f6fa;padding:2px 6px;border-radius:4px">'+escHtml(m.id)+'</code></td><td style="font-weight:600">'+escHtml(m.name)+'</td><td>'+escHtml(m.email)+'</td><td>'+escHtml(m.phone)+'</td><td>'+escHtml(m.brandName)+'</td><td>'+rankBadge(m.rank)+'</td><td class="r fw-800">'+m.points.toLocaleString()+'</td><td>'+m.joined+'</td></tr>';
  }).join('')+
  '</tbody></table>'+paginationHtml(total,userMemberPage,'userMemberPage','renderMembersList');
}

function sortMembers(col){memberSort={col:col,asc:memberSort.col===col?!memberSort.asc:false};userMemberPage=0;renderMembersList();}

function renderGuestsList(){
  var data=GUESTS_DATA;
  var total=data.length;
  var start=userGuestPage*USER_PAGE_SIZE;
  var page=data.slice(start,start+USER_PAGE_SIZE);
  var countEl=document.getElementById('guestCount');
  if(countEl)countEl.textContent='合計 '+total+'件';
  var el=document.getElementById('guestListContainer');
  if(!el)return;
  el.innerHTML='<table class="data-table"><thead><tr><th>ゲストID</th><th class="r">注文回数</th><th>最終注文日</th><th>ブランド</th></tr></thead><tbody>'+
  page.map(function(g){
    return '<tr><td><code style="font-size:11px;background:#f5f6fa;padding:2px 6px;border-radius:4px">'+escHtml(g.id)+'</code></td><td class="r fw-800">'+g.orderCount+'</td><td>'+g.lastOrder+'</td><td>'+escHtml(g.brandName)+'</td></tr>';
  }).join('')+
  '</tbody></table>'+paginationHtml(total,userGuestPage,'userGuestPage','renderGuestsList');
}

function paginationHtml(total,page,pageVar,renderFn){
  var pages=Math.ceil(total/USER_PAGE_SIZE);
  if(pages<=1)return '';
  var h='<div style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:12px;font-size:12px">';
  h+='<button class="btn btn-secondary btn-sm" onclick="'+pageVar+'=Math.max(0,'+pageVar+'-1);'+renderFn+'()"'+(page===0?' disabled':'')+'>‹ 前</button>';
  h+='<span>'+(page+1)+' / '+pages+'</span>';
  h+='<button class="btn btn-secondary btn-sm" onclick="'+pageVar+'=Math.min('+(pages-1)+','+pageVar+'+1);'+renderFn+'()"'+(page>=pages-1?' disabled':'')+'>次 ›</button>';
  h+='</div>';
  return h;
}

function filterAccountsList(q){
  q=q.toLowerCase();
  var body=document.getElementById('accountListBody');
  if(!body)return;
  var filtered=q?ACCOUNTS.filter(function(a){return a.name.toLowerCase().includes(q)||a.email.toLowerCase().includes(q)||a.id.toLowerCase().includes(q);}):ACCOUNTS;
  body.innerHTML=filtered.map(function(a){
    var cp=CORPS.find(function(c){return c.id===a.corpId;});
    return '<tr><td><code style="font-size:11px;background:#f5f6fa;padding:2px 6px;border-radius:4px">'+a.id+'</code></td><td style="font-weight:600">'+escHtml(a.name)+'</td><td>'+escHtml(a.email)+'</td><td>'+roleBadge(a.role)+'</td><td>'+escHtml(cp?cp.name:'')+'</td><td>'+a.lastLogin+'</td><td><button class="btn btn-secondary btn-sm" style="margin-right:4px" onclick="openEditAccountModal(\''+a.id+'\')">編集</button><button class="btn btn-secondary btn-sm" style="color:var(--danger)" onclick="deleteAccount(\''+a.id+'\')">削除</button></td></tr>';
  }).join('');
}

function exportMembers(){
  var csv='\uFEFF'+'ID,氏名,メール,電話番号,ブランド,ランク,ポイント,登録日\n';
  MEMBERS_DATA.forEach(function(m){csv+=m.id+','+m.name+','+m.email+','+m.phone+','+m.brandName+','+m.rank+','+m.points+','+m.joined+'\n';});
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='members_export.csv';a.click();
  showToast('📥 会員データをエクスポートしました');
}

function exportGuests(){
  var csv='\uFEFF'+'ゲストID,注文回数,最終注文日,ブランド\n';
  GUESTS_DATA.forEach(function(g){csv+=g.id+','+g.orderCount+','+g.lastOrder+','+g.brandName+'\n';});
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='guests_export.csv';a.click();
  showToast('📥 ゲストデータをエクスポートしました');
}
```

- [ ] **Step 4: renderPage内でユーザー管理表示時にDB読み込み**

In `renderPage()`, after `else if(v.type==='users')`, update to load data:

```js
else if(v.type==='users'){el.innerHTML=renderUsers();checkUnverifiedCount();loadUsersData().then(function(){renderMembersList();renderGuestsList();});}
```

- [ ] **Step 5: Commit**

```bash
git add aiden-admin.html
git commit -m "feat: user management - DB-backed members/guests/bans, search, pagination, export"
```

---

### Task 5: BAN管理 — DB永続化 + scope拡張

**Files:**
- Modify: `aiden-admin.html:708-856` (BAN functions)

- [ ] **Step 1: saveBan関数をDB永続化に更新**

Replace saveBan function to write to user_bans table:

```js
async function saveBan(){
  var email=document.getElementById('banEmail').value.trim();
  var reasonDetail=document.getElementById('banReasonDetail').value.trim();
  if(!email||!email.includes('@')){showToast('⚠️ 有効なメールアドレスを入力してください');return;}
  if(!reasonDetail){showToast('⚠️ 理由の詳細は必須です');return;}

  var scopeType=document.getElementById('banType').value;
  var reasonCat=document.getElementById('banReasonCat').value;
  var reason=(BAN_REASON_CATS[reasonCat]||'その他')+'：'+reasonDetail;
  var expiryVal=document.getElementById('banExpiry').value;
  var expiresAt=null;
  if(expiryVal==='custom'){
    expiresAt=document.getElementById('banCustomDate').value;
    if(!expiresAt){showToast('⚠️ 期限日を選択してください');return;}
  }else if(expiryVal!=='permanent'){
    var d=new Date();d.setDate(d.getDate()+parseInt(expiryVal));
    expiresAt=d.toISOString().split('T')[0];
  }

  var banEffect='all_except_dinein'; // default
  var bannedServices=[];
  // For now, use all_except_dinein as default effect

  if(!confirm('BANを実行しますか？\nメール: '+email+'\n範囲: '+scopeType+'\n理由: '+reason)) return;

  var scopeId=null;
  if(scopeType==='store_specific'){
    var sel=document.getElementById('banStoreSelect');
    var selected=Array.from(sel.selectedOptions);
    if(!selected.length){showToast('⚠️ 対象店舗を選択してください');return;}
    // Insert one ban per store
    for(var i=0;i<selected.length;i++){
      var store=STORES.find(function(s){return s.id===selected[i].value;});
      try{
        var {error}=await sb.from('user_bans').insert({
          target_type:'guest',target_email:email,
          scope_type:'store',scope_id:store?store._uuid:null,
          ban_type:banEffect,banned_services:bannedServices,
          reason:reason,is_active:true,expires_at:expiresAt
        });
        if(error)throw error;
      }catch(e){showToast('⚠️ '+e.message);return;}
    }
  }else{
    // Global ban
    try{
      var {error}=await sb.from('user_bans').insert({
        target_type:'guest',target_email:email,
        scope_type:'global',scope_id:null,
        ban_type:banEffect,banned_services:bannedServices,
        reason:reason,is_active:true,expires_at:expiresAt
      });
      if(error)throw error;
    }catch(e){showToast('⚠️ '+e.message);return;}
  }
  logAudit('add_ban','user_bans',null,{email,scopeType,reason});
  closeModal();showToast('⛔ BANを追加しました');
  await loadUsersData();refreshBanTab();
}
```

- [ ] **Step 2: executeUnban関数をDB永続化に更新**

```js
async function executeUnban(banId){
  var reason=document.getElementById('unbanReason').value.trim();
  if(!reason){showToast('⚠️ 解除理由は必須です');return;}
  var b=BANS.find(function(x){return x.id===banId||x._uuid===banId;});
  if(!b)return;
  try{
    var {error}=await sb.from('user_bans').update({
      is_active:false,unbanned_at:new Date().toISOString().split('T')[0],unban_reason:reason
    }).eq('id',b._uuid||banId);
    if(error)throw error;
    logAudit('unban','user_bans',b._uuid||banId,{reason});
    closeModal();showToast('🔓 BANを解除しました');
    await loadUsersData();refreshBanTab();
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 3: renderBanTab更新 — scope_type表示対応**

Update `banTypeBadge` to support all scope types:

```js
function banTypeBadge(t){
  if(t==='global') return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:#d6303120;color:#d63031">グローバル</span>';
  if(t==='corporation') return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:#6c5ce720;color:#6c5ce7">法人</span>';
  if(t==='brand') return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:#e1705520;color:#e17055">ブランド</span>';
  return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:#0984e320;color:#0984e3">店舗</span>';
}
```

Update renderBanTab to use `b.scope_type` instead of `b.ban_type` for the type badge, and handle the new data structure from DB.

- [ ] **Step 4: Commit**

```bash
git add aiden-admin.html
git commit -m "feat: BAN management - DB persistence for add/unban with scope types"
```

---

### Task 6: MO画面BANチェック追加

**Files:**
- Modify: `aiden-order-checkout.html:1894` (placeOrder function)

- [ ] **Step 1: placeOrder関数にBANチェック追加**

In `aiden-order-checkout.html`, at the beginning of the `placeOrder()` function (after session validity check, around line 1902), add a BAN check:

```js
// BAN check — insert after session validation, before payment intent creation
var banEmail = document.getElementById('custEmail')?.value.trim();
var banPhone = document.getElementById('custPhone')?.value.trim();
var banMemberId = sessionStorage.getItem('aiden_member_id') || null;
if(banEmail || banPhone || banMemberId){
  try{
    var banQuery = sb.from('user_bans').select('id,scope_type,ban_type')
      .eq('is_active', true);
    // Build OR filter for target matching
    var orFilters = [];
    if(banEmail) orFilters.push('target_email.eq.'+banEmail);
    if(banPhone) orFilters.push('target_phone.eq.'+banPhone);
    if(banMemberId) orFilters.push('target_id.eq.'+banMemberId);
    banQuery = banQuery.or(orFilters.join(','));
    
    var {data:bans,error:banError} = await banQuery;
    if(!banError && bans && bans.length > 0){
      // Check if any ban applies to current store/brand/corp
      var storeId = CHECKOUT_DATA.storeId;
      var applicable = bans.filter(function(ban){
        if(ban.scope_type === 'global') return true;
        if(ban.scope_type === 'store' && ban.scope_id === storeId) return true;
        // For corp/brand scope, would need additional lookup — global and store are primary
        return false;
      });
      if(applicable.length > 0){
        showError('このサービスはご利用いただけません。お問い合わせください。');
        return;
      }
    }
  }catch(e){/* BAN check failure should not block order — log and continue */}
}
```

Note: The `showError` function should display the error prominently. If it doesn't exist, use an alert or create an error display div.

- [ ] **Step 2: Verify showError or equivalent exists**

Check if there's a `showError` function in the checkout page. If not, add one:

```js
function showBanError(msg){
  var el = document.getElementById('checkoutErrors') || document.createElement('div');
  el.id = 'checkoutErrors';
  el.style.cssText = 'background:#fce4ec;color:#c62828;padding:16px;border-radius:10px;margin-bottom:16px;font-size:14px;font-weight:600;text-align:center';
  el.textContent = msg;
  var form = document.querySelector('.checkout-form') || document.getElementById('content');
  if(form) form.prepend(el);
  window.scrollTo({top:0,behavior:'smooth'});
}
```

- [ ] **Step 3: Commit**

```bash
git add aiden-order-checkout.html
git commit -m "feat: add BAN check to checkout flow - block banned users from ordering"
```

---

### Task 7: 最終確認 + lint + push

- [ ] **Step 1: npm run lint**
- [ ] **Step 2: git pull --rebase origin main**
- [ ] **Step 3: git push origin main**
- [ ] **Step 4: vercel --prod**
- [ ] **Step 5: ブラウザ動作確認**

---

## 注意事項

- マイグレーション（Task 1）は手動実行が必要
- Geocoding: GOOGLE_GEOCODING_API_KEY未設定のため、住所→緯度経度の自動算出はNominatim（OpenStreetMap、無料）を使用
- 配達タブの高度な機能（geojsonインポート、距離別料金、Uber Direct連携）はPhase 4以降
- メディアタブのStorage連携はPhase 4以降
- 口コミタブのGoogle Reviews連携はPhase 4以降
- 機能タブの一括設定（ブランド/法人単位）はPhase 4以降
