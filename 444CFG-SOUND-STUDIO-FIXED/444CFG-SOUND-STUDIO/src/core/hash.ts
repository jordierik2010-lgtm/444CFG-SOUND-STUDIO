/** Jenkins one-at-a-time (joaat) usado por GTA V. Las claves de los streams AWC son joaat(nombre en minúsculas) & 0x1FFFFFFF. */
export function joaat(text: string): number {
  let h = 0;
  const s = text.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h = (h + (s.charCodeAt(i) & 0xff)) >>> 0;
    h = (h + (h << 10)) >>> 0;
    h = (h ^ (h >>> 6)) >>> 0;
  }
  h = (h + (h << 3)) >>> 0;
  h = (h ^ (h >>> 11)) >>> 0;
  h = (h + (h << 15)) >>> 0;
  return h >>> 0;
}
export const awcStreamKey = (name: string): number => joaat(name) & 0x1fffffff;
export const hex = (n: number, w = 8): string => '0x' + (n >>> 0).toString(16).toUpperCase().padStart(w, '0');
