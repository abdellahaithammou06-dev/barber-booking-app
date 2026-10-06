-- Les couvertures sont des images WebP compressées et stockées comme data URL.
ALTER TABLE barber_photos MODIFY COLUMN url LONGTEXT NOT NULL;
