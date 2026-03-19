/**
 * Vercel Serverless Function — Express API wrapper
 */
const path = require('path');

// Set env for serverless
process.env.VERCEL = 'true';

// Load dotenv
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes — load from server directory
const serverDir = path.join(__dirname, '..', 'server');
app.use('/api/sync', require(path.join(serverDir, 'routes', 'sync')));
app.use('/api/orders', require(path.join(serverDir, 'routes', 'orders')));
app.use('/api/inventory', require(path.join(serverDir, 'routes', 'inventory')));
app.use('/api/routing', require(path.join(serverDir, 'routes', 'routing')));
app.use('/api/dashboard', require(path.join(serverDir, 'routes', 'dashboard')));
app.use('/api/pincodes', require(path.join(serverDir, 'routes', 'pincodes')));
app.use('/api/exports', require(path.join(serverDir, 'routes', 'exports')));
app.use('/api/create-order', require(path.join(serverDir, 'routes', 'createOrder')));

// Error handling
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
