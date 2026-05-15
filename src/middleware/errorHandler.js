// Wrap async route handlers so thrown errors hit the error middleware.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const errorHandler = (err, req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production';
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || null;

  // Sequelize validation / uniqueness errors
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 400;
    message = err.errors?.[0]?.message || 'Validation failed';
    errors = err.errors?.map(e => ({ field: e.path, message: e.message })) || null;
  } else if (err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 400;
    message = 'Invalid foreign key reference';
  } else if (err.name === 'SequelizeDatabaseError') {
    statusCode = 500;
    message = isProd ? 'Database error' : err.message;
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  if (statusCode >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  } else {
    console.warn(`[${req.method} ${req.originalUrl}] ${statusCode}: ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    message: isProd && statusCode >= 500 ? 'Internal Server Error' : message,
    errors,
    ...(isProd ? {} : { stack: err.stack }),
  });
};

const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

module.exports = { errorHandler, notFound, asyncHandler };
