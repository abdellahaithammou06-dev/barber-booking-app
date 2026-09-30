-- Upgrade an existing database created from the original schema.sql.
-- Existing service rows are copied and old service rows remain in services_legacy.
-- Run once, while the application is stopped and after making a database backup.

RENAME TABLE services TO services_legacy;

CREATE TABLE services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT
);

INSERT INTO services (name, description)
SELECT name, MIN(description)
FROM services_legacy
GROUP BY name;

INSERT INTO services (name, description) VALUES
  ('Coupe classique', 'Coupe et finition soignée.'),
  ('Dégradé', 'Dégradé personnalisé avec contours nets.'),
  ('Taille de barbe', 'Taille, contours et soin de la barbe.'),
  ('Coupe et barbe', 'Coupe de cheveux et taille de barbe.'),
  ('Rasage traditionnel', 'Rasage au coupe-chou avec serviette chaude.')
ON DUPLICATE KEY UPDATE description = VALUES(description);

CREATE TABLE barber_services (
  barber_id INT NOT NULL,
  service_id INT NOT NULL,
  price DECIMAL(8, 2) NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  PRIMARY KEY (barber_id, service_id),
  KEY idx_barber_services_service (service_id),
  CONSTRAINT fk_barber_services_barber FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE,
  CONSTRAINT fk_barber_services_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TEMPORARY TABLE service_migration_map AS
SELECT old.id AS old_service_id, old.barber_id, current.id AS service_id,
       old.price, old.duration
FROM services_legacy old
JOIN services current ON current.name = old.name;

INSERT INTO barber_services (barber_id, service_id, price, duration_minutes)
SELECT barber_id, service_id, MAX(price), MAX(duration)
FROM service_migration_map
GROUP BY barber_id, service_id;

ALTER TABLE appointments
  ADD COLUMN price_at_booking DECIMAL(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN duration_minutes INT NOT NULL DEFAULT 30;

ALTER TABLE appointments DROP FOREIGN KEY appointments_ibfk_3;

UPDATE appointments appointment
JOIN service_migration_map mapped
  ON mapped.old_service_id = appointment.service_id
 AND mapped.barber_id = appointment.barber_id
SET appointment.service_id = mapped.service_id,
    appointment.price_at_booking = mapped.price,
    appointment.duration_minutes = mapped.duration;

ALTER TABLE appointments
  ADD CONSTRAINT fk_appointments_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;

DROP TEMPORARY TABLE service_migration_map;
