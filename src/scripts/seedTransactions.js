const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const crypto = require('crypto');

async function seed() {
  try {
    console.log('🌱 Starting full seed...\n');

    // ── Step 1: Fetch existing data ───────────────────────
    const users = await sequelize.query(
      `SELECT id, name, email FROM users WHERE role IN ('student', 'faculty') LIMIT 10`,
      { type: QueryTypes.SELECT }
    );

    const copies = await sequelize.query(
      `SELECT bc.id AS copyId, bc.bookId, b.title, b.category
       FROM book_copies bc
       JOIN books b ON b.id = bc.bookId
       ORDER BY RAND()
       LIMIT 60`,
      { type: QueryTypes.SELECT }
    );

    if (!users.length || !copies.length) {
      console.log('❌ No users or book copies found.');
      process.exit(1);
    }

    console.log(`✅ Found ${users.length} users, ${copies.length} copies\n`);

    // ── Step 2: Clean previous seeded data ────────────────
    await sequelize.query(`DELETE FROM transactions WHERE notes = 'seeded'`, { type: QueryTypes.DELETE });
    console.log('🧹 Cleared previous seeded transactions');

    // ── Step 3: Build transactions ────────────────────────
    const now = new Date();

    // Template: each entry = one transaction profile
    const templates = [
      // ── Returned (historical) ─────────────────────
      { status: 'returned', daysAgo: 60, dueDays: 14, returnedAfter: 10, fine: 0  },
      { status: 'returned', daysAgo: 55, dueDays: 14, returnedAfter: 12, fine: 0  },
      { status: 'returned', daysAgo: 50, dueDays: 14, returnedAfter: 13, fine: 0  },
      { status: 'returned', daysAgo: 45, dueDays: 14, returnedAfter: 14, fine: 0  },
      { status: 'returned', daysAgo: 40, dueDays: 14, returnedAfter: 10, fine: 0  },
      { status: 'returned', daysAgo: 35, dueDays: 14, returnedAfter: 11, fine: 0  },
      { status: 'returned', daysAgo: 30, dueDays: 14, returnedAfter: 9,  fine: 0  },
      { status: 'returned', daysAgo: 28, dueDays: 14, returnedAfter: 7,  fine: 0  },
      { status: 'returned', daysAgo: 25, dueDays: 14, returnedAfter: 12, fine: 0  },
      { status: 'returned', daysAgo: 20, dueDays: 14, returnedAfter: 10, fine: 0  },
      { status: 'returned', daysAgo: 18, dueDays: 14, returnedAfter: 14, fine: 0  },
      { status: 'returned', daysAgo: 15, dueDays: 14, returnedAfter: 8,  fine: 0  },
      { status: 'returned', daysAgo: 12, dueDays: 14, returnedAfter: 6,  fine: 0  },
      { status: 'returned', daysAgo: 10, dueDays: 14, returnedAfter: 5,  fine: 0  },

      // ── Returned with fines ────────────────────────
      { status: 'returned', daysAgo: 40, dueDays: 14, returnedAfter: 20, fine: 30 },
      { status: 'returned', daysAgo: 35, dueDays: 14, returnedAfter: 22, fine: 40 },
      { status: 'returned', daysAgo: 30, dueDays: 14, returnedAfter: 18, fine: 20 },

      // ── Active (currently issued) ──────────────────
      { status: 'active', daysAgo: 10, dueDays: 14, returnedAfter: null, fine: 0 },
      { status: 'active', daysAgo: 8,  dueDays: 14, returnedAfter: null, fine: 0 },
      { status: 'active', daysAgo: 6,  dueDays: 14, returnedAfter: null, fine: 0 },
      { status: 'active', daysAgo: 4,  dueDays: 14, returnedAfter: null, fine: 0 },
      { status: 'active', daysAgo: 3,  dueDays: 14, returnedAfter: null, fine: 0 },

      // ── Overdue ────────────────────────────────────
      { status: 'overdue', daysAgo: 30, dueDays: 14, returnedAfter: null, fine: 80  },
      { status: 'overdue', daysAgo: 25, dueDays: 14, returnedAfter: null, fine: 55  },
      { status: 'overdue', daysAgo: 22, dueDays: 14, returnedAfter: null, fine: 40  },
      { status: 'overdue', daysAgo: 20, dueDays: 14, returnedAfter: null, fine: 30  },
    ];

    const transactions = templates.map((t, idx) => {
      const user   = users[idx % users.length];
      const copy   = copies[idx % copies.length];

      const issueDate = new Date(now);
      issueDate.setDate(issueDate.getDate() - t.daysAgo);

      const dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + t.dueDays);

      const returnDate = t.returnedAfter
        ? (() => {
            const d = new Date(issueDate);
            d.setDate(d.getDate() + t.returnedAfter);
            return d;
          })()
        : null;

      return {
        id:              crypto.randomUUID(),
        userId:          user.id,
        bookCopyId:      copy.copyId,
        bookId:          copy.bookId,
        issueDate,
        dueDate,
        returnDate,
        status:          t.status,
        fineAmount:      t.fine,
        renewalCount:    0,
        returnCondition: returnDate ? 'good' : null,
        notes:           'seeded',
        createdAt:       issueDate,
        updatedAt:       returnDate ?? now
      };
    });

    // ── Step 4: Insert transactions ───────────────────────
    for (const txn of transactions) {
      await sequelize.query(
        `INSERT INTO transactions
           (id, userId, bookCopyId, issueDate, dueDate, returnDate,
            status, fineAmount, renewalCount, returnCondition,
            notes, createdAt, updatedAt)
         VALUES
           (:id, :userId, :bookCopyId, :issueDate, :dueDate, :returnDate,
            :status, :fineAmount, :renewalCount, :returnCondition,
            :notes, :createdAt, :updatedAt)`,
        { replacements: txn, type: QueryTypes.INSERT }
      );
    }
    console.log(`✅ Inserted ${transactions.length} transactions`);

    // ── Step 5: Update book_copies status ─────────────────
    const activeOrOverdue = transactions
      .filter(t => t.status === 'active' || t.status === 'overdue')
      .map(t => `'${t.bookCopyId}'`)
      .join(',');

    if (activeOrOverdue) {
      await sequelize.query(
        `UPDATE book_copies SET status = 'issued', updatedAt = NOW()
         WHERE id IN (${activeOrOverdue})`,
        { type: QueryTypes.UPDATE }
      );
    }
    console.log('✅ Updated book_copies statuses');

    // ── Step 6: Recalculate books.availableCopies ─────────
    await sequelize.query(
      `UPDATE books b
       SET availableCopies = (
         SELECT COUNT(*) FROM book_copies bc
         WHERE bc.bookId = b.id AND bc.status = 'available'
       ), updatedAt = NOW()`,
      { type: QueryTypes.UPDATE }
    );
    console.log('✅ Recalculated availableCopies');

    // ── Step 7: Update user activity stats ────────────────
    console.log('\n👤 Updating user activity stats...');

    for (const user of users) {
      const [stats] = await sequelize.query(
        `SELECT
           COUNT(*)                                        AS totalBorrowed,
           SUM(status = 'returned')                        AS totalReturned,
           SUM(status = 'active')                          AS currentlyActive,
           SUM(status = 'overdue')                         AS overdueCount,
           COALESCE(SUM(fineAmount), 0)                    AS totalFines,
           MAX(issueDate)                                   AS lastBorrowDate
         FROM transactions
         WHERE userId = :userId`,
        { replacements: { userId: user.id }, type: QueryTypes.SELECT }
      );

      // Check if users table has these columns before updating
      const columns = await sequelize.query(
        `SHOW COLUMNS FROM users`,
        { type: QueryTypes.SELECT }
      );
      const colNames = columns.map((c) => c.Field);

      // Build dynamic SET clause based on existing columns
      const updates = [];
      const replacements = { userId: user.id };

      if (colNames.includes('totalBorrowed')) {
        updates.push('totalBorrowed = :totalBorrowed');
        replacements.totalBorrowed = Number(stats.totalBorrowed);
      }
      if (colNames.includes('fineOwed')) {
        // Only add fines for overdue transactions
        const [overdueStats] = await sequelize.query(
          `SELECT COALESCE(SUM(fineAmount), 0) AS owedFines
           FROM transactions
           WHERE userId = :userId AND status = 'overdue'`,
          { replacements: { userId: user.id }, type: QueryTypes.SELECT }
        );
        updates.push('fineOwed = :fineOwed');
        replacements.fineOwed = Number(overdueStats.owedFines);
      }
      if (colNames.includes('lastActivity')) {
        updates.push('lastActivity = :lastActivity');
        replacements.lastActivity = stats.lastBorrowDate ?? now;
      }
      if (colNames.includes('updatedAt')) {
        updates.push('updatedAt = NOW()');
      }

      if (updates.length > 0) {
        await sequelize.query(
          `UPDATE users SET ${updates.join(', ')} WHERE id = :userId`,
          { replacements, type: QueryTypes.UPDATE }
        );
      }

      console.log(`   ✅ ${user.name}: ${stats.totalBorrowed} borrows, ₹${stats.totalFines} fines`);
    }

    // ── Step 8: Print summary ─────────────────────────────
    console.log('\n📊 Seed Summary:');
    console.log(`   Active:   ${transactions.filter(t => t.status === 'active').length}`);
    console.log(`   Returned: ${transactions.filter(t => t.status === 'returned').length}`);
    console.log(`   Overdue:  ${transactions.filter(t => t.status === 'overdue').length}`);
    console.log(`   Total:    ${transactions.length}`);
    console.log('\n🎉 Seed complete!');
    process.exit(0);

  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
