-- Leveranciers tabel
CREATE TABLE IF NOT EXISTS leveranciers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  naam TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS voor leveranciers
ALTER TABLE leveranciers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for leveranciers" ON leveranciers FOR ALL USING (true) WITH CHECK (true);

-- Extra kolommen voor bibliotheek
ALTER TABLE bibliotheek ADD COLUMN IF NOT EXISTS artikelnummer TEXT;
ALTER TABLE bibliotheek ADD COLUMN IF NOT EXISTS omschrijving TEXT;
ALTER TABLE bibliotheek ADD COLUMN IF NOT EXISTS subcategorie TEXT;
ALTER TABLE bibliotheek ADD COLUMN IF NOT EXISTS catalogusprijs DECIMAL(10,2) DEFAULT 0;
ALTER TABLE bibliotheek ADD COLUMN IF NOT EXISTS korting DECIMAL(5,2) DEFAULT 0;

-- Index voor sneller zoeken
CREATE INDEX IF NOT EXISTS idx_bibliotheek_leverancier ON bibliotheek(leverancier);
CREATE INDEX IF NOT EXISTS idx_bibliotheek_subcategorie ON bibliotheek(subcategorie);
CREATE INDEX IF NOT EXISTS idx_bibliotheek_artikelnummer ON bibliotheek(artikelnummer);
