-- =====================================================
-- HUB-UITBREIDING FASE 1 (2026-08-01) — 100% ADDITIEF
-- Voer uit in Supabase SQL Editor. Geen bestaande data wordt gewijzigd.
-- =====================================================

-- 1. Begrote uren gesplitst per type (begrote_uren blijft bestaan als totaal/legacy)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS uren_tekenwerk_begroot NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS uren_productie_begroot NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS uren_plaatsing_begroot NUMERIC DEFAULT 0;

-- 2. Prijs & facturatie per order (prijzen excl. btw)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS prijs NUMERIC;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gefactureerd_pct NUMERIC DEFAULT 0
  CHECK (gefactureerd_pct >= 0 AND gefactureerd_pct <= 100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gefactureerd_bedrag NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS facturatie_notitie TEXT;

-- 3. Urenregistratie: tekenwerk + plaatsen als type_werk
ALTER TABLE uren_registratie DROP CONSTRAINT IF EXISTS uren_registratie_type_werk_check;
ALTER TABLE uren_registratie ADD CONSTRAINT uren_registratie_type_werk_check
  CHECK (type_werk IN ('onderdelen','monteren','inpakken','lakwerk','metaalwerk','tekenwerk','plaatsen','overig'));

-- 4. Status-historiek (audit: wie zette wanneer welke status)
CREATE TABLE IF NOT EXISTS status_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  veld TEXT NOT NULL,
  oude_waarde TEXT,
  nieuwe_waarde TEXT,
  gewijzigd_door TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_status_history_order ON status_history(order_id);
ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "status_history_all" ON status_history;
CREATE POLICY "status_history_all" ON status_history FOR ALL USING (true) WITH CHECK (true);

-- Controle
SELECT column_name FROM information_schema.columns
WHERE table_name='orders' AND column_name IN
('uren_tekenwerk_begroot','uren_productie_begroot','uren_plaatsing_begroot','prijs','gefactureerd_pct','gefactureerd_bedrag');
