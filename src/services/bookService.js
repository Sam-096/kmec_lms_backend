const { Op } = require('sequelize');
const { Book, BookCopy, Review } = require('../models/index');
const { applyCoverImage } = require('../utils/coverImage');

const getAllBooks = async ({ search, category, status, page = 1, limit = 10 }) => {
  const where = {};
  const copyWhere = {};

  if (search) {
    where[Op.or] = [
      { title: { [Op.like]: `%${search}%` } },
      { author: { [Op.like]: `%${search}%` } },
      { isbn: { [Op.like]: `%${search}%` } }
    ];
  }

  if (category) where.category = category;
  if (status === 'available') where.availableCopies = { [Op.gt]: 0 };
  if (status === 'unavailable') where.availableCopies = 0;

  const offset = (page - 1) * limit;

  const { count, rows } = await Book.findAndCountAll({
    where,
    include: [
      { model: BookCopy, as: 'copies', attributes: ['id', 'copyNumber', 'status', 'shelfLocation'] },
      { model: Review, as: 'reviews', attributes: ['rating'] }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['createdAt', 'DESC']],
    distinct: true
  });

  const books = rows.map(book => {
    const reviews = book.reviews || [];
    const avgRating = reviews.length
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : null;

    return applyCoverImage({
      ...book.toJSON(),
      avgRating,
      reviewCount: reviews.length
    });
  });

  return {
    books,
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / limit)
    }
  };
};

const getBookById = async (id) => {
  const book = await Book.findByPk(id, {
    include: [
      { model: BookCopy, as: 'copies' },
      {
        model: Review, as: 'reviews',
        include: [{ model: require('../models/User'), as: 'user', attributes: ['id', 'name', 'avatar'] }]
      }
    ]
  });

  if (!book) throw { statusCode: 404, message: 'Book not found.' };
  return applyCoverImage(book.toJSON());
};

const createBook = async (data) => {
  const existing = await Book.findOne({ where: { isbn: data.isbn } });
  if (existing) throw { statusCode: 409, message: 'Book with this ISBN already exists.' };

  const book = await Book.create(data);

  // Create book copies
  const copies = [];
  for (let i = 1; i <= data.totalCopies; i++) {
    copies.push({
      bookId: book.id,
      copyNumber: `${data.isbn}-C${String(i).padStart(2, '0')}`,
      shelfLocation: data.shelfLocation || 'Shelf-A-1',
      status: 'available',
      condition: 'good'
    });
  }
  await BookCopy.bulkCreate(copies);

  return book;
};

const updateBook = async (id, data) => {
  const book = await Book.findByPk(id);
  if (!book) throw { statusCode: 404, message: 'Book not found.' };

  await book.update(data);
  return book;
};

const deleteBook = async (id) => {
  const book = await Book.findByPk(id);
  if (!book) throw { statusCode: 404, message: 'Book not found.' };

  // Check if any copies are currently issued
  const issuedCopies = await BookCopy.count({
    where: { bookId: id, status: 'issued' }
  });

  if (issuedCopies > 0) {
    throw { statusCode: 400, message: `Cannot delete. ${issuedCopies} copies are currently issued.` };
  }

  await BookCopy.destroy({ where: { bookId: id } });
  await book.destroy();
  return true;
};

const getDashboardStats = async () => {
  const totalBooks = await Book.count();
  const totalCopies = await BookCopy.count();
  const issuedCopies = await BookCopy.count({ where: { status: 'issued' } });
  const availableCopies = await BookCopy.count({ where: { status: 'available' } });
  const damagedCopies = await BookCopy.count({ where: { status: 'damaged' } });

  const categoryStats = await Book.findAll({
    attributes: ['category', [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']],
    group: ['category']
  });

  return {
    totalBooks,
    totalCopies,
    issuedCopies,
    availableCopies,
    damagedCopies,
    categoryStats
  };
};

module.exports = { getAllBooks, getBookById, createBook, updateBook, deleteBook, getDashboardStats };
