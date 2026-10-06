const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const { envoyer } = require('../controllers/contactController');
const { valider } = require('../middlewares/validation');

const routeur = express.Router();
const sujets = [
  'Question sur une réservation',
  'Modifier ou annuler un rendez-vous',
  'Problème avec mon compte',
  'Créer ou gérer mon profil barbier',
  'Mes prestations et horaires',
  'Mes rendez-vous clients',
  'Autre demande',
];
const limiteur = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Trop de messages envoyés. Réessayez dans quelques minutes.' },
});

routeur.post('/', limiteur, [
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('email').trim().isEmail().isLength({ max: 254 }),
  body('role').isIn(['client', 'barber']),
  body('shop').optional({ values: 'falsy' }).trim().isLength({ max: 150 }),
  body('subject').isIn(sujets),
  body('message').trim().isLength({ min: 10, max: 3000 }),
  valider,
], envoyer);

module.exports = routeur;
