'use strict';

const ollamaService = require('../services/ollamaService');
const { sequelize }  = require('../config/database');
const { QueryTypes } = require('sequelize');
const {
  buildStudentSystemPrompt,
  buildAdminSystemPrompt,
} = require('../utils/prompts');


// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════

/** Format a value as Indian Rupees */
const inr = (v) => `₹${Number(v || 0).toFixed(2)}`;

/** Format a DB date to Indian locale */
const dateIN = (d) => new Date(d).toLocaleDateString('en-IN');

/**
 * Strip punctuation/special chars from a search string for safe SQL LIKE use.
 * Returns the cleaned string, or `fallback` if it ends up too short.
 */
const safeKw = (text, fallback = 'a') => {
  const cleaned = text.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  return cleaned.length >= 2 ? cleaned : fallback;
};

/**
 * Extract a book title from common summary-request patterns:
 *   "Summarize Atomic Habits"
 *   "Give me a summary of Clean Code by Robert Martin"
 *   "What is Elon Musk about"
 *   "Summarize a book"  → returns null (no specific title given)
 */
const extractBookTitle = (message) => {
  const patterns = [
    /(?:summary\s+(?:of|for)|summarize)\s+["']?(.+?)["']?(?:\s+by\s+.+)?$/i,
    /(?:tell\s+me\s+about|describe)\s+["']?(.+?)["']?(?:\s+by\s+.+)?$/i,
    /(?:what\s+is|what's)\s+["']?(.+?)["']?\s+about/i,
    /(?:give\s+me\s+(?:a\s+)?(?:summary|overview)\s+of)\s+["']?(.+?)["']?(?:\s+by\s+.+)?$/i,
  ];
  for (const re of patterns) {
    const m = message.match(re);
    if (m && m[1]) {
      const t = m[1].trim();
      // Exclude generic phrases like "a book", "any book"
      if (t.toLowerCase() !== 'a book' && t.toLowerCase() !== 'any book' && t.length > 2) {
        return t;
      }
    }
  }
  return null;
};

/**
 * Extract a book title from citation-request patterns:
 *   "cite Clean Code"
 *   "Citation for Clean Code by Robert Martin"
 *   "How do I cite Atomic Habits"
 *   "Get a citation"  → returns null (no specific title given)
 */
const extractCitationTitle = (message) => {
  const patterns = [
    /(?:cite|citation\s+for|reference\s+for|bibliography\s+for)\s+["']?(.+?)["']?(?:\s+by\s+.+)?$/i,
    /(?:apa|mla|ieee)\s+(?:for|of|citation\s+for)\s+["']?(.+?)["']?(?:\s+by\s+.+)?$/i,
    /how\s+do\s+i\s+cite\s+["']?(.+?)["']?(?:\s+by\s+.+)?$/i,
  ];
  for (const re of patterns) {
    const m = message.match(re);
    if (m && m[1]) {
      const t = m[1].trim();
      if (t.length > 2) return t;
    }
  }
  return null;
};


// ═══════════════════════════════════════════════════════════
//  STUDENT INTENT HANDLERS
//  All share signature: (userId, user, message) → Promise<string>
// ═══════════════════════════════════════════════════════════

async function handleStudentGreeting(userId, user) {
  const [active] = await sequelize.query(
    `SELECT COUNT(*) AS count
     FROM transactions
     WHERE userId = :userId AND status IN ('active','overdue')`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  const fine = Number(user.fineOwed || 0);
  const fineNote = fine > 0
    ? `\n⚠️  You have an outstanding fine of ${inr(fine)}. Please clear it at the counter.`
    : `\n✅ No outstanding fines — your account is clear.`;

  return (
    `Hi ${user.name}! 👋 Welcome to KMEC Library Assistant.\n\n` +
    `📚 Books with you: ${active.count}/3${fineNote}\n\n` +
    `You can ask me about your books, fines, due dates, renewals, recommendations, or get a citation for any book in our catalogue.`
  );
}

async function handleFineQuery(userId, user) {
  const fine = Number(user.fineOwed || 0);
  if (fine === 0) {
    return `Great news, ${user.name}! 🎉 You have no outstanding fines — your account is completely clear.`;
  }
  const blocked = fine >= 50;
  return (
    `💰 Your outstanding fine is **${inr(fine)}**.\n\n` +
    (blocked
      ? `🚫 **Borrowing is currently blocked** because your fine exceeds the ₹50 limit.\n` +
        `Please visit the library counter to clear your dues and restore borrowing access.`
      : `You can still borrow books. Please clear the fine at the library counter soon.`)
  );
}

async function handleDueDateQuery(userId) {
  const borrows = await sequelize.query(
    `SELECT b.title, t.dueDate, DATEDIFF(t.dueDate, NOW()) AS daysLeft
     FROM transactions t
     JOIN book_copies bc ON bc.id = t.bookCopyId
     JOIN books b        ON b.id  = bc.bookId
     WHERE t.userId = :userId AND t.status IN ('active','overdue')
     ORDER BY t.dueDate ASC`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );

  if (borrows.length === 0) {
    return `You have no books currently borrowed. Visit the library to borrow some! 📚`;
  }

  const lines = borrows.map((b) => {
    const days = Number(b.daysLeft);
    const due  = dateIN(b.dueDate);
    let flag;
    if (days < 0)        flag = `🔴 OVERDUE by **${Math.abs(days)} day(s)** — Accrued fine: ${inr(Math.abs(days) * 2)}`;
    else if (days === 0) flag = `🟡 **Due TODAY** — please return immediately`;
    else if (days <= 3)  flag = `🟠 Due in **${days} day(s)** on ${due}`;
    else                 flag = `🟢 ${days} days left (due ${due})`;
    return `• **"${b.title}"** → ${flag}`;
  });

  return `📅 **Your book due dates:**\n\n${lines.join('\n')}`;
}

async function handleBorrowedQuery(userId) {
  const borrows = await sequelize.query(
    `SELECT b.title, b.author, t.issueDate, t.dueDate,
            DATEDIFF(t.dueDate, NOW()) AS daysLeft
     FROM transactions t
     JOIN book_copies bc ON bc.id = t.bookCopyId
     JOIN books b        ON b.id  = bc.bookId
     WHERE t.userId = :userId AND t.status IN ('active','overdue')
     ORDER BY t.dueDate ASC`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );

  if (borrows.length === 0) {
    return `You haven't borrowed any books currently. Head to the library to get started! 📚`;
  }

  const lines = borrows.map((b) => {
    const days = Number(b.daysLeft);
    const icon = days < 0 ? '🔴' : days <= 3 ? '🟠' : '🟢';
    return (
      `${icon} **"${b.title}"** by ${b.author}\n` +
      `   Issued: ${dateIN(b.issueDate)} | Due: ${dateIN(b.dueDate)}`
    );
  });

  return `📚 **You currently have ${borrows.length}/3 book(s):**\n\n${lines.join('\n\n')}`;
}

async function handleCanBorrowQuery(userId, user) {
  const [active] = await sequelize.query(
    `SELECT COUNT(*) AS activeCount
     FROM transactions
     WHERE userId = :userId AND status IN ('active','overdue')`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  const count = Number(active.activeCount);
  const fine  = Number(user.fineOwed || 0);

  if (fine >= 50) {
    return (
      `🚫 **Borrowing is blocked.**\n\n` +
      `Your outstanding fine of ${inr(fine)} exceeds the ₹50 limit.\n` +
      `Please clear your dues at the library counter to restore access.`
    );
  }
  if (count >= 3) {
    return (
      `🚫 **You've reached the borrowing limit.**\n\n` +
      `You already have ${count}/3 books. Please return a book before borrowing another.`
    );
  }
  return (
    `✅ **Yes, you can borrow books!**\n\n` +
    `• Books with you: ${count}/3\n` +
    `• Outstanding fine: ${inr(fine)}\n` +
    `• You can take **${3 - count} more book(s)**.`
  );
}

async function handleHistoryQuery(userId) {
  const history = await sequelize.query(
    `SELECT b.title, b.author, t.returnDate, t.fineAmount
     FROM transactions t
     JOIN book_copies bc ON bc.id = t.bookCopyId
     JOIN books b        ON b.id  = bc.bookId
     WHERE t.userId = :userId AND t.status = 'returned'
     ORDER BY t.returnDate DESC
     LIMIT 10`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );

  if (history.length === 0) {
    return `You haven't returned any books yet. Your borrowing history will appear here once you do.`;
  }

  const lines = history.map((b) => {
    const finePart = Number(b.fineAmount) > 0 ? ` _(Fine paid: ${inr(b.fineAmount)})_` : '';
    return `• **"${b.title}"** by ${b.author} — returned ${dateIN(b.returnDate)}${finePart}`;
  });

  return `📖 **Your borrowing history (last ${history.length} books):**\n\n${lines.join('\n')}`;
}

async function handleRenewQuery(userId) {
  const borrows = await sequelize.query(
    `SELECT b.title, t.renewalCount, t.dueDate, t.status
     FROM transactions t
     JOIN book_copies bc ON bc.id = t.bookCopyId
     JOIN books b        ON b.id  = bc.bookId
     WHERE t.userId = :userId AND t.status IN ('active','overdue')
     ORDER BY t.dueDate ASC`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );

  if (borrows.length === 0) {
    return `You have no active books to renew at this time.`;
  }

  const lines = borrows.map((b) => {
    const left = 2 - Number(b.renewalCount);
    const due  = dateIN(b.dueDate);
    return left > 0
      ? `• **"${b.title}"** — ${left} renewal(s) remaining | Current due: ${due}`
      : `• **"${b.title}"** — ❌ No renewals left (max 2 used) | Due: ${due}`;
  });

  return (
    `🔄 **Renewal status** _(each renewal adds 14 days)_:\n\n${lines.join('\n')}\n\n` +
    `To renew, go to **My Books → "Extend 14 days"**.`
  );
}

async function handleRulesQuery() {
  return (
    `📋 **KMEC Library Rules:**\n\n` +
    `• **Loan period:** 14 days\n` +
    `• **Max books:** 3 at a time\n` +
    `• **Late fine:** ₹2/day per overdue book\n` +
    `• **Borrowing blocked** when fine ≥ ₹50\n` +
    `• **Renewals:** max 2 per book (+14 days each)\n` +
    `• **Lost book:** replacement cost + ₹50 penalty\n` +
    `• **Library hours:** Mon–Sat, 9 AM – 5 PM\n\n` +
    `_For any queries, visit the library counter or speak to a librarian._`
  );
}

async function handleAvailabilityQuery(userId, user, message) {
  const match = message.match(
    /(?:is|find|search\s+(?:for)?|do\s+you\s+have|any\s+copies\s+of|looking\s+for)\s+["']?(.{3,60})["']?(?:\s+available)?/i
  );
  const rawKw   = match ? match[1].trim() : message;
  const keyword = safeKw(rawKw);

  const books = await sequelize.query(
    `SELECT b.title, b.author, b.availableCopies, b.shelfLocation, b.category
     FROM books b
     WHERE (b.title LIKE :kw OR b.author LIKE :kw OR b.category LIKE :kw)
       AND b.availableCopies > 0
     ORDER BY b.availableCopies DESC
     LIMIT 6`,
    { replacements: { kw: `%${keyword}%` }, type: QueryTypes.SELECT }
  );

  if (books.length === 0) {
    return (
      `No books matching **"${rawKw}"** are currently available.\n\n` +
      `All copies may be borrowed at the moment. Try a different title or author name.`
    );
  }

  const lines = books.map(
    (b) =>
      `• **"${b.title}"** by ${b.author}\n` +
      `  ${b.availableCopies} copy/copies available${b.shelfLocation ? ` — Shelf: ${b.shelfLocation}` : ''}`
  );
  return `📚 **Available books matching "${rawKw}":**\n\n${lines.join('\n\n')}`;
}

/**
 * Handles both:
 *   - In-chat: "Summarize Elon Musk by Ashlee Vance"
 *   - Quick-action button: "Summarize a book" (no title → prompt the user)
 */
async function handleSummarizeQuery(userId, user, message) {
  const title = extractBookTitle(message);

  if (!title) {
    return (
      `📖 **Which book would you like a summary of?**\n\n` +
      `Just say:\n` +
      `• _"Summarize Atomic Habits"_\n` +
      `• _"Tell me about Clean Code"_\n` +
      `• _"What is Elon Musk about"_`
    );
  }

  const keyword = safeKw(title);
  const [book]  = await sequelize.query(
    `SELECT id, title, author, category, description, publicationYear, pages
     FROM books
     WHERE title LIKE :kw
     ORDER BY CHAR_LENGTH(title) ASC
     LIMIT 1`,
    { replacements: { kw: `%${keyword}%` }, type: QueryTypes.SELECT }
  );

  if (!book) {
    return (
      `I couldn't find **"${title}"** in our catalogue.\n\n` +
      `Double-check the title, or try: _"Find books on [topic]"_ to browse what's available.`
    );
  }

  // Graceful fallback if Ollama is unavailable
  const ollamaUp = await ollamaService.isAvailable();
  if (!ollamaUp) {
    return book.description
      ? `📖 **"${book.title}"** by ${book.author}\n\n${book.description}`
      : (
        `📖 **"${book.title}"** by ${book.author} _(${book.category}, ${book.publicationYear || 'n.d.'}, ${book.pages || '?'} pages)_\n\n` +
        `No detailed description is available in our catalogue. Ask a librarian for more info.`
      );
  }

  const prompt =
    `Write a concise library catalogue summary for a student:\n` +
    `Title: "${book.title}" | Author: ${book.author}\n` +
    `Category: ${book.category} | Year: ${book.publicationYear || 'n.d.'} | Pages: ${book.pages || 'unknown'}\n` +
    `Description: ${book.description || 'Not provided'}\n\n` +
    `Use exactly this format, under 120 words total:\n` +
    `ABOUT: [2 sentences about the book's content and purpose]\n` +
    `AUDIENCE: [1 sentence — who should read this]\n` +
    `KEY TOPICS:\n• [topic 1]\n• [topic 2]\n• [topic 3]`;

  const summary = await ollamaService.generate(prompt);
  return `📖 **Summary of "${book.title}"** by ${book.author}:\n\n${summary}`;
}

async function handleCitationQuery(userId, user, message) {
  const title = extractCitationTitle(message);

  if (!title) {
    return (
      `📚 **Which book do you need a citation for?**\n\n` +
      `Just say:\n` +
      `• _"Citation for Clean Code"_\n` +
      `• _"Cite Atomic Habits by James Clear"_\n` +
      `• _"APA for The Pragmatic Programmer"_`
    );
  }

  const keyword = safeKw(title);
  const [book]  = await sequelize.query(
    `SELECT title, author, publicationYear, isbn, publisher
     FROM books
     WHERE title LIKE :kw
     ORDER BY CHAR_LENGTH(title) ASC
     LIMIT 1`,
    { replacements: { kw: `%${keyword}%` }, type: QueryTypes.SELECT }
  );

  if (!book) {
    return (
      `I couldn't find **"${title}"** in our catalogue.\n\n` +
      `Please check the exact title and try again, e.g. _"Citation for Clean Code"_.`
    );
  }

  const year      = book.publicationYear || 'n.d.';
  const publisher = book.publisher       || 'KMEC Library';
  const apa       = `${book.author}. (${year}). *${book.title}*. ${publisher}.`;
  const mla       = `${book.author}. *${book.title}*. ${publisher}, ${year}.`;
  const ieee      = `${book.author}, *${book.title}*, ${publisher}, ${year}.`;

  return (
    `📝 **Citation for "${book.title}"** by ${book.author}:\n\n` +
    `**APA 7th:**\n> ${apa}\n\n` +
    `**MLA 9th:**\n> ${mla}\n\n` +
    `**IEEE:**\n> ${ieee}` +
    (book.isbn ? `\n\n_ISBN: ${book.isbn}_` : '')
  );
}

/**
 * In-chat recommendation handler — mirrors /api/ai/recommendations logic
 * but returns a formatted string instead of JSON.
 */
async function handleRecommendQuery(userId, user) {
  const history = await sequelize.query(
    `SELECT b.title, b.author, b.category
     FROM transactions t
     JOIN book_copies bc ON bc.id = t.bookCopyId
     JOIN books b        ON b.id  = bc.bookId
     WHERE t.userId = :userId
     ORDER BY t.createdAt DESC
     LIMIT 8`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );

  const available = await sequelize.query(
    `SELECT id, title, author, category, availableCopies
     FROM books
     WHERE availableCopies > 0
     ORDER BY RAND()
     LIMIT 20`,
    { type: QueryTypes.SELECT }
  );

  if (history.length === 0) {
    const popular = await sequelize.query(
      `SELECT title, author, category, availableCopies
       FROM books
       WHERE availableCopies > 0
       ORDER BY (totalCopies - availableCopies) DESC
       LIMIT 4`,
      { type: QueryTypes.SELECT }
    );
    if (popular.length === 0) return `📚 No books are currently available. Check back soon!`;
    const lines = popular.map(
      (b) => `• **"${b.title}"** by ${b.author} _(${b.category})_ — ${b.availableCopies} copy/copies`
    );
    return (
      `📚 **Popular books you might enjoy:**\n\n${lines.join('\n')}\n\n` +
      `_Personalised picks will appear after you've borrowed a few books._`
    );
  }

  let books = [];
  const ollamaUp = await ollamaService.isAvailable();

  if (ollamaUp) {
    const prompt =
      `A student has recently read:\n` +
      `${history.map((b) => `- "${b.title}" (${b.category})`).join('\n')}\n\n` +
      `From the catalogue below pick the 4 books that best match their interests.\n` +
      `Return ONLY a JSON array of IDs: ["id1","id2","id3","id4"]. No other text.\n\n` +
      `Catalogue:\n` +
      `${available.map((b) => `ID:${b.id} | "${b.title}" [${b.category}]`).join('\n')}`;

    try {
      const aiResponse = await ollamaService.generate(prompt);
      const match      = aiResponse.match(/\[[\s\S]*?\]/);
      if (match) {
        const ids   = JSON.parse(match[0]);
        const idSet = new Set(ids.map(String));
        books = available.filter((b) => idSet.has(String(b.id)));
      }
    } catch { /* fall through */ }
  }

  if (books.length === 0) books = available.slice(0, 4);

  const categories = [...new Set(history.map((b) => b.category))].slice(0, 3).join(', ');
  const lines = books.map(
    (b) => `• **"${b.title}"** by ${b.author} _(${b.category})_ — ${b.availableCopies} copy/copies`
  );

  return (
    `🎯 **Picks based on your interest in ${categories}:**\n\n` +
    `${lines.join('\n')}\n\n` +
    `Head to the library counter to borrow any of these!`
  );
}


// ═══════════════════════════════════════════════════════════
//  ADMIN INTENT HANDLERS
// ═══════════════════════════════════════════════════════════

async function handleAdminGreeting(userId, user) {
  const [stats] = await sequelize.query(
    `SELECT
       (SELECT COUNT(*) FROM transactions WHERE status IN ('active','overdue'))                     AS activeLoans,
       (SELECT COUNT(*) FROM transactions WHERE status IN ('active','overdue') AND dueDate < NOW()) AS overdueCount,
       (SELECT COUNT(*) FROM users WHERE role = 'student')                                          AS totalStudents,
       (SELECT COUNT(*) FROM books)                                                                  AS totalBooks,
       (SELECT COALESCE(SUM(fineOwed),0) FROM users WHERE role = 'student')                        AS totalPending
     FROM DUAL`,
    { type: QueryTypes.SELECT }
  );

  return (
    `Hi ${user.name}! 👋 Here's your library snapshot:\n\n` +
    `📚 Total books: ${stats.totalBooks}\n` +
    `👥 Registered students: ${stats.totalStudents}\n` +
    `📖 Active loans: ${stats.activeLoans}\n` +
    `⚠️ Overdue: ${stats.overdueCount}\n` +
    `💰 Total pending fines: ${inr(stats.totalPending)}\n\n` +
    `What would you like to manage today?`
  );
}

async function handleAdminStudentFines() {
  const students = await sequelize.query(
    `SELECT name, email, fineOwed
     FROM users
     WHERE role = 'student' AND fineOwed > 0
     ORDER BY fineOwed DESC
     LIMIT 10`,
    { type: QueryTypes.SELECT }
  );

  if (students.length === 0) return `✅ No students currently have pending fines. All accounts are clear!`;

  const total = students.reduce((s, u) => s + Number(u.fineOwed), 0);
  const lines = students.map(
    (s, i) => `${i + 1}. **${s.name}** (${s.email}) — ${inr(s.fineOwed)}`
  );
  return (
    `💰 **Students with pending fines (${students.length}):**\n\n` +
    `${lines.join('\n')}\n\n` +
    `📊 **Total outstanding: ${inr(total)}**`
  );
}

async function handleAdminOverdueBooks() {
  const overdue = await sequelize.query(
    `SELECT b.title, u.name AS studentName, u.email,
            t.dueDate, DATEDIFF(NOW(), t.dueDate) AS daysOverdue
     FROM transactions t
     JOIN book_copies bc ON bc.id = t.bookCopyId
     JOIN books b        ON b.id  = bc.bookId
     JOIN users u        ON u.id  = t.userId
     WHERE t.status IN ('active','overdue') AND t.dueDate < NOW()
     ORDER BY daysOverdue DESC
     LIMIT 10`,
    { type: QueryTypes.SELECT }
  );

  if (overdue.length === 0) return `✅ No overdue books right now! All loans are within their due dates.`;

  const lines = overdue.map(
    (t, i) =>
      `${i + 1}. **"${t.title}"**\n` +
      `   ${t.studentName} (${t.email})\n` +
      `   ↳ **${t.daysOverdue} day(s) overdue** since ${dateIN(t.dueDate)}`
  );
  return `⚠️ **Overdue books (${overdue.length} total):**\n\n${lines.join('\n\n')}`;
}

async function handleAdminActiveLoans() {
  const [result] = await sequelize.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN t.dueDate < NOW() THEN 1 ELSE 0 END)                           AS overdueCount,
       SUM(CASE WHEN DATEDIFF(t.dueDate, NOW()) BETWEEN 0 AND 3 THEN 1 ELSE 0 END) AS dueSoon
     FROM transactions t
     WHERE t.status IN ('active','overdue')`,
    { type: QueryTypes.SELECT }
  );
  const onTime = Number(result.total) - Number(result.overdueCount);
  return (
    `📚 **Active Loan Summary:**\n\n` +
    `• Total issued: **${result.total}**\n` +
    `• Overdue: **${result.overdueCount}**\n` +
    `• Due in next 3 days: **${result.dueSoon}**\n` +
    `• On time: **${onTime}**`
  );
}

async function handleAdminPopularBooks() {
  const books = await sequelize.query(
    `SELECT b.title, b.author, COUNT(t.id) AS borrowCount
     FROM transactions t
     JOIN book_copies bc ON bc.id = t.bookCopyId
     JOIN books b        ON b.id  = bc.bookId
     GROUP BY b.id
     ORDER BY borrowCount DESC
     LIMIT 5`,
    { type: QueryTypes.SELECT }
  );
  if (books.length === 0) return `No borrowing data available yet.`;
  const lines = books.map(
    (b, i) => `${i + 1}. **"${b.title}"** by ${b.author} — ${b.borrowCount} borrow(s)`
  );
  return `🏆 **Most borrowed books:**\n\n${lines.join('\n')}`;
}

async function handleAdminTodayReturns() {
  const [result] = await sequelize.query(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(fineAmount), 0) AS finesCollected
     FROM transactions
     WHERE DATE(returnDate) = CURDATE() AND status = 'returned'`,
    { type: QueryTypes.SELECT }
  );
  return (
    `📥 **Today's Returns:**\n\n` +
    `• Books returned: **${result.count}**\n` +
    `• Fines collected: **${inr(result.finesCollected)}**`
  );
}

async function handleAdminLowStock() {
  const books = await sequelize.query(
    `SELECT title, author, availableCopies, totalCopies
     FROM books
     WHERE availableCopies <= 2
     ORDER BY availableCopies ASC
     LIMIT 10`,
    { type: QueryTypes.SELECT }
  );
  if (books.length === 0) return `✅ All books have sufficient copies. No low-stock alerts.`;
  const lines = books.map(
    (b) => `• **"${b.title}"** by ${b.author} — ${b.availableCopies}/${b.totalCopies} copies remaining`
  );
  return `⚠️ **Low-stock books (≤2 copies):**\n\n${lines.join('\n')}`;
}

async function handleAdminTotalFines() {
  const [result] = await sequelize.query(
    `SELECT
       COALESCE(SUM(t.fineAmount), 0) AS totalCollected,
       COALESCE(SUM(u.fineOwed),   0) AS totalPending
     FROM users u
     LEFT JOIN transactions t ON t.userId = u.id AND t.status = 'returned'
     WHERE u.role = 'student'`,
    { type: QueryTypes.SELECT }
  );
  return (
    `💰 **Fine Summary:**\n\n` +
    `• Collected: **${inr(result.totalCollected)}**\n` +
    `• Pending (uncollected): **${inr(result.totalPending)}**`
  );
}

async function handleAdminNewStudents() {
  const students = await sequelize.query(
    `SELECT name, email, createdAt
     FROM users
     WHERE role = 'student'
     ORDER BY createdAt DESC
     LIMIT 5`,
    { type: QueryTypes.SELECT }
  );
  if (students.length === 0) return `No students are registered yet.`;
  const lines = students.map(
    (s, i) => `${i + 1}. **${s.name}** (${s.email}) — joined ${dateIN(s.createdAt)}`
  );
  return `👥 **Recently registered students:**\n\n${lines.join('\n')}`;
}

async function handleAdminDueSoon() {
  const due = await sequelize.query(
    `SELECT b.title, u.name AS studentName, u.email,
            t.dueDate, DATEDIFF(t.dueDate, NOW()) AS daysLeft
     FROM transactions t
     JOIN book_copies bc ON bc.id = t.bookCopyId
     JOIN books b        ON b.id  = bc.bookId
     JOIN users u        ON u.id  = t.userId
     WHERE t.status = 'active'
       AND t.dueDate BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 3 DAY)
     ORDER BY t.dueDate ASC`,
    { type: QueryTypes.SELECT }
  );
  if (due.length === 0) return `✅ No books are due in the next 3 days.`;
  const lines = due.map(
    (t) =>
      `• **"${t.title}"** — ${t.studentName} (${t.email})\n` +
      `  ↳ Due in **${t.daysLeft} day(s)** on ${dateIN(t.dueDate)}`
  );
  return `⏰ **Books due in next 3 days (${due.length} total):**\n\n${lines.join('\n\n')}`;
}


// ═══════════════════════════════════════════════════════════
//  INTENT MAPS
// ═══════════════════════════════════════════════════════════

const STUDENT_INTENTS = [
  {
    name: 'greeting',
    patterns: [/^hi$/i, /^hello$/i, /^hey$/i, /^sup$/i, /good\s+morning/i, /good\s+afternoon/i, /good\s+evening/i],
    handler: handleStudentGreeting,
  },
  {
    name: 'fine_query',
    patterns: [/\bfine\b/i, /how\s+much.*owe/i, /\bpenalty\b/i, /overdue.*amount/i, /\bdues\b/i, /check.*fine/i, /my\s+fine/i],
    handler: handleFineQuery,
  },
  {
    name: 'due_date',
    patterns: [/due\s+date/i, /when.*return/i, /\bdeadline\b/i, /days\s+left/i, /return.*by/i, /when.*due/i],
    handler: handleDueDateQuery,
  },
  {
    name: 'borrowed_books',
    patterns: [/my\s+books/i, /what.*borrow/i, /currently.*borrow/i, /books.*i\s+have/i, /have.*book/i],
    handler: handleBorrowedQuery,
  },
  {
    name: 'can_borrow',
    patterns: [/can\s+i\s+borrow/i, /borrow\s+more/i, /\beligible\b/i, /\ballowed\b/i, /how\s+many.*borrow/i, /am\s+i\s+blocked/i],
    handler: handleCanBorrowQuery,
  },
  {
    name: 'history',
    patterns: [/\bhistory\b/i, /past.*book/i, /previously.*borrow/i, /returned.*book/i, /books.*returned/i],
    handler: handleHistoryQuery,
  },
  {
    name: 'renew',
    patterns: [/\brenew\b/i, /\bextend\b/i, /\brenewal\b/i, /extend.*loan/i, /add.*days/i],
    handler: handleRenewQuery,
  },
  {
    name: 'rules',
    patterns: [/\brules?\b/i, /\bpolic/i, /how.*work/i, /loan\s+period/i, /max\s+books?/i, /library.*hours?/i],
    handler: handleRulesQuery,
  },
  {
    name: 'availability',
    patterns: [/\bavailable\b/i, /find.*book/i, /search.*(?:book|for)/i, /do\s+you\s+have/i, /any\s+copies/i],
    handler: handleAvailabilityQuery,
  },
  // NEW: handles both "Summarize a book" (button) and "Summarize Elon Musk" (specific)
  {
    name: 'summarize',
    patterns: [
      /\bsummar/i,
      /tell\s+me\s+about\s+\w/i,
      /what\s+is\s+.{3,}?\s+about/i,
      /what'?s\s+.{3,}?\s+about/i,
      /describe\s+\w/i,
      /give\s+me\s+(?:a\s+)?(?:summary|overview)/i,
    ],
    handler: handleSummarizeQuery,
  },
  // NEW: handles "Get a citation" (button), "Citation for X by Y", "cite X"
  {
    name: 'citation',
    patterns: [
      /\bcite\b/i,
      /citation/i,
      /\breference\s+for\b/i,
      /bibliography/i,
      /\bapa\b/i,
      /\bmla\b/i,
      /\bieee\b/i,
      /how\s+do\s+i\s+cite/i,
      /get\s+a\s+citation/i,
    ],
    handler: handleCitationQuery,
  },
  // NEW: handles "Recommend books" (button) and natural variants
  {
    name: 'recommend',
    patterns: [
      /recommend/i,
      /suggest.*book/i,
      /what.*should.*read/i,
      /good\s+book/i,
      /books?\s+for\s+me/i,
      /what\s+to\s+read/i,
    ],
    handler: handleRecommendQuery,
  },
];

const ADMIN_INTENTS = [
  {
    name: 'greeting',
    patterns: [/^hi$/i, /^hello$/i, /^hey$/i, /good\s+morning/i, /good\s+afternoon/i, /good\s+evening/i],
    handler: handleAdminGreeting,
  },
  {
    name: 'student_fines',
    patterns: [/student.*fine/i, /who.*fine/i, /pending\s+fine/i, /fine.*student/i, /outstanding.*fine/i, /\bunpaid\b/i],
    handler: handleAdminStudentFines,
  },
  {
    name: 'overdue_books',
    patterns: [/\boverdue\b/i, /late.*return/i, /not.*returned/i, /past.*due/i],
    handler: handleAdminOverdueBooks,
  },
  {
    name: 'active_loans',
    patterns: [/active.*loan/i, /books.*issued/i, /how\s+many.*issued/i, /currently.*borrowed/i, /total.*borrow/i],
    handler: handleAdminActiveLoans,
  },
  {
    name: 'popular_books',
    patterns: [/\bpopular\b/i, /most.*borrow/i, /top.*book/i, /frequently.*borrow/i, /highest.*demand/i],
    handler: handleAdminPopularBooks,
  },
  {
    name: 'today_returns',
    patterns: [/today.*return/i, /returned.*today/i, /return.*today/i],
    handler: handleAdminTodayReturns,
  },
  {
    name: 'low_stock',
    patterns: [/low.*stock/i, /running.*out/i, /few.*copies/i, /less.*copies/i, /\bstock\b/i],
    handler: handleAdminLowStock,
  },
  {
    name: 'total_fines',
    patterns: [/total.*fine/i, /fine.*collect/i, /revenue.*fine/i, /how\s+much.*fine/i, /fine.*summar/i],
    handler: handleAdminTotalFines,
  },
  {
    name: 'new_students',
    patterns: [/new.*student/i, /recent.*register/i, /recently.*join/i, /latest.*user/i, /\bregistered\b/i],
    handler: handleAdminNewStudents,
  },
  {
    name: 'due_soon',
    patterns: [/due.*soon/i, /\bexpiring\b/i, /due.*today/i, /due.*this\s+week/i, /\bremind\b/i, /upcoming.*due/i],
    handler: handleAdminDueSoon,
  },
];


// ═══════════════════════════════════════════════════════════
//  CLASSIFIER
// ═══════════════════════════════════════════════════════════

function classifyIntent(message, role) {
  const intents = role === 'admin' ? ADMIN_INTENTS : STUDENT_INTENTS;
  const msg = message.trim();
  for (const intent of intents) {
    if (intent.patterns.some((p) => p.test(msg))) return intent;
  }
  return null;
}


// ═══════════════════════════════════════════════════════════
//  EXPORTED CONTROLLERS
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/ai/chat
 */
exports.chat = async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    const userId   = req.user.id;
    const userRole = req.user.role;   // 'student' | 'admin'

    if (!message?.trim()) {
      return res.status(400).json({ success: false, message: 'Message is required.' });
    }

    const [user] = await sequelize.query(
      `SELECT id, name, role, fineOwed FROM users WHERE id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // ── Step 1: Pattern-based intent (zero latency, zero AI cost) ──
    const intent = classifyIntent(message.trim(), userRole);

    if (intent) {
      const reply = await intent.handler(userId, user, message);
      return res.json({
        success: true,
        data: { reply, source: 'intent', intent: intent.name },
      });
    }

    // ── Step 2: Ollama for genuinely open-ended queries ─────────────
    const ollamaUp = await ollamaService.isAvailable();
    if (!ollamaUp) {
      // Friendly degraded-mode response instead of an error
      return res.json({
        success: true,
        data: {
          reply:
            `I'm having trouble reaching the AI service right now. 😔\n\n` +
            `I can still help you with:\n` +
            `• Your fines & due dates\n` +
            `• Books you've borrowed\n` +
            `• Book availability & renewals\n` +
            `• Citations & recommendations\n\n` +
            `Just ask me one of those!`,
          source: 'fallback',
        },
      });
    }

    try {
      const systemPrompt =
        userRole === 'admin'
          ? await buildAdminSystemPrompt(user)
          : await buildStudentSystemPrompt(user, message);

      const reply = await ollamaService.chat([
        { role: 'system', content: systemPrompt },
        ...history.slice(-4),
        { role: 'user', content: message },
      ]);

      return res.json({ success: true, data: { reply, source: 'ollama' } });
    } catch (aiErr) {
      // Don't 500 on AI failure — degrade gracefully so the UI stays usable.
      console.error('[AI Chat Ollama Error]', aiErr.message);
      return res.json({
        success: true,
        data: {
          reply:
            `I couldn't reach the AI just now, but I can still help with:\n` +
            `• Your fines & due dates\n` +
            `• Books you've borrowed\n` +
            `• Availability, renewals, summaries, citations\n\n` +
            `Try one of those.`,
          source: 'fallback',
        },
      });
    }

  } catch (error) {
    console.error('[AI Chat Error]', error.message, error.stack);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};


/**
 * GET /api/ai/recommendations
 */
exports.recommend = async (req, res) => {
  try {
    const userId = req.user.id;

    const history = await sequelize.query(
      `SELECT b.title, b.author, b.category
       FROM transactions t
       JOIN book_copies bc ON bc.id = t.bookCopyId
       JOIN books b        ON b.id  = bc.bookId
       WHERE t.userId = :userId
       ORDER BY t.createdAt DESC
       LIMIT 8`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    if (history.length === 0) {
      const popular = await sequelize.query(
        `SELECT id, title, author, category, availableCopies
         FROM books
         WHERE availableCopies > 0
         ORDER BY (totalCopies - availableCopies) DESC
         LIMIT 4`,
        { type: QueryTypes.SELECT }
      );
      return res.json({ success: true, data: { books: popular, reason: 'popular' } });
    }

    const available = await sequelize.query(
      `SELECT id, title, author, category, availableCopies
       FROM books WHERE availableCopies > 0
       ORDER BY RAND() LIMIT 20`,
      { type: QueryTypes.SELECT }
    );

    let books = [];
    const ollamaUp = await ollamaService.isAvailable();

    if (ollamaUp) {
      const prompt =
        `Student read:\n${history.map((b) => `- "${b.title}" (${b.category})`).join('\n')}\n\n` +
        `Pick 4 from catalogue that match their interests.\n` +
        `Return ONLY a JSON array of IDs: ["id1","id2","id3","id4"]. No other text.\n\n` +
        `Catalogue:\n${available.map((b) => `ID:${b.id} | "${b.title}" [${b.category}]`).join('\n')}`;

      try {
        const aiResponse = await ollamaService.generate(prompt);
        const match = aiResponse.match(/\[[\s\S]*?\]/);
        if (match) {
          const ids   = JSON.parse(match[0]);
          const idSet = new Set(ids.map(String));
          books = available.filter((b) => idSet.has(String(b.id)));
        }
      } catch { /* fall through */ }
    }

    if (books.length === 0) books = available.slice(0, 4);

    return res.json({ success: true, data: { books, reason: 'personalized' } });

  } catch (error) {
    console.error('[AI Recommend Error]', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};


/**
 * GET /api/ai/book-summary/:bookId
 */
exports.bookSummary = async (req, res) => {
  try {
    const bookId = parseInt(req.params.bookId, 10);
    if (!bookId || isNaN(bookId)) {
      return res.status(400).json({ success: false, message: 'Invalid book ID.' });
    }

    const [book] = await sequelize.query(
      `SELECT title, author, category, description, publicationYear, pages
       FROM books WHERE id = :bookId`,
      { replacements: { bookId }, type: QueryTypes.SELECT }
    );

    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found.' });
    }

    const ollamaUp = await ollamaService.isAvailable();

    // Graceful fallback — use DB description if Ollama is down
    if (!ollamaUp) {
      const fallback = book.description
        ? `ABOUT: ${book.description}\nAUDIENCE: Readers interested in ${book.category}.\nKEY TOPICS:\n• ${book.category}`
        : `ABOUT: "${book.title}" by ${book.author} is a ${book.category} title (${book.publicationYear || 'n.d.'}).\nAUDIENCE: Anyone interested in ${book.category}.`;
      return res.json({ success: true, data: { summary: fallback, bookTitle: book.title, source: 'fallback' } });
    }

    const prompt =
      `Write a concise library catalogue summary:\n` +
      `Title: "${book.title}" | Author: ${book.author}\n` +
      `Category: ${book.category} | Year: ${book.publicationYear || 'n.d.'} | Pages: ${book.pages || 'unknown'}\n` +
      `Description: ${book.description || 'Not provided'}\n\n` +
      `Format (under 120 words):\n` +
      `ABOUT: [2 sentences]\nAUDIENCE: [1 sentence]\nKEY TOPICS:\n• [topic 1]\n• [topic 2]\n• [topic 3]`;

    const summary = await ollamaService.generate(prompt);
    return res.json({ success: true, data: { summary, bookTitle: book.title, source: 'ollama' } });

  } catch (error) {
    console.error('[AI BookSummary Error]', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};


/**
 * GET /api/ai/status
 */
exports.status = async (req, res) => {
  try {
    const available = await ollamaService.isAvailable();
    return res.json({
      success: true,
      data: {
        available,
        provider: 'groq',
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      },
    });
  } catch (error) {
    console.error('[AI Status Error]', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};