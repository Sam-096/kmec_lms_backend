const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Book = sequelize.define('Book', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  isbn: {
    type: DataTypes.STRING(20),
    unique: true,
    allowNull: false
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  author: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  publisher: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  publicationYear: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 1900,
      max: new Date().getFullYear()
    }
  },
  category: {
    type: DataTypes.ENUM('Fiction', 'Non-Fiction', 'Science', 'Technology', 'History', 'Biography', 'Mathematics', 'Engineering', 'Literature', 'Other'),
    defaultValue: 'Other'
  },
  language: {
    type: DataTypes.STRING(50),
    defaultValue: 'English'
  },
  edition: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  pages: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  coverImage: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  totalCopies: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    validate: {
      min: 0
    }
  },
  availableCopies: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    validate: {
      min: 0
    }
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'books',
  timestamps: true
});

module.exports = Book;
