const express = require('express'); const { body, param } = require('express-validator'); const c = require('../controllers/appointmentController'); const { authentifier } = require('../middlewares/auth'); const { valider } = require('../middlewares/validation');
const { normaliserNumeroWhatsApp } = require('../utils/phone');
const routeur = express.Router();
routeur.post('/', authentifier, [body('barberId').isInt({ min: 1 }), body('serviceId').isInt({ min: 1 }), body('date').isISO8601(), body('time').matches(/^([01]\d|2[0-3]):[0-5]\d$/), body('clientPhone').optional({ nullable: true }).isString().isLength({ max: 30 }), body('whatsappOptIn').optional().isBoolean().toBoolean(), body('whatsappOptIn').custom((value, { req }) => !value || Boolean(normaliserNumeroWhatsApp(req.body.clientPhone))).withMessage('Saisissez un numéro WhatsApp valide pour recevoir le rappel.'), valider], c.creer);
routeur.get('/me', authentifier, c.miens);
routeur.put('/:id/status', authentifier, [param('id').isInt({ min: 1 }), body('status').isIn(['confirmed', 'cancelled_by_client', 'cancelled_by_barber', 'completed', 'no_show']), valider], c.changerStatut);
module.exports = routeur;
