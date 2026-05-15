const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BookCopy = sequelize.define('BookCopy', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  bookId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'books',
      key: 'id'
    }
  },
  copyNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  qrCode: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  shelfLocation: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('available', 'issued', 'damaged', 'lost', 'maintenance'),
    defaultValue: 'available'
  },
  condition: {
    type: DataTypes.ENUM('excellent', 'good', 'fair', 'poor'),
    defaultValue: 'good'
  },
  acquiredDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'book_copies',
  timestamps: true
});

module.exports = BookCopy;
