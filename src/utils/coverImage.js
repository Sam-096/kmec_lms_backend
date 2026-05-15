// Returns a guaranteed-loadable cover image URL.
//
// Why this exists:
//   The seed data points coverImage at https://covers.openlibrary.org/b/isbn/<isbn>-L.jpg,
//   but the ISBNs are synthetic and almost none exist on OpenLibrary.
//   OpenLibrary then returns a 0.2 KB blank pixel (HTTP 200), so the frontend <img>
//   "loads" successfully but shows nothing.
//
// Strategy:
//   1. If coverImage is set to a non-OpenLibrary URL, trust it as-is.
//   2. For OpenLibrary URLs, append `?default=false` so missing covers return 404
//      (lets the frontend onerror handler kick in if it has one).
//   3. Always provide `coverImageFallback`: a deterministic placeholder generated
//      from the book title so the frontend can show a readable cover even if the
//      primary URL fails.

const PLACEHOLDER_BG = '1f2937'; // slate-800
const PLACEHOLDER_FG = 'ffffff';

const placeholderFor = (title = 'Book') => {
  const text = encodeURIComponent(String(title).slice(0, 40).trim() || 'Book');
  return `https://placehold.co/300x450/${PLACEHOLDER_BG}/${PLACEHOLDER_FG}/png?text=${text}`;
};

const isOpenLibrary = (url) =>
  typeof url === 'string' && url.includes('covers.openlibrary.org');

const resolveCoverImage = ({ coverImage, title } = {}) => {
  if (coverImage && !isOpenLibrary(coverImage)) {
    return { coverImage, coverImageFallback: placeholderFor(title) };
  }
  if (isOpenLibrary(coverImage)) {
    const sep = coverImage.includes('?') ? '&' : '?';
    return {
      coverImage: `${coverImage}${sep}default=false`,
      coverImageFallback: placeholderFor(title),
    };
  }
  // No cover at all — return placeholder directly so <img> always renders.
  const ph = placeholderFor(title);
  return { coverImage: ph, coverImageFallback: ph };
};

// Convenience: mutate a plain book/transaction-like object in place.
const applyCoverImage = (obj) => {
  if (!obj) return obj;
  const { coverImage, coverImageFallback } = resolveCoverImage({
    coverImage: obj.coverImage,
    title: obj.title || obj.bookTitle,
  });
  obj.coverImage = coverImage;
  obj.coverImageFallback = coverImageFallback;
  return obj;
};

module.exports = { resolveCoverImage, applyCoverImage, placeholderFor };
