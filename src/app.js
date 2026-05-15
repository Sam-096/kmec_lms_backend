const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();

// ── CORS ──────────────────────────────────────────────────
// Evaluated per-request so env vars are visible even if loaded late,
// and so additional origins can be added without code changes.
const staticOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:8080',
  'http://localhost:3000',
]);

app.use(cors({
  origin(origin, cb) {
    // Allow same-origin / curl / server-to-server requests
    if (!origin) return cb(null, true);

    const allowList = new Set(staticOrigins);
    if (process.env.CLIENT_URL) allowList.add(process.env.CLIENT_URL);
    if (process.env.CORS_ORIGINS) {
      process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
        .forEach(o => allowList.add(o));
    }
    if (allowList.has(origin)) return cb(null, true);

    // In dev, be permissive so we don't block local tooling
    if ((process.env.NODE_ENV || 'development') !== 'production') {
      return cb(null, true);
    }
    return cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
}));

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Trust proxy (Render/Heroku-style)
app.set('trust proxy', 1);

// ── Health checks ─────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'KMEC Library Management System API is running',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});
app.get('/', (req, res) => res.json({ success: true, message: 'KMEC LMS API' }));

// ── API Routes ────────────────────────────────────────────
app.use('/api/auth',          require('./routes/authRoutes'));
app.use('/api/books',         require('./routes/bookRoutes'));
app.use('/api/users',         require('./routes/userRoutes'));
app.use('/api/transactions',  require('./routes/transactionRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/dashboard',     require('./routes/dashboardRoutes'));
app.use('/api/ai',            require('./routes/aiRoutes'));

// ── Error handlers ────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
