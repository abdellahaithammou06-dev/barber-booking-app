# Exploitation de Barber Booking

## Avant d'activer la vérification des e-mails

Dans Railway, configurez `RESEND_API_KEY`, `CONTACT_FROM_EMAIL` avec un expéditeur dont le domaine est validé chez Resend, et `PUBLIC_APP_URL` avec le domaine HTTPS de production. Testez l'inscription, le renvoi du lien, la vérification et la réinitialisation du mot de passe. Activez ensuite `REQUIRE_EMAIL_VERIFICATION=true`. Cette option est désactivée par défaut afin de ne pas bloquer les nouvelles inscriptions tant que l'expéditeur n'est pas validé.

Les anciens comptes sont considérés comme vérifiés par la migration. Les nouvelles fiches barbier sont en attente jusqu'à ce qu'un administrateur les approuve. Pour créer un premier administrateur, identifiez le compte voulu puis exécutez dans MySQL `UPDATE users SET role = 'admin' WHERE email = 'adresse-du-proprietaire';`. Ne laissez pas un compte de test avec ce rôle.

## Sauvegardes et restauration

Activez une sauvegarde quotidienne dans Railway, dans le service MySQL concerné, sous **Settings > Backups**. Conservez une copie exportée séparément pour les restaurations importantes. Une sauvegarde doit être vérifiée par une restauration sur une base de test avant toute urgence.

`npm run db:backup` crée un fichier compressé dans `backups/` (dossier ignoré par Git). Le programme requiert `mysqldump` installé et les variables `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` et `DB_PASSWORD`.

Pour valider une sauvegarde sans toucher à la production, créez d'abord une base temporaire vide, puis définissez `BACKUP_FILE` et `RESTORE_DB_NAME` vers cette base. `npm run db:restore:verify` refuse le mode production et refuse de restaurer dans la base source configurée.

## Disponibilité et charge

Railway utilise `GET /api/ready` comme contrôle de disponibilité. Il répond indisponible si MySQL ne peut pas répondre. Les métriques Railway permettent de suivre CPU, mémoire, redémarrages, requêtes HTTP et erreurs 5xx; ajoutez un contrôle externe périodique sur `/api/ready` pour recevoir une alerte si le domaine devient inaccessible.

Après une mise en production, `LOAD_TEST_URL=https://votre-domaine npm run load:smoke` effectue des requêtes GET sans modifier les réservations. Le script plafonne volontairement la charge et exige une autorisation explicite pour une cible de production. Ce contrôle rapide ne remplace pas un test de charge progressif avec un jeu de données de préproduction.

## Paiement

Le parcours indique que le paiement est effectué au salon. Aucun paiement en ligne ni donnée de carte n'est collecté par l'application.
