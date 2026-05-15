const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const { resolveCoverImage } = require('../utils/coverImage');

// Adds coverImage + coverImageFallback to a row that has `title` or `bookTitle`.
const withCovers = (rows) => rows.map(r => {
  const { coverImage, coverImageFallback } = resolveCoverImage({
    coverImage: r.coverImage,
    title: r.title || r.bookTitle,
  });
  return { ...r, coverImage, coverImageFallback };
});

// ── ISSUE BOOK ────────────────────────────────────────────
exports.issueBook = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { userId, bookCopyId, dueDate } = req.body;

    // ✅ Step 1 — Check user can borrow
    const [borrowCheck] = await sequelize.query(
      `SELECT can_borrow(:userId)        AS canBorrow,
              active_borrow_count(:userId) AS activeCount`,
      { replacements: { userId }, type: QueryTypes.SELECT, transaction: t }
    );

    if (!borrowCheck.canBorrow) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: borrowCheck.activeCount >= 3
          ? 'Maximum 3 books allowed at a time'
          : 'Outstanding fine exceeds ₹50 — please clear fine first'
      });
    }

    // ✅ Step 2 — Check book copy is available
    const [copy] = await sequelize.query(
      `SELECT id, bookId, status FROM book_copies WHERE id = :bookCopyId`,
      { replacements: { bookCopyId }, type: QueryTypes.SELECT, transaction: t }
    );

    if (!copy) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Book copy not found' });
    }

    if (copy.status !== 'available') {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: `Book copy is currently ${copy.status}`
      });
    }

    // ✅ Step 3 — Create transaction
    const id = require('crypto').randomUUID();
    const issueDateVal = new Date();
    const dueDateVal = dueDate
      ? new Date(dueDate)
      : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days default

    await sequelize.query(
      `INSERT INTO transactions
         (id, userId, bookCopyId, issueDate, dueDate, status, createdAt, updatedAt)
       VALUES
         (:id, :userId, :bookCopyId, :issueDate, :dueDate, 'active', NOW(), NOW())`,
      {
        replacements: { id, userId, bookCopyId, issueDate: issueDateVal, dueDate: dueDateVal },
        type: QueryTypes.INSERT,
        transaction: t
      }
    );

    // ✅ Step 4 — Mark copy as issued
    await sequelize.query(
      `UPDATE book_copies SET status = 'issued', updatedAt = NOW() WHERE id = :bookCopyId`,
      { replacements: { bookCopyId }, type: QueryTypes.UPDATE, transaction: t }
    );

    // ✅ Step 5 — Decrement availableCopies on books
    await sequelize.query(
      `UPDATE books SET availableCopies = availableCopies - 1, updatedAt = NOW()
       WHERE id = :bookId AND availableCopies > 0`,
      { replacements: { bookId: copy.bookId }, type: QueryTypes.UPDATE, transaction: t }
    );

    await t.commit();

    res.status(201).json({
      success: true,
      message: 'Book issued successfully',
      data: { transactionId: id, dueDate: dueDateVal }
    });

  } catch (error) {
    await t.rollback();
    console.error('Issue book error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── RETURN BOOK ───────────────────────────────────────────
exports.returnBook = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { transactionId } = req.params;
    const { returnCondition = 'good', notes = '' } = req.body;

    // ✅ Step 1 — Get transaction
    const [txn] = await sequelize.query(
      `SELECT t.id, t.userId, t.bookCopyId, t.dueDate, t.status,
              bc.bookId
       FROM transactions t
       JOIN book_copies bc ON bc.id = t.bookCopyId
       WHERE t.id = :transactionId`,
      { replacements: { transactionId }, type: QueryTypes.SELECT, transaction: t }
    );

    if (!txn) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (txn.status === 'returned') {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Book already returned' });
    }

    // ✅ Step 2 — Calculate fine using DB function
    const [fineResult] = await sequelize.query(
      `SELECT calculate_fine(:dueDate, NOW()) AS fineAmount`,
      { replacements: { dueDate: txn.dueDate }, type: QueryTypes.SELECT, transaction: t }
    );

    const fineAmount = Number(fineResult.fineAmount || 0);

    // ✅ Step 3 — Update transaction to returned
    await sequelize.query(
      `UPDATE transactions
       SET status = 'returned',
           returnDate = NOW(),
           fineAmount = :fineAmount,
           returnCondition = :returnCondition,
           notes = :notes,
           updatedAt = NOW()
       WHERE id = :transactionId`,
      {
        replacements: { fineAmount, returnCondition, notes, transactionId },
        type: QueryTypes.UPDATE,
        transaction: t
      }
    );

    // ✅ Step 4 — Mark copy as available
    await sequelize.query(
      `UPDATE book_copies
       SET status = 'available', updatedAt = NOW()
       WHERE id = :bookCopyId`,
      { replacements: { bookCopyId: txn.bookCopyId }, type: QueryTypes.UPDATE, transaction: t }
    );

    // ✅ Step 5 — Increment availableCopies on books
    await sequelize.query(
      `UPDATE books
       SET availableCopies = availableCopies + 1, updatedAt = NOW()
       WHERE id = :bookId`,
      { replacements: { bookId: txn.bookId }, type: QueryTypes.UPDATE, transaction: t }
    );

    // ✅ Step 6 — Add fine to user's fineOwed
    if (fineAmount > 0) {
      await sequelize.query(
        `UPDATE users
         SET fineOwed = fineOwed + :fineAmount, updatedAt = NOW()
         WHERE id = :userId`,
        { replacements: { fineAmount, userId: txn.userId }, type: QueryTypes.UPDATE, transaction: t }
      );
    }

    await t.commit();

    res.json({
      success: true,
      message: fineAmount > 0
        ? `Book returned. Fine incurred: ₹${fineAmount.toFixed(2)}`
        : 'Book returned successfully. No fine.',
      data: { fineAmount, returnDate: new Date() }
    });

  } catch (error) {
    await t.rollback();
    console.error('Return book error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET ALL TRANSACTIONS (Admin) ──────────────────────────
exports.getAllTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const replacements = { limit: Number(limit), offset: Number(offset) };

    if (status) {
      whereClause += ' AND t.status = :status';
      replacements.status = status;
    }

    if (search) {
      whereClause += ' AND (u.name LIKE :search OR b.title LIKE :search)';
      replacements.search = `%${search}%`;
    }

    const transactions = await sequelize.query(
      `SELECT t.id, t.status, t.issueDate, t.dueDate, t.returnDate,
              t.fineAmount, t.renewalCount,
              u.id AS userId, u.name AS userName, u.email AS userEmail,
              b.id AS bookId, b.title AS bookTitle, b.author AS bookAuthor,
              bc.copyNumber, bc.shelfLocation,
              DATEDIFF(t.dueDate, NOW()) AS daysLeft,
              calculate_fine(t.dueDate, t.returnDate) AS calculatedFine
       FROM transactions t
       JOIN users u         ON u.id  = t.userId
       JOIN book_copies bc  ON bc.id = t.bookCopyId
       JOIN books b         ON b.id  = bc.bookId
       WHERE ${whereClause}
       ORDER BY t.createdAt DESC
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    );

    const [countResult] = await sequelize.query(
      `SELECT COUNT(*) AS total
       FROM transactions t
       JOIN users u        ON u.id  = t.userId
       JOIN book_copies bc ON bc.id = t.bookCopyId
       JOIN books b        ON b.id  = bc.bookId
       WHERE ${whereClause}`,
      { replacements, type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      data: {
        transactions: withCovers(transactions),
        pagination: {
          total: countResult.total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(countResult.total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get transactions error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET USER'S TRANSACTIONS (Student) ────────────────────
exports.getMyTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 't.userId = :userId';
    const replacements = { userId, limit: Number(limit), offset: Number(offset) };

    if (status) {
      whereClause += ' AND t.status = :status';
      replacements.status = status;
    }

    const transactions = await sequelize.query(
      `SELECT t.id, t.status, t.issueDate, t.dueDate, t.returnDate,
              t.fineAmount, t.renewalCount,
              b.title, b.author, b.category, b.coverImage,
              bc.copyNumber, bc.shelfLocation,
              DATEDIFF(t.dueDate, NOW()) AS daysLeft,
              calculate_fine(t.dueDate, t.returnDate) AS calculatedFine
       FROM transactions t
       JOIN book_copies bc ON bc.id = t.bookCopyId
       JOIN books b        ON b.id  = bc.bookId
       WHERE ${whereClause}
       ORDER BY t.createdAt DESC
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    );

    res.json({ success: true, data: { transactions: withCovers(transactions) } });

  } catch (error) {
    console.error('Get my transactions error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── RENEW BOOK ────────────────────────────────────────────
exports.renewBook = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user.id;

    const [txn] = await sequelize.query(
      `SELECT id, userId, dueDate, renewalCount, status
       FROM transactions WHERE id = :transactionId`,
      { replacements: { transactionId }, type: QueryTypes.SELECT }
    );

    if (!txn) return res.status(404).json({ success: false, message: 'Transaction not found' });
    if (txn.userId !== userId) return res.status(403).json({ success: false, message: 'Unauthorized' });
    if (txn.status !== 'active') return res.status(400).json({ success: false, message: 'Can only renew active transactions' });
    if (txn.renewalCount >= 2) return res.status(400).json({ success: false, message: 'Maximum 2 renewals allowed' });

    const newDueDate = new Date(txn.dueDate);
    newDueDate.setDate(newDueDate.getDate() + 14); // extend by 14 days

    await sequelize.query(
      `UPDATE transactions
       SET dueDate = :newDueDate,
           renewalCount = renewalCount + 1,
           updatedAt = NOW()
       WHERE id = :transactionId`,
      { replacements: { newDueDate, transactionId }, type: QueryTypes.UPDATE }
    );

    res.json({
      success: true,
      message: 'Book renewed successfully',
      data: { newDueDate, renewalCount: txn.renewalCount + 1 }
    });

  } catch (error) {
    console.error('Renew book error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET OVERDUE TRANSACTIONS (Admin) ──────────────────────
exports.getOverdue = async (req, res) => {
  try {
    const overdue = await sequelize.query(
      `SELECT t.id, t.dueDate, t.issueDate,
              DATEDIFF(NOW(), t.dueDate) AS daysOverdue,
              calculate_fine(t.dueDate, NULL) AS currentFine,
              u.name AS userName, u.email AS userEmail,
              b.title AS bookTitle, b.author AS bookAuthor
       FROM transactions t
       JOIN users u         ON u.id  = t.userId
       JOIN book_copies bc  ON bc.id = t.bookCopyId
       JOIN books b         ON b.id  = bc.bookId
       WHERE t.status = 'active' AND t.dueDate < NOW()
       ORDER BY daysOverdue DESC`,
      { type: QueryTypes.SELECT }
    );

    res.json({ success: true, data: { overdue, count: overdue.length } });

  } catch (error) {
    console.error('Get overdue error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const [active, returned, overdue, totalFinesRaw, topBooks] = await Promise.all([

      sequelize.query(
        `SELECT COUNT(*) AS count FROM transactions WHERE status = 'active'`,
        { type: QueryTypes.SELECT }
      ),

      sequelize.query(
        `SELECT COUNT(*) AS count FROM transactions WHERE status = 'returned'`,
        { type: QueryTypes.SELECT }
      ),

      sequelize.query(
        `SELECT COUNT(*) AS count FROM transactions WHERE status = 'overdue'`,
        { type: QueryTypes.SELECT }
      ),

      sequelize.query(
        `SELECT COALESCE(SUM(fineAmount), 0) AS total FROM transactions`,
        { type: QueryTypes.SELECT }
      ),

      // ✅ Top 5 most borrowed with book details via JOIN
      sequelize.query(
        `SELECT
           t.bookCopyId,
           COUNT(t.id)        AS borrowCount,
           b.id               AS bookId,
           b.title            AS bookTitle,
           b.author           AS bookAuthor,
           b.category         AS bookCategory,
           b.coverImage       AS bookCoverImage
         FROM transactions t
         JOIN book_copies bc ON bc.id = t.bookCopyId
         JOIN books b        ON b.id  = bc.bookId
         GROUP BY t.bookCopyId, b.id, b.title, b.author, b.category, b.coverImage
         ORDER BY borrowCount DESC
         LIMIT 5`,
        { type: QueryTypes.SELECT }
      )

    ]);

    return res.json({
      success: true,
      message: 'Transaction stats fetched.',
      data: {
        active:     Number(active[0].count),
        returned:   Number(returned[0].count),
        overdue:    Number(overdue[0].count),
        totalFines: Number(totalFinesRaw[0].total),
        topBooks:   topBooks.map(b => ({
          bookCopyId:    b.bookCopyId,
          borrowCount:   Number(b.borrowCount),
          bookId:        b.bookId,
          bookTitle:     b.bookTitle,
          bookAuthor:    b.bookAuthor,
          bookCategory:  b.bookCategory,
          bookCoverImage: b.bookCoverImage
        }))
      }
    });

  } catch (error) {
    console.error('Stats error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};





