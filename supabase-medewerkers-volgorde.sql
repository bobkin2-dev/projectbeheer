-- Verwijder/deactiveer Milan
UPDATE medewerkers SET actief = false WHERE naam = 'Milan';

-- Voeg Guy toe als die nog niet bestaat
INSERT INTO medewerkers (naam, actief, uren_per_dag, is_flex, volgorde)
SELECT 'Guy', true, 8, true, 6
WHERE NOT EXISTS (SELECT 1 FROM medewerkers WHERE naam = 'Guy');

-- Stel volgorde en vast/flex in voor iedereen
UPDATE medewerkers SET volgorde = 1, is_flex = false WHERE naam = 'Pavel';
UPDATE medewerkers SET volgorde = 2, is_flex = false WHERE naam = 'Ruben';
UPDATE medewerkers SET volgorde = 3, is_flex = false WHERE naam = 'Jos';
UPDATE medewerkers SET volgorde = 4, is_flex = false WHERE naam = 'Niels';
UPDATE medewerkers SET volgorde = 5, is_flex = false WHERE naam = 'Jurgen';
UPDATE medewerkers SET volgorde = 6, is_flex = true WHERE naam = 'Guy';
UPDATE medewerkers SET volgorde = 7, is_flex = true WHERE naam = 'Dinko';
UPDATE medewerkers SET volgorde = 8, is_flex = true WHERE naam = 'Kurt';
