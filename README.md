# Barber Booking

Application de réservation de salons de coiffure pour hommes. Les clients recherchent un salon, consultent ses prestations et réservent un créneau. Les barbiers gèrent leur établissement et leurs rendez-vous. Les administrateurs gèrent les comptes et les avis.

## Prérequis

- Node.js 18 ou plus récent
- MySQL 8 ou compatible

## Installation

1. Créez une base de données MySQL vide.
2. Importez `database/schema.sql` dans cette base. Le schéma ajoute aussi les prestations proposées dans le catalogue. Ce fichier initialise une base neuve; il ne migre pas une ancienne base.
3. Copiez `.env.example` vers `.env` et renseignez les paramètres MySQL et deux secrets JWT indépendants.
4. Installez les dépendances avec `npm install`.
5. Lancez l'application avec `npm run dev`, puis ouvrez `http://localhost:3000`.

L'application s'arrête au démarrage si la base ou les secrets ne sont pas configurés. Ne publiez jamais le fichier `.env`.

## Hébergement en ligne avec Railway

1. Poussez le projet vers GitHub et créez un projet Railway depuis ce dépôt.
2. Ajoutez un service **MySQL** dans le projet Railway.
3. Dans le service de l'application, reliez les variables MySQL du service de base aux variables `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` et `DB_PASSWORD` attendues par l'application.
4. Dans les variables de l'application, ajoutez `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET` avec deux valeurs longues et différentes. Ajoutez les autres variables nécessaires, par exemple `GOOGLE_CLIENT_ID` ou les paramètres WhatsApp, seulement si ces fonctions doivent être activées.
   Pour envoyer les e-mails de compte via Brevo, ajoutez `BREVO_API_KEY` et `MAIL_FROM` (adresse expéditrice vérifiée dans Brevo) aux variables Railway. L'application envoie alors les e-mails via l'API HTTP Brevo. Pour le formulaire Contact, définissez aussi `CONTACT_EMAIL` comme destinataire. Resend reste disponible en solution de repli avec `RESEND_API_KEY` et `CONTACT_FROM_EMAIL`.
5. Le fichier `railway.toml` lance `npm run db:init` avant chaque déploiement. Il crée le schéma d'une base neuve et applique la migration des photos de salon sur une base déjà initialisée.
6. Railway détecte `npm start` dans `package.json`. Déployez l'application, puis activez un domaine public HTTPS dans les réglages réseau du service.
7. Ouvrez le domaine fourni par Railway. Pour WhatsApp, indiquez ensuite `https://<domaine>/webhooks/whatsapp` comme URL de rappel dans Meta et configurez les secrets dans les variables du service.

Gardez une copie de sauvegarde de la base. La commande d'initialisation est destinée à une base vide; si elle détecte un schéma partiel, elle s'arrête et demande une vérification.

Pour une base existante issue de l'ancien schéma, sauvegardez-la puis lancez une seule fois `mysql -u <utilisateur> -p <nom_de_base> < database/migrations/001_catalogue_prestations.sql`. Les anciennes prestations sont conservées dans `services_legacy` et recopiées dans le nouveau catalogue.

Pour une base créée avant l'ajout des rappels, lancez aussi une fois `mysql -u <utilisateur> -p <nom_de_base> < database/migrations/002_rappels_email_rendez_vous.sql`. Une base neuve créée avec `database/schema.sql` inclut déjà ces champs.

Pour une base créée avant l'ajout de la connexion Google, lancez une fois `mysql -u <utilisateur> -p <nom_de_base> < database/migrations/003_connexion_google.sql`.

Pour activer les rappels WhatsApp sur une base existante, appliquez une fois `mysql -u <utilisateur> -p <nom_de_base> < database/migrations/004_rappels_whatsapp.sql`.

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
| `GOOGLE_CLIENT_ID` | Identifiant OAuth de type application Web créé dans Google Cloud |
| `BREVO_API_KEY` | Clé API Brevo; prioritaire pour l'envoi des e-mails via HTTP |
| `MAIL_FROM` | Adresse expéditrice vérifiée dans Brevo, par exemple `noreply@exemple.com` |
| `RESEND_API_KEY` | Clé privée Resend utilisée si Brevo n'est pas configuré |
| `CONTACT_EMAIL` | Adresse qui reçoit les messages Contact (par défaut `abdellahaithammou06@gmail.com`) |
| `CONTACT_FROM_EMAIL` | Adresse expéditrice pour Resend (par défaut l’adresse de test Resend) |
| `APPOINTMENT_CANCELLATION_MIN_HOURS` | Délai minimal d'annulation client (2 heures par défaut) |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Identifiants d'envoi de la WhatsApp Cloud API |
| `WHATSAPP_API_VERSION` | Version Graph API utilisée (v26.0 par défaut) |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Vérification de signature et validation du webhook Meta |
| `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE` | Modèle WhatsApp approuvé et langue (`appointment_reminder`, `fr` par défaut) |
| `APPOINTMENT_REMINDER_MINUTES` | Envoi combien de minutes avant le rendez-vous (60 par défaut, maximum 10080) |

Le serveur vérifie chaque minute les rendez-vous confirmés et envoie un seul rappel WhatsApp par rendez-vous lorsque le client a renseigné son numéro et accepté le rappel. Sans configuration WhatsApp, l'application continue de fonctionner et les rappels restent désactivés. Les anciens rappels e-mail sont conservés dans l'historique mais aucun nouvel e-mail n'est envoyé.

Les conversations sortantes doivent utiliser un modèle approuvé par Meta. Le modèle configuré doit contenir quatre variables dans le corps, dans cet ordre : nom du client, nom du salon, date et heure, prestation. Par exemple : `Bonjour {{1}}, rappel de votre rendez-vous chez {{2}} le {{3}} pour {{4}}. Répondez à ce message si vous avez besoin d'aide.` Le client doit d'abord cocher la case de consentement lors de la réservation. Pour que le chatbot réponde, configurez le webhook public HTTPS `https://<votre-domaine>/webhooks/whatsapp`, renseignez son jeton de vérification et le secret de l'application Meta, puis abonnez le webhook au champ `messages`. Les réponses du bot sont envoyées dans la fenêtre de service ouverte par un message du client; les messages initiés par l'entreprise utilisent le modèle approuvé.

La connexion Google utilise Google Identity Services et vérifie le jeton côté serveur. Créez un identifiant OAuth de type **Application Web** dans Google Cloud, ajoutez l'origine de l'application aux origines JavaScript autorisées (par exemple `http://localhost:3000` en développement), puis renseignez son identifiant dans `GOOGLE_CLIENT_ID`. Les nouvelles inscriptions Google créent des comptes client. Une adresse Google vérifiée peut aussi être liée à un compte existant portant la même adresse.

## API

Les pages sont dans `frontend/public/`, l'API Express dans `backend/src/` et le schéma ainsi que les migrations MySQL dans `database/`. `backend/scripts/` contient l'initialisation de la base. L'API expose les routes `/auth`, `/barbers`, `/appointments`, `/reviews` et `/admin`. `GET /api/health` vérifie la disponibilité HTTP sans interroger la base.
