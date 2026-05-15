const jwt = require('jsonwebtoken');
const { User } = require('../models/index');
const { errorResponse } = require('../utils/response');

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 401, 'Access denied. No token provided.');
    }

    const token = authHeader.split(' ')[1];
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set in environment');
      return errorResponse(res, 500, 'Server auth misconfiguration.');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return errorResponse(res, 401, 'Invalid or expired token.');
    }

    const user = await User.findByPk(decoded.id, { attributes: { exclude: ['password'] } });
    if (!user) return errorResponse(res, 401, 'User not found.');
    if (user.status === 'suspended') return errorResponse(res, 403, 'Account suspended.');

    req.user = user;
    return next();
  } catch (error) {
    console.error('[auth.protect]', error.message);
    return errorResponse(res, 500, 'Authentication error.');
  }
};

const adminOnly = (req, res, next) => {
  if (!req.user || (req.user.role || '').toLowerCase() !== 'admin') {
    return errorResponse(res, 403, 'Access denied. Admins only.');
  }
  return next();
};

const adminOrFaculty = (req, res, next) => {
  const role = (req.user?.role || '').toLowerCase();
  if (!['admin', 'faculty'].includes(role)) {
    return errorResponse(res, 403, 'Access denied.');
  }
  return next();
};

module.exports = { protect, adminOnly, adminOrFaculty };
