BEGIN;
ALTER TABLE rental_addons ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'equipment';
ALTER TABLE rental_addons ADD COLUMN IF NOT EXISTS insurance_kind text;
UPDATE rental_addons SET category = 'winter_tires'
WHERE lower(trim(name)) IN ('winter tires', 'winter tyres', 'snow tires', 'snow tyres', 'winter tire', 'winter tyre')
   OR name_ja IN ('冬用タイヤ', 'スタッドレスタイヤ') OR name_zh_tw IN ('冬季輪胎', '雪胎');
UPDATE rental_addons SET category = 'insurance', insurance_kind = 'noc', max_qty = 1 WHERE lower(trim(name)) IN ('noc protection', 'noc');
UPDATE rental_addons SET category = 'insurance', insurance_kind = 'cdw', max_qty = 1 WHERE lower(trim(name)) IN ('cdw', 'cdw protection', 'deductible waiver');
UPDATE rental_addons SET category = 'insurance', insurance_kind = 'full', max_qty = 1 WHERE lower(trim(name)) = 'full protection package';
COMMIT;
