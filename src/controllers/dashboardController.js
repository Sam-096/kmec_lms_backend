const { Op, fn, col, literal } = require('sequelize');
const { User, Book, BookCopy, Transaction } = require('../models/index');
const { successResponse, errorResponse } = require('../utils/response');
const { resolveCoverImage } = require('../utils/coverImage');

const decorateNestedBookCover = (item) => {
  const book = item?.bookCopy?.book;
  if (book) {
    const { coverImage, coverImageFallback } = resolveCoverImage({
      coverImage: book.coverImage,
      title: book.title,
    });
    book.coverImage = coverImage;
    book.coverImageFallback = coverImageFallback;
  }
  return item;
};

const getDashboard = async (req, res) => {
  try {
    // Overview counts
    const [
      totalBooks, totalUsers, issuedBooks,
      overdueBooks, totalFinesRaw
    ] = await Promise.all([
      Book.count(),
      User.count({ where: { role: ['student', 'faculty'] } }),
      BookCopy.count({ where: { status: 'issued' } }),
      Transaction.count({ where: { status: 'overdue' } }),
      Transaction.sum('fineAmount'),
    ]);
    const totalFines = Number(totalFinesRaw || 0);

    // Monthly borrowing trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyData = await Transaction.findAll({
      attributes: [
        [fn('MONTH', col('issueDate')), 'month'],
        [fn('YEAR', col('issueDate')), 'year'],
        [fn('COUNT', col('id')), 'count']
      ],
      where: { issueDate: { [Op.gte]: sixMonthsAgo } },
      group: [fn('MONTH', col('issueDate')), fn('YEAR', col('issueDate'))],
      order: [[fn('YEAR', col('issueDate')), 'ASC'], [fn('MONTH', col('issueDate')), 'ASC']]
    });

    // Top 5 most borrowed books
    const topBooks = await Transaction.findAll({
      attributes: [
        'bookCopyId',
        [fn('COUNT', col('Transaction.id')), 'borrowCount']
      ],
      include: [{
        model: BookCopy, as: 'bookCopy',
        attributes: ['bookId'],
        include: [{
          model: Book, as: 'book',
          attributes: ['title', 'author', 'coverImage']
        }]
      }],
      group: ['bookCopyId', 'bookCopy.id', 'bookCopy.bookId',
        'bookCopy->book.id', 'bookCopy->book.title',
        'bookCopy->book.author', 'bookCopy->book.coverImage'],
      order: [[fn('COUNT', col('Transaction.id')), 'DESC']],
      limit: 5
    });

    // Category distribution
    const categoryStats = await Book.findAll({
      attributes: ['category', [fn('COUNT', col('id')), 'count']],
      group: ['category'],
      order: [[fn('COUNT', col('id')), 'DESC']]
    });

    // Recent 5 transactions
    const recentTransactions = await Transaction.findAll({
      include: [
        { model: User, as: 'user', attributes: ['name', 'email'] },
        {
          model: BookCopy, as: 'bookCopy',
          include: [{ model: Book, as: 'book', attributes: ['title'] }]
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    const decoratedTopBooks = topBooks.map(t => {
      const json = typeof t.toJSON === 'function' ? t.toJSON() : t;
      return decorateNestedBookCover(json);
    });
    const decoratedRecent = recentTransactions.map(t => {
      const json = typeof t.toJSON === 'function' ? t.toJSON() : t;
      return decorateNestedBookCover(json);
    });

    return successResponse(res, 200, 'Dashboard data fetched.', {
      overview: { totalBooks, totalUsers, issuedBooks, overdueBooks, totalFines },
      monthlyTrend: monthlyData,
      topBooks: decoratedTopBooks,
      categoryStats,
      recentTransactions: decoratedRecent
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

module.exports = { getDashboard };
