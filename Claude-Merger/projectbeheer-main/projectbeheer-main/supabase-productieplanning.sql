-- =====================================================
-- PRODUCTIEPLANNING - Database migratie
-- =====================================================

-- 1. Planning blokken (kern van de planning)
CREATE TABLE IF NOT EXISTS planning_blokken (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  medewerker_id UUID REFERENCES medewerkers(id) NOT NULL,
  datum DATE NOT NULL,
  uren NUMERIC NOT NULL DEFAULT 8,
  is_marge BOOLEAN DEFAULT false,
  is_spoed BOOLEAN DEFAULT false,
  notitie TEXT,
  volgorde INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planning_datum ON planning_blokken(datum);
CREATE INDEX IF NOT EXISTS idx_planning_medewerker ON planning_blokken(medewerker_id, datum);
CREATE INDEX IF NOT EXISTS idx_planning_order ON planning_blokken(order_id);

-- RLS
ALTER TABLE planning_blokken ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planning_blokken_all" ON planning_blokken FOR ALL USING (true) WITH CHECK (true);

-- 2. Planning instellingen
CREATE TABLE IF NOT EXISTS planning_instellingen (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL
);

ALTER TABLE planning_instellingen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planning_instellingen_all" ON planning_instellingen FOR ALL USING (true) WITH CHECK (true);

INSERT INTO planning_instellingen (key, value) VALUES
  ('marge_strategie', 'per_week'),
  ('marge_waarde', '1'),
  ('weekend_zaterdag', 'true'),
  ('capaciteit_waarschuwing', '80')
ON CONFLICT (key) DO NOTHING;

-- 3. Nieuwe kolommen op orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_spoed BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS planning_start DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS planning_eind DATE;

-- 4. Nieuwe kolommen op medewerkers
ALTER TABLE medewerkers ADD COLUMN IF NOT EXISTS uren_per_dag NUMERIC DEFAULT 8;
ALTER TABLE medewerkers ADD COLUMN IF NOT EXISTS is_flex BOOLEAN DEFAULT false;
ALTER TABLE medewerkers ADD COLUMN IF NOT EXISTS volgorde INTEGER DEFAULT 0;
