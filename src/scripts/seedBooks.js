const path = require('path');
const fs   = require('fs');
require('dotenv').config();

const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

async function seedBooks() {
  console.log('\n📚 KMEC Library Book Seeder v3');
  console.log('================================');

  const jsonPath = path.join(__dirname, '../../books_data.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ books_data.json not found at:', jsonPath);
    process.exit(1);
  }

  const { books, copies } = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`📖 Loaded: ${books.length} books, ${copies.length} copies`);

  try {
    // ── Clear tables ────────────────────────────────────────
    console.log('\n🔓 Clearing tables...');
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    await sequelize.query('TRUNCATE TABLE book_copies');
    await sequelize.query('TRUNCATE TABLE books');
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('🗑️  Done');

    // ── Insert books in batches of 50 ───────────────────────
    console.log('\n📥 Inserting books...');
    const BATCH = 50;
    for (let i = 0; i < books.length; i += BATCH) {
      const batch = books.slice(i, i + BATCH);
      const placeholders = batch.map(() =>
        '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).join(', ');

      const values = batch.flatMap(b => [
        b.id,
        b.isbn,
        b.title,
        b.author,
        b.publisher,
        b.publicationYear,
        b.category,
        b.language,
        b.edition,
        b.pages,
        b.description,
        b.coverImage,
        b.totalCopies,
        b.availableCopies,
        b.price,
        JSON.stringify(b.tags),   // tags is JSON column
        '2026-01-01 00:00:00',
        '2026-01-01 00:00:00'
      ]);

      await sequelize.query(
        `INSERT INTO books
           (id, isbn, title, author, publisher, publicationYear,
            category, language, edition, pages, description,
            coverImage, totalCopies, availableCopies, price,
            tags, createdAt, updatedAt)
         VALUES ${placeholders}`,
        { replacements: values, type: QueryTypes.INSERT }
      );

      const done = Math.min(i + BATCH, books.length);
      process.stdout.write(`   ✅ Books: ${done}/${books.length}\r`);
    }
    console.log(`\n   ✅ All ${books.length} books inserted`);

    // ── Insert copies in batches of 100 ────────────────────
    console.log('\n📦 Inserting copies...');
    const COPY_BATCH = 100;
    for (let i = 0; i < copies.length; i += COPY_BATCH) {
      const batch = copies.slice(i, i + COPY_BATCH);
      const placeholders = batch.map(() =>
        '(?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).join(', ');

      const values = batch.flatMap(c => [
        c.id, c.bookId, c.copyNumber, c.shelfLocation,
        c.status, c.condition,
        '2026-01-01', '2026-01-01 00:00:00', '2026-01-01 00:00:00'
      ]);

      await sequelize.query(
        `INSERT INTO book_copies
           (id, bookId, copyNumber, shelfLocation,
            status, \`condition\`, acquiredDate, createdAt, updatedAt)
         VALUES ${placeholders}`,
        { replacements: values, type: QueryTypes.INSERT }
      );

      const done = Math.min(i + COPY_BATCH, copies.length);
      process.stdout.write(`   ✅ Copies: ${done}/${copies.length}\r`);
    }
    console.log(`\n   ✅ All ${copies.length} copies inserted`);

    // ── Verify ──────────────────────────────────────────────
    const [[{ bookCount }]] = await sequelize.query(
      'SELECT COUNT(*) AS bookCount FROM books'
    );
    const [[{ copyCount }]] = await sequelize.query(
      'SELECT COUNT(*) AS copyCount FROM book_copies'
    );

    console.log('\n================================');
    console.log('✅ SEED COMPLETE!');
    console.log(`   📗 Books:  ${bookCount}`);
    console.log(`   📋 Copies: ${copyCount}`);
    console.log('================================\n');

  } catch (err) {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    console.error('\n❌ Seed failed:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

seedBooks();
