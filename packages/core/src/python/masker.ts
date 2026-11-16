/**
 * Masks Python string literals (single, double, and triple-quoted, including escaped quotes)
 * and `#` comments with spaces of identical length, preserving exact character offsets and newlines.
 */
export function maskPythonStringsAndComments(source: string): string {
  const chars = source.split('');
  let i = 0;

  while (i < chars.length) {
    const ch = chars[i];
    if (ch === '#') {
      while (i < chars.length && chars[i] !== '\n') {
        chars[i] = ' ';
        i += 1;
      }
      continue;
    }

    if (ch === '\'' || ch === '"') {
      const triple = source.slice(i, i + 3);
      const quote = triple === '\'\'\'' || triple === '"""' ? triple : ch;
      const quoteLen = quote.length;
      for (let k = 0; k < quoteLen; k += 1) {
        chars[i + k] = ' ';
      }
      i += quoteLen;

      while (i < chars.length) {
        if (chars[i] === '\\') {
          chars[i] = ' ';
          if (i + 1 < chars.length && chars[i + 1] !== '\n') {
            chars[i + 1] = ' ';
          }
          i += 2;
          continue;
        }
        if (source.slice(i, i + quoteLen) === quote) {
          for (let k = 0; k < quoteLen; k += 1) {
            chars[i + k] = ' ';
          }
          i += quoteLen;
          break;
        }
        if (chars[i] !== '\n') {
          chars[i] = ' ';
        }
        i += 1;
      }
      continue;
    }

    i += 1;
  }

  return chars.join('');
}
