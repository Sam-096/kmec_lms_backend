const jwt = require('jsonwebtoken');
const { User } = require('../models/index');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

const registerUser = async ({ name, email, password, role, phone, department, semester }) => {
  // Check if email already exists
  const existing = await User.findOne({ where: { email } });
  if (existing) throw { statusCode: 409, message: 'Email already registered.' };

  // Create user (password hashed by model hook)
  const user = await User.create({
    name, email, password,
    role: role || 'student',
    phone, department, semester
  });

  const token = generateToken(user.id);

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      status: user.status
    }
  };
};

const loginUser = async ({ email, password }) => {
  // Find user with password
  const user = await User.findOne({ where: { email } });
  if (!user) throw { statusCode: 401, message: 'Invalid email or password.' };

  // Check password
  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw { statusCode: 401, message: 'Invalid email or password.' };

  // Check status
  if (user.status === 'suspended') throw { statusCode: 403, message: 'Account suspended. Contact admin.' };
  if (user.status === 'pending') throw { statusCode: 403, message: 'Account pending approval.' };

  const token = generateToken(user.id);

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      semester: user.semester,
      fineOwed: user.fineOwed,
      status: user.status
    }
  };
};

module.exports = { registerUser, loginUser, generateToken };
