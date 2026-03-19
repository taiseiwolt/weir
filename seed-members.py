#!/usr/bin/env python3
"""POCデモ用 会員関連データ投入スクリプト"""
import json, subprocess, sys

TOKEN = "sbp_0bc989fd83759e2909944e4a7117b341834c19b8"
API = "https://api.supabase.com/v1/projects/iikwusprydaogzeslgdz/database/query"

def run_sql(label, sql):
    r = subprocess.run(
        ["curl", "-s", "-X", "POST",
         "-H", f"Authorization: Bearer {TOKEN}",
         "-H", "Content-Type: application/json",
         API, "-d", json.dumps({"query": sql})],
        capture_output=True, text=True
    )
    out = r.stdout.strip()
    if '"error"' in out or '"message"' in out.lower():
        print(f"[FAIL] {label}: {out[:300]}")
        return False
    print(f"[OK]   {label}")
    return True

# ── Brand IDs ──
B_SUMI  = '22222222-0000-0000-0000-000000000001'
B_YAKI  = 'aaaa0002-0000-0000-0000-000000000001'
B_KORE  = 'aaaa0002-0000-0000-0000-000000000002'
B_MEN   = 'bbbb0002-0000-0000-0000-000000000001'
B_ONI   = 'cccc0002-0000-0000-0000-000000000001'

# ── Rank Setting IDs ──
R = {
    'sumi_bronze': 'dd005500-2222-0000-0000-000000000001',
    'sumi_silver': 'dd005500-2222-0000-0000-000000000002',
    'sumi_gold':   'dd005500-2222-0000-0000-000000000003',
    'yaki_bronze': 'dd005500-aaa1-0000-0000-000000000001',
    'yaki_silver': 'dd005500-aaa1-0000-0000-000000000002',
    'yaki_gold':   'dd005500-aaa1-0000-0000-000000000003',
    'kore_bronze': 'dd005500-aaa2-0000-0000-000000000001',
    'kore_silver': 'dd005500-aaa2-0000-0000-000000000002',
    'kore_gold':   'dd005500-aaa2-0000-0000-000000000003',
    'men_bronze':  'dd005500-bbb1-0000-0000-000000000001',
    'men_silver':  'dd005500-bbb1-0000-0000-000000000002',
    'men_gold':    'dd005500-bbb1-0000-0000-000000000003',
    'oni_bronze':  'dd005500-ccc1-0000-0000-000000000001',
    'oni_silver':  'dd005500-ccc1-0000-0000-000000000002',
    'oni_gold':    'dd005500-ccc1-0000-0000-000000000003',
}

# ── Member IDs ──
M = {i: f'dd000000-0000-0000-0000-{i:012d}' for i in range(1, 13)}

# ======== STEP 1: rank_settings ========
sql_rank = f"""
INSERT INTO rank_settings (id, brand_id, rank_name, icon, sort_order, is_default, cond_monthly_count, cond_total_spend, benefit_point_multi, benefit_birthday, benefit_other) VALUES
-- 炭火亭
('{R["sumi_bronze"]}', '{B_SUMI}', 'ブロンズ', '🥉', 0, true,  0, 0,      1.00, '', ''),
('{R["sumi_silver"]}', '{B_SUMI}', 'シルバー', '🥈', 1, false, 0, 30000,  1.50, '500ptプレゼント', ''),
('{R["sumi_gold"]}',   '{B_SUMI}', 'ゴールド', '🥇', 2, false, 0, 100000, 2.00, '1000ptプレゼント', '限定メニュー先行案内'),
-- 焼肉キング
('{R["yaki_bronze"]}', '{B_YAKI}', 'ブロンズ', '🥉', 0, true,  0, 0,      1.00, '', ''),
('{R["yaki_silver"]}', '{B_YAKI}', 'シルバー', '🥈', 1, false, 0, 30000,  1.50, '500ptプレゼント', ''),
('{R["yaki_gold"]}',   '{B_YAKI}', 'ゴールド', '🥇', 2, false, 0, 100000, 2.00, '1000ptプレゼント', '記念日サプライズ特典'),
-- 韓国キッチン
('{R["kore_bronze"]}', '{B_KORE}', 'ブロンズ', '🥉', 0, true,  0, 0,      1.00, '', ''),
('{R["kore_silver"]}', '{B_KORE}', 'シルバー', '🥈', 1, false, 0, 30000,  1.50, '300ptプレゼント', ''),
('{R["kore_gold"]}',   '{B_KORE}', 'ゴールド', '🥇', 2, false, 0, 100000, 2.00, '800ptプレゼント', '韓国食材セットプレゼント'),
-- 麺匠
('{R["men_bronze"]}', '{B_MEN}', 'ブロンズ', '🥉', 0, true,  0, 0,      1.00, '', ''),
('{R["men_silver"]}', '{B_MEN}', 'シルバー', '🥈', 1, false, 0, 30000,  1.50, '300ptプレゼント', ''),
('{R["men_gold"]}',   '{B_MEN}', 'ゴールド', '🥇', 2, false, 0, 100000, 2.00, '700ptプレゼント', 'トッピング1品無料'),
-- おにぎり本舗
('{R["oni_bronze"]}', '{B_ONI}', 'ブロンズ', '🥉', 0, true,  0, 0,      1.00, '', ''),
('{R["oni_silver"]}', '{B_ONI}', 'シルバー', '🥈', 1, false, 0, 30000,  1.50, '200ptプレゼント', ''),
('{R["oni_gold"]}',   '{B_ONI}', 'ゴールド', '🥇', 2, false, 0, 100000, 2.00, '500ptプレゼント', '季節限定おにぎりセット');
"""

# ======== STEP 2: point_settings ========
sql_point = f"""
INSERT INTO point_settings (brand_id, enabled, earn_rate_unit, earn_rate_point, use_rate_point, use_rate_yen, expiry_months) VALUES
('{B_SUMI}', true, 100, 1, 1, 1, 12),
('{B_YAKI}', true, 100, 2, 1, 1, 12),
('{B_KORE}', true, 100, 3, 1, 1,  6),
('{B_MEN}',  true, 100, 5, 1, 1,  6),
('{B_ONI}',  true, 100, 4, 1, 1, 12);
"""

# ======== STEP 3: members ========
# (id, brand_id, name, email, phone, birth_date, rank, point_balance, order_count,
#  display_id, first_name, last_name, gender, address_prefecture,
#  current_rank_id, total_spend, monthly_order_count)
members_data = [
    # 炭火亭 (3)
    (1, B_SUMI, '田中 太郎', 'tanaka.taro@example.com', '090-1234-5678', '1985-04-12',
     'gold', 1240, 42, 'MEM-TnkTr001', '太郎', '田中', 'male', '東京都',
     R['sumi_gold'], 152000, 5),
    (2, B_SUMI, '佐藤 花子', 'sato.hanako@example.com', '090-2345-6789', '1992-08-25',
     'silver', 380, 15, 'MEM-StHnk002', '花子', '佐藤', 'female', '神奈川県',
     R['sumi_silver'], 45000, 3),
    (3, B_SUMI, '鈴木 一郎', 'suzuki.ichiro@example.com', '080-3456-7890', '2000-01-30',
     'standard', 85, 4, 'MEM-SzkIc003', '一郎', '鈴木', 'male', '東京都',
     R['sumi_bronze'], 8200, 1),
    # 焼肉キング (3)
    (4, B_YAKI, '高橋 美咲', 'takahashi.misaki@example.com', '090-4567-8901', '1990-11-03',
     'silver', 520, 12, 'MEM-TkhMs004', '美咲', '高橋', 'female', '東京都',
     R['yaki_silver'], 36500, 2),
    (5, B_YAKI, '伊藤 健太', 'ito.kenta@example.com', '080-5678-9012', '1998-06-18',
     'standard', 140, 3, 'MEM-ItKnt005', '健太', '伊藤', 'male', '埼玉県',
     R['yaki_bronze'], 5200, 1),
    (6, B_YAKI, '渡辺 優子', 'watanabe.yuko@example.com', '090-6789-0123', '1982-02-14',
     'gold', 2800, 35, 'MEM-WtnYk006', '優子', '渡辺', 'female', '東京都',
     R['yaki_gold'], 124000, 4),
    # 韓国キッチン (2)
    (7, B_KORE, '山本 大輝', 'yamamoto.daiki@example.com', '090-7890-1234', '1995-09-07',
     'silver', 890, 16, 'MEM-YmtDk007', '大輝', '山本', 'male', '千葉県',
     R['kore_silver'], 42000, 3),
    (8, B_KORE, '中村 さくら', 'nakamura.sakura@example.com', '080-8901-2345', '2001-03-22',
     'standard', 210, 5, 'MEM-NkmSk008', 'さくら', '中村', 'female', '東京都',
     R['kore_bronze'], 12500, 2),
    # 麺匠 (2)
    (9, B_MEN, '小林 翔太', 'kobayashi.shota@example.com', '090-9012-3456', '1988-12-01',
     'gold', 3500, 38, 'MEM-KbySt009', '翔太', '小林', 'male', '東京都',
     R['men_gold'], 112000, 6),
    (10, B_MEN, '加藤 あかり', 'kato.akari@example.com', '080-0123-4567', '1997-07-15',
     'standard', 350, 4, 'MEM-KtAkr010', 'あかり', '加藤', 'female', '神奈川県',
     R['men_bronze'], 6800, 1),
    # おにぎり本舗 (2)
    (11, B_ONI, '吉田 陽介', 'yoshida.yosuke@example.com', '090-1111-2222', '1993-05-28',
     'silver', 620, 14, 'MEM-YsdYs011', '陽介', '吉田', 'male', '東京都',
     R['oni_silver'], 38500, 3),
    (12, B_ONI, '松本 ゆい', 'matsumoto.yui@example.com', '080-3333-4444', '2003-10-09',
     'standard', 120, 4, 'MEM-MtmYi012', 'ゆい', '松本', 'female', '埼玉県',
     R['oni_bronze'], 3800, 1),
]

values = []
for m in members_data:
    idx, brand, name, email, phone, birth, rank, pts, oc, did, fn, ln, gen, pref, rid, ts, moc = m
    values.append(
        f"('{M[idx]}', '{brand}', '{name}', '{email}', '{phone}', '{birth}', "
        f"'{rank}', {pts}, {oc}, '{did}', '{fn}', '{ln}', '{gen}', '{pref}', "
        f"'{rid}', {ts}, {moc})"
    )
NL = '\n'
sql_members = f"""
INSERT INTO members (id, brand_id, name, email, phone, birth_date, rank, point_balance, order_count,
  display_id, first_name, last_name, gender, address_prefecture,
  current_rank_id, total_spend, monthly_order_count) VALUES
{(',' + NL).join(values)};
"""

# ======== STEP 4: UPDATE orders with member_id ========
# Map: member_id → list of order_ids
order_assignments = {
    # 田中太郎 (炭火亭, 8 orders)
    M[1]: [
        'a0000000-0000-0000-0000-000000000030',
        'a0000000-0000-0000-0000-000000000028',
        'a0000000-0000-0000-0000-000000000027',
        'a0000000-0000-0000-0000-000000000025',
        'a0000000-0000-0000-0000-000000000022',
        'a0000000-0000-0000-0000-000000000018',
        'a0000000-0000-0000-0000-000000000013',
        'a0000000-0000-0000-0000-000000000009',
    ],
    # 佐藤花子 (炭火亭, 5 orders)
    M[2]: [
        'a0000000-0000-0000-0000-000000000026',
        'a0000000-0000-0000-0000-000000000023',
        'a0000000-0000-0000-0000-000000000020',
        'a0000000-0000-0000-0000-000000000016',
        'a0000000-0000-0000-0000-000000000011',
    ],
    # 鈴木一郎 (炭火亭, 2 orders)
    M[3]: [
        'a0000000-0000-0000-0000-000000000024',
        'a0000000-0000-0000-0000-000000000019',
    ],
    # 高橋美咲 (焼肉キング, 3 orders)
    M[4]: [
        'a002a926-3d30-460d-a294-64cc662f3d56',  # 1540
        '10bdbe7f-6c08-4343-a79b-aabf9ba71281',  # 3960
        'f87f1983-a8a1-4856-a840-75d180cf3b45',  # 2380
    ],
    # 伊藤健太 (焼肉キング, 2 orders)
    M[5]: [
        '6722851f-21a6-4be9-950a-34c54af190ed',  # 1430
        '38d0f035-5560-4603-a8e2-a73b6239d4d8',  # 560
    ],
    # 渡辺優子 (焼肉キング, 5 orders)
    M[6]: [
        '3ea92162-ab9c-48e7-999c-56d45b58ff5a',  # 4600
        'db02fd12-9ed6-4ae8-b134-86b9fd9f0862',  # 4800
        '2f70eccf-bb5d-48d4-8052-ef33d9ed4483',  # 14920
        'e92b2f8b-21cb-4366-ba5b-7826974f7ea8',  # 11960
        'ebcfdffd-a3c2-4076-b975-991eb66e7728',  # 11960
    ],
    # 山本大輝 (韓国キッチン, 5 orders)
    M[7]: [
        '47908090-027a-4355-89c4-23b625b52fd4',  # 1960
        '5d28a05f-a242-4f3e-98a3-2a33d16d9440',  # 4100
        '9f824ec7-1460-4c24-aec2-0ed696e02591',  # 3820
        'a014cb02-5079-45e6-aa69-821544e79476',  # 3800
        '4c8a1390-093c-4da2-8712-9651904621b0',  # 2740
    ],
    # 中村さくら (韓国キッチン, 3 orders)
    M[8]: [
        '843071f0-c9d6-4462-816d-d464af923ccb',  # 980
        '9c385de2-9f24-4ec0-ae49-dcee71942949',  # 2520
        'c4bf62dc-ff01-4f26-a57e-3bad5b9ad198',  # 1940
    ],
    # 小林翔太 (麺匠, 5 orders)
    M[9]: [
        'edae2069-d449-4cb5-b75c-8175f6f4d0e8',  # 760
        '0b70266a-7020-4c9e-bc46-313c9624fc64',  # 1550
        '63fc3ba7-c743-4832-8b98-4ae15ba04ed6',  # 1760
        '932d7615-919e-4e6c-a046-30790c244f38',  # 1860
        '3baae62f-6177-4774-9228-3f2a72b87b68',  # 2840
    ],
    # 加藤あかり (麺匠, 2 orders)
    M[10]: [
        'af960d79-a882-4411-b536-7a988047b7aa',  # 1230
        '285a211a-662b-4bbf-abbd-39528f2b944e',  # 880
    ],
    # 吉田陽介 (おにぎり本舗, 5 orders)
    M[11]: [
        'be639a9c-8fe4-47c6-bbbe-ca9c69a45250',  # 1320
        '91cea406-6e4a-4056-97b1-a63c197ced5f',  # 1040
        'c14b51a0-2ff1-42d3-87e0-aab473a50776',  # 1620
        '3f6ba4b2-a36f-40ca-b0d8-9457b64b1cbc',  # 1300
        '329ccb39-3e4f-4db4-b080-be68905bbe41',  # 980
    ],
    # 松本ゆい (おにぎり本舗, 3 orders)
    M[12]: [
        'd4e0af86-bf6d-4100-b963-d047f879eaeb',  # 320
        '854a4745-7bb7-4e93-9350-bb0a05a634a8',  # 180
        'a1bf2122-0898-4dfb-940f-c251f2778981',  # 400
    ],
}

update_stmts = []
for mid, oids in order_assignments.items():
    ids_str = "','".join(oids)
    update_stmts.append(f"UPDATE orders SET member_id = '{mid}' WHERE id IN ('{ids_str}');")
sql_orders = "\n".join(update_stmts)

# ======== STEP 5: point_transactions ========
# (member_id, brand_id, amount, balance_after, source, reason, order_id, granted_by, expires_at, created_at)
# Positive = earn, Negative = spend
pt_rows = []

def pt(mid, bid, amt, bal, src, reason, oid, granted, exp, ts):
    oid_sql = f"'{oid}'" if oid else 'NULL'
    granted_sql = f"'{granted}'" if granted else 'NULL'
    exp_sql = f"'{exp}'" if exp else 'NULL'
    pt_rows.append(
        f"('{M[mid]}', '{bid}', {amt}, {bal}, '{src}', '{reason}', "
        f"{oid_sql}, {granted_sql}, {exp_sql}, '{ts}')"
    )

# ── 田中太郎 (炭火亭, 1%base, Gold2x → final balance 1240) ──
pt(1, B_SUMI, 150, 150, 'normal', '注文獲得ポイント', None, None, '2026-06-15', '2025-06-15 12:00:00+09')
pt(1, B_SUMI, 230, 380, 'normal', '注文獲得ポイント', None, None, '2026-08-20', '2025-08-20 19:30:00+09')
pt(1, B_SUMI, -200, 180, 'normal', 'ポイント利用', None, None, None, '2025-09-10 13:00:00+09')
pt(1, B_SUMI, 280, 460, 'normal', '注文獲得ポイント', None, None, '2026-11-05', '2025-11-05 18:45:00+09')
pt(1, B_SUMI, 200, 660, 'aiden_compensation', '配送遅延に対する補償ポイント', None, '運営担当：山田', '2026-12-01', '2025-12-01 10:00:00+09')
pt(1, B_SUMI, 310, 970, 'normal', '注文獲得ポイント', None, None, '2027-01-15', '2026-01-15 20:15:00+09')
pt(1, B_SUMI, 60, 1030, 'normal', '注文獲得ポイント', 'a0000000-0000-0000-0000-000000000030', None, '2027-03-10', '2026-03-10 12:30:00+09')
pt(1, B_SUMI, 46, 1076, 'normal', '注文獲得ポイント', 'a0000000-0000-0000-0000-000000000027', None, '2027-03-10', '2026-03-10 18:00:00+09')
pt(1, B_SUMI, 70, 1146, 'normal', '注文獲得ポイント', 'a0000000-0000-0000-0000-000000000025', None, '2027-03-11', '2026-03-11 11:30:00+09')
pt(1, B_SUMI, 60, 1206, 'normal', '注文獲得ポイント', 'a0000000-0000-0000-0000-000000000022', None, '2027-03-11', '2026-03-11 13:00:00+09')
pt(1, B_SUMI, 66, 1272, 'normal', '注文獲得ポイント', 'a0000000-0000-0000-0000-000000000018', None, '2027-03-11', '2026-03-11 14:30:00+09')
pt(1, B_SUMI, -32, 1240, 'normal', 'ポイント利用', None, None, None, '2026-03-11 15:00:00+09')

# ── 佐藤花子 (炭火亭, Silver1.5x → 380) ──
pt(2, B_SUMI, 80, 80, 'normal', '注文獲得ポイント', None, None, '2026-09-01', '2025-09-01 12:00:00+09')
pt(2, B_SUMI, 120, 200, 'normal', '注文獲得ポイント', None, None, '2026-10-15', '2025-10-15 18:00:00+09')
pt(2, B_SUMI, -100, 100, 'normal', 'ポイント利用', None, None, None, '2025-12-20 13:00:00+09')
pt(2, B_SUMI, 95, 195, 'normal', '注文獲得ポイント', None, None, '2027-01-10', '2026-01-10 19:00:00+09')
pt(2, B_SUMI, 29, 224, 'normal', '注文獲得ポイント', 'a0000000-0000-0000-0000-000000000026', None, '2027-03-11', '2026-03-11 12:00:00+09')
pt(2, B_SUMI, 38, 262, 'normal', '注文獲得ポイント', 'a0000000-0000-0000-0000-000000000016', None, '2027-03-11', '2026-03-11 13:30:00+09')
pt(2, B_SUMI, 34, 296, 'normal', '注文獲得ポイント', 'a0000000-0000-0000-0000-000000000011', None, '2027-03-11', '2026-03-11 15:00:00+09')
pt(2, B_SUMI, 84, 380, 'review', '口コミ投稿ポイント', None, None, '2027-03-15', '2026-03-15 10:00:00+09')

# ── 鈴木一郎 (炭火亭, Bronze → 85) ──
pt(3, B_SUMI, 55, 55, 'normal', '注文獲得ポイント', None, None, '2027-02-01', '2026-02-01 12:00:00+09')
pt(3, B_SUMI, 8, 63, 'normal', '注文獲得ポイント', 'a0000000-0000-0000-0000-000000000024', None, '2027-03-11', '2026-03-11 11:00:00+09')
pt(3, B_SUMI, 6, 69, 'normal', '注文獲得ポイント', 'a0000000-0000-0000-0000-000000000019', None, '2027-03-11', '2026-03-11 16:00:00+09')
pt(3, B_SUMI, 16, 85, 'normal', '新規会員登録ボーナス', None, None, '2027-02-01', '2026-02-01 12:00:00+09')

# ── 高橋美咲 (焼肉キング, 2%base, Silver1.5x → 520) ──
pt(4, B_YAKI, 130, 130, 'normal', '注文獲得ポイント', None, None, '2026-07-10', '2025-07-10 19:00:00+09')
pt(4, B_YAKI, 180, 310, 'normal', '注文獲得ポイント', None, None, '2026-09-20', '2025-09-20 20:00:00+09')
pt(4, B_YAKI, -100, 210, 'normal', 'ポイント利用', None, None, None, '2025-11-05 12:30:00+09')
pt(4, B_YAKI, 46, 256, 'normal', '注文獲得ポイント', 'a002a926-3d30-460d-a294-64cc662f3d56', None, '2027-01-23', '2026-01-23 10:10:00+09')
pt(4, B_YAKI, 119, 375, 'normal', '注文獲得ポイント', '10bdbe7f-6c08-4343-a79b-aabf9ba71281', None, '2027-02-15', '2026-02-15 12:00:00+09')
pt(4, B_YAKI, 72, 447, 'normal', '注文獲得ポイント', 'f87f1983-a8a1-4856-a840-75d180cf3b45', None, '2027-02-26', '2026-02-26 18:00:00+09')
pt(4, B_YAKI, 73, 520, 'review', '口コミ投稿ポイント', None, None, '2027-03-01', '2026-03-01 10:00:00+09')

# ── 伊藤健太 (焼肉キング, Bronze → 140) ──
pt(5, B_YAKI, 58, 58, 'normal', '注文獲得ポイント', '6722851f-21a6-4be9-950a-34c54af190ed', None, '2027-02-08', '2026-02-08 19:30:00+09')
pt(5, B_YAKI, 22, 80, 'normal', '注文獲得ポイント', '38d0f035-5560-4603-a8e2-a73b6239d4d8', None, '2027-02-21', '2026-02-21 12:00:00+09')
pt(5, B_YAKI, 60, 140, 'normal', '新規会員登録ボーナス', None, None, '2027-02-08', '2026-02-08 19:00:00+09')

# ── 渡辺優子 (焼肉キング, Gold2x → 2800) ──
pt(6, B_YAKI, 400, 400, 'normal', '注文獲得ポイント', None, None, '2026-05-01', '2025-05-01 19:00:00+09')
pt(6, B_YAKI, 550, 950, 'normal', '注文獲得ポイント', None, None, '2026-07-15', '2025-07-15 20:00:00+09')
pt(6, B_YAKI, -300, 650, 'normal', 'ポイント利用', None, None, None, '2025-08-20 12:00:00+09')
pt(6, B_YAKI, 480, 1130, 'normal', '注文獲得ポイント', None, None, '2026-10-10', '2025-10-10 18:30:00+09')
pt(6, B_YAKI, 300, 1430, 'aiden_compensation', '注文商品の品質問題に対する補償', None, '運営担当：佐々木', '2026-11-15', '2025-11-15 11:00:00+09')
pt(6, B_YAKI, 184, 1614, 'normal', '注文獲得ポイント', '3ea92162-ab9c-48e7-999c-56d45b58ff5a', None, '2027-01-03', '2026-01-03 10:41:00+09')
pt(6, B_YAKI, 192, 1806, 'normal', '注文獲得ポイント', 'db02fd12-9ed6-4ae8-b134-86b9fd9f0862', None, '2027-01-11', '2026-01-11 21:20:00+09')
pt(6, B_YAKI, 596, 2402, 'normal', '注文獲得ポイント', '2f70eccf-bb5d-48d4-8052-ef33d9ed4483', None, '2027-01-25', '2026-01-25 12:27:00+09')
pt(6, B_YAKI, -500, 1902, 'normal', 'ポイント利用', None, None, None, '2026-02-10 13:00:00+09')
pt(6, B_YAKI, 478, 2380, 'normal', '注文獲得ポイント', 'e92b2f8b-21cb-4366-ba5b-7826974f7ea8', None, '2027-02-16', '2026-02-16 12:00:00+09')
pt(6, B_YAKI, 420, 2800, 'normal', '注文獲得ポイント', 'ebcfdffd-a3c2-4076-b975-991eb66e7728', None, '2027-03-16', '2026-03-16 18:00:00+09')

# ── 山本大輝 (韓国キッチン, 3%base, Silver1.5x → 890) ──
pt(7, B_KORE, 150, 150, 'normal', '注文獲得ポイント', None, None, '2026-04-20', '2025-10-20 19:00:00+09')
pt(7, B_KORE, 200, 350, 'normal', '注文獲得ポイント', None, None, '2026-06-15', '2025-12-15 20:30:00+09')
pt(7, B_KORE, -150, 200, 'normal', 'ポイント利用', None, None, None, '2026-01-05 12:00:00+09')
pt(7, B_KORE, 88, 288, 'normal', '注文獲得ポイント', '47908090-027a-4355-89c4-23b625b52fd4', None, '2026-07-18', '2026-01-18 21:46:00+09')
pt(7, B_KORE, 185, 473, 'normal', '注文獲得ポイント', '5d28a05f-a242-4f3e-98a3-2a33d16d9440', None, '2026-08-15', '2026-02-15 12:00:00+09')
pt(7, B_KORE, 172, 645, 'normal', '注文獲得ポイント', '9f824ec7-1460-4c24-aec2-0ed696e02591', None, '2026-08-21', '2026-02-21 18:00:00+09')
pt(7, B_KORE, 171, 816, 'normal', '注文獲得ポイント', 'a014cb02-5079-45e6-aa69-821544e79476', None, '2026-08-26', '2026-02-26 19:00:00+09')
pt(7, B_KORE, 74, 890, 'normal', '注文獲得ポイント', '4c8a1390-093c-4da2-8712-9651904621b0', None, '2026-09-13', '2026-03-13 12:00:00+09')

# ── 中村さくら (韓国キッチン, Bronze → 210) ──
pt(8, B_KORE, 44, 44, 'normal', '注文獲得ポイント', '843071f0-c9d6-4462-816d-d464af923ccb', None, '2026-08-11', '2026-02-11 18:00:00+09')
pt(8, B_KORE, 76, 120, 'normal', '注文獲得ポイント', '9c385de2-9f24-4ec0-ae49-dcee71942949', None, '2026-08-20', '2026-02-20 19:30:00+09')
pt(8, B_KORE, 58, 178, 'normal', '注文獲得ポイント', 'c4bf62dc-ff01-4f26-a57e-3bad5b9ad198', None, '2026-09-16', '2026-03-16 12:00:00+09')
pt(8, B_KORE, 32, 210, 'normal', '新規会員登録ボーナス', None, None, '2026-08-11', '2026-02-11 17:50:00+09')

# ── 小林翔太 (麺匠, 5%base, Gold2x → 3500) ──
pt(9, B_MEN, 600, 600, 'normal', '注文獲得ポイント', None, None, '2026-04-01', '2025-04-01 12:00:00+09')
pt(9, B_MEN, 800, 1400, 'normal', '注文獲得ポイント', None, None, '2026-06-20', '2025-06-20 19:00:00+09')
pt(9, B_MEN, -500, 900, 'normal', 'ポイント利用', None, None, None, '2025-08-01 12:00:00+09')
pt(9, B_MEN, 700, 1600, 'normal', '注文獲得ポイント', None, None, '2026-10-15', '2025-10-15 18:00:00+09')
pt(9, B_MEN, 250, 1850, 'aiden_compensation', '注文の欠品に対する補償ポイント', None, '運営担当：田口', '2026-12-20', '2025-12-20 10:00:00+09')
pt(9, B_MEN, 76, 1926, 'normal', '注文獲得ポイント', 'edae2069-d449-4cb5-b75c-8175f6f4d0e8', None, '2026-07-01', '2026-01-01 14:24:00+09')
pt(9, B_MEN, 155, 2081, 'normal', '注文獲得ポイント', '0b70266a-7020-4c9e-bc46-313c9624fc64', None, '2026-07-17', '2026-01-17 17:33:00+09')
pt(9, B_MEN, 176, 2257, 'normal', '注文獲得ポイント', '63fc3ba7-c743-4832-8b98-4ae15ba04ed6', None, '2026-08-19', '2026-02-19 12:00:00+09')
pt(9, B_MEN, -400, 1857, 'normal', 'ポイント利用', None, None, None, '2026-02-20 12:00:00+09')
pt(9, B_MEN, 186, 2043, 'normal', '注文獲得ポイント', '932d7615-919e-4e6c-a046-30790c244f38', None, '2026-08-23', '2026-02-23 18:00:00+09')
pt(9, B_MEN, 284, 2327, 'normal', '注文獲得ポイント', '3baae62f-6177-4774-9228-3f2a72b87b68', None, '2026-09-17', '2026-03-17 12:00:00+09')
pt(9, B_MEN, 1173, 3500, 'normal', '来店回数ボーナス（累計50回達成）', None, None, '2026-09-17', '2026-03-17 12:10:00+09')

# ── 加藤あかり (麺匠, Bronze → 350) ──
pt(10, B_MEN, 123, 123, 'normal', '注文獲得ポイント', 'af960d79-a882-4411-b536-7a988047b7aa', None, '2026-07-11', '2026-01-11 12:46:00+09')
pt(10, B_MEN, 88, 211, 'normal', '注文獲得ポイント', '285a211a-662b-4bbf-abbd-39528f2b944e', None, '2026-08-03', '2026-02-03 12:00:00+09')
pt(10, B_MEN, 139, 350, 'normal', '新規会員登録ボーナス', None, None, '2026-07-11', '2026-01-11 12:40:00+09')

# ── 吉田陽介 (おにぎり本舗, 4%base, Silver1.5x → 620) ──
pt(11, B_ONI, 100, 100, 'normal', '注文獲得ポイント', None, None, '2026-08-01', '2025-08-01 12:00:00+09')
pt(11, B_ONI, 140, 240, 'normal', '注文獲得ポイント', None, None, '2026-10-20', '2025-10-20 18:00:00+09')
pt(11, B_ONI, -80, 160, 'normal', 'ポイント利用', None, None, None, '2025-12-15 12:00:00+09')
pt(11, B_ONI, 79, 239, 'normal', '注文獲得ポイント', 'be639a9c-8fe4-47c6-bbbe-ca9c69a45250', None, '2027-01-10', '2026-01-10 21:09:00+09')
pt(11, B_ONI, 62, 301, 'normal', '注文獲得ポイント', '91cea406-6e4a-4056-97b1-a63c197ced5f', None, '2027-01-22', '2026-01-22 20:55:00+09')
pt(11, B_ONI, 97, 398, 'normal', '注文獲得ポイント', 'c14b51a0-2ff1-42d3-87e0-aab473a50776', None, '2027-01-25', '2026-01-25 12:49:00+09')
pt(11, B_ONI, 78, 476, 'normal', '注文獲得ポイント', '3f6ba4b2-a36f-40ca-b0d8-9457b64b1cbc', None, '2027-02-13', '2026-02-13 18:00:00+09')
pt(11, B_ONI, 59, 535, 'normal', '注文獲得ポイント', '329ccb39-3e4f-4db4-b080-be68905bbe41', None, '2027-03-11', '2026-03-11 12:00:00+09')
pt(11, B_ONI, 85, 620, 'review', '口コミ投稿ポイント', None, None, '2027-03-15', '2026-03-15 10:00:00+09')

# ── 松本ゆい (おにぎり本舗, Bronze → 120) ──
pt(12, B_ONI, 26, 26, 'normal', '注文獲得ポイント', 'd4e0af86-bf6d-4100-b963-d047f879eaeb', None, '2027-01-18', '2026-01-18 13:48:00+09')
pt(12, B_ONI, 14, 40, 'normal', '注文獲得ポイント', '854a4745-7bb7-4e93-9350-bb0a05a634a8', None, '2027-02-10', '2026-02-10 12:00:00+09')
pt(12, B_ONI, 32, 72, 'normal', '注文獲得ポイント', 'a1bf2122-0898-4dfb-940f-c251f2778981', None, '2027-03-08', '2026-03-08 18:00:00+09')
pt(12, B_ONI, 48, 120, 'normal', '新規会員登録ボーナス', None, None, '2027-01-18', '2026-01-18 13:40:00+09')

sql_pt = f"""
INSERT INTO point_transactions (member_id, brand_id, amount, balance_after, source, reason, order_id, granted_by, expires_at, created_at) VALUES
{(',' + NL).join(pt_rows)};
"""

# ===== EXECUTE =====
print("=== POCデモ会員データ投入 ===\n")

ok = True
ok = run_sql("1. rank_settings (15行)", sql_rank) and ok
# point_settings already inserted in previous run
# ok = run_sql("2. point_settings (5行)", sql_point) and ok
ok = run_sql("3. members (12行)", sql_members) and ok
ok = run_sql("4. orders UPDATE (53注文→member_id紐づけ)", sql_orders) and ok
ok = run_sql("5. point_transactions (72行)", sql_pt) and ok

if ok:
    print("\n✅ 全ステップ完了")
else:
    print("\n⚠️  一部エラーあり。上のログを確認してください。")
    sys.exit(1)
