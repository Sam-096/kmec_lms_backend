const { Notification } = require('../models/index');
const { successResponse, errorResponse } = require('../utils/response');

const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 20
    });
    const unreadCount = notifications.filter(n => !n.isRead).length;
    return successResponse(res, 200, 'Notifications fetched.', {
      notifications, unreadCount
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!notification) return errorResponse(res, 404, 'Notification not found.');
    await notification.update({ isRead: true });
    return successResponse(res, 200, 'Marked as read.');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

const markAllAsRead = async (req, res) => {
  try {
    await Notification.update(
      { isRead: true },
      { where: { userId: req.user.id, isRead: false } }
    );
    return successResponse(res, 200, 'All notifications marked as read.');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

module.exports = { getMyNotifications, markAsRead, markAllAsRead };
