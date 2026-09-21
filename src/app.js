const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const barberRoutes = require('./routes/barberRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { lister: listerAvis } = require('./controllers/reviewController');
const { param } = require('express-validator');
const { valider } = require('./middlewares/validation');

const app = express();

// Les futurs contrôleurs reçoivent ici les corps JSON des requêtes API.
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.static('public'));

// Point de contrôle sans accès à la base, pratique pour vérifier le serveur.
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/barbers', barberRoutes);
app.get('/barbers/:id/reviews', [param('id').isInt({ min: 1 }), valider], listerAvis);
app.use('/services', serviceRoutes);
app.use('/appointments', appointmentRoutes);
app.use('/reviews', reviewRoutes);
app.use('/admin', adminRoutes);

// Réponse homogène pour les routes qui seront ajoutées progressivement.
app.use((req, res) => {
  res.status(404).json({ message: 'Route introuvable.' });
});

// Dernier filet de sécurité : aucun détail interne n'est envoyé au client.
app.use((erreur, req, res, next) => {
  console.error(erreur);
  res.status(erreur.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ message: 'Une erreur interne est survenue.' });
});

module.exports = app;
