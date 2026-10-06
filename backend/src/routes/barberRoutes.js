const express = require('express');
const { body, param, query } = require('express-validator');
const c = require('../controllers/barberController');
const { authentifier, autoriser } = require('../middlewares/auth');
const { valider } = require('../middlewares/validation');
const routeur = express.Router();
const service = [body('serviceId').isInt({ min: 1 }), body('price').isFloat({ gt: 0 }), body('durationMinutes').optional().isInt({ min: 5, max: 480 }), valider];
const serviceUpdate = [body('price').isFloat({ gt: 0 }), body('durationMinutes').isInt({ min: 5, max: 480 }), valider];
routeur.get('/', [query('latitude').optional().isFloat({ min: -90, max: 90 }), query('longitude').optional().isFloat({ min: -180, max: 180 }), valider], c.lister);
routeur.get('/services/catalog', c.catalogueServices);
routeur.get('/me/profile', authentifier, autoriser('barber'), c.monProfil);
routeur.put('/me/profile', authentifier, autoriser('barber'), [body('shopName').trim().isLength({ min: 2, max: 150 }), body('address').optional({ nullable: true }).isString().isLength({ max: 255 }), body('phone').optional({ nullable: true }).isString().isLength({ max: 20 }), body('description').optional({ nullable: true }).isString().isLength({ max: 2000 }), body('latitude').optional({ nullable: true }).isFloat({ min: -90, max: 90 }), body('longitude').optional({ nullable: true }).isFloat({ min: -180, max: 180 }), valider], c.modifierProfil);
routeur.get('/me/hours', authentifier, autoriser('barber'), c.horairesDuBarbier);
routeur.put('/me/hours', authentifier, autoriser('barber'), [body('hours').isArray({ min: 7, max: 7 }).custom((hours) => {
  const days = new Set();
  return hours.every((hour) => {
    if (!Number.isInteger(hour.dayOfWeek) || hour.dayOfWeek < 0 || hour.dayOfWeek > 6 || days.has(hour.dayOfWeek) || typeof hour.active !== 'boolean') return false;
    days.add(hour.dayOfWeek);
    return !hour.active || (typeof hour.startTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(hour.startTime) && typeof hour.endTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(hour.endTime) && hour.startTime < hour.endTime);
  }) && days.size === 7;
}), valider], c.modifierHoraires);
routeur.get('/:id/available-slots', [param('id').isInt({ min: 1 }), query('date').isISO8601(), query('serviceId').isInt({ min: 1 }), valider], c.creneauxDisponibles);
routeur.get('/:id/services', [param('id').isInt({ min: 1 }), valider], c.servicesDuBarbier);
routeur.get('/:id', [param('id').isInt({ min: 1 }), valider], c.detail);
routeur.post('/:id/services', authentifier, autoriser('barber'), [param('id').isInt({ min: 1 }), ...service], c.ajouterService);
routeur.put('/:id/services/:serviceId', authentifier, autoriser('barber'), [param('id').isInt({ min: 1 }), param('serviceId').isInt({ min: 1 }), ...serviceUpdate], c.modifierService);
routeur.delete('/:id/services/:serviceId', authentifier, autoriser('barber'), [param('id').isInt({ min: 1 }), param('serviceId').isInt({ min: 1 }), valider], c.supprimerService);
module.exports = routeur;
