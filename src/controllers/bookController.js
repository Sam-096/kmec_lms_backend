const bookService = require('../services/bookService');
const { successResponse, errorResponse } = require('../utils/response');

const getBooks = async (req, res) => {
  try {
    const { search, category, status, page, limit } = req.query;
    const result = await bookService.getAllBooks({ search, category, status, page, limit });
    return successResponse(res, 200, 'Books fetched successfully.', result);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message);
  }
};

const getBook = async (req, res) => {
  try {
    const book = await bookService.getBookById(req.params.id);
    return successResponse(res, 200, 'Book fetched successfully.', book);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message);
  }
};

const createBook = async (req, res) => {
  try {
    const book = await bookService.createBook(req.body);
    return successResponse(res, 201, 'Book created successfully.', book);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message);
  }
};

const updateBook = async (req, res) => {
  try {
    const book = await bookService.updateBook(req.params.id, req.body);
    return successResponse(res, 200, 'Book updated successfully.', book);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message);
  }
};

const deleteBook = async (req, res) => {
  try {
    await bookService.deleteBook(req.params.id);
    return successResponse(res, 200, 'Book deleted successfully.');
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message);
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const stats = await bookService.getDashboardStats();
    return successResponse(res, 200, 'Stats fetched successfully.', stats);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message);
  }
};

module.exports = { getBooks, getBook, createBook, updateBook, deleteBook, getDashboardStats };
