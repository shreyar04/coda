const express = require('express');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth.routes');
const musicRoutes = require('./routes/music.routes');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/music', musicRoutes);

// 404 Not Found handler
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

module.exports = app;