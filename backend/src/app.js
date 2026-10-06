const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const barberRoutes = require('./routes/barberRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const adminRoutes = require('./routes/adminRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');
const contactRoutes = require('./routes/contactRoutes');
const { lister: listerAvis } = require('./controllers/reviewController');
const { param } = require('express-validator');
const { valider } = require('./middlewares/validation');

const app = express();

// Les futurs contrôleurs reçoivent ici les corps JSON des requêtes API.
app.use(cors());
app.use(express.json({
  limit: '1mb',
  verify(req, res, buffer) { req.rawBody = Buffer.from(buffer); },
}));
app.use(express.static(path.resolve(__dirname, '../../frontend/public')));

// Point de contrôle sans accès à la base, pratique pour vérifier le serveur.
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// L'adresse de contact est publique par nature, contrairement aux identifiants SMTP.
app.get('/api/public-config', (req, res) => {
  res.status(200).json({ contactEmail: process.env.CONTACT_EMAIL || 'abdellahaithammou06@gmail.com' });
});

app.use('/auth', authRoutes);
app.use('/barbers', barberRoutes);
app.get('/barbers/:id/reviews', [param('id').isInt({ min: 1 }), valider], listerAvis);
app.use('/appointments', appointmentRoutes);
app.use('/reviews', reviewRoutes);
app.use('/admin', adminRoutes);
app.use('/webhooks/whatsapp', whatsappRoutes);
app.use('/api/contact', contactRoutes);

// Le middleware express.static ne sert pas toujours les fichiers dans les environnements
// qui regroupent Express en fonction. Ce repli garde les pages et leurs assets accessibles.
const dossierPublic = path.resolve(__dirname, '../../frontend/public');
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  const cheminDemande = req.path === '/' ? '/index.html' : req.path;
  const fichier = path.resolve(dossierPublic, `.${cheminDemande}`);
  if (!fichier.startsWith(`${dossierPublic}${path.sep}`)) return next();

  res.sendFile(fichier, (erreur) => {
    if (erreur) next();
  });
});

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
