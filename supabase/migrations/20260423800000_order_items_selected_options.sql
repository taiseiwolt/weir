-- =============================================================================
-- CC-Option-Master-Stage2a Migration: order_items にオプション選択スナップショット JSONB カラム追加
--
-- 決定: D-242 (Stage 1) / D-166 (metadata 整理)
-- 依頼: cc-requests/cc-option-master-stage2a
--
-- 目的:
--   注文時に選択されたオプションを order_items に JSONB スナップショットで保存。
--   option master 削除後も注文履歴で選択内容を完全表示可能にする (name スナップショット必須)。
--
-- Schema: (docs/order_items_selected_options_schema.md 参照)
--   [
--     { option_id: uuid, option_name: text, group_id: uuid, group_name: text, price_delta: int }
--   ]
--
-- Stage 1 schema (option_groups / options / product_option_groups / option_sale_status) は変更しない。
-- =============================================================================

BEGIN;

ALTER TABLE order_items
  ADD COLUMN selected_options jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN order_items.selected_options IS
  'Snapshot of selected options at order time. Array of { option_id, option_name, group_id, group_name, price_delta }. name フィールドは option master 削除後の履歴保全のため必須。';

-- GIN index: 集計クエリ (「特定 option_id の採用率」等) の性能担保
CREATE INDEX idx_order_items_selected_options
  ON order_items USING GIN (selected_options);

COMMIT;

-- =============================================================================
-- ROLLBACK SQL (本番障害時に Dashboard SQL Editor で実行)
-- =============================================================================
-- BEGIN;
--   DROP INDEX IF EXISTS idx_order_items_selected_options;
--   ALTER TABLE order_items DROP COLUMN IF EXISTS selected_options;
-- COMMIT;
