const express = require('express');
const router = express.Router();
const {
  issueBook,
  returnBook,
  renewBook,
  getMyTransactions,
  getAllTransactions,
  getOverdue,
  getStats           // ✅ add this
} = require('../controllers/transactionController');
const { protect, adminOnly } = require('../middleware/auth');

// ✅ Use protect + adminOnly (matching your existing middleware)
router.get('/stats',                      protect, adminOnly,      getStats);

router.post('/issue',                     protect, adminOnly,      issueBook);
router.put('/return/:transactionId',      protect, adminOnly,      returnBook);
router.put('/renew/:transactionId',       protect,                 renewBook);
router.get('/my',                         protect,                 getMyTransactions);
router.get('/all',                        protect, adminOnly,      getAllTransactions);
router.get('/overdue',                    protect, adminOnly,      getOverdue);

module.exports = router;
