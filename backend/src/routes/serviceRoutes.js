const express = require('express'); const { body, param } = require('express-validator'); const c = require('../controllers/barberController'); const { authentifier, autoriser } = require('../middlewares/auth'); const { valider } = require('../middlewares/validation');
const routeur = express.Router(); const validation = [body('name').trim().isLength({ min: 2, max: 100 }), body('description').optional({ nullable: true }).isString(), body('price').isFloat({ gt: 0 }), body('duration').isInt({ min: 5, max: 480 }), valider];
routeur.put('/:id', authentifier, autoriser('barber'), [param('id').isInt({ min: 1 }), ...validation], c.modifierService);
routeur.delete('/:id', authentifier, autoriser('barber'), [param('id').isInt({ min: 1 }), valider], c.supprimerService);
module.exports = routeur;
