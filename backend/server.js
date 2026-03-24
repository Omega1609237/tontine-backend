const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Connexion PostgreSQL avec SSL
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'tontine_db',
    ssl: {
        rejectUnauthorized: false
    }
});

// Test connexion
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Erreur PostgreSQL:', err.stack);
    } else {
        console.log('✅ PostgreSQL connecté');
        release();
    }
});

// Middleware d'authentification
const auth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Accès non autorisé' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'mon_secret_jwt');
        req.userId = decoded.id;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Token invalide' });
    }
};

// ==================== AUTHENTIFICATION ====================

// Inscription
app.post('/api/register', async (req, res) => {
    try {
        const { nom, email, password, telephone, role = 'membre' } = req.body;

        console.log('📝 Inscription:', { nom, email, role });

        // Vérifier si l'email existe déjà
        const existing = await pool.query(
            'SELECT * FROM utilisateurs WHERE email = $1',
            [email]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Email déjà utilisé' });
        }

        // Hasher le mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insérer l'utilisateur
        const result = await pool.query(
            `INSERT INTO utilisateurs (nom, email, password, telephone, role)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, nom, email, role, telephone, date_creation`,
            [nom, email, hashedPassword, telephone, role]
        );

        const user = result.rows[0];
        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET || 'mon_secret_jwt',
            { expiresIn: '7d' }
        );

        console.log('✅ Utilisateur créé:', user.email);
        res.json({ token, user });
    } catch (err) {
        console.error('❌ Erreur inscription:', err);
        res.status(500).json({ error: err.message });
    }
});

// Connexion
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await pool.query(
            'SELECT * FROM utilisateurs WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }

        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password);

        if (!valid) {
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }

        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET || 'mon_secret_jwt',
            { expiresIn: '7d' }
        );

        const { password: _, ...userWithoutPassword } = user;

        console.log('✅ Connexion réussie:', email);
        res.json({ token, user: userWithoutPassword });
    } catch (err) {
        console.error('❌ Erreur connexion:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== UTILISATEUR COURANT ====================

app.get('/api/me', auth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nom, email, telephone, role, date_creation FROM utilisateurs WHERE id = $1',
            [req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ Erreur /me:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== TONTINES ====================

// Récupérer toutes les tontines (sans filtre utilisateur)
app.get('/api/tontines', auth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM tontines ORDER BY date_creation DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Erreur GET tontines:', err);
        res.status(500).json({ error: err.message });
    }
});

// Créer une tontine
app.post('/api/tontines', auth, async (req, res) => {
    try {
        const { nom, montant, frequence, membres, date_debut, description } = req.body;

        const result = await pool.query(
            `INSERT INTO tontines (nom, montant, frequence, membres, date_debut, description)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [nom, montant, frequence, membres, date_debut, description]
        );

        console.log('✅ Tontine créée:', result.rows[0].nom);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ Erreur POST tontine:', err);
        res.status(500).json({ error: err.message });
    }
});

// Modifier une tontine
app.put('/api/tontines/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const { nom, montant, frequence, membres, statut, description } = req.body;

        const result = await pool.query(
            `UPDATE tontines SET
                nom = $1,
                montant = $2,
                frequence = $3,
                membres = $4,
                statut = $5,
                description = $6
             WHERE id = $7
             RETURNING *`,
            [nom, montant, frequence, membres, statut, description, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tontine non trouvée' });
        }

        console.log('✅ Tontine modifiée:', result.rows[0].nom);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ Erreur PUT tontine:', err);
        res.status(500).json({ error: err.message });
    }
});

// Supprimer une tontine
app.delete('/api/tontines/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM tontines WHERE id = $1 RETURNING id',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tontine non trouvée' });
        }

        console.log('✅ Tontine supprimée:', id);
        res.json({ message: 'Tontine supprimée' });
    } catch (err) {
        console.error('❌ Erreur DELETE tontine:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== MEMBRES ====================

// Récupérer les membres d'une tontine
app.get('/api/tontines/:tontineId/membres', auth, async (req, res) => {
    try {
        const { tontineId } = req.params;
        const result = await pool.query(
            'SELECT * FROM membres WHERE tontine_id = $1 ORDER BY date_inscription DESC',
            [tontineId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Erreur GET membres:', err);
        res.status(500).json({ error: err.message });
    }
});

// Ajouter un membre
app.post('/api/tontines/:tontineId/membres', auth, async (req, res) => {
    try {
        const { tontineId } = req.params;
        const { nom, prenom, telephone, email } = req.body;

        const result = await pool.query(
            `INSERT INTO membres (tontine_id, nom, prenom, telephone, email)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [tontineId, nom, prenom, telephone, email]
        );

        console.log('✅ Membre ajouté:', result.rows[0].prenom, result.rows[0].nom);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ Erreur POST membre:', err);
        res.status(500).json({ error: err.message });
    }
});

// Supprimer un membre
app.delete('/api/membres/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'DELETE FROM membres WHERE id = $1 RETURNING id',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Membre non trouvé' });
        }

        console.log('✅ Membre supprimé:', id);
        res.json({ message: 'Membre supprimé' });
    } catch (err) {
        console.error('❌ Erreur DELETE membre:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== COTISATIONS ====================

// Récupérer les cotisations d'une tontine
app.get('/api/tontines/:tontineId/cotisations', auth, async (req, res) => {
    try {
        const { tontineId } = req.params;
        const result = await pool.query(
            `SELECT c.*, m.nom, m.prenom
             FROM cotisations c
             JOIN membres m ON c.membre_id = m.id
             WHERE c.tontine_id = $1
             ORDER BY c.date_paiement DESC`,
            [tontineId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Erreur GET cotisations:', err);
        res.status(500).json({ error: err.message });
    }
});

// Ajouter une cotisation
app.post('/api/tontines/:tontineId/cotisations', auth, async (req, res) => {
    try {
        const { tontineId } = req.params;
        const { membre_id, montant, mode_paiement } = req.body;

        // Ajouter la cotisation
        const result = await pool.query(
            `INSERT INTO cotisations (tontine_id, membre_id, montant, mode_paiement)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [tontineId, membre_id, montant, mode_paiement]
        );

        // Mettre à jour le montant total de la tontine
        await pool.query(
            'UPDATE tontines SET montant_total = montant_total + $1 WHERE id = $2',
            [montant, tontineId]
        );

        // Récupérer le nom du membre
        const membre = await pool.query(
            'SELECT nom, prenom FROM membres WHERE id = $1',
            [membre_id]
        );

        console.log('✅ Cotisation ajoutée:', montant, 'FCFA');
        res.json({
            ...result.rows[0],
            membre_nom: `${membre.rows[0].prenom} ${membre.rows[0].nom}`
        });
    } catch (err) {
        console.error('❌ Erreur POST cotisation:', err);
        res.status(500).json({ error: err.message });
    }
});

// Supprimer une cotisation
app.delete('/api/cotisations/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;

        // Récupérer le montant et la tontine
        const cotisation = await pool.query(
            'SELECT montant, tontine_id FROM cotisations WHERE id = $1',
            [id]
        );

        if (cotisation.rows.length === 0) {
            return res.status(404).json({ error: 'Cotisation non trouvée' });
        }

        await pool.query('DELETE FROM cotisations WHERE id = $1', [id]);
        await pool.query(
            'UPDATE tontines SET montant_total = montant_total - $1 WHERE id = $2',
            [cotisation.rows[0].montant, cotisation.rows[0].tontine_id]
        );

        console.log('✅ Cotisation supprimée:', id);
        res.json({ message: 'Cotisation supprimée' });
    } catch (err) {
        console.error('❌ Erreur DELETE cotisation:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== STATISTIQUES ====================

app.get('/api/statistiques', auth, async (req, res) => {
    try {
        // Total tontines
        const tontinesResult = await pool.query('SELECT COUNT(*) FROM tontines');
        // Total membres
        const membresResult = await pool.query('SELECT COUNT(*) FROM membres');
        // Total cotisations
        const cotisationsResult = await pool.query('SELECT COALESCE(SUM(montant), 0) FROM cotisations');
        // Objectif total
        const objectifResult = await pool.query('SELECT COALESCE(SUM(montant * membres), 0) FROM tontines');

        const totalTontines = parseInt(tontinesResult.rows[0].count) || 0;
        const totalMembres = parseInt(membresResult.rows[0].count) || 0;
        const totalCotisations = parseFloat(cotisationsResult.rows[0].coalesce) || 0;
        const objectifTotal = parseFloat(objectifResult.rows[0].coalesce) || 0;
        const tauxParticipation = objectifTotal > 0 ? (totalCotisations / objectifTotal * 100) : 0;

        res.json({
            totalTontines,
            totalMembres,
            totalCotisations,
            tauxParticipation
        });
    } catch (err) {
        console.error('❌ Erreur statistiques:', err);
        res.status(500).json({ error: err.message });
    }
});

// Démarrer le serveur
app.listen(port, () => {
    console.log(`🚀 Serveur démarré sur http://localhost:${port}`);
});
