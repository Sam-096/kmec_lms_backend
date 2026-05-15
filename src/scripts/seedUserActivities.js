const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const crypto = require('crypto');

async function seed() {
  try {
    console.log('🌱 Starting full activity seed...\n');

    // ── Step 1: Fetch real data ───────────────────────────
    const users = await sequelize.query(
      `SELECT id, name, email, role FROM users 
       WHERE role IN ('student', 'faculty') 
       ORDER BY createdAt ASC`,
      { type: QueryTypes.SELECT }
    );

    const copies = await sequelize.query(
      `SELECT bc.id AS copyId, bc.bookId, b.title, b.category, b.price
       FROM book_copies bc
       JOIN books b ON b.id = bc.bookId
       WHERE bc.status = 'available'
       ORDER BY RAND()
       LIMIT 100`,
      { type: QueryTypes.SELECT }
    );

    if (!users.length || !copies.length) {
      console.log('❌ No users or book copies found.');
      process.exit(1);
    }
    console.log(`✅ Found ${users.length} users, ${copies.length} available copies\n`);

    // ── Step 2: Clean previous seeded data ────────────────
    await sequelize.query(
      `DELETE FROM transactions WHERE notes = 'seeded'`,
      { type: QueryTypes.DELETE }
    );
    await sequelize.query(
      `UPDATE book_copies SET status = 'available' WHERE status = 'issued'`,
      { type: QueryTypes.UPDATE }
    );
    console.log('🧹 Cleared previous seeded data\n');

    // ── Step 3: Generate 6 months of transactions ─────────
    const now    = new Date();
    const transactions = [];
    const usedCopies   = new Set(); // prevent duplicate active borrows

    // Per-user activity profiles
    const userProfiles = [
      { borrowed: 12, overdueChance: 0.1 }, // heavy reader
      { borrowed: 8,  overdueChance: 0.2 }, // moderate reader
      { borrowed: 6,  overdueChance: 0.0 }, // responsible reader
      { borrowed: 10, overdueChance: 0.3 }, // occasional overdue
      { borrowed: 4,  overdueChance: 0.1 }, // light reader
      { borrowed: 7,  overdueChance: 0.2 },
      { borrowed: 5,  overdueChance: 0.0 },
      { borrowed: 9,  overdueChance: 0.1 },
      { borrowed: 3,  overdueChance: 0.2 },
      { borrowed: 6,  overdueChance: 0.0 },
    ];

    let copyIndex = 0;

    for (let u = 0; u < users.length; u++) {
      const user    = users[u];
      const profile = userProfiles[u % userProfiles.length];

      console.log(`👤 Building activity for ${user.name} (${profile.borrowed} transactions)...`);

      for (let i = 0; i < profile.borrowed; i++) {

        // Pick a unique copy
        let copy = null;
        for (let c = copyIndex; c < copies.length; c++) {
          if (!usedCopies.has(copies[c].copyId)) {
            copy = copies[c];
            copyIndex = c + 1;
            break;
          }
        }
        if (!copy) {
          copyIndex = 0; // reset if exhausted
          copy = copies[i % copies.length];
        }

        // Spread over last 6 months
        const daysAgo   = Math.floor(Math.random() * 180) + 1;
        const issueDate = new Date(now);
        issueDate.setDate(issueDate.getDate() - daysAgo);

        const dueDate = new Date(issueDate);
        dueDate.setDate(dueDate.getDate() + 14);

        // Determine status
        let status, returnDate, fineAmount, returnCondition;
        const isRecent   = daysAgo <= 14;
        const isOverdue  = !isRecent && Math.random() < profile.overdueChance;

        if (isRecent) {
          // Recent issues are active
          status          = 'active';
          returnDate      = null;
          fineAmount      = 0;
          returnCondition = null;
          usedCopies.add(copy.copyId);  // keep as issued
        } else if (isOverdue) {
          // Past due and not returned
          status          = 'overdue';
          returnDate      = null;
          const daysLate  = Math.floor(Math.random() * 20) + 1;
          fineAmount      = daysLate * 5;
          returnCondition = null;
          usedCopies.add(copy.copyId);
        } else {
          // Returned
          status          = 'returned';
          const returnAfter = Math.floor(Math.random() * 14) + 1;
          returnDate      = new Date(issueDate);
          returnDate.setDate(returnDate.getDate() + returnAfter);

          // Late return fine
          const wasLate   = returnAfter > 14;
          fineAmount      = wasLate ? (returnAfter - 14) * 5 : 0;
          returnCondition = ['good', 'good', 'good', 'fair', 'damaged'][
            Math.floor(Math.random() * 5)
          ];
        }

        transactions.push({
          id:              crypto.randomUUID(),
          userId:          user.id,
          bookCopyId:      copy.copyId,
          bookId:          copy.bookId,
          issueDate,
          dueDate,
          returnDate,
          status,
          fineAmount,
          renewalCount:    Math.random() > 0.8 ? 1 : 0,
          returnCondition,
          notes:           'seeded',
          createdAt:       issueDate,
          updatedAt:       returnDate ?? now
        });
      }
    }

    // ── Step 4: Insert transactions ───────────────────────
    console.log(`\n📥 Inserting ${transactions.length} transactions...`);
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

    // ── Step 5: Update book_copies to 'issued' ────────────
    const issuedCopyIds = [...usedCopies].map(id => `'${id}'`).join(',');
    if (issuedCopyIds) {
      await sequelize.query(
        `UPDATE book_copies 
         SET status = 'issued', updatedAt = NOW()
         WHERE id IN (${issuedCopyIds})`,
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
    console.log('✅ Recalculated availableCopies\n');

    // ── Step 7: Update user activity stats ────────────────
    console.log('👤 Updating user activity stats...');

    // Check which columns exist in users table
    const columns = await sequelize.query(
      `SHOW COLUMNS FROM users`,
      { type: QueryTypes.SELECT }
    );
    const colNames = columns.map(c => c.Field);

    for (const user of users) {

      // Full activity summary per user
      const [activity] = await sequelize.query(
        `SELECT
           COUNT(*)                               AS totalBorrowed,
           SUM(status = 'returned')               AS totalReturned,
           SUM(status = 'active')                 AS activeBooks,
           SUM(status = 'overdue')                AS overdueBooks,
           COALESCE(SUM(fineAmount), 0)           AS totalFinesIncurred,
           COALESCE(
             SUM(CASE WHEN status = 'overdue' 
                 THEN fineAmount ELSE 0 END), 0)  AS currentFineOwed,
           COUNT(DISTINCT bookCopyId)             AS uniqueBooksBorrowed,
           SUM(renewalCount)                      AS totalRenewals,
           MIN(issueDate)                         AS firstBorrowDate,
           MAX(issueDate)                         AS lastBorrowDate
         FROM transactions
         WHERE userId = :userId AND notes = 'seeded'`,
        { replacements: { userId: user.id }, type: QueryTypes.SELECT }
      );

      // Build SET clause from existing columns only
      const updates      = [];
      const replacements = { userId: user.id };

      const colMap = {
        fineOwed:      { val: Number(activity.currentFineOwed),   key: 'fineOwed'      },
        totalBorrowed: { val: Number(activity.totalBorrowed),      key: 'totalBorrowed' },
        lastActivity:  { val: activity.lastBorrowDate ?? now,      key: 'lastActivity'  },
      };

      Object.entries(colMap).forEach(([col, { val, key }]) => {
        if (colNames.includes(col)) {
          updates.push(`${col} = :${key}`);
          replacements[key] = val;
        }
      });

      // updatedAt always exists
      updates.push('updatedAt = NOW()');

      await sequelize.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = :userId`,
        { replacements, type: QueryTypes.UPDATE }
      );

      console.log(
        `   ✅ ${user.name.padEnd(20)} | ` +
        `Borrowed: ${String(activity.totalBorrowed).padStart(3)} | ` +
        `Returned: ${String(activity.totalReturned ?? 0).padStart(3)} | ` +
        `Active: ${String(activity.activeBooks ?? 0).padStart(2)} | ` +
        `Overdue: ${String(activity.overdueBooks ?? 0).padStart(2)} | ` +
        `Fines: ₹${activity.currentFineOwed}`
      );
    }

    // ── Step 8: Final summary ─────────────────────────────
    const [summary] = await sequelize.query(
      `SELECT
         COUNT(*)                     AS total,
         SUM(status = 'active')       AS active,
         SUM(status = 'returned')     AS returned,
         SUM(status = 'overdue')      AS overdue,
         COALESCE(SUM(fineAmount), 0) AS totalFines
       FROM transactions WHERE notes = 'seeded'`,
      { type: QueryTypes.SELECT }
    );

    console.log('\n📊 ─── Final Summary ───────────────────────');
    console.log(`   Total Transactions : ${summary.total}`);
    console.log(`   Active             : ${summary.active}`);
    console.log(`   Returned           : ${summary.returned}`);
    console.log(`   Overdue            : ${summary.overdue}`);
    console.log(`   Total Fines        : ₹${summary.totalFines}`);
    console.log('────────────────────────────────────────────');
    console.log('🎉 Seed complete!\n');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Seed failed:', err.message);
    console.error(err);
    process.exit(1);
  }
}

seed();
