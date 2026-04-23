// @ts-check
// CC-22b-stage1: AI 生成基盤 E2E (Playwright)
//
// 前提条件:
//   1. Supabase migrations 適用済 (generation_jobs / generation_results / template_reviews / rate_limits)
//   2. seed_template_reviews.sql 実行済 (template_reviews 48 件)
//   3. Edge Function デプロイ済 (start-generation + generation-worker)
//   4. Supabase EF Secrets に ANTHROPIC_API_KEY 設定済
//   5. 本番 / staging に weir-onboarding.html 配信中
//
// 使い方:
//   BASE_URL=https://xorder.co.jp npx playwright test e2e-cc22b-stage1-ai-generation.spec.cjs
//
// Stage 1 MVP 範囲:
//   T1: Happy path (warmth-1 / 居酒屋) - 30s 以内に 3 件生成 + モーダル表示
//   T2: 16 業態全てで生成成功 (並列)
//   T5: Realtime 受信確認 (job completed への遷移観測)
//
// Stage 2+ TODO (API モックが必要):
//   T3: 永続エラー時の friendly メッセージ表示
//   T4: エラー率 < 5% (20 回連続実行)
//   T6: Claude API 一時失敗時の自動リトライ

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'https://xorder.co.jp';
const ONBOARDING_URL = BASE_URL + '/weir-onboarding.html';

const GENERATION_TIMEOUT_MS = 30000;
const PAGE_TIMEOUT = 30000;

const CUISINE_KEYS = [
  'warmth-1',  'warmth-2',  'warmth-3',  'warmth-4',
  'modern-1',  'modern-2',  'modern-3',  'modern-4',
  'premium-1', 'premium-2', 'premium-3', 'premium-4',
  'casual-1',  'casual-2',  'casual-3',  'casual-4',
];

// Step 1 ~ Step 2 の Q&A / 演出を飛ばし、Step 3 から開始するための state を pre-seed する。
async function seedOnboardingStateForStep3(page) {
  await page.addInitScript(() => {
    const state = {
      currentStep: 3,
      form: {
        brandName: 'テスト店舗',
        category: 'izakaya',
        concept: 'テスト用のコンセプトです',
        target: 'テスト用のターゲットです',
        catchphrase: '',
        foundingYear: '',
        ownerStory: '',
        imageKeywords: ['warmth'],
        colorMain: '#6c5ce7',
        colorAccent: '#fdcb6e',
        colorSub: '#2d3436',
      },
      photos: { exterior: [], interior: [], menu: [], logo: [] },
      selectedPreviewId: null,
      session: { id: 'e2e-session-' + Math.random().toString(36).slice(2, 10), startedAt: Date.now(), lastSavedAt: null },
    };
    localStorage.setItem('weir_onboarding_state_v1', JSON.stringify(state));
  });
}

async function navigateToStep3(page) {
  await seedOnboardingStateForStep3(page);
  await page.goto(ONBOARDING_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
  // loadStateFromLocalStorage は DOMContentLoaded 前に走る想定だが、安全のため手動で step 遷移を叩く。
  await page.evaluate(() => {
    if (typeof window.goToStep === 'function') window.goToStep(3);
  });
  await expect(page.locator('#step3.active')).toBeVisible({ timeout: PAGE_TIMEOUT });
  await expect(page.locator('.onb-preview-tile')).toHaveCount(16, { timeout: PAGE_TIMEOUT });
}

async function selectTileByCuisineKey(page, cuisineKey) {
  const previewId = 'weir-' + cuisineKey;
  await page.click('.onb-preview-tile[data-preview-id="' + previewId + '"]');
  await page.waitForSelector('#previewModal.show', { timeout: 5000 });
  await page.click('#previewModal button[onclick*="selectFromModal"]');
  await expect(page.locator('#step3NextBtn')).toBeEnabled();
}

async function confirmSelectionAndWaitStep4(page) {
  await page.click('#step3NextBtn');
  await expect(page.locator('#step4.active')).toBeVisible({ timeout: PAGE_TIMEOUT });
  // Step 4-1 から Step 4-2 へ進む (hero reveal → 5 cards)
  // 自動遷移するかボタンで遷移するかはタイミング次第のため、どちらにも対応。
  const goButton = page.locator('#step4 button.s4-primary:visible').first();
  if (await goButton.isVisible().catch(() => false)) {
    await goButton.click({ timeout: 5000 }).catch(() => {});
  }
}

async function openReviewCardAndWaitForResult(page) {
  // Step 4-2 の 5 枚カードのうち review (idx=2) を開く
  await expect(page.locator('#packageGrid .package-card[data-pkg-idx="2"]')).toBeVisible({ timeout: PAGE_TIMEOUT });
  await page.click('#packageGrid .package-card[data-pkg-idx="2"]');
  await expect(page.locator('#step4PreviewModal.show')).toBeVisible({ timeout: 5000 });
  // Loading or completed のいずれかが表示される
  await expect(page.locator('#step4PreviewModal .pd-review')).toBeVisible({ timeout: 5000 });
  // 生成完了を待つ (最大 30s)
  await expect(page.locator('#step4PreviewModal .pd-review .rv-card.rv-out .rv-text')).toBeVisible({ timeout: GENERATION_TIMEOUT_MS });
}

// ============================================================================
// T1: Happy path (warmth-1 / 居酒屋)
// ============================================================================

test('[T1] Happy path: warmth-1 で 30s 以内にレビュー返信が生成される', async ({ page }) => {
  await navigateToStep3(page);
  await selectTileByCuisineKey(page, 'warmth-1');
  await confirmSelectionAndWaitStep4(page);
  await openReviewCardAndWaitForResult(page);

  // 返信文が 30 文字以上含まれていることを確認
  const replyText = await page.locator('#step4PreviewModal .pd-review .rv-card.rv-out .rv-text').textContent();
  expect((replyText || '').trim().length).toBeGreaterThan(30);

  // 元レビュー (source_review) も表示されている
  const sourceText = await page.locator('#step4PreviewModal .pd-review .rv-card.rv-in .rv-text').textContent();
  expect((sourceText || '').trim().length).toBeGreaterThan(10);
});

// ============================================================================
// T2: 16 業態全てで動作する (並列実行)
// ============================================================================

test.describe.parallel('[T2] 16 業態', () => {
  for (const key of CUISINE_KEYS) {
    test('業態 ' + key + ' で生成成功', async ({ page }) => {
      await navigateToStep3(page);
      await selectTileByCuisineKey(page, key);
      await confirmSelectionAndWaitStep4(page);
      await openReviewCardAndWaitForResult(page);

      const replyText = await page.locator('#step4PreviewModal .pd-review .rv-card.rv-out .rv-text').textContent();
      expect((replyText || '').trim().length).toBeGreaterThan(20);
    });
  }
});

// ============================================================================
// T5: Realtime 受信 - Step 4 モーダルが loading → completed に遷移する
// ============================================================================

test('[T5] Realtime: モーダル loading → completed に遷移する', async ({ page }) => {
  await navigateToStep3(page);
  await selectTileByCuisineKey(page, 'modern-1');
  await page.click('#step3NextBtn');
  await expect(page.locator('#step4.active')).toBeVisible({ timeout: PAGE_TIMEOUT });

  // Step 4-2 へ強制遷移してモーダルを開く
  await page.evaluate(() => {
    if (typeof window.goStep4Sub === 'function') window.goStep4Sub(2);
    // 念のため直接開く
    if (typeof window.openStep4Preview === 'function') window.openStep4Preview(2);
  });
  await expect(page.locator('#step4PreviewModal.show')).toBeVisible({ timeout: 5000 });

  // 最初は loading (タイミングが速いと既に completed の可能性あり)
  const loadingOrCompleted = await Promise.race([
    page.locator('.pd-review-loading').waitFor({ timeout: 3000 }).then(() => 'loading').catch(() => null),
    page.locator('.rv-card.rv-out .rv-text').waitFor({ timeout: 3000 }).then(() => 'completed').catch(() => null),
  ]);
  expect(['loading', 'completed']).toContain(loadingOrCompleted);

  // 最終的に completed になる
  await expect(page.locator('#step4PreviewModal .pd-review .rv-card.rv-out .rv-text')).toBeVisible({ timeout: GENERATION_TIMEOUT_MS });
});

// ============================================================================
// T3 / T4 / T6: Stage 2+ で実装 (Claude API のモックが必要)
// ============================================================================

test.skip('[T3] エラー時: フレンドリーメッセージ表示', async () => {
  // TODO Stage 2: ANTHROPIC_API_KEY を無効値に差し替えた test env で実施。
  //              generation-worker が claude_api_error を返し、
  //              .pd-review-error / .rv-error-msg が表示されることを確認。
});

test.skip('[T4] エラー率 < 5%: 20 回連続実行で失敗 1 回以下', async () => {
  // TODO Stage 2: 実運用で計測。CI では rate limit の関係で実行しない。
  //              監視クエリ (docs/cc22b-stage1-monitoring.sql) で本番データから算出する。
});

test.skip('[T6] リトライ動作: Claude API 一時失敗時に最大 2 回リトライで成功', async () => {
  // TODO Stage 2: モックサーバーで最初の 2 回を失敗にして 3 回目成功を再現。
  //              generation_jobs.retry_count = 1 以上を DB 確認。
});
