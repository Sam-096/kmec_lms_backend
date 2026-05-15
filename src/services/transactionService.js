const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { Transaction, BookCopy, Book, User, Notification } = require('../models/index');

const FINE_PER_DAY = 2; // ₹2 per day
const MAX_BOOKS_PER_USER = 3;
const LOAN_PERIOD_DAYS = 14;

// ── Issue Book ──────────────────────────────────────────
const issueBook = async ({ userId, bookCopyId, issuedBy }) => {
  const t = await sequelize.transaction();
  try {
    // 1. Check user exists
    const user = await User.findByPk(userId);
    if (!user) throw { statusCode: 404, message: 'User not found.' };
    if (user.status === 'suspended') throw { statusCode: 403, message: 'User account is suspended.' };

    // 2. Check user has not exceeded borrow limit
    const activeCount = await Transaction.count({
      where: { userId, status: ['active', 'overdue'] }
    });
    if (activeCount >= MAX_BOOKS_PER_USER) {
      throw { statusCode: 400, message: `User already has ${MAX_BOOKS_PER_USER} books issued. Return one first.` };
    }

    // 3. Check user has no unpaid fines > ₹50
    if (parseFloat(user.fineOwed) > 50) {
      throw { statusCode: 400, message: `User has unpaid fines of ₹${user.fineOwed}. Please clear dues first.` };
    }

    // 4. Check book copy is available
    const copy = await BookCopy.findByPk(bookCopyId, {
      include: [{ model: Book, as: 'book' }]
    });
    if (!copy) throw { statusCode: 404, message: 'Book copy not found.' };
    if (copy.status !== 'available') {
      throw { statusCode: 400, message: `This copy is currently ${copy.status}.` };
    }

    // 5. Calculate dates
    const issueDate = new Date();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + LOAN_PERIOD_DAYS);

    // 6. Create transaction
    const transaction = await Transaction.create({
      userId,
      bookCopyId,
      issueDate,
      dueDate,
      status: 'active',
      notes: `Issued by admin: ${issuedBy}`
    }, { transaction: t });

    // 7. Update copy status
    await copy.update({ status: 'issued' }, { transaction: t });

    // 8. Update book available count
    await copy.book.decrement('availableCopies', { transaction: t });

    // 9. Send notification to user
    await Notification.create({
      userId,
      type: 'general',
      title: 'Book Issued Successfully',
      message: `"${copy.book.title}" issued. Due date: ${dueDate.toDateString()}.`
    }, { transaction: t });

    await t.commit();

    return {
      transaction,
      book: copy.book,
      user: { id: user.id, name: user.name, email: user.email },
      dueDate
    };
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

// ── Return Book ─────────────────────────────────────────
const returnBook = async ({ transactionId, returnCondition, adminNote }) => {
  const t = await sequelize.transaction();
  try {
    // 1. Find transaction
    const txn = await Transaction.findByPk(transactionId, {
      include: [
        {
          model: BookCopy, as: 'bookCopy',
          include: [{ model: Book, as: 'book' }]
        },
        { model: User, as: 'user' }
      ]
    });

    if (!txn) throw { statusCode: 404, message: 'Transaction not found.' };
    if (txn.status === 'returned') throw { statusCode: 400, message: 'Book already returned.' };

    // 2. Calculate fine
    const returnDate = new Date();
    let fineAmount = 0;

    if (returnDate > txn.dueDate) {
      const daysLate = Math.ceil((returnDate - txn.dueDate) / (1000 * 60 * 60 * 24));
      fineAmount = daysLate * FINE_PER_DAY;
    }

    // 3. Update transaction
    await txn.update({
      returnDate,
      status: 'returned',
      fineAmount,
      returnCondition: returnCondition || 'good',
      notes: adminNote || txn.notes
    }, { transaction: t });

    // 4. Update copy status
    const newCopyStatus = returnCondition === 'damaged' ? 'damaged' : 'available';
    await txn.bookCopy.update({
      status: newCopyStatus,
      condition: returnCondition || 'good'
    }, { transaction: t });

    // 5. Update book available count (only if copy is available again)
    if (newCopyStatus === 'available') {
      await txn.bookCopy.book.increment('availableCopies', { transaction: t });
    }

    // 6. Update user fine
    if (fineAmount > 0) {
      await txn.user.increment('fineOwed', { by: fineAmount, transaction: t });

      // Notify user about fine
      await Notification.create({
        userId: txn.userId,
        type: 'fine',
        title: 'Late Return Fine Applied',
        message: `"${txn.bookCopy.book.title}" returned ${Math.ceil((returnDate - txn.dueDate) / (1000 * 60 * 60 * 24))} days late. Fine: ₹${fineAmount}.`
      }, { transaction: t });
    }

    await t.commit();

    return {
      transaction: txn,
      fineAmount,
      returnDate,
      book: txn.bookCopy.book
    };
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

// ── Renew Book ──────────────────────────────────────────
const renewBook = async ({ transactionId, userId }) => {
  const txn = await Transaction.findByPk(transactionId);

  if (!txn) throw { statusCode: 404, message: 'Transaction not found.' };
  if (txn.userId !== userId) throw { statusCode: 403, message: 'Unauthorized.' };
  if (txn.status === 'returned') throw { statusCode: 400, message: 'Book already returned.' };
  if (txn.renewalCount >= 2) throw { statusCode: 400, message: 'Maximum 2 renewals allowed.' };

  const newDueDate = new Date(txn.dueDate);
  newDueDate.setDate(newDueDate.getDate() + LOAN_PERIOD_DAYS);

  await txn.update({
    dueDate: newDueDate,
    renewalCount: txn.renewalCount + 1,
    status: 'active'
  });

  return txn;
};

// ── Get User Transactions ───────────────────────────────
const getUserTransactions = async ({ userId, status, page = 1, limit = 10 }) => {
  const where = { userId };
  if (status) where.status = status;

  const { count, rows } = await Transaction.findAndCountAll({
    where,
    include: [{
      model: BookCopy, as: 'bookCopy',
      include: [{ model: Book, as: 'book', attributes: ['id', 'title', 'author', 'coverImage', 'isbn'] }]
    }],
    order: [['createdAt', 'DESC']],
    limit: parseInt(limit),
    offset: (page - 1) * parseInt(limit),
    distinct: true
  });

  return {
    transactions: rows,
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / limit)
    }
  };
};

// ── Get All Transactions (Admin) ────────────────────────
const getAllTransactions = async ({ status, page = 1, limit = 10, search }) => {
  const where = {};
  if (status) where.status = status;

  const { count, rows } = await Transaction.findAndCountAll({
    where,
    include: [
      { model: User, as: 'user', attributes: ['id', 'name', 'email', 'department'] },
      {
        model: BookCopy, as: 'bookCopy',
        include: [{ model: Book, as: 'book', attributes: ['id', 'title', 'author', 'isbn'] }]
      }
    ],
    order: [['createdAt', 'DESC']],
    limit: parseInt(limit),
    offset: (page - 1) * parseInt(limit),
    distinct: true
  });

  return {
    transactions: rows,
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / limit)
    }
  };
};

// ── Check Overdue & Update Status ──────────────────────
const checkOverdue = async () => {
  const now = new Date();

  const overdueTransactions = await Transaction.findAll({
    where: {
      status: 'active',
      dueDate: { [Op.lt]: now }
    },
    include: [
      { model: User, as: 'user' },
      {
        model: BookCopy, as: 'bookCopy',
        include: [{ model: Book, as: 'book' }]
      }
    ]
  });

  for (const txn of overdueTransactions) {
    await txn.update({ status: 'overdue' });

    // Notify user
    const daysLate = Math.ceil((now - txn.dueDate) / (1000 * 60 * 60 * 24));
    await Notification.create({
      userId: txn.userId,
      type: 'overdue',
      title: 'Overdue Book',
      message: `"${txn.bookCopy.book.title}" is overdue by ${daysLate} day(s). Fine so far: ₹${daysLate * FINE_PER_DAY}.`
    });
  }

  return overdueTransactions.length;
};

// ── Dashboard Stats ─────────────────────────────────────
const getTransactionStats = async () => {
  const total = await Transaction.count();
  const active = await Transaction.count({ where: { status: 'active' } });
  const overdue = await Transaction.count({ where: { status: 'overdue' } });
  const returned = await Transaction.count({ where: { status: 'returned' } });
  const totalFines = await Transaction.sum('fineAmount') || 0;

  return { total, active, overdue, returned, totalFines };
};

module.exports = {
  issueBook, returnBook, renewBook,
  getUserTransactions, getAllTransactions,
  checkOverdue, getTransactionStats
};
