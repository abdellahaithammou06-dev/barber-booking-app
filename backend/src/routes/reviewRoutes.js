const express = require('express'); const { body, param } = require('express-validator'); const c = require('../controllers/reviewController'); const { authentifier } = require('../middlewares/auth'); const { valider } = require('../middlewares/validation');
const routeur = express.Router();
routeur.post('/', authentifier, [body('barberId').isInt({ min: 1 }), body('appointmentId').isInt({ min: 1 }), body('rating').isInt({ min: 1, max: 5 }), body('comment').optional({ nullable: true }).isLength({ max: 2000 }), valider], c.creer);
module.exports = routeur;
