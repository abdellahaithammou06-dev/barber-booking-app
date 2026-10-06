const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const { inscrire, connexion, renouveler, configurationGoogle, connexionGoogle } = require('../controllers/authController');
const { valider } = require('../middlewares/validation');

const routeur = express.Router();
const limiteur = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { message: 'Trop de tentatives. Réessayez plus tard.' } });
// Un administrateur est créé de manière contrôlée, jamais depuis un formulaire public.
const roles = ['client', 'barber'];

routeur.post('/register', limiteur, [body('name').trim().isLength({ min: 2, max: 100 }), body('email').isEmail().normalizeEmail(), body('password').isLength({ min: 8 }), body('role').optional().isIn(roles)], valider, inscrire);
routeur.post('/login', limiteur, [body('email').isEmail().normalizeEmail(), body('password').notEmpty()], valider, connexion);
routeur.post('/refresh', limiteur, [body('refreshToken').isString().notEmpty()], valider, renouveler);
routeur.get('/google/config', configurationGoogle);
routeur.post('/google', limiteur, [body('credential').isString().isLength({ min: 100, max: 10000 }), valider], connexionGoogle);

module.exports = routeur;
