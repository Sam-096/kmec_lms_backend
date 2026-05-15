const User = require('./User');
const Book = require('./Book');
const BookCopy = require('./BookCopy');
const Transaction = require('./Transaction');
const Reservation = require('./Reservation');
const Notification = require('./Notification');
const Review = require('./Review');

// Define relationships

// User relationships
User.hasMany(Transaction, { foreignKey: 'userId', as: 'transactions' });
User.hasMany(Reservation, { foreignKey: 'userId', as: 'reservations' });
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
User.hasMany(Review, { foreignKey: 'userId', as: 'reviews' });

// Book relationships
Book.hasMany(BookCopy, { foreignKey: 'bookId', as: 'copies' });
Book.hasMany(Reservation, { foreignKey: 'bookId', as: 'reservations' });
Book.hasMany(Review, { foreignKey: 'bookId', as: 'reviews' });

// BookCopy relationships
BookCopy.belongsTo(Book, { foreignKey: 'bookId', as: 'book' });
BookCopy.hasMany(Transaction, { foreignKey: 'bookCopyId', as: 'transactions' });

// Transaction relationships
Transaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Transaction.belongsTo(BookCopy, { foreignKey: 'bookCopyId', as: 'bookCopy' });

// Reservation relationships
Reservation.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Reservation.belongsTo(Book, { foreignKey: 'bookId', as: 'book' });

// Notification relationships
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Review relationships
Review.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Review.belongsTo(Book, { foreignKey: 'bookId', as: 'book' });

module.exports = {
  User,
  Book,
  BookCopy,
  Transaction,
  Reservation,
  Notification,
  Review
};
