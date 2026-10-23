ALTER TABLE app_users ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ponds ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE app_users SET is_demo = TRUE WHERE email IN ('citizen@judges.invalid', 'officer@judges.invalid', 'worker@judges.invalid');
UPDATE ponds SET is_demo = TRUE WHERE name LIKE '[JUDGES DEMO]%' AND ward = 'Demo Ward';
ALTER TABLE ponds DROP INDEX uq_pond_name_ward;
ALTER TABLE ponds ADD CONSTRAINT uq_pond_name_ward UNIQUE (name, ward, is_demo);
ALTER TABLE ponds MODIFY COLUMN latitude DECIMAL(10,7) NULL;
ALTER TABLE ponds MODIFY COLUMN longitude DECIMAL(10,7) NULL;
CREATE INDEX idx_ponds_scope ON ponds (is_demo, active);
ALTER TABLE problems MODIFY COLUMN latitude DECIMAL(10,7) NULL;
ALTER TABLE problems MODIFY COLUMN longitude DECIMAL(10,7) NULL;

-- Preserve any older genuine reports that had been attached to seeded sample ponds.
-- Their actual location is unknown: never carry sample coordinates/photos into real data.
INSERT INTO ponds (name, ward, description, active, created_at, is_demo)
SELECT CONCAT(REPLACE(d.name, '[JUDGES DEMO] ', ''), ' (location to confirm)'),
       'Location to confirm', 'Earlier citizen report linked to a sample pond. Confirm the actual pond name and location.',
       TRUE, d.created_at, FALSE
FROM ponds d WHERE d.is_demo = TRUE AND EXISTS (
    SELECT 1 FROM problems p JOIN app_users u ON u.id = p.reporter_id
    WHERE p.pond_id = d.id AND u.is_demo = FALSE
);
UPDATE problems SET pond_id = (
    SELECT real_pond.id FROM ponds real_pond
    WHERE real_pond.is_demo = FALSE AND real_pond.ward = 'Location to confirm'
      AND real_pond.name = (SELECT CONCAT(REPLACE(old_pond.name, '[JUDGES DEMO] ', ''), ' (location to confirm)')
                           FROM ponds old_pond WHERE old_pond.id = problems.pond_id)
), latitude = NULL, longitude = NULL
WHERE reporter_id IN (SELECT id FROM app_users WHERE is_demo = FALSE)
  AND pond_id IN (SELECT id FROM ponds WHERE is_demo = TRUE);
