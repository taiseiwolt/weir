# メニュー管理 検索ベースUI リファクタ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `aiden-admin.html` のメニュー管理セクションを、display_id検索起点の3ペインUIに全面刷新する。

**Architecture:** 検索バー + 条件付き3ペインレイアウト（左=ブランド情報/店舗一覧、中=パターン、右=商品）。既存のCRUDモーダル関数（openMenusAddPatternModal / _renderMenusProductModal 等）は流用し、UI層とデータ取得層のみを書き換える。店舗 → パターンの紐付けは新設された `venues.menu_pattern_id` カラムを使用する。

**Tech Stack:** Pure Vanilla JS + Supabase JS Client v2（CDN経由）/ HTMLインラインイベント / 既存ヘルパー `escHtml()`, `showToast()`, `openModal()`, `closeModal()`, `Y()`, `logAudit()`

**Files:**
- Modify: `aiden-admin.html` (lines 715-1222 周辺)
  - 715: menusState 宣言を拡張
  - 718-725: renderMenusPage を全面書き換え
  - 727-731: initMenusPage を縮小
  - 733-774: menusRenderBrandList / menusSelectBrand を削除し、新関数に置換
  - 776-796: menusRenderPatternList に「適用店舗N件」を追加
  - 798-828: menusSelectPattern の内部参照を新state名に変更
  - 879-1222: 既存のCRUD系モジュールの state参照を `selectedBrandUuid` → `brandId` に一括置換

**Database:**
- `venues.menu_pattern_id UUID NULL REFERENCES menu_patterns(id) ON DELETE SET NULL` はTaiseiが Supabase SQL Editor で既に追加済み（2026-04-11確認）
- マイグレーションファイル作成は不要

**事前調査で確認した事実:**
- `merchants.display_id` は `CRP-xxxxxxx` 形式のみ（`MRC-` は未使用だが、仕様に従い両方受け付ける）
- `brands.display_id` は `BRD-xxxxxxx`
- `venues.display_id` は `STR-xxxxxxx`（`VEN-` は未使用だが、仕様に従い両方受け付ける）
- `menu_patterns` テーブルは現在空（新規作成ボタンで追加が必要）
- ヘルパー関数名は `escHtml()`（CLAUDE.mdの `escH()` ではなく、このファイルのコードは `escHtml()` を使用）

---

## Task 1: menusState の拡張

**Files:**
- Modify: `aiden-admin.html:715`

- [ ] **Step 1: 既存の menusState 宣言を読む**

Run: `sed -n '715,716p' aiden-admin.html`
Expected: `var menusState={selectedBrandUuid:null,...};`

- [ ] **Step 2: 新state構造に置換**

```javascript
var menusState={brandId:null,brandDisplayId:null,brandName:null,venues:[],highlightVenueId:null,patterns:[],selectedPatternId:null,products:[],productSizesMap:{},categories:[]};
```

- [ ] **Step 3: 動作確認のためlintチェック**

Run: `npm run lint`
Expected: errors 0（この時点では他の参照がまだ古い名前を使っているためエラーは出ないはずだが、新しい未使用変数などがないか確認）

コミットは Task 11 の直後まで保留（途中の状態で壊れた commit を残したくないため、関連するリファクタを一塊でコミットする）。

---

## Task 2: renderMenusPage を全面書き換え

**Files:**
- Modify: `aiden-admin.html:718-725`

- [ ] **Step 1: 既存のrenderMenusPageを読む**

Run: `sed -n '718,725p' aiden-admin.html`
Expected: 既存の3カラムレイアウト（20%/25%/1fr）

- [ ] **Step 2: 検索バー + 非表示の3ペインに置換**

```javascript
function renderMenusPage(){
  return '<div class="page-title">メニュー管理</div>'+
    '<div class="page-subtitle">display_id（法人・ブランド・店舗）で検索してメニューを管理</div>'+
    '<div class="card" style="margin-bottom:12px">'+
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
        '<input type="text" id="menusSearchInput" placeholder="display_id を入力" style="flex:1;min-width:240px;padding:10px 12px;border:1px solid var(--border);border-radius:6px;font-family:monospace;font-size:13px" onkeydown="if(event.key===\'Enter\')menusSearch()">'+
        '<button class="btn btn-primary" onclick="menusSearch()">🔍 検索</button>'+
        '<button class="btn btn-secondary" onclick="menusReset()">リセット</button>'+
      '</div>'+
      '<div style="font-size:11px;color:var(--text-light);margin-top:8px">例: CRP-a1b2c3d（法人）/ BRD-a1b2c3d（ブランド）/ STR-a1b2c3d（店舗）</div>'+
    '</div>'+
    '<div id="menusResult" style="display:none"></div>';
}
```

**設計メモ**:
- 3ペイン本体は `menusResult` コンテナ内に検索成功後に描画する。検索前は `display:none`
- 検索バーの下の「例: ～」ヒントは依頼仕様どおり（実データ準拠で CRP- を先頭に記載）
- `menusResult` 内部の3ペインHTMLは Task 6 (menusLoadBrand) から動的に注入される

- [ ] **Step 3: Playwrightで画面を開いて旧UIが消え検索バーが出ることを確認**

この時点では検索ロジックが未実装なので検索ボタンを押してもエラーになる。ここではレイアウトだけ確認。

---

## Task 3: initMenusPage を縮小

**Files:**
- Modify: `aiden-admin.html:727-731`

- [ ] **Step 1: 既存initMenusPageを読む**

Run: `sed -n '727,731p' aiden-admin.html`

- [ ] **Step 2: BRANDS 全件プリロード処理を削除し、state初期化のみにする**

```javascript
function initMenusPage(){
  menusState={brandId:null,brandDisplayId:null,brandName:null,venues:[],highlightVenueId:null,patterns:[],selectedPatternId:null,products:[],productSizesMap:{},categories:[]};
  menusImageUploadState={file:null,currentUrl:null};
  var input=document.getElementById('menusSearchInput');
  if(input)setTimeout(function(){input.focus();},50);
}
```

**設計メモ**:
- `menusRenderBrandList()` の呼び出しは削除（Task 5 で関数自体も削除する）
- 初期フォーカスを検索ボックスに当てる（UX向上、依頼の「検索ベース」のUX）

---

## Task 4: menusReset 関数を新設

**Files:**
- Modify: `aiden-admin.html:732` 付近（initMenusPage の直後に挿入）

- [ ] **Step 1: menusReset を追加**

```javascript
function menusReset(){
  menusState={brandId:null,brandDisplayId:null,brandName:null,venues:[],highlightVenueId:null,patterns:[],selectedPatternId:null,products:[],productSizesMap:{},categories:[]};
  menusImageUploadState={file:null,currentUrl:null};
  var input=document.getElementById('menusSearchInput');
  if(input){input.value='';input.focus();}
  var result=document.getElementById('menusResult');
  if(result){result.style.display='none';result.innerHTML='';}
}
```

---

## Task 5: menusRenderBrandList と menusSelectBrand を削除

**Files:**
- Modify: `aiden-admin.html:733-774`

- [ ] **Step 1: 対象範囲を確認**

Run: `sed -n '733,774p' aiden-admin.html`
Expected: `function menusRenderBrandList()` と `async function menusSelectBrand()` の2関数

- [ ] **Step 2: 両関数を完全に削除**

これら2関数は以降は参照されない（Task 6 以降で新規に追加する `menusSearch` / `menusLoadBrand` が役割を引き継ぐ）。

---

## Task 6: menusSearch 関数を新設

**Files:**
- Modify: `aiden-admin.html` — Task 5 の削除後の位置に挿入

- [ ] **Step 1: menusSearch を追加**

```javascript
async function menusSearch(){
  var inputEl=document.getElementById('menusSearchInput');
  var raw=((inputEl&&inputEl.value)||'').trim();
  if(!raw){showToast('⚠️ display_idを入力してください');return;}
  var upper=raw.toUpperCase();
  var prefix=upper.split('-')[0];
  try{
    if(prefix==='MRC'||prefix==='CRP'){
      var mRes=await sb.from('merchants').select('id,display_id,name').eq('display_id',raw).maybeSingle();
      if(mRes.error)throw mRes.error;
      if(!mRes.data){showToast('⚠️ 該当する法人が見つかりません');return;}
      var bRes=await sb.from('brands').select('id,display_id,name,merchant_id').eq('merchant_id',mRes.data.id).order('name');
      if(bRes.error)throw bRes.error;
      var brands=bRes.data||[];
      if(brands.length===0){showToast('⚠️ この法人に紐づくブランドがありません');return;}
      if(brands.length===1){await menusLoadBrand(brands[0].id,brands[0].display_id,brands[0].name,null);return;}
      menusShowBrandSelect(mRes.data,brands);
      return;
    }
    if(prefix==='BRD'){
      var brRes=await sb.from('brands').select('id,display_id,name').eq('display_id',raw).maybeSingle();
      if(brRes.error)throw brRes.error;
      if(!brRes.data){showToast('⚠️ 該当するブランドが見つかりません');return;}
      await menusLoadBrand(brRes.data.id,brRes.data.display_id,brRes.data.name,null);
      return;
    }
    if(prefix==='STR'||prefix==='VEN'){
      var vRes=await sb.from('venues').select('id,display_id,name,brand_id').eq('display_id',raw).maybeSingle();
      if(vRes.error)throw vRes.error;
      if(!vRes.data){showToast('⚠️ 該当する店舗が見つかりません');return;}
      var brRes2=await sb.from('brands').select('id,display_id,name').eq('id',vRes.data.brand_id).maybeSingle();
      if(brRes2.error)throw brRes2.error;
      if(!brRes2.data){showToast('⚠️ 店舗のブランド情報が取得できません');return;}
      await menusLoadBrand(brRes2.data.id,brRes2.data.display_id,brRes2.data.name,vRes.data.id);
      return;
    }
    showToast('⚠️ 有効なdisplay_idを入力してください（CRP- / BRD- / STR-）');
  }catch(e){
    showToast('❌ 検索エラー: '+(e.message||e));
  }
}
```

**設計メモ**:
- `.maybeSingle()` を使うことで0件の場合にエラーを投げず data=null になる
- `MRC-` と `CRP-` 両方対応（CLAUDE.md の「merchantsテーブル」に統一された後の移行期）
- `STR-` と `VEN-` 両方対応（同上）
- 検索エラー時は toast で通知、3ペインは表示しない
- プレフィックスは `.split('-')[0]` で取り出す（`upper.startsWith('MRC-')` より短く書ける）

- [ ] **Step 2: menusShowBrandSelect を追加（複数ブランド選択UI）**

```javascript
function menusShowBrandSelect(merchant,brands){
  var html='<div class="card" style="margin-top:12px"><div class="card-title">'+escHtml(merchant.name||'')+' に紐づくブランドを選択</div>'+
    '<div style="display:flex;flex-direction:column;gap:8px">'+
    brands.map(function(b){
      return '<button class="btn-outline" style="text-align:left;padding:12px 14px" onclick="menusLoadBrand(\''+b.id+'\',\''+escHtml(b.display_id||'')+'\',\''+escHtml((b.name||'').replace(/\'/g,"\\'"))+'\',null)">'+
        '<div style="font-weight:700">'+escHtml(b.name||'')+'</div>'+
        '<div style="font-size:11px;color:var(--text-light);font-family:monospace">'+escHtml(b.display_id||'')+'</div>'+
      '</button>';
    }).join('')+
    '</div></div>';
  var result=document.getElementById('menusResult');
  if(result){result.style.display='';result.innerHTML=html;}
}
```

**設計メモ**:
- ボタンテキストは onclick inline で直接 `menusLoadBrand` を呼ぶ
- ブランド名のシングルクオート混入対策で `.replace(/\'/g,"\\'")` を入れる
- 2件以上のときのみこのUIが出る（1件のときは即 menusLoadBrand）

---

## Task 7: menusLoadBrand 関数を新設

**Files:**
- Modify: `aiden-admin.html` — Task 6 の直後に挿入

- [ ] **Step 1: menusLoadBrand を追加**

```javascript
async function menusLoadBrand(brandId,brandDisplayId,brandName,highlightVenueId){
  menusState.brandId=brandId;
  menusState.brandDisplayId=brandDisplayId;
  menusState.brandName=brandName;
  menusState.highlightVenueId=highlightVenueId||null;
  menusState.selectedPatternId=null;
  menusState.products=[];
  menusState.productSizesMap={};
  var result=document.getElementById('menusResult');
  if(result){
    result.style.display='';
    result.innerHTML='<div class="card"><div class="empty-state">読み込み中...</div></div>';
  }
  try{
    var [vRes,pRes,cRes]=await Promise.all([
      sb.from('venues').select('id,display_id,name,menu_pattern_id').eq('brand_id',brandId).order('name'),
      sb.from('menu_patterns').select('*').eq('brand_id',brandId).order('code'),
      sb.from('categories').select('*').eq('brand_id',brandId).order('sort_order').order('name')
    ]);
    if(vRes.error)throw vRes.error;
    if(pRes.error)throw pRes.error;
    if(cRes.error)throw cRes.error;
    menusState.venues=vRes.data||[];
    menusState.patterns=pRes.data||[];
    menusState.categories=cRes.data||[];
  }catch(e){
    showToast('❌ 読み込みエラー: '+(e.message||e));
    menusState.venues=[];
    menusState.patterns=[];
    menusState.categories=[];
  }
  menusRenderResultPanes();
}
```

**設計メモ**:
- 3つのクエリを `Promise.all` で並列発行（パフォーマンス）
- `venues.select('...,menu_pattern_id')` で現在の適用パターンIDを取得
- エラー時はtoastを出し、空配列にして継続（ペインは空表示）

- [ ] **Step 2: menusRenderResultPanes（3ペインのコンテナHTMLを生成して各ペインを描画）を追加**

```javascript
function menusRenderResultPanes(){
  var result=document.getElementById('menusResult');
  if(!result)return;
  result.style.display='';
  result.innerHTML=
    '<div style="display:grid;grid-template-columns:35% 30% 1fr;gap:16px;align-items:flex-start">'+
      '<div class="card" style="margin-bottom:0"><div id="menusLeftPane"></div></div>'+
      '<div class="card" style="margin-bottom:0"><div class="card-title">📋 メニューパターン <span class="ct-right"><button class="btn btn-primary btn-sm" onclick="openMenusAddPatternModal()">＋ 新規</button></span></div><div id="menusPatternList"></div></div>'+
      '<div class="card" style="margin-bottom:0"><div class="card-title" id="menusProductTitle">🍽️ 商品 <span class="ct-right"><button class="btn btn-primary btn-sm" id="menusBtnAddProduct" onclick="openMenusAddProductModal()" disabled>＋ 商品追加</button></span></div><div id="menusProductList"><div class="empty-state">パターンを選択してください</div></div></div>'+
    '</div>';
  menusRenderLeftPane();
  menusRenderPatternList();
  menusRenderProductList();
}
```

**設計メモ**:
- グリッド比率は 35% / 30% / 1fr（依頼仕様どおり）
- 左ペインはカード全体が内部HTMLで構成されるので card-title を中に入れず `menusLeftPane` div をカード直下に置く（スッキリ）
- 中ペイン / 右ペインは card-title を外に出して、右上に＋ボタンを配置
- `menusBtnAddProduct` は初期 disabled（パターン未選択時）

---

## Task 8: 左ペインの描画（menusRenderLeftPane）

**Files:**
- Modify: `aiden-admin.html` — Task 7 の直後に挿入

- [ ] **Step 1: menusRenderLeftPane を追加**

```javascript
function menusRenderLeftPane(){
  var el=document.getElementById('menusLeftPane');
  if(!el)return;
  var patternOptions='<option value="">(未設定)</option>'+
    menusState.patterns.map(function(p){
      return '<option value="'+escHtml(p.id)+'">'+escHtml(p.name||'')+'</option>';
    }).join('');
  var venuesHtml;
  if(!menusState.venues.length){
    venuesHtml='<div class="empty-state" style="padding:16px">紐づく店舗がありません</div>';
  }else{
    venuesHtml=menusState.venues.map(function(v){
      var isHighlight=menusState.highlightVenueId===v.id;
      var cardBg=isHighlight?'#f3efff':'#fff';
      var cardBorder=isHighlight?'var(--accent)':'var(--border)';
      var currentPattern=menusState.patterns.find(function(p){return p.id===v.menu_pattern_id;});
      var currentLabel=currentPattern?currentPattern.name:'(未設定)';
      var selectHtml='<select class="menus-venue-pattern" data-venue-id="'+escHtml(v.id)+'" onchange="menusChangeVenuePattern(\''+v.id+'\',this.value)" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;background:#fff">'+
        patternOptions.replace('value="'+escHtml(v.menu_pattern_id||'')+'"','value="'+escHtml(v.menu_pattern_id||'')+'" selected')+
      '</select>';
      return '<div style="padding:12px;border:1px solid '+cardBorder+';border-radius:6px;margin-bottom:8px;background:'+cardBg+'">'+
        '<div style="font-weight:700;font-size:13px;margin-bottom:2px">'+escHtml(v.name||'')+'</div>'+
        '<div style="font-size:10px;color:var(--text-light);font-family:monospace;margin-bottom:8px">'+escHtml(v.display_id||'')+'</div>'+
        '<div style="font-size:11px;color:var(--text-light);margin-bottom:4px">適用中: '+escHtml(currentLabel)+'</div>'+
        selectHtml+
      '</div>';
    }).join('');
  }
  el.innerHTML=
    '<div style="padding:4px 4px 12px 4px;border-bottom:1px solid var(--border);margin-bottom:12px">'+
      '<div style="font-weight:800;font-size:16px">'+escHtml(menusState.brandName||'')+'</div>'+
      '<div style="font-size:11px;color:var(--text-light);font-family:monospace;margin-top:2px">'+escHtml(menusState.brandDisplayId||'')+'</div>'+
    '</div>'+
    '<div class="card-title" style="padding:0 0 8px 0;margin-bottom:8px">🏪 紐づく店舗 ('+menusState.venues.length+')</div>'+
    venuesHtml;
}
```

**設計メモ**:
- ブランド名は大きめ（16pxでfont-weight 800）、display_idはモノスペース小文字グレー
- 各店舗カードに「適用中: パターン名」ラベル + `<select>` ドロップダウン
- `<select>` の selected 属性は、`patternOptions` の該当行に後から置換で付与する（最初に全 option を生成しておいて、該当の option に selected を挿し込む）
- ハイライト対象 venue は背景色 `#f3efff` + 紫ボーダー
- `data-venue-id` 属性は将来拡張用（現在は onchange で直接渡しているので必須ではないが、DOMツール等からのアクセス用に保持）

**エッジケース**:
- `menu_pattern_id` が NULL の venue は 「(未設定)」が selected になる
- `menu_pattern_id` に該当するパターンが（削除されて）見つからない場合は "(未設定)" 表示 + selectは空選択

- [ ] **Step 2: menusChangeVenuePattern を追加**

```javascript
async function menusChangeVenuePattern(venueId,patternId){
  var payload={menu_pattern_id:patternId||null};
  try{
    var r=await sb.from('venues').update(payload).eq('id',venueId).select('id,menu_pattern_id');
    if(r.error)throw r.error;
    if(!r.data||!r.data.length)throw new Error('更新権限がないか対象が見つかりません');
    logAudit('update_venue_menu_pattern','venues',venueId,{menu_pattern_id:patternId||null});
    var idx=menusState.venues.findIndex(function(v){return v.id===venueId;});
    if(idx>=0)menusState.venues[idx].menu_pattern_id=patternId||null;
    showToast('✅ 適用パターンを更新しました');
    menusRenderLeftPane();
    menusRenderPatternList();
  }catch(e){
    showToast('❌ 更新に失敗しました: '+(e.message||e));
    menusRenderLeftPane();
  }
}
```

**設計メモ**:
- 空文字列 `''` は NULL として扱う（未設定に戻すケース）
- DB更新成功後、ローカルstate を更新してから左ペインと中ペイン両方を再描画（中ペインに「適用店舗N件」があるため）
- 失敗時は左ペインを再描画してドロップダウンを元に戻す
- `logAudit` は既存の監査ログ機構を流用

---

## Task 9: 中ペイン（menusRenderPatternList）に「適用店舗N件」を追加

**Files:**
- Modify: `aiden-admin.html:776-796`

- [ ] **Step 1: 既存の menusRenderPatternList を読む**

Run: `sed -n '776,796p' aiden-admin.html`

- [ ] **Step 2: 適用店舗カウント付きで書き換え**

```javascript
function menusRenderPatternList(){
  var el=document.getElementById('menusPatternList');
  if(!el)return;
  if(!menusState.brandId){el.innerHTML='<div class="empty-state">ブランドを検索してください</div>';return;}
  if(!menusState.patterns.length){el.innerHTML='<div class="empty-state">パターンがありません<br><span style="font-size:11px">右上の「＋新規」から追加</span></div>';return;}
  el.innerHTML=menusState.patterns.map(function(p){
    var isActive=menusState.selectedPatternId===p.id;
    var bg=isActive?'#f3efff':'#fff';
    var border=isActive?'var(--accent)':'var(--border)';
    var dimmed=p.is_active===false?'opacity:0.55;':'';
    var inactiveTag=p.is_active===false?' <span style="font-size:9px;background:#dfe6e9;color:#636e72;padding:1px 6px;border-radius:4px">無効</span>':'';
    var applyCount=menusState.venues.filter(function(v){return v.menu_pattern_id===p.id;}).length;
    return '<div style="padding:10px 12px;border:1px solid '+border+';border-radius:6px;margin-bottom:6px;background:'+bg+';'+dimmed+'display:flex;align-items:center;gap:8px">'+
      '<div style="flex:1;min-width:0;cursor:pointer" onclick="menusSelectPattern(\''+p.id+'\')">'+
        '<div style="font-weight:700;font-size:12px">'+escHtml(p.name||'')+inactiveTag+'</div>'+
        '<div style="font-size:10px;color:var(--text-light);font-family:monospace;margin-top:2px">'+escHtml(p.code||'')+'</div>'+
        '<div style="font-size:10px;color:var(--accent);margin-top:4px;font-weight:600">🏪 適用店舗: '+applyCount+'件</div>'+
      '</div>'+
      '<button class="btn-outline btn-sm" title="編集" onclick="openMenusEditPatternModal(\''+p.id+'\')">✏️</button>'+
      '<button class="btn-outline btn-sm" title="削除" onclick="deleteMenusPattern(\''+p.id+'\')">🗑️</button>'+
    '</div>';
  }).join('');
}
```

**差分ポイント**:
- `menusState.selectedBrandUuid` → `menusState.brandId`
- `applyCount` を新規追加（`menusState.venues` から `menu_pattern_id` が一致するものをカウント）
- "🏪 適用店舗: N件" ラベルを追加（accent色）

---

## Task 10: 既存CRUDの `selectedBrandUuid` → `brandId` 参照更新

**Files:**
- Modify: `aiden-admin.html` 全体（`selectedBrandUuid` / `selectedBrandDisplayId` の参照全て）

- [ ] **Step 1: 対象を洗い出す**

Run: `grep -n "selectedBrandUuid\|selectedBrandDisplayId" aiden-admin.html`
Expected: 約12〜15箇所

以下の関数で参照されている想定:
- `menusSelectPattern` (line 798-828)
- `openMenusAddPatternModal` (line 879)
- `saveMenusNewPattern` (line 905, 910, 912, 915)
- `menusSaveProduct` (line 1137, 1166, 1170, 1175)

- [ ] **Step 2: 全置換（Edit tool の replace_all）**

`menusState.selectedBrandUuid` → `menusState.brandId`
`menusState.selectedBrandDisplayId` → `menusState.brandDisplayId`

**注意**: 他の `selectedBrandUuid` が他のセクションで使われていないか事前に確認。メニュー管理以外で同名キーを使っている箇所がないことをgrepで確認済み（Task 10 Step 1 のgrepで全件表示される想定、menusState 以外の出現がないこと）。

---

## Task 11: 右ペインの動作確認とガード条件の更新

**Files:**
- Modify: `aiden-admin.html:798-828` (menusSelectPattern)

- [ ] **Step 1: menusSelectPattern のガードを確認**

`menusState.selectedBrandUuid` が変数名変更で `brandId` に置換されたか確認。

- [ ] **Step 2: 既存の menusRenderProductList の参照確認**

Run: `sed -n '830,876p' aiden-admin.html`
Expected: `menusState.selectedPatternId`, `menusState.products`, `menusState.productSizesMap`, `menusState.categories` を使用。ここは state 名変更の影響を受けない（新stateでも同じキー名）。

右ペインは **無変更** で動作する想定。

---

## Task 12: 手動ブラウザQA（ローカル + 本番）

**Files:**
- 実行ブラウザでのみ

- [ ] **Step 1: lint を実行**

Run: `npm run lint`
Expected: エラー 0件

- [ ] **Step 2: ローカル確認（Playwright）**

```
# ブラウザで http://localhost:PORT/aiden-admin.html を開く
# サイドバーから「メニュー管理」クリック
```

チェック項目:
- [ ] 検索バーが表示され、3ペインは非表示
- [ ] CRP- の display_id を入力 → 複数ブランドの場合は選択UIが出る
- [ ] BRD- の display_id を入力 → 左ペインにブランド名と店舗が表示される
- [ ] STR- の display_id を入力 → 該当店舗がハイライト表示
- [ ] 店舗の pattern ドロップダウンを変更すると toast「✅ 適用パターンを更新しました」
- [ ] 中ペインのパターンカードに「適用店舗 N件」が更新される
- [ ] ＋新規からパターン追加が動作（既存モーダル流用）
- [ ] パターンをクリックすると右ペインに商品が表示（menu_patterns テーブルが空の場合は「商品がありません」）
- [ ] リセットで検索前の状態に戻る
- [ ] 他セクション（ダッシュボード、注文等）の表示が崩れていない

- [ ] **Step 3: `git status` と `git diff` で変更確認**

Run: `git status && git diff aiden-admin.html | head -100`

- [ ] **Step 4: git add → commit**

```bash
git add aiden-admin.html docs/superpowers/plans/2026-04-11-menu-management-search-ui.md
git commit -m "$(cat <<'EOF'
feat(admin): rebuild menu management with display_id search UI

- Replace all-brands list with search-first 3-pane layout
- Support CRP-/BRD-/STR-/VEN- display_id prefix detection
- Add venues.menu_pattern_id dropdown on left pane (per-venue pattern assignment)
- Show "applied venues count" badge on pattern cards
- Reuse existing modal functions for pattern/product CRUD
- Rename menusState.selectedBrandUuid -> brandId for clarity
EOF
)"
```

- [ ] **Step 5: git pull --rebase origin main → git push**

```bash
git pull --rebase origin main
git push origin main
```

- [ ] **Step 6: vercel --prod でデプロイ**

```bash
vercel --prod
```

- [ ] **Step 7: 本番URL（https://weir.co.jp/aiden-admin.html）でスモークテスト**

上記 Step 2 のチェック項目を本番で再実行。

---

## Self-Review

1. **Spec coverage**:
   - [x] 検索ボックス + ヒント + リセットボタン → Task 2
   - [x] MRC-/CRP-/BRD-/STR-/VEN- のプレフィックス検知 → Task 6
   - [x] 複数ブランド選択UI → Task 6 Step 2 (menusShowBrandSelect)
   - [x] 3ペインレイアウト（35%/30%/1fr）→ Task 7 Step 2
   - [x] 左ペイン: ブランド情報 + 店舗一覧 + pattern ドロップダウン → Task 8
   - [x] 中ペイン: パターンカード + 適用店舗N件 + 既存モーダル流用 → Task 9
   - [x] 右ペイン: 既存の商品表示ロジック流用 → Task 11
   - [x] menusState 拡張 → Task 1
   - [x] 既存 menusRenderBrandList / menusSelectBrand 削除 → Task 5
   - [x] initMenusPage の BRANDS プリロード削除 → Task 3
   - [x] ハードコードデータなし（すべて DB から取得）→ すべてのタスクが Supabase client 経由

2. **Placeholder scan**: 完了。TBD / TODO / 省略表現なし。

3. **Type consistency**:
   - `menusState.brandId` は全 Task で統一
   - `menusState.brandDisplayId` は Task 1, 7, 8 で統一
   - `menusState.brandName` は Task 1, 7, 8 で統一
   - `menusState.highlightVenueId` は Task 1, 7, 8 で統一
   - `menusLoadBrand(brandId, brandDisplayId, brandName, highlightVenueId)` のシグネチャは Task 6 で呼び出し、Task 7 で定義、両者一致

---

## 依存関係

- Task 1 は Task 2-11 のすべての前提
- Task 6 は Task 7 に依存（menusSearch が menusLoadBrand を呼ぶ）
- Task 7 は Task 8 / 9 / 11 に依存（menusRenderResultPanes が 3 ペインを描画）
- Task 10 は Task 9 と同時または後（リネーム後に参照を直す）
- Task 12 は Task 1-11 完了後のみ

## 実装順序

推奨: Task 1 → 2 → 3 → 4 → 5 → 9（中ペインのstate名変更を先に）→ 10 → 6 → 7 → 8 → 11 → 12

中ペインの書き換え（Task 9）を先にやって `brandId` リネームを進めてから、Task 10 で残りを全置換 → Task 6-8 で新機能を追加する流れの方が、途中段階で動作確認しやすい。

ただし単一ファイル内の連続編集なので、**実際は Task 1 → 5 → 3 → 2 → 10 → 9 → 4 → 6 → 7 → 8 → 11 → 12** の順で、破壊的変更を先に終わらせて新機能を後から積む方がコンフリクトが少ない。
