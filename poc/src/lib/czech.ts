/**
 * Czech counts three ways, not two: 1 hráč, 2-4 hráči, 5+ hráčů. Getting this
 * wrong is the tell that a UI was translated rather than written, and the room
 * browser prints these numbers on every row.
 */
function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

export const players = (n: number) => `${n} ${plural(n, 'hráč', 'hráči', 'hráčů')}`;
export const lives = (n: number) => `${n} ${plural(n, 'život', 'životy', 'životů')}`;
export const words = (n: number) => `${n} ${plural(n, 'slovo', 'slova', 'slov')}`;
export const watching = (n: number) => `${n} ${plural(n, 'divák', 'diváci', 'diváků')}`;
