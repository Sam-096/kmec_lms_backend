const express = require('express');
const router  = express.Router();

const {
  getUsers,
  getUser,
  updateProfile,
  updateUserStatus,
  clearFine,
  getUserStats,
} = require('../controllers/userController');

const { protect, adminOnly } = require('../middleware/auth');

// Static routes MUST stay before /:id
router.get('/stats',            protect, adminOnly, getUserStats);
router.get('/',                 protect, adminOnly, getUsers);
router.put('/profile',          protect,            updateProfile);

// :id — student/faculty can read OWN record; only admin can read others.
// Controller enforces ownership; this stays simple and avoids a 403 storm.
router.get('/:id',              protect,            getUser);

router.patch('/:id/status',     protect, adminOnly, updateUserStatus);
router.post('/:id/clear-fine',  protect, adminOnly, clearFine);

module.exports = router;
