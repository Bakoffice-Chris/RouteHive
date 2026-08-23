require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const leadRoutes = require('./routes/leads');
const routeRoutes = require('./routes/routes');
const stopRoutes = require('./routes/stops');
const territoryRoutes = require('./routes/territories');
const userRoutes = require('./routes/users');
const integrationRoutes = require('./routes/integrations');
const externalRoutes = require('./routes/external');
const appointmentRoutes = require('./routes/appointments');
const availabilityRoutes = require('./routes/availability');
const bookingRoutes = require('./routes/booking');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/stops', stopRoutes);
app.use('/api/territories', territoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/external', externalRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/availability', availabilityRoutes);
// Public - deliberately mounted outside /api and without requireAuth
// anywhere in its chain. Kept as its own top-level path (not nested under
// /api/leads or similar) so it's immediately visually obvious in the
// codebase which routes are unauthenticated.
app.use('/public/booking', bookingRoutes);

// Basic error handler - keeps stack traces out of API responses
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Route platform API listening on port ${PORT}`);
});
