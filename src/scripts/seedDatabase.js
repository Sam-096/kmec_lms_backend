require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, testConnection } = require('../config/database');
const { User, Book, BookCopy, Transaction, Notification } = require('../models/index');

const seed = async () => {
  await testConnection();
  await sequelize.sync({ force: false });

  console.log('🌱 Seeding database...');

  // ===== USERS =====
  const hashedPassword = await bcrypt.hash('password123', 10);

  const users = await User.bulkCreate([
    {
      name: 'Admin User',
      email: 'admin@kmec.ac.in',
      password: hashedPassword,
      role: 'admin',
      phone: '9000000001',
      department: 'Library',
      status: 'active'
    },
    {
      name: 'Rahul Sharma',
      email: 'rahul@kmec.ac.in',
      password: hashedPassword,
      role: 'student',
      phone: '9000000002',
      department: 'Computer Science',
      semester: 6,
      status: 'active'
    },
    {
      name: 'Priya Reddy',
      email: 'priya@kmec.ac.in',
      password: hashedPassword,
      role: 'student',
      phone: '9000000003',
      department: 'Electronics',
      semester: 4,
      status: 'active'
    },
    {
      name: 'Arjun Mehta',
      email: 'arjun@kmec.ac.in',
      password: hashedPassword,
      role: 'faculty',
      phone: '9000000004',
      department: 'Mechanical',
      status: 'active'
    },
    {
      name: 'Sneha Patel',
      email: 'sneha@kmec.ac.in',
      password: hashedPassword,
      role: 'student',
      phone: '9000000005',
      department: 'Civil',
      semester: 2,
      status: 'active'
    },
    {
      name: 'Vikram Singh',
      email: 'vikram@kmec.ac.in',
      password: hashedPassword,
      role: 'student',
      phone: '9000000006',
      department: 'Computer Science',
      semester: 8,
      status: 'active'
    },
    {
      name: 'Anjali Nair',
      email: 'anjali@kmec.ac.in',
      password: hashedPassword,
      role: 'student',
      phone: '9000000007',
      department: 'Information Technology',
      semester: 5,
      status: 'active'
    }
  ], { individualHooks: false });

  console.log(`✅ ${users.length} users seeded`);

  // ===== BOOKS =====
  const books = await Book.bulkCreate([
    {
      isbn: '9780132350884',
      title: 'Clean Code',
      author: 'Robert C. Martin',
      publisher: 'Prentice Hall',
      publicationYear: 2008,
      category: 'Technology',
      description: 'A handbook of agile software craftsmanship',
      totalCopies: 5,
      availableCopies: 3,
      price: 450.00,
      tags: ['programming', 'best practices', 'software engineering'],
      coverImage: 'https://covers.openlibrary.org/b/isbn/9780132350884-L.jpg'
    },
    {
      isbn: '9780201633610',
      title: 'Design Patterns',
      author: 'Gang of Four',
      publisher: 'Addison-Wesley',
      publicationYear: 1994,
      category: 'Technology',
      description: 'Elements of reusable object-oriented software',
      totalCopies: 4,
      availableCopies: 4,
      price: 600.00,
      tags: ['design patterns', 'object oriented', 'architecture'],
      coverImage: 'https://covers.openlibrary.org/b/isbn/9780201633610-L.jpg'
    },
    {
      isbn: '9780735619678',
      title: 'Code Complete',
      author: 'Steve McConnell',
      publisher: 'Microsoft Press',
      publicationYear: 2004,
      category: 'Technology',
      description: 'A practical handbook of software construction',
      totalCopies: 3,
      availableCopies: 2,
      price: 520.00,
      tags: ['programming', 'software construction'],
      coverImage: 'https://covers.openlibrary.org/b/isbn/9780735619678-L.jpg'
    },
    {
      isbn: '9781491950357',
      title: 'Learning Python',
      author: 'Mark Lutz',
      publisher: "O'Reilly Media",
      publicationYear: 2013,
      category: 'Technology',
      description: 'Powerful Object-Oriented Programming',
      totalCopies: 8,
      availableCopies: 5,
      price: 380.00,
      tags: ['python', 'programming', 'beginners'],
      coverImage: 'https://covers.openlibrary.org/b/isbn/9781491950357-L.jpg'
    },
    {
      isbn: '9780596517748',
      title: 'JavaScript: The Good Parts',
      author: 'Douglas Crockford',
      publisher: "O'Reilly Media",
      publicationYear: 2008,
      category: 'Technology',
      description: 'Unearthing the excellence in JavaScript',
      totalCopies: 6,
      availableCopies: 6,
      price: 320.00,
      tags: ['javascript', 'web development', 'programming'],
      coverImage: 'https://covers.openlibrary.org/b/isbn/9780596517748-L.jpg'
    },
    {
      isbn: '9781617294945',
      title: 'React in Action',
      author: 'Mark Thomas',
      publisher: 'Manning Publications',
      publicationYear: 2018,
      category: 'Technology',
      description: 'Teaches you to think in components',
      totalCopies: 5,
      availableCopies: 3,
      price: 410.00,
      tags: ['react', 'javascript', 'frontend', 'web development'],
      coverImage: 'https://covers.openlibrary.org/b/isbn/9781617294945-L.jpg'
    },
    {
      isbn: '9780062316097',
      title: 'Sapiens',
      author: 'Yuval Noah Harari',
      publisher: 'Harper',
      publicationYear: 2015,
      category: 'History',
      description: 'A Brief History of Humankind',
      totalCopies: 7,
      availableCopies: 4,
      price: 399.00,
      tags: ['history', 'humanity', 'evolution'],
      coverImage: 'https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg'
    },
    {
      isbn: '9780735224292',
      title: 'Atomic Habits',
      author: 'James Clear',
      publisher: 'Avery',
      publicationYear: 2018,
      category: 'Non-Fiction',
      description: 'An easy and proven way to build good habits',
      totalCopies: 10,
      availableCopies: 7,
      price: 350.00,
      tags: ['habits', 'productivity', 'self improvement'],
      coverImage: 'https://covers.openlibrary.org/b/isbn/9780735224292-L.jpg'
    },
    {
      isbn: '9781501156700',
      title: 'Elon Musk',
      author: 'Ashlee Vance',
      publisher: 'Ecco',
      publicationYear: 2015,
      category: 'Biography',
      description: 'Tesla, SpaceX, and the Quest for a Fantastic Future',
      totalCopies: 4,
      availableCopies: 2,
      price: 370.00,
      tags: ['biography', 'entrepreneur', 'technology'],
      coverImage: 'https://covers.openlibrary.org/b/isbn/9781501156700-L.jpg'
    },
    {
      isbn: '9780071346085',
      title: 'Engineering Mathematics',
      author: 'B.S. Grewal',
      publisher: 'Khanna Publishers',
      publicationYear: 2017,
      category: 'Mathematics',
      description: 'Higher Engineering Mathematics',
      totalCopies: 15,
      availableCopies: 10,
      price: 550.00,
      tags: ['mathematics', 'engineering', 'calculus'],
      coverImage: 'https://covers.openlibrary.org/b/isbn/9780071346085-L.jpg'
    },
    {
      isbn: '9780131103627',
      title: 'The C Programming Language',
      author: 'Brian W. Kernighan',
      publisher: 'Prentice Hall',
      publicationYear: 1988,
      category: 'Technology',
      description: 'The classic reference for C programmers',
      totalCopies: 6,
      availableCopies: 5,
      price: 480.00,
      tags: ['c programming', 'systems programming'],
      coverImage: 'https://covers.openlibrary.org/b/isbn/9780131103627-L.jpg'
    },
    {
      isbn: '9780743273565',
      title: 'The Great Gatsby',
      author: 'F. Scott Fitzgerald',
      publisher: 'Scribner',
      publicationYear: 1925,
      category: 'Fiction',
      description: 'A story of the fabulously wealthy Jay Gatsby',
      totalCopies: 5,
      availableCopies: 5,
      price: 280.00,
      tags: ['classic', 'fiction', 'literature'],
      coverImage: 'https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg'
    }
  ]);

  console.log(`✅ ${books.length} books seeded`);

  // ===== BOOK COPIES =====
  const copies = [];
  for (const book of books) {
    for (let i = 1; i <= book.totalCopies; i++) {
      const isIssued = i > book.availableCopies;
      copies.push({
        bookId: book.id,
        copyNumber: `${book.isbn}-C${String(i).padStart(2, '0')}`,
        shelfLocation: `Shelf-${String.fromCharCode(65 + Math.floor(Math.random() * 5))}-${Math.floor(Math.random() * 20) + 1}`,
        status: isIssued ? 'issued' : 'available',
        condition: 'good',
        acquiredDate: new Date()
      });
    }
  }

  const createdCopies = await BookCopy.bulkCreate(copies);
  console.log(`✅ ${createdCopies.length} book copies seeded`);

  // ===== TRANSACTIONS =====
  const issuedCopies = createdCopies.filter(c => c.status === 'issued');
  const studentUsers = users.filter(u => u.role === 'student');

  const transactions = [];
  const now = new Date();

  for (let i = 0; i < issuedCopies.length; i++) {
    const issueDate = new Date(now);
    issueDate.setDate(issueDate.getDate() - Math.floor(Math.random() * 20));

    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + 14);

    const isOverdue = dueDate < now;

    transactions.push({
      userId: studentUsers[i % studentUsers.length].id,
      bookCopyId: issuedCopies[i].id,
      issueDate,
      dueDate,
      status: isOverdue ? 'overdue' : 'active',
      fineAmount: isOverdue
        ? Math.floor((now - dueDate) / (1000 * 60 * 60 * 24)) * 2
        : 0,
      renewalCount: 0
    });
  }

  const createdTransactions = await Transaction.bulkCreate(transactions);
  console.log(`✅ ${createdTransactions.length} transactions seeded`);

  // ===== NOTIFICATIONS =====
  const notifications = [
    {
      userId: users[1].id,
      type: 'due_soon',
      title: 'Book Due Soon',
      message: "Your book 'Clean Code' is due in 2 days. Please return or renew.",
      isRead: false
    },
    {
      userId: users[2].id,
      type: 'overdue',
      title: 'Overdue Book',
      message: "Your book 'Atomic Habits' is overdue by 3 days. Fine: ₹6",
      isRead: false
    },
    {
      userId: users[1].id,
      type: 'general',
      title: 'New Books Available',
      message: '5 new Technology books have been added to the library.',
      isRead: true
    },
    {
      userId: users[6].id,
      type: 'available',
      title: 'Waitlisted Book Available',
      message: "'React in Action' is now available for borrowing.",
      isRead: false
    }
  ];

  const createdNotifications = await Notification.bulkCreate(notifications);
  console.log(`✅ ${createdNotifications.length} notifications seeded`);

  console.log('\n🎉 Database seeded successfully!');
  console.log('\n📋 LOGIN CREDENTIALS:');
  console.log('─────────────────────────────────────');
  console.log('Admin:   admin@kmec.ac.in  / password123');
  console.log('Student: rahul@kmec.ac.in  / password123');
  console.log('Faculty: arjun@kmec.ac.in  / password123');
  console.log('─────────────────────────────────────');

  process.exit(0);
};

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
