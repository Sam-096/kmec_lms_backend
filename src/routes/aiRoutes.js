const express      = require('express');
const router       = express.Router();
const aiController = require('../controllers/aiController');
const { protect }  = require('../middleware/auth');

router.get( '/status',                       aiController.status);
router.post('/chat',           protect,      aiController.chat);

// Recommendations — accept both names; supports POST (legacy) and GET.
router.post('/recommend',         protect,   aiController.recommend);
router.get( '/recommend',         protect,   aiController.recommend);
router.post('/recommendations',   protect,   aiController.recommend);
router.get( '/recommendations',   protect,   aiController.recommend);

// Book summary — accept both URL shapes.
router.get('/summary/:bookId',      protect, aiController.bookSummary);
router.get('/book-summary/:bookId', protect, aiController.bookSummary);

module.exports = router;
