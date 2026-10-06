-- Associe chaque rappel à un rendez-vous pour éviter les envois en double.
ALTER TABLE notifications
  MODIFY COLUMN status ENUM('pending', 'sending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  ADD COLUMN appointment_id INT NULL AFTER user_id,
  ADD CONSTRAINT fk_notifications_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  ADD UNIQUE INDEX uq_notifications_appointment_type (appointment_id, type);
