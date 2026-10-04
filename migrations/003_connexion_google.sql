-- Identifiant stable du compte Google associé au compte Barber Booking.
ALTER TABLE users
  ADD COLUMN google_sub VARCHAR(255) NULL,
  ADD UNIQUE INDEX uq_users_google_sub (google_sub);
