-- Medewerkers tabel
CREATE TABLE medewerkers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  naam TEXT NOT NULL,
  actief BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Initiele medewerkers (huidige hardcoded lijst)
INSERT INTO medewerkers (naam) VALUES
  ('Pavel'), ('Ruben'), ('Jos'), ('Jurgen'), ('Dinko'), ('Niels');

-- Uren registratie tabel
CREATE TABLE uren_registratie (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  medewerker_id UUID REFERENCES medewerkers(id),
  datum DATE NOT NULL,
  order_id UUID REFERENCES orders(id),
  project_id UUID REFERENCES projecten(id),
  type_werk TEXT CHECK (type_werk IN ('onderdelen', 'monteren', 'inpakken', 'overig')),
  uren NUMERIC NOT NULL,
  notitie TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order producten tabel
CREATE TABLE order_producten (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  naam TEXT NOT NULL,
  aantal NUMERIC NOT NULL DEFAULT 1,
  eenheid TEXT DEFAULT 'stuk',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS policies
ALTER TABLE medewerkers ENABLE ROW LEVEL SECURITY;
ALTER TABLE uren_registratie ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_producten ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for medewerkers" ON medewerkers FOR ALL USING (true);
CREATE POLICY "Allow all for uren_registratie" ON uren_registratie FOR ALL USING (true);
CREATE POLICY "Allow all for order_producten" ON order_producten FOR ALL USING (true);
