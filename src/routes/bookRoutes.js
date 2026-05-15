const express = require('express');
const router = express.Router();
const {
  getBooks, getBook, createBook,
  updateBook, deleteBook, getDashboardStats
} = require('../controllers/bookController');
const { protect, adminOnly } = require('../middleware/auth');

// Public routes (students can view books without login)
router.get('/', getBooks);
router.get('/stats', protect, adminOnly, getDashboardStats);
router.get('/:id', getBook);

// Admin only routes
router.post('/', protect, adminOnly, createBook);
router.put('/:id', protect, adminOnly, updateBook);
router.delete('/:id', protect, adminOnly, deleteBook);

module.exports = router;
