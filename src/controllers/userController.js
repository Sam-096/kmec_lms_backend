const userService = require('../services/userService');
const { successResponse, errorResponse } = require('../utils/response');
const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');


const getUsers = async (req, res) => {
  try {
    const { search, role, status, page, limit } = req.query;
    const result = await userService.getAllUsers({ search, role, status, page, limit });
    return successResponse(res, 200, 'Users fetched.', result);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message);
  }
};


const getUser = async (req, res) => {
  try {
    // Ownership rule: non-admin can only fetch self.
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return errorResponse(res, 403, 'You can only view your own profile.');
    }
    const user = await userService.getUserById(req.params.id);
    return successResponse(res, 200, 'User fetched.', user);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message);
  }
};


const updateProfile = async (req, res) => {
  try {
    const user = await userService.updateUser(req.user.id, req.body);
    return successResponse(res, 200, 'Profile updated.', user);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message);
  }
};


const updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['active', 'suspended', 'pending'];
    if (!validStatuses.includes(status)) {
      return errorResponse(res, 400, 'Invalid status.');
    }
    const user = await userService.updateUserStatus(
      req.params.id, status, req.user.id
    );
    return successResponse(res, 200, `User ${status}.`, user);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message);
  }
};


const clearFine = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return errorResponse(res, 400, 'Valid amount required.');
    }
    const result = await userService.clearUserFine(req.params.id, amount);
    return successResponse(res, 200, 'Fine cleared.', result);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message);
  }
};


const getUserStats = async (req, res) => {
  try {
    if (typeof userService.getUserStats === 'function') {
      const stats = await userService.getUserStats();
      return successResponse(res, 200, 'User stats fetched.', stats);
    }

    // Fallback: direct SQL (uses `status` column from User model)
    const [stats] = await sequelize.query(
      `SELECT
         COUNT(*)                                                       AS totalUsers,
         SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END)             AS totalStudents,
         SUM(CASE WHEN role = 'faculty' THEN 1 ELSE 0 END)             AS totalFaculty,
         SUM(CASE WHEN role = 'admin'   THEN 1 ELSE 0 END)             AS totalAdmins,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END)            AS activeUsers,
         SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END)         AS suspendedUsers,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)           AS pendingUsers,
         SUM(CASE WHEN DATE(createdAt) = CURDATE() THEN 1 ELSE 0 END)  AS joinedToday,
         SUM(CASE WHEN createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                  THEN 1 ELSE 0 END)                                   AS joinedThisWeek,
         COALESCE(SUM(fineOwed), 0)                                    AS totalPendingFines
       FROM users`,
      { type: QueryTypes.SELECT }
    );

    return successResponse(res, 200, 'User stats fetched.', stats);
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};


module.exports = {
  getUsers,
  getUser,
  updateProfile,
  updateUserStatus,
  clearFine,
  getUserStats,
};
