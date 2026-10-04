-- Enregistre le numéro WhatsApp et le consentement pour chaque réservation.
ALTER TABLE appointments
  ADD COLUMN client_phone VARCHAR(16) NULL AFTER time,
  ADD COLUMN whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE AFTER client_phone;

-- Permet de conserver l'historique des anciens rappels par e-mail et de suivre WhatsApp séparément.
ALTER TABLE notifications
  MODIFY COLUMN channel ENUM('email', 'sms', 'whatsapp') NOT NULL DEFAULT 'whatsapp',
  ADD UNIQUE INDEX uq_notifications_appointment_type_channel (appointment_id, type, channel);

ALTER TABLE notifications
  DROP INDEX uq_notifications_appointment_type;
