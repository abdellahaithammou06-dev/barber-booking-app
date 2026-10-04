const express = require('express');
const { verifierWebhook, recevoirWebhook } = require('../controllers/whatsappController');

const routeur = express.Router();
routeur.get('/', verifierWebhook);
routeur.post('/', recevoirWebhook);

module.exports = routeur;
