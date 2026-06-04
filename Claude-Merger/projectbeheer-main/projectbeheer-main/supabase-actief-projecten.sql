-- Voeg 'actief' kolom toe aan projecten (default true)
ALTER TABLE projecten ADD COLUMN IF NOT EXISTS actief boolean DEFAULT true;

-- Zet projecten op non-actief als de laatste uren_registratie voor 2026-04-01 is
-- OF als er helemaal geen uren_registratie bestaat
UPDATE projecten
SET actief = false
WHERE id NOT IN (
  SELECT DISTINCT project_id
  FROM uren_registratie
  WHERE datum >= '2026-04-01'
    AND project_id IS NOT NULL
);
