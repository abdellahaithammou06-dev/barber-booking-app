# Barber Booking

Application de réservation de salons de coiffure pour hommes. Les clients recherchent un salon, consultent ses prestations et réservent un créneau. Les barbiers gèrent leur établissement et leurs rendez-vous. Les administrateurs gèrent les comptes et les avis.

## Prérequis

- Node.js 18 ou plus récent
- MySQL 8 ou compatible

## Installation

1. Créez une base de données MySQL vide.
2. Importez `schema.sql` dans cette base. Le schéma ajoute aussi les prestations proposées dans le catalogue. Ce fichier initialise une base neuve; il ne migre pas une ancienne base.
3. Copiez `.env.example` vers `.env` et renseignez les paramètres MySQL et deux secrets JWT indépendants.
4. Installez les dépendances avec `npm install`.
5. Lancez l'application avec `npm run dev`, puis ouvrez `http://localhost:3000`.

L'application s'arrête au démarrage si la base ou les secrets ne sont pas configurés. Ne publiez jamais le fichier `.env`.

Pour une base existante issue de l'ancien schéma, sauvegardez-la puis lancez une seule fois `mysql -u <utilisateur> -p <nom_de_base> < migrations/001_catalogue_prestations.sql`. Les anciennes prestations sont conservées dans `services_legacy` et recopiées dans le nouveau catalogue.

## Comptes et rôles

L'inscription publique permet de créer un compte client ou barbier. Après connexion, un barbier complète son profil de salon et ajoute ses prestations depuis **Espace barbier**. Les comptes administrateur ne peuvent pas être créés depuis le formulaire public; définissez le rôle `admin` directement dans la base pour le compte concerné.

Les clients peuvent annuler une réservation au moins deux heures avant le rendez-vous. Le délai peut être modifié avec `APPOINTMENT_CANCELLATION_MIN_HOURS`. Seuls les rendez-vous terminés peuvent recevoir un avis.

## Configuration

| Variable | Description |
| --- | --- |
| `PORT` | Port HTTP (3000 par défaut) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Connexion MySQL |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Secrets JWT distincts |
| `JWT_ACCESS_EXPIRES_IN` | Durée du jeton d'accès (15 minutes par défaut) |
| `JWT_REFRESH_EXPIRES_IN` | Durée du jeton de renouvellement (7 jours par défaut) |
| `APPOINTMENT_CANCELLATION_MIN_HOURS` | Délai minimal d'annulation client (2 heures par défaut) |

## API

Les pages sont servies depuis `public/`. L'API expose les routes `/auth`, `/barbers`, `/appointments`, `/reviews` et `/admin`. `GET /api/health` vérifie la disponibilité HTTP sans interroger la base.
