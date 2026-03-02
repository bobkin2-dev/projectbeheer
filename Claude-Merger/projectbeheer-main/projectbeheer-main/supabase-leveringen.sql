-- =====================================================
-- LEVERINGEN / TRANSPORT REGISTRATIE
-- VOER DIT UIT IN SUPABASE SQL EDITOR
-- =====================================================

-- Leveringen tabel: transport tracking voor chauffeurs
CREATE TABLE leveringen (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chauffeur TEXT NOT NULL,
  datum DATE NOT NULL,
  bestemming TEXT NOT NULL CHECK (bestemming IN ('werf', 'tongeren')),
  project_id UUID REFERENCES projecten(id),
  werf_naam TEXT,
  tijd_start_rijden TIME,
  tijd_stop_rijden TIME,
  tijd_klaar_lossen TIME,
  notitie TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS policies
ALTER TABLE leveringen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for leveringen" ON leveringen FOR ALL USING (true);
