const express = require('express'); const { body, param } = require('express-validator'); const c = require('../controllers/adminController'); const { authentifier, autoriser } = require('../middlewares/auth'); const { valider } = require('../middlewares/validation');
const routeur = express.Router(); routeur.use(authentifier, autoriser('admin'));
routeur.get('/users', c.utilisateurs); routeur.put('/users/:id/active', [param('id').isInt({ min: 1 }), body('isActive').isBoolean(), valider], c.changerActivation); routeur.put('/reviews/:id/moderation', [param('id').isInt({ min: 1 }), body('isHidden').isBoolean(), body('isFlagged').isBoolean(), valider], c.modererAvis);
module.exports = routeur;
