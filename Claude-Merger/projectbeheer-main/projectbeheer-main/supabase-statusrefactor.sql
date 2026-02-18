-- =====================================================
-- STATUS REFACTOR - Nieuw statussysteem voor orders
-- VOER DIT UIT IN SUPABASE SQL EDITOR
-- =====================================================

-- Nieuwe kolommen voor het vernieuwde statussysteem
-- Hoofdstatus (lineair): prijsvraag → geteld → offerte_verstuurd → goedgekeurd → in_productie → kwaliteitscontrole → klaar_voor_plaatsing → in_plaatsing → geplaatst → opgeleverd
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'prijsvraag';

-- Parallelle tracks (onafhankelijke checkboxes)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tekening_klaar BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tekening_goedgekeurd BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS materiaal_besteld BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS materiaal_binnen BOOLEAN DEFAULT false;

-- Extra velden
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_meerwerk BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS begrote_uren NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notitie TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS goedkeuring_datum DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS plaatsing_datum DATE;

-- Type werk uitbreiden met lakwerk en metaalwerk
-- (type_werk in uren_registratie: drop old constraint, add new)
ALTER TABLE uren_registratie DROP CONSTRAINT IF EXISTS uren_registratie_type_werk_check;
ALTER TABLE uren_registratie ADD CONSTRAINT uren_registratie_type_werk_check
  CHECK (type_werk IN ('onderdelen', 'monteren', 'inpakken', 'lakwerk', 'metaalwerk', 'overig'));
