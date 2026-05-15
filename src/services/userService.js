const { Op } = require('sequelize');
const { User, Transaction, BookCopy, Book } = require('../models/index');
const { resolveCoverImage } = require('../utils/coverImage');

const sanitize = (user) => {
  if (!user) return user;
  const obj = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
  delete obj.password;
  return obj;
};

const getAllUsers = async ({ search, role, status, page = 1, limit = 10 }) => {
  const where = {};
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

  if (search) {
    where[Op.or] = [
      { name:  { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
    ];
  }
  if (role)   where.role = role;
  if (status) where.status = status;

  const { count, rows } = await User.findAndCountAll({
    where,
    attributes: { exclude: ['password'] },
    limit: limitNum,
    offset: (pageNum - 1) * limitNum,
    order: [['createdAt', 'DESC']],
  });

  return {
    users: rows,
    pagination: {
      total: count,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(count / limitNum),
    },
  };
};

const getUserById = async (id) => {
  const user = await User.findByPk(id, { attributes: { exclude: ['password'] } });
  if (!user) throw { statusCode: 404, message: 'User not found.' };

  const activeTransactions = await Transaction.findAll({
    where: { userId: id, status: ['active', 'overdue'] },
    include: [{
      model: BookCopy, as: 'bookCopy',
      include: [{ model: Book, as: 'book', attributes: ['title', 'author', 'coverImage'] }],
    }],
  });

  const flatTransactions = activeTransactions.map(t => {
    const tx = t.toJSON();
    const bookTitle = tx.bookCopy?.book?.title ?? 'Unknown Book';
    const { coverImage, coverImageFallback } = resolveCoverImage({
      coverImage: tx.bookCopy?.book?.coverImage,
      title: bookTitle,
    });
    return {
      id:                 tx.id,
      status:             tx.status,
      issueDate:          tx.issueDate,
      dueDate:            tx.dueDate,
      renewalCount:       tx.renewalCount,
      fineAmount:         tx.fineAmount,
      bookTitle,
      bookAuthor:         tx.bookCopy?.book?.author ?? '',
      coverImage,
      coverImageFallback,
      copyNumber:         tx.bookCopy?.copyNumber    ?? '',
      shelfLocation:      tx.bookCopy?.shelfLocation ?? '',
    };
  });

  return { ...user.toJSON(), activeTransactions: flatTransactions };
};


const updateUser = async (id, data) => {
  const user = await User.findByPk(id);
  if (!user) throw { statusCode: 404, message: 'User not found.' };

  // Strip fields users must not self-update
  delete data.password;
  delete data.role;
  delete data.status;
  delete data.fineOwed;
  delete data.id;

  await user.update(data);
  return sanitize(user);
};

const updateUserStatus = async (id, status, adminId) => {
  if (id === adminId) throw { statusCode: 400, message: 'Cannot change your own status.' };

  const user = await User.findByPk(id);
  if (!user) throw { statusCode: 404, message: 'User not found.' };

  await user.update({ status });
  return sanitize(user);
};

const clearUserFine = async (id, amount) => {
  const user = await User.findByPk(id);
  if (!user) throw { statusCode: 404, message: 'User not found.' };

  const newFine = Math.max(0, parseFloat(user.fineOwed || 0) - parseFloat(amount));
  await user.update({ fineOwed: newFine });
  return { paidAmount: Number(amount), remainingFine: newFine };
};

const getUserStats = async () => {
  const [
    total, students, faculty, admins,
    active, suspended, pending,
  ] = await Promise.all([
    User.count(),
    User.count({ where: { role: 'student' } }),
    User.count({ where: { role: 'faculty' } }),
    User.count({ where: { role: 'admin' } }),
    User.count({ where: { status: 'active' } }),
    User.count({ where: { status: 'suspended' } }),
    User.count({ where: { status: 'pending' } }),
  ]);

  return { total, students, faculty, admins, active, suspended, pending };
};

module.exports = {
  getAllUsers, getUserById, updateUser,
  updateUserStatus, clearUserFine, getUserStats,
};
