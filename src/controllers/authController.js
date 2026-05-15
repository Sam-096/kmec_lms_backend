const { registerUser, loginUser } = require('../services/authService');
const { successResponse, errorResponse } = require('../utils/response');
const { User } = require('../models/index');

const register = async (req, res) => {
  try {
    const { name, email, password, role, phone, department, semester } = req.body;

    if (!name || !email || !password) {
      return errorResponse(res, 400, 'Name, email and password are required.');
    }

    const result = await registerUser({ name, email, password, role, phone, department, semester });
    return successResponse(res, 201, 'Registration successful.', result);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message);
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return errorResponse(res, 400, 'Email and password are required.');
    }

    const result = await loginUser({ email, password });
    return successResponse(res, 200, 'Login successful.', result);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message);
  }
};

const getMe = async (req, res) => {
  try {
    return successResponse(res, 200, 'User profile fetched.', req.user);
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findByPk(req.user.id);
    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) return errorResponse(res, 401, 'Current password is incorrect.');

    user.password = newPassword;
    await user.save();

    return successResponse(res, 200, 'Password changed successfully.');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

module.exports = { register, login, getMe, changePassword };
