-- =========================================
-- Schéma de base de données — Barber Booking App
-- =========================================

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  google_sub VARCHAR(255) NULL,
  role ENUM('client', 'barber', 'admin') NOT NULL DEFAULT 'client',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_google_sub (google_sub)
);

CREATE TABLE barbers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  shop_name VARCHAR(150) NOT NULL,
  address VARCHAR(255),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  description TEXT,
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE barber_photos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  barber_id INT NOT NULL,
  url VARCHAR(255) NOT NULL,
  is_cover BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
);

CREATE TABLE services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT
);

INSERT INTO services (name, description) VALUES
  ('Coupe classique', 'Coupe et finition soignée.'),
  ('Dégradé', 'Dégradé personnalisé avec contours nets.'),
  ('Taille de barbe', 'Taille, contours et soin de la barbe.'),
  ('Coupe et barbe', 'Coupe de cheveux et taille de barbe.'),
  ('Rasage traditionnel', 'Rasage au coupe-chou avec serviette chaude.')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Une prestation est un catalogue partagé. Le tarif et la durée dépendent du barbier.
CREATE TABLE barber_services (
  barber_id INT NOT NULL,
  service_id INT NOT NULL,
  price DECIMAL(8, 2) NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  PRIMARY KEY (barber_id, service_id),
  FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE working_hours (
  id INT AUTO_INCREMENT PRIMARY KEY,
  barber_id INT NOT NULL,
  day_of_week TINYINT NOT NULL COMMENT '0=dimanche ... 6=samedi',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
);

CREATE TABLE time_off (
  id INT AUTO_INCREMENT PRIMARY KEY,
  barber_id INT NOT NULL,
  date DATE NOT NULL,
  reason VARCHAR(255),
  is_full_day BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
);

CREATE TABLE appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  barber_id INT NOT NULL,
  service_id INT NOT NULL,
  price_at_booking DECIMAL(8, 2) NOT NULL,
  duration_minutes INT NOT NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  client_phone VARCHAR(16) NULL,
  whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM(
    'pending', 'confirmed', 'cancelled_by_client',
    'cancelled_by_barber', 'completed', 'no_show'
  ) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  barber_id INT NOT NULL,
  appointment_id INT,
  rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  barber_reply TEXT,
  is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX uq_reviews_appointment ON reviews (appointment_id);

CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  appointment_id INT NULL,
  type ENUM('confirmation', 'reminder', 'cancellation') NOT NULL,
  channel ENUM('email', 'sms', 'whatsapp') NOT NULL DEFAULT 'whatsapp',
  sent_at TIMESTAMP NULL,
  status ENUM('pending', 'sending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  UNIQUE KEY uq_notifications_appointment_type_channel (appointment_id, type, channel)
);

-- Index utiles pour les recherches fréquentes
CREATE INDEX idx_barbers_location ON barbers (latitude, longitude);
CREATE INDEX idx_appointments_barber_date ON appointments (barber_id, date);
CREATE INDEX idx_appointments_client ON appointments (client_id);
CREATE INDEX idx_reviews_barber ON reviews (barber_id);
CREATE INDEX idx_barber_services_service ON barber_services (service_id);
