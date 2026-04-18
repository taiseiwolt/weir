# 来店予約モーダル共通化 + 17:30 ハードコード全消し 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4ファイル（brand.html / weir-brand-menu.html / weir-brand-stores.html / weir-membership.html）に重複/欠落している来店予約モーダルを `weir-common.js` に集約し、ヘッダーボタンが全ブランドページから動作するようにする。同時に 17:30「満席🔔」ハードコードを全消し（D-83 違反解消）。

**Architecture:** weir-common.js に「モーダル CSS / DOM / JS（venues 遅延ロード含む）」を集約し、`AidenCommon.init({header:'brand'})` 実行時に自動 inject する。3ブランドページからモーダル DOM・JS・CSS を削除。weir-store.html は座席モーダル（別系統）なので 17:30 hardcode のみ修正。create-reservation Edge Function（既存）にPOSTする real 実装を採用（weir-brand-stores.html の rmSubmit が source of truth）。

**Tech Stack:** Vanilla JS, Supabase JS Client v2 (CDN), HTML/CSS, Playwright (verification)

---

## 重要な発見（事前調査の結果）

1. **brand.html:889 は既に修正済み** — commit 082fc2f で `slot-full` + `rmOpenVacancy('17:30')` から通常の `rmSelSlot(this,'17:30')` に置換済み。今回は触らない（モーダル削除で結果的に消える）。

2. **rmSubmit() の正は weir-brand-stores.html** — brand.html / weir-brand-menu.html の rmSubmit は `RES-' + Date.now().toString().slice(-6)` を生成するだけのスタブ。weir-brand-stores.html だけ `/functions/v1/create-reservation` Edge Function に実 POST する。共通化では **weir-brand-stores.html の rmSubmit を採用**。

3. **weir-membership.html は weir-common.js を既に読み込み済み** — line 20。タスク4は確認のみで足りる。weir-common.js 側で modal を auto-inject するようにすれば自動動作する。

4. **weir-store.html は座席モーダル（別系統）** — `openVacancyFromSlot('17:30')` + `selSlot` / `selSeatSlot`（class `.slot-b`）で `.rm-slot-b` ファミリとは無関係。共通化対象外、17:30 hardcode のみ削除。

5. **STORES 読み込みパターンが3ファイルでバラバラ**:
   - brand.html: `onBrandLoaded` 内で venues SELECT → rm-store dropdown に input
   - weir-brand-menu.html: `loadReservationStores()` で venues SELECT
   - weir-brand-stores.html: STORES グローバル配列（既に読み済）+ `initResStoreOptions()`
   → **共通モーダル側で「初回 open 時に lazy-load + キャッシュ」する設計に統一**。各ページから rm-store 関連の loader 削除。

6. **rmOpenVacancy() は機能未実装（alert のみ）** — 17:30 hardcode 消失で呼び出されなくなり死コード化。今回は残す（別案件で削除/実装判断）。

---

## File Structure

| ファイル | 変更内容 | 概算 diff |
|---|---|---|
| `weir-common.js` | モーダル CSS injector / DOM injector / JS 関数群追加 (300行程度) | +300/-0 |
| `brand.html` | モーダル CSS / HTML / JS 削除、venues→rm-store loader 削除 | +2/-280 |
| `weir-brand-menu.html` | モーダル CSS / HTML / JS 削除、loadReservationStores() 削除 | +0/-280 |
| `weir-brand-stores.html` | モーダル CSS / HTML / JS 削除、initResStoreOptions() 削除 | +0/-300 |
| `weir-store.html` | 17:30「満席🔔」ハードコード 2箇所を通常スロットに置換 | +2/-2 |
| `weir-membership.html` | 確認のみ（weir-common.js は既に読み込み済） | +0/-0 |

---

## Task 1: weir-common.js にモーダル CSS / DOM / JS を追加

**Files:**
- Modify: `weir-common.js`（末尾の `window.AidenCommon = {...}` 直前に追加）

### Step 1.1: 既存 brand.html の `.rm-slot-b` フォントを `var(--brand-font)` に統一する旨を確認

参考: brand.html:203 は `font-family:var(--brand-font)`、weir-brand-menu.html:128 も `var(--brand-font)`、weir-brand-stores.html:137 は `font-family:inherit`。共通版は **`var(--brand-font)`** に統一（ブランドフォント反映）。

- [ ] **Step 1.1: 確認のみ（コード変更なし）**

### Step 1.2: weir-common.js に CSS 文字列定数を追加

`weir-common.js` の `function showNotFound()` 定義の **後**（478行目以降）、`function renderFooter` の前に以下を挿入:

- [ ] **Step 1.2: CSS injector を追加**

```javascript
  /* =============================================================
     17b. RESERVATION_MODAL_CSS — 来店予約モーダル CSS
     ============================================================= */
  var RESERVATION_MODAL_CSS = ''
    + '.res-modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;align-items:center;justify-content:center}'
    + '.res-modal-bg.open{display:flex}'
    + '.res-modal{background:white;border-radius:12px;width:92%;max-width:560px;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25)}'
    + '.res-modal-header{padding:18px 22px;border-bottom:1px solid #e8e8e8;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:white;border-radius:12px 12px 0 0;z-index:1}'
    + '.res-modal-title{font-size:16px;font-weight:700}'
    + '.res-modal-close{background:none;border:none;font-size:22px;color:#999;line-height:1;padding:4px;cursor:pointer}'
    + '.res-modal-body{padding:22px}'
    + '.rm-steps{display:flex;margin-bottom:24px}'
    + '.rm-step{flex:1;text-align:center;position:relative}'
    + '.rm-step::after{content:"";position:absolute;top:13px;left:50%;right:-50%;height:1px;background:#e8e8e8}'
    + '.rm-step:last-child::after{display:none}'
    + '.rm-step-dot{width:26px;height:26px;border-radius:50%;background:#f5f5f5;border:1px solid #ddd;color:#999;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 4px;position:relative;z-index:1;transition:all .2s}'
    + '.rm-step.active .rm-step-dot{background:#1a1a1a;border-color:#1a1a1a;color:white}'
    + '.rm-step.done .rm-step-dot{background:#27ae60;border-color:#27ae60;color:white}'
    + '.rm-step-label{font-size:10px;color:#999}'
    + '.rm-step.active .rm-step-label{color:#1a1a1a;font-weight:600}'
    + '.rf-field{margin-bottom:16px}'
    + '.rf-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}'
    + '.rf-label{font-size:11px;font-weight:700;color:#666;margin-bottom:5px;display:flex;align-items:center;gap:4px}'
    + '.rf-req{color:var(--brand-primary)}'
    + '.rf-input{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-family:var(--brand-font);font-size:14px;color:#1a1a1a;outline:none;transition:border-color .15s;background:white}'
    + '.rf-input:focus{border-color:#888}'
    + '.rf-input.error{border-color:var(--brand-primary);background:#FFF8F8}'
    + '.rf-error{font-size:11px;color:var(--brand-primary);margin-top:4px;display:none}'
    + '.rf-error.show{display:block}'
    + '.rm-slot-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}'
    + '.rm-slot-title{font-size:12px;font-weight:700;color:#666}'
    + '.rm-slot-note{font-size:11px;color:#999}'
    + '.rm-slot-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:16px}'
    + '.rm-slot-b{padding:9px 4px;text-align:center;border:1px solid #e0e0e0;border-radius:5px;font-size:12px;cursor:pointer;transition:all .12s;background:white;width:100%;font-family:var(--brand-font)}'
    + '.rm-slot-b:hover{border-color:#333}'
    + '.rm-slot-b.on{background:#1a1a1a;color:white;border-color:#1a1a1a}'
    + '.rm-slot-b.slot-full{background:#f5f5f5;color:#bbb;cursor:default}'
    + '.rm-slot-b.slot-full:hover{border-color:var(--brand-primary);background:#fff5f5}'
    + '.rm-cap-alert{padding:10px 14px;border-radius:5px;margin-bottom:14px;font-size:13px;display:none}'
    + '.rm-cap-alert.ok{background:#f0faf5;border:1px solid rgba(39,174,96,.3);color:#27ae60;display:block}'
    + '.rm-cap-alert.err{background:#fff5f5;border:1px solid rgba(211,47,47,.25);color:var(--brand-primary);display:block}'
    + '.rm-btn{width:100%;padding:13px;border:none;border-radius:6px;font-size:14px;font-weight:700;background:var(--brand-primary);color:white;cursor:pointer;font-family:var(--brand-font);transition:opacity .15s}'
    + '.rm-btn:hover{opacity:.88}'
    + '.rm-btn:disabled{opacity:.35;cursor:not-allowed}'
    + '.rm-btn-back{width:100%;padding:12px;border:1px solid #ddd;border-radius:6px;font-size:14px;background:none;color:#666;cursor:pointer;font-family:var(--brand-font)}'
    + '.rm-confirm-box{background:#f8f8f8;border-radius:8px;padding:16px;margin-bottom:16px}'
    + '.rm-confirm-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #eee;font-size:13px}'
    + '.rm-confirm-row:last-child{border-bottom:none}'
    + '.rm-confirm-label{color:#666}'
    + '.rm-complete-box{text-align:center;padding:28px 10px}'
    + '.rm-store-preset{padding:10px 12px;border:1px solid #ddd;border-radius:6px;background:#f8f8f8;font-size:14px;color:#333;font-weight:600}'
    + '@media(max-width:480px){.rf-row{grid-template-columns:1fr}.rm-slot-grid{grid-template-columns:repeat(3,1fr)}}';

  function injectReservationModalCSS() {
    if (document.getElementById('weir-res-modal-css')) return;
    var s = document.createElement('style');
    s.id = 'weir-res-modal-css';
    s.textContent = RESERVATION_MODAL_CSS;
    document.head.appendChild(s);
  }
```

**注意点**: `.rf-row`/`.rf-field`/`.rf-label`/`.rf-req`/`.rf-input`/`.rf-error` クラスは既存ファイルでは別途定義されていた可能性がある。念のため共通モーダル用にも含める（既存ページの同名クラスと干渉する場合は名前を `.rm-rf-*` にリネームする選択肢もあるが、今回は同じクラス名で共通化）。

### Step 1.3: weir-common.js にモーダル DOM injector を追加

Step 1.2 の `injectReservationModalCSS` 関数定義の **直後** に以下を挿入:

- [ ] **Step 1.3: モーダル DOM injector を追加**

```javascript
  /* =============================================================
     17c. injectReservationModalDOM — モーダル本体を body に append
     ============================================================= */
  var RESERVATION_MODAL_HTML = ''
    + '<div class="res-modal-bg" id="res-modal-bg">'
    +   '<div class="res-modal">'
    +     '<div class="res-modal-header">'
    +       '<div class="res-modal-title">ご予約</div>'
    +       '<button class="res-modal-close" onclick="closeResModal()">×</button>'
    +     '</div>'
    +     '<div class="res-modal-body">'
    +       '<div class="rm-steps">'
    +         '<div class="rm-step active" id="rms1"><div class="rm-step-dot">1</div><div class="rm-step-label">日時・人数</div></div>'
    +         '<div class="rm-step" id="rms2"><div class="rm-step-dot">2</div><div class="rm-step-label">お客様情報</div></div>'
    +         '<div class="rm-step" id="rms3"><div class="rm-step-dot">3</div><div class="rm-step-label">確認</div></div>'
    +       '</div>'
    +       '<div id="rmstep-1">'
    +         '<div class="rf-field" id="rm-store-field">'
    +           '<div class="rf-label">予約店舗 <span class="rf-req">*</span></div>'
    +           '<select id="rm-store" class="rf-input" onchange="rmOnStoreChange()">'
    +             '<option value="">店舗を選択してください</option>'
    +           '</select>'
    +           '<div class="rf-error" id="err-rm-store">店舗を選択してください</div>'
    +         '</div>'
    +         '<div class="rf-field" id="rm-store-preset-field" style="display:none">'
    +           '<div class="rf-label">予約店舗</div>'
    +           '<div class="rm-store-preset" id="rm-store-preset-text"></div>'
    +         '</div>'
    +         '<div class="rf-row" style="margin-bottom:16px">'
    +           '<div class="rf-field" style="margin-bottom:0">'
    +             '<div class="rf-label">日付 <span class="rf-req">*</span></div>'
    +             '<input type="date" id="rm-date" class="rf-input">'
    +           '</div>'
    +           '<div class="rf-field" style="margin-bottom:0">'
    +             '<div class="rf-label">人数 <span class="rf-req">*</span></div>'
    +             '<select id="rm-guests" class="rf-input" onchange="rmCheckCap()">'
    +               '<option value="1">1名</option><option value="2">2名</option>'
    +               '<option value="3" selected>3名</option><option value="4">4名</option>'
    +               '<option value="5">5名</option><option value="6">6名</option><option value="8">8名</option>'
    +             '</select>'
    +           '</div>'
    +         '</div>'
    +         '<div class="rm-slot-header">'
    +           '<div class="rm-slot-title">時間を選択</div>'
    +           '<div class="rm-slot-note">🔔 から空席通知が可能</div>'
    +         '</div>'
    +         '<div class="rm-slot-grid">'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'17:00\')">17:00</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'17:15\')">17:15</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'17:30\')">17:30</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'17:45\')">17:45</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'18:00\')">18:00</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'18:15\')">18:15</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'18:30\')">18:30</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'18:45\')">18:45</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'19:00\')">19:00</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'19:30\')">19:30</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'20:00\')">20:00</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'20:30\')">20:30</button>'
    +         '</div>'
    +         '<div class="rm-cap-alert" id="rm-cap-alert"></div>'
    +         '<button id="rm-step1-btn" class="rm-btn" onclick="rmGoStep(2)" disabled style="opacity:.35">次へ：お客様情報を入力</button>'
    +       '</div>'
    +       '<div id="rmstep-2" style="display:none">'
    +         '<div class="rf-row">'
    +           '<div class="rf-field">'
    +             '<div class="rf-label">お名前 <span class="rf-req">*</span></div>'
    +             '<input id="rm-name" type="text" placeholder="山田 花子" class="rf-input" oninput="rmClearErr(\'rm-name\')">'
    +             '<div class="rf-error" id="err-rm-name"></div>'
    +           '</div>'
    +           '<div class="rf-field">'
    +             '<div class="rf-label">電話番号 <span class="rf-req">*</span></div>'
    +             '<input id="rm-phone" type="tel" placeholder="09012345678" class="rf-input" oninput="rmClearErr(\'rm-phone\')">'
    +             '<div class="rf-error" id="err-rm-phone"></div>'
    +           '</div>'
    +         '</div>'
    +         '<div class="rf-field">'
    +           '<div class="rf-label">メールアドレス <span class="rf-req">*</span></div>'
    +           '<input id="rm-email" type="email" placeholder="example@email.com" class="rf-input" oninput="rmClearErr(\'rm-email\')">'
    +           '<div class="rf-error" id="err-rm-email"></div>'
    +         '</div>'
    +         '<div class="rf-field">'
    +           '<div class="rf-label">ご要望・アレルギー</div>'
    +           '<textarea id="rm-notes" rows="3" placeholder="アレルギー情報、記念日の演出ご希望などご自由にお書きください。" class="rf-input" style="resize:vertical"></textarea>'
    +         '</div>'
    +         '<div style="display:flex;gap:10px">'
    +           '<button class="rm-btn-back" onclick="rmGoStep(1)" style="flex:1">← 戻る</button>'
    +           '<button class="rm-btn" onclick="rmValidateStep2()" style="flex:2">確認へ進む</button>'
    +         '</div>'
    +       '</div>'
    +       '<div id="rmstep-3" style="display:none">'
    +         '<div class="rm-confirm-box" id="rm-confirm-box"></div>'
    +         '<div style="font-size:12px;color:#666;margin-bottom:14px;line-height:1.9">上記内容でご予約を確定します。確定後、ご登録のメールアドレス宛に確認メールをお送りします。</div>'
    +         '<div style="display:flex;gap:10px">'
    +           '<button class="rm-btn-back" onclick="rmGoStep(2)" style="flex:1">← 戻る</button>'
    +           '<button class="rm-btn" onclick="rmSubmit()" style="flex:2">予約を確定する</button>'
    +         '</div>'
    +       '</div>'
    +       '<div id="rmstep-complete" style="display:none">'
    +         '<div class="rm-complete-box">'
    +           '<div style="font-size:52px;margin-bottom:14px">✅</div>'
    +           '<div id="rm-res-id" style="font-size:22px;font-weight:700;margin-bottom:10px;color:var(--brand-primary)">RES-000000</div>'
    +           '<div style="font-size:13px;color:#666;line-height:1.9">ご予約ありがとうございます。<br>確認メールをお送りしました。</div>'
    +           '<button class="rm-btn" onclick="closeResModal()" style="margin-top:22px;max-width:200px">閉じる</button>'
    +         '</div>'
    +       '</div>'
    +     '</div>'
    +   '</div>'
    + '</div>';

  function injectReservationModalDOM() {
    if (document.getElementById('res-modal-bg')) return; // 既に存在
    var wrap = document.createElement('div');
    wrap.innerHTML = RESERVATION_MODAL_HTML;
    document.body.appendChild(wrap.firstChild);

    // 背景クリックで閉じる
    document.getElementById('res-modal-bg').addEventListener('click', function(e){
      if (e.target === this) closeResModal();
    });
  }
```

### Step 1.4: weir-common.js にモーダル JS 関数群を追加

Step 1.3 の `injectReservationModalDOM` 関数定義の **直後** に以下を挿入:

- [ ] **Step 1.4: モーダル動作 JS を追加**

```javascript
  /* =============================================================
     17d. 来店予約モーダル — JS 関数群
          source of truth: weir-brand-stores.html の rmSubmit (real impl)
     ============================================================= */
  var rmSelTime = null;
  var rmPresetStore = null;
  var rmStoresLoaded = false;

  // 初回 open 時に venues を lazy-load してキャッシュ
  async function loadReservationStoresIfNeeded() {
    if (rmStoresLoaded) return;
    var brand = window.AidenCommon && window.AidenCommon.brand;
    if (!brand || !brand.id) return;
    var client = getSb();
    if (!client) return;
    try {
      var res = await client.from('venues').select('id, name').eq('brand_id', brand.id).order('name');
      var sel = document.getElementById('rm-store');
      if (!sel || !res.data) return;
      sel.innerHTML = '<option value="">店舗を選択してください</option>';
      res.data.forEach(function(v) {
        sel.innerHTML += '<option value="' + escH(v.id) + '">' + escH(v.name) + '</option>';
      });
      rmStoresLoaded = true;
    } catch (e) { /* 失敗時は dropdown 空のまま */ }
  }

  function openResModal(storeValue) {
    // モーダル DOM が無ければ inject（保険）
    if (!document.getElementById('res-modal-bg')) {
      injectReservationModalCSS();
      injectReservationModalDOM();
    }
    rmSelTime = null;
    rmPresetStore = storeValue || null;

    var dropdown = document.getElementById('rm-store-field');
    var preset   = document.getElementById('rm-store-preset-field');
    if (rmPresetStore) {
      dropdown.style.display = 'none';
      preset.style.display   = 'block';
      document.getElementById('rm-store-preset-text').textContent = rmPresetStore;
    } else {
      dropdown.style.display = 'block';
      preset.style.display   = 'none';
      document.getElementById('rm-store').selectedIndex = 0;
    }

    // 日付初期値（今日）
    document.getElementById('rm-date').value = new Date().toISOString().split('T')[0];

    document.querySelectorAll('.rm-slot-b').forEach(function(b){ b.classList.remove('on'); });
    document.getElementById('rm-cap-alert').className = 'rm-cap-alert';
    document.getElementById('rm-step1-btn').disabled = true;
    document.getElementById('rm-step1-btn').style.opacity = '.35';
    rmGoStep(1);

    document.getElementById('res-modal-bg').classList.add('open');
    document.body.style.overflow = 'hidden';

    // 非同期で venues ロード（プリセット時はスキップ）
    if (!rmPresetStore) loadReservationStoresIfNeeded();
  }

  function closeResModal() {
    var bg = document.getElementById('res-modal-bg');
    if (bg) bg.classList.remove('open');
    document.body.style.overflow = '';
  }

  function rmOnStoreChange() { rmCheckCap(); }

  function rmSelSlot(el, t) {
    if (!rmPresetStore && !document.getElementById('rm-store').value) {
      document.getElementById('err-rm-store').classList.add('show');
      document.getElementById('rm-store').focus();
      return;
    }
    rmSelTime = t;
    document.querySelectorAll('.rm-slot-b:not(.slot-full)').forEach(function(b){ b.classList.remove('on'); });
    el.classList.add('on');
    var btn = document.getElementById('rm-step1-btn');
    btn.disabled = false; btn.style.opacity = '1';
    rmCheckCap();
  }

  function rmCheckCap() {
    if (!rmSelTime) return;
    var g  = parseInt(document.getElementById('rm-guests').value);
    var ok = [{s:2,n:4},{s:4,n:3},{s:6,n:2},{s:8,n:1}].some(function(t){ return t.s>=g&&t.n>0; });
    var el = document.getElementById('rm-cap-alert');
    el.className = 'rm-cap-alert ' + (ok ? 'ok' : 'err');
    el.textContent = ok ? '✅ ' + g + '名様のご予約が可能です' : '⚠️ 満席です。時間帯を変更してください。';
    document.getElementById('rm-step1-btn').disabled = !ok;
    document.getElementById('rm-step1-btn').style.opacity = ok ? '1' : '.4';
  }

  function rmOpenVacancy(time) {
    // 死コード予定（17:30 hardcode 削除で呼び出されなくなる）。互換のため残す。
    alert('🔔 ' + time + ' の空席通知は近日対応予定です');
  }

  function rmGoStep(n) {
    [1,2,3,'complete'].forEach(function(s){
      var el = document.getElementById('rmstep-' + s);
      if (el) el.style.display = (s === n) ? 'block' : 'none';
    });
    ['rms1','rms2','rms3'].forEach(function(id, i){
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('active','done');
      if (i+1 < n) el.classList.add('done');
      else if (i+1 === n) el.classList.add('active');
    });
    if (n === 3) {
      var storeEl = document.getElementById('rm-store');
      var storeName = rmPresetStore
        ? rmPresetStore
        : (storeEl.options[storeEl.selectedIndex] ? storeEl.options[storeEl.selectedIndex].text : '—');
      var rows = [
        ['店舗',  storeName],
        ['日時',  (document.getElementById('rm-date').value || '—') + ' ' + (rmSelTime || '—')],
        ['人数',  document.getElementById('rm-guests').value + '名'],
        ['お名前', document.getElementById('rm-name').value || '—'],
        ['電話',  document.getElementById('rm-phone').value || '—'],
        ['メール', document.getElementById('rm-email').value || '—'],
        ['ご要望', document.getElementById('rm-notes').value || 'なし']
      ];
      document.getElementById('rm-confirm-box').innerHTML = rows.map(function(r){
        return '<div class="rm-confirm-row"><span class="rm-confirm-label">' + escH(r[0]) + '</span><span>' + escH(r[1]) + '</span></div>';
      }).join('');
    }
  }

  function rmValidateStep2() {
    var ok = true;
    var name  = document.getElementById('rm-name').value.trim();
    var phone = document.getElementById('rm-phone').value.trim();
    var email = document.getElementById('rm-email').value.trim();
    if (!name)  { rmShowErr('rm-name',  'お名前を入力してください'); ok=false; }
    if (!phone || !/^[0-9\-+]{7,15}$/.test(phone)) { rmShowErr('rm-phone', '正しい電話番号を入力してください'); ok=false; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { rmShowErr('rm-email', '正しいメールアドレスを入力してください'); ok=false; }
    if (ok) rmGoStep(3);
  }

  function rmShowErr(id, msg) {
    var el = document.getElementById('err-' + id);
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
  }

  function rmClearErr(id) {
    var el = document.getElementById('err-' + id);
    if (el) el.classList.remove('show');
  }

  async function rmSubmit() {
    var submitBtn = document.querySelector('#rmstep-3 .rm-btn:last-child');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '送信中...'; }
    try {
      var storeSelect = document.getElementById('rm-store');
      var storeId = storeSelect.value;
      // プリセット時は venues 検索でID解決（lazy-load 済みのキャッシュから）
      if (rmPresetStore) {
        var brand = window.AidenCommon && window.AidenCommon.brand;
        if (brand && brand.id) {
          var client = getSb();
          if (client) {
            var rv = await client.from('venues').select('id').eq('brand_id', brand.id).eq('name', rmPresetStore).limit(1);
            storeId = (rv.data && rv.data[0]) ? rv.data[0].id : '';
          }
        }
      }
      var res = await fetch(SUPABASE_URL + '/functions/v1/create-reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          date: document.getElementById('rm-date').value,
          time: rmSelTime,
          guest_count: parseInt(document.getElementById('rm-guests').value, 10),
          name: document.getElementById('rm-name').value.trim(),
          phone: document.getElementById('rm-phone').value.trim(),
          email: document.getElementById('rm-email').value.trim(),
          notes: document.getElementById('rm-notes').value.trim() || undefined
        })
      });
      var json = await res.json();
      if (!res.ok || !json.success) {
        alert('予約の送信に失敗しました: ' + (json.error || '不明なエラー'));
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '予約を確定する'; }
        return;
      }
      document.getElementById('rmstep-3').style.display = 'none';
      document.getElementById('rm-res-id').textContent = json.reservation.display_id;
      document.getElementById('rmstep-complete').style.display = 'block';
    } catch (e) {
      alert('予約の送信に失敗しました。通信状況をご確認ください。');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '予約を確定する'; }
    }
  }

  // window グローバルへ公開（HTML 内 onclick="openResModal()" 等から呼べるように）
  window.openResModal = openResModal;
  window.closeResModal = closeResModal;
  window.rmOnStoreChange = rmOnStoreChange;
  window.rmSelSlot = rmSelSlot;
  window.rmCheckCap = rmCheckCap;
  window.rmOpenVacancy = rmOpenVacancy;
  window.rmGoStep = rmGoStep;
  window.rmValidateStep2 = rmValidateStep2;
  window.rmShowErr = rmShowErr;
  window.rmClearErr = rmClearErr;
  window.rmSubmit = rmSubmit;
```

### Step 1.5: init() 内で auto-inject を呼ぶ

`weir-common.js` の既存 `init()` 関数の中、`renderHeaderBrand(brand)` を呼ぶ if 文の **直後** に CSS / DOM inject を追加:

- [ ] **Step 1.5: init() に auto-inject を追加**

既存:
```javascript
      // Render header
      if (headerType === 'brand') {
        renderHeaderBrand(brand);
      } else if (headerType === 'order') {
        renderHeaderOrder(brand, options);
      }
```

変更後:
```javascript
      // Render header
      if (headerType === 'brand') {
        renderHeaderBrand(brand);
        // 来店予約モーダル auto-inject (brand header のあるページのみ)
        injectReservationModalCSS();
        injectReservationModalDOM();
      } else if (headerType === 'order') {
        renderHeaderOrder(brand, options);
      }
```

### Step 1.6: 構文チェック

- [ ] **Step 1.6: 構文チェック**

```bash
node -c /Users/taisei/Desktop/weir/weir-common.js
```
期待: 出力なし（PASS）。エラーが出たら修正してから次へ。

---

## Task 2: brand.html からモーダル削除

**Files:**
- Modify: `brand.html`

### Step 2.1: brand.html のモーダル CSS 削除

- [ ] **Step 2.1: line 173 の `/* ===== 来店予約モーダル ===== */` から line 221 (`@media(max-width:480px){.rf-row...}` 行) までを削除**

`grep -n` で正確な範囲を確認してから削除すること。`.rf-row` 含む `@media` クエリも削除。

### Step 2.2: brand.html のモーダル HTML 削除

- [ ] **Step 2.2: line 834 の `<!-- ===== 来店予約モーダル ===== -->` から `</div>` (modal 閉じ) まで削除**

`</div></div></div>` のネストに注意。Read で範囲確認後に Edit で削除。

### Step 2.3: brand.html のモーダル JS 削除

- [ ] **Step 2.3: line 956 の `<script>\n/* ===== 来店予約モーダル ===== */` から line 1097 の `</script>` まで削除**

最後の `</script>` を含む。`<script>` から `</script>` まで。

### Step 2.4: brand.html の rm-store 関連 loader 削除

- [ ] **Step 2.4: line 566-569 周辺の rm-store ドロップダウン populate コードを削除**

該当箇所:
```javascript
    // 3. Load venues for reservation dropdown
    ...
      var sel = document.getElementById('rm-store');
      ...
```
共通モーダルが lazy-load するので不要。Read で実際の範囲を確認してから削除。

### Step 2.5: 構文/動作確認

- [ ] **Step 2.5: ファイルが壊れていないことを確認**

```bash
grep -c "openResModal\|closeResModal\|rm-store\|rmSelSlot" /Users/taisei/Desktop/weir/brand.html
```
期待: ヘッダー/フッターから呼ばれる `openResModal` が `weir-common.js` 経由で残るのみ。`rmSelSlot` 等の **定義** は 0 件、**inline呼出** も 0 件（モーダル削除済みのため）。

---

## Task 3: weir-brand-menu.html からモーダル削除

**Files:**
- Modify: `weir-brand-menu.html`

### Step 3.1: weir-brand-menu.html のモーダル CSS 削除

- [ ] **Step 3.1: line 98 の `/* ===== 来店予約モーダル ===== */` から `.rm-store-preset` 行（line 145）まで削除**

### Step 3.2: weir-brand-menu.html のモーダル HTML 削除

- [ ] **Step 3.2: line 895 の `<div class="res-modal-bg" id="res-modal-bg">` から閉じ `</div>` まで削除**

これにより 17:30 hardcode（line 949 の `rmOpenVacancy('17:30')` 含む `slot-full` ボタン）も自然に消える。

### Step 3.3: weir-brand-menu.html のモーダル JS 削除

- [ ] **Step 3.3: line 1017 の `<script>\n/* ===== 来店予約モーダル ===== */` から対応する `</script>` まで削除**

### Step 3.4: weir-brand-menu.html の loadReservationStores() 削除

- [ ] **Step 3.4: line 801-810 の `async function loadReservationStores() {...}` を削除し、line 884 の呼び出しも削除**

該当呼び出し:
```javascript
      Promise.all([
        loadMenuFromSupabase().catch(function(){}),
        loadReservationStores().catch(function(){})  // ← この行を削除
      ]).then(function() {
```
`Promise.all` が `loadMenuFromSupabase` のみを含む形に整形。

### Step 3.5: 17:30 hardcode 消失の確認

- [ ] **Step 3.5: weir-brand-menu.html から 17:30 hardcode が消えたことを確認**

```bash
grep -n "17:30" /Users/taisei/Desktop/weir/weir-brand-menu.html
```
期待: 0 件。

---

## Task 4: weir-brand-stores.html からモーダル削除

**Files:**
- Modify: `weir-brand-stores.html`

### Step 4.1: weir-brand-stores.html のモーダル CSS 削除

- [ ] **Step 4.1: line 107 の `/* ===== 来店予約モーダル ===== */` から `@media(max-width:480px)` 行（line 155）まで削除**

### Step 4.2: weir-brand-stores.html のモーダル HTML 削除

- [ ] **Step 4.2: line 467 の `<!-- ===== 来店予約モーダル ===== -->` から閉じ `</div>` (line 575) まで削除**

これにより 17:30 hardcode（line 513）も消える。

### Step 4.3: weir-brand-stores.html のモーダル JS 削除

- [ ] **Step 4.3: line 577 の `<script>` から line 749 の `</script>` まで削除**

`initResStoreOptions` / `openResModal` / `closeResModal` / `rmSelSlot` / `rmCheckCap` / `rmOpenVacancy` / `rmGoStep` / `rmValidateStep2` / `rmShowErr` / `rmClearErr` / `rmSubmit` 全削除。

### Step 4.4: weir-brand-stores.html の onBrandLoaded 内の rm-store loader 削除

- [ ] **Step 4.4: line 442-443 周辺の rm-store ドロップダウン populate コードを削除**

該当箇所:
```javascript
      // Re-initialize reservation store dropdown with DB-loaded STORES
      var sel = document.getElementById('rm-store');
      ...
```
Read で実際の範囲確認後に Edit で削除。

### Step 4.5: 17:30 hardcode 消失の確認

- [ ] **Step 4.5: weir-brand-stores.html から 17:30 hardcode が消えたことを確認**

```bash
grep -n "17:30" /Users/taisei/Desktop/weir/weir-brand-stores.html
```
期待: 0 件。

---

## Task 5: weir-store.html の 17:30 hardcode 削除

**Files:**
- Modify: `weir-store.html`

### Step 5.1: line 635 を通常スロットに置換

- [ ] **Step 5.1: 予約モーダル内の 17:30 を通常化**

```html
<!-- 旧 -->
<button class="slot-b slot-full" onclick="openVacancyFromSlot('17:30')">17:30<br><span style="font-size:9px">満席 🔔</span></button>

<!-- 新 -->
<button class="slot-b" onclick="selSlot(this,'17:30')">17:30</button>
```

### Step 5.2: line 793 を通常スロットに置換

- [ ] **Step 5.2: 座席モーダル内の 17:30 を通常化**

```html
<!-- 旧 -->
<button class="slot-b slot-full" onclick="openVacancyFromSlot('17:30')">17:30<br><span style="font-size:9px">満席 🔔</span></button>

<!-- 新 -->
<button class="slot-b" onclick="selSeatSlot(this,'17:30')">17:30</button>
```

**注意**: line 635 は `selSlot`、line 793 は `selSeatSlot` を呼ぶ（既存パターン参照: line 633-634, 791-792 など）。間違えないこと。

### Step 5.3: weir-store.html の 17:30 hardcode 残存チェック

- [ ] **Step 5.3: 「満席」hardcode が消えたことを確認**

```bash
grep -n "17:30.*満席\|openVacancyFromSlot" /Users/taisei/Desktop/weir/weir-store.html
```
期待: 0 件。`<option>17:30</option>` (line 549) は **time picker のドロップダウンで通常表記なので残してOK**（hardcode ではない）。

---

## Task 6: weir-membership.html の確認（変更なし）

**Files:**
- Verify: `weir-membership.html`（編集不要）

### Step 6.1: weir-common.js 読み込みの確認

- [ ] **Step 6.1: weir-common.js 読み込み確認**

```bash
grep -n "weir-common.js" /Users/taisei/Desktop/weir/weir-membership.html
```
期待: line 20 で `<script src="./weir-common.js"></script>` を確認。

### Step 6.2: AidenCommon.init({header:'brand'}) 呼び出しの確認

- [ ] **Step 6.2: ヘッダー初期化の確認**

```bash
grep -n "AidenCommon.init" /Users/taisei/Desktop/weir/weir-membership.html
```
期待: `header: 'brand'` で init している。これにより Task 1.5 の auto-inject が発火する。

### Step 6.3: モーダル DOM が無いことの確認

- [ ] **Step 6.3: 既存モーダル不在の確認**

```bash
grep -n "res-modal-bg" /Users/taisei/Desktop/weir/weir-membership.html
```
期待: 0 件（このページには元々モーダルがない）。

---

## Task 7: ローカル動作確認（Playwright 前の sanity check）

**Files:** なし（読み取りのみ）

### Step 7.1: 全ファイルの 17:30 hardcode 残存確認

- [ ] **Step 7.1: 17:30「満席」が全消失したか確認**

```bash
grep -rn "17:30" /Users/taisei/Desktop/weir/*.html /Users/taisei/Desktop/weir/*.js | grep -v ".claude/worktrees" | grep -v "qa-"
```
期待: brand.html line 889 周辺の `rmSelSlot(this,'17:30')` は **削除済み**（モーダルごと削除）。weir-store.html:549 の `<option>17:30</option>` のみ残存（OK）。weir-common.js 内の `'17:30'` は新規追加分のみ（共通モーダル内、これは仕様）。

### Step 7.2: 全ファイルの rm-* / openResModal 関数定義残存確認

- [ ] **Step 7.2: モーダル関数の重複定義がないか確認**

```bash
grep -n "function openResModal\|function closeResModal\|function rmSelSlot\|function rmGoStep\|function rmCheckCap\|function rmSubmit\|function rmValidateStep2" /Users/taisei/Desktop/weir/*.html /Users/taisei/Desktop/weir/*.js
```
期待: weir-common.js のみで定義（4ブランドファイルからは消失）。

### Step 7.3: ブランドページの onclick="openResModal()" は残存

- [ ] **Step 7.3: ヘッダー/フッター/CTA からの openResModal 呼び出しは残っていることを確認**

```bash
grep -n "openResModal" /Users/taisei/Desktop/weir/brand.html /Users/taisei/Desktop/weir/weir-brand-menu.html /Users/taisei/Desktop/weir/weir-brand-stores.html /Users/taisei/Desktop/weir/weir-membership.html
```
期待: 各ファイルに inline呼出 (`onclick="openResModal()"`) は残るが、定義はなし。weir-common.js が定義を提供。

### Step 7.4: ローカルサーバー起動 + console エラーチェック（オプション）

- [ ] **Step 7.4: 必要に応じて簡易 HTTP サーバーで開いて DevTools で確認**

```bash
cd /Users/taisei/Desktop/weir && python3 -m http.server 8000 &
# ブラウザで http://localhost:8000/brand.html?brand_id=227e4325-5bc2-4249-b223-389abdbe058a を開く
# DevTools Console でエラーがないか確認
# モーダルが開くか確認
```
（オプション。本番デプロイ後の Playwright で同等のチェックを行う）

---

## Task 8: コミット + push

**Files:** git

### Step 8.1: 変更内容を git diff で再確認

- [ ] **Step 8.1: 自分の変更のみが含まれていることを確認**

```bash
git diff --stat HEAD
git diff HEAD -- weir-common.js | head -50
```

### Step 8.2: 最新を取り込み（rebase）

- [ ] **Step 8.2: 並列セッション対策**

```bash
git pull --rebase origin main
```
コンフリクトがあれば解決してから次へ。

### Step 8.3: stage + commit

- [ ] **Step 8.3: 関連ファイルのみ staging & commit**

```bash
git add weir-common.js brand.html weir-brand-menu.html weir-brand-stores.html weir-store.html docs/superpowers/plans/2026-04-17-reservation-modal-consolidation.md
git commit -m "$(cat <<'EOF'
refactor: consolidate reservation modal into weir-common.js + remove 17:30 hardcode

- Add reservation modal CSS/DOM/JS to weir-common.js (auto-inject on brand header)
- Remove modal duplicates from brand.html, weir-brand-menu.html, weir-brand-stores.html
- Remove 17:30 vacancy-button hardcode from weir-store.html (lines 635, 793)
- weir-membership.html now gets working reservation button (was silent failure)
- Adopt weir-brand-stores.html's real rmSubmit (POST to /functions/v1/create-reservation) as source of truth

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Step 8.4: push

- [ ] **Step 8.4: push to main**

```bash
git push origin main
```

### Step 8.5: GitHub auto-deploy 完了を待つ

- [ ] **Step 8.5: Vercel ビルド完了確認（D-80 遵守: 手動 vercel --prod 禁止）**

git push 後 ~60-90 秒待つ。Vercel Dashboard で deploy 状況確認可能。確認できなければ次のタスクで Playwright が deploy 完了後の URL を叩くので問題なし。

---

## Task 9: Playwright 実機検証（5URL）

**Files:** /tmp に検証スクリプト作成

### Step 9.1: 検証用 Playwright スクリプト作成

- [ ] **Step 9.1: スクリプト作成**

`/tmp/verify-reservation-modal.js` に以下を作成:

```javascript
const { chromium } = require('playwright');

const BRAND_ID = '227e4325-5bc2-4249-b223-389abdbe058a';
const URLS = [
  { url: 'https://xorder.co.jp/izakaya-ushio', name: 'brand' },
  { url: `https://xorder.co.jp/weir-brand-menu.html?brand_id=${BRAND_ID}`, name: 'menu' },
  { url: `https://xorder.co.jp/weir-brand-stores.html?brand_id=${BRAND_ID}`, name: 'stores' },
  { url: `https://xorder.co.jp/weir-membership.html?brand_id=${BRAND_ID}`, name: 'membership' },
  { url: 'https://xorder.co.jp/weir-store.html?store=ra6DXDh', name: 'store' }
];

(async () => {
  const browser = await chromium.launch();
  const results = [];

  for (const target of URLS) {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

    let modalShown = false;
    let slot1730Normal = false;
    let mansekiText = false;
    let err = null;

    try {
      await page.goto(target.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500); // brand load + modal inject 待ち

      // weir-store.html は座席モーダル系。ヘッダーに openResModal がないので別判定
      if (target.name === 'store') {
        // 17:30 が「満席🔔」じゃないことを確認
        const m1 = await page.locator('button.slot-b:has-text("17:30")').count();
        const m2 = await page.locator('button.slot-b.slot-full:has-text("17:30")').count();
        slot1730Normal = (m1 > 0 && m2 === 0);
        const manseki = await page.locator('text=/17:30.*満席/').count();
        mansekiText = (manseki > 0);
        modalShown = true; // 該当なし扱い（座席モーダルは別系統、UI 操作はスキップ）
      } else {
        // ヘッダー来店予約ボタンクリック
        // weir-common.js は inline onclick="if(window.openResModal)openResModal()" を生成
        await page.evaluate(() => { if (window.openResModal) window.openResModal(); });
        await page.waitForTimeout(800);

        // モーダル表示判定
        modalShown = await page.locator('#res-modal-bg.open').count() > 0;

        // 17:30 ボタンが通常 slot-b で slot-full ではないこと
        const normalCount = await page.locator('#res-modal-bg button.rm-slot-b:not(.slot-full):has-text("17:30")').count();
        const fullCount = await page.locator('#res-modal-bg button.rm-slot-b.slot-full:has-text("17:30")').count();
        slot1730Normal = (normalCount > 0 && fullCount === 0);

        // 満席🔔テキストが 17:30 周辺にないこと
        const manseki = await page.locator('#res-modal-bg button:has-text("17:30") >> text=/満席/').count();
        mansekiText = (manseki > 0);

        // クリックして on 状態になることも確認
        if (slot1730Normal) {
          // 店舗を選択（必要時）
          const storeSelect = page.locator('#rm-store');
          if (await storeSelect.isVisible()) {
            const optCount = await storeSelect.locator('option').count();
            if (optCount > 1) await storeSelect.selectOption({ index: 1 });
          }
          await page.locator('#res-modal-bg button.rm-slot-b:has-text("17:30")').first().click();
          await page.waitForTimeout(300);
        }

        // スクショ
        await page.screenshot({ path: `/tmp/after-${target.name}-modal.png`, fullPage: false });
      }
    } catch (e) {
      err = e.message;
    }

    results.push({
      url: target.url,
      modalShown,
      slot1730Normal,
      mansekiPresent: mansekiText,
      consoleErrors: consoleErrors.length,
      consoleErrorSample: consoleErrors.slice(0, 3),
      err
    });
    await page.close();
  }

  console.log('\n=== Results ===\n');
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
```

### Step 9.2: Playwright スクリプト実行

- [ ] **Step 9.2: 実行**

```bash
cd /tmp && node verify-reservation-modal.js 2>&1 | tee /tmp/verify-output.log
```

### Step 9.3: 結果解析（PASS/FAIL 判定）

- [ ] **Step 9.3: 結果整理**

各 URL の合格条件:
- brand / menu / stores / membership: `modalShown=true && slot1730Normal=true && mansekiPresent=false && consoleErrors=0`
- store: `slot1730Normal=true && mansekiPresent=false && consoleErrors=0`（座席モーダルの操作は別系統のためスキップ）

FAIL があれば原因分析して修正タスクに戻る。

### Step 9.4: スクリーンショット保管

- [ ] **Step 9.4: スクショ確認**

```bash
ls -la /tmp/after-*-modal.png
```
ファイル一覧を完了報告に含める。

---

## Task 10: 完了報告

**Files:** なし（コミュニケーション）

### Step 10.1: CC 完了報告フォーマットに沿って報告

- [ ] **Step 10.1: 完了報告作成**

CC 依頼の「完了報告フォーマット」に沿って Taisei に報告:
- 変更ファイル diff サマリ
- タスク別 PASS / FAIL
- Playwright 5URL 結果テーブル
- commit hash
- スクショ保存先
- 発見した Gotchas
- 手動作業（あれば）

---

## 検証チェックリスト（最終）

- [ ] weir-common.js: モーダル CSS / DOM / JS 全関数追加済み + `node -c` 構文チェック PASS
- [ ] weir-common.js init() で auto-inject 実装済み
- [ ] brand.html: モーダル CSS / HTML / JS / rm-store loader 削除済み
- [ ] weir-brand-menu.html: 同上 + loadReservationStores() 削除済み + 17:30 hardcode 消失
- [ ] weir-brand-stores.html: 同上 + initResStoreOptions() 削除済み + 17:30 hardcode 消失
- [ ] weir-store.html: line 635 / 793 の 17:30「満席🔔」を通常スロットに置換
- [ ] weir-membership.html: 変更なし、weir-common.js 経由で動作確認
- [ ] git pull --rebase / commit / push 完了
- [ ] Playwright 5URL 全 PASS（または FAIL を明記）
- [ ] スクショ /tmp/after-*-modal.png 保存
- [ ] CC 完了報告フォーマットで報告

---

## 注意事項（過去の教訓）

- **TL-01**: middleware 変更なしだが JS 共通化は全ページに影響 → Playwright 実機必須
- **TL-03**: curl HTTP 200 判定は不十分 → Playwright 実機確認必須
- **D-80**: GitHub auto-deploy 経由（`vercel --prod` 直接実行禁止）
- **D-83**: 新規ハードコード追加禁止（共通モーダル内の `'17:00'` 〜 `'20:30'` は仕様の固定スロット、これは hardcode ではなく UI 仕様）
- **S-05**: スコープ外の「ついで修正」禁止（Phase 2-a / weir-store.html 共通化 / rmOpenVacancy 機能実装は触らない）
- **CC⑤/CC⑩の反省**: 全ファイル grep で網羅確認済み（事前調査セクション参照）

---

## 想定外シナリオへの対処

- **Playwright で modal が出ない**: AidenCommon.init() の onBrandLoaded コールバックが未完了の可能性 → `await page.waitForFunction(() => !!document.getElementById('res-modal-bg'))` で待機する
- **rm-store dropdown が空**: lazy-load の API 失敗 → DevTools Network タブで `venues` クエリのレスポンス確認、RLS ポリシーを確認
- **CSS が当たらない**: 既存ページの `.rf-row` 等と class 名が衝突している可能性 → 別クラス名（`.rm-rf-row` 等）にリネーム検討
- **brand.html で `STORES` グローバルが他コードから参照されエラー**: rm-store loader を消したことで STORES 自体が無くなる場合は要復元 → `grep -n "STORES" brand.html` で参照を確認してから削除すること
