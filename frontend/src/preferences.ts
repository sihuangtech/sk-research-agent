export const defaultConnectionKey = 'second-moon.default-connection';
export function preferredConnection() {
  try {
    return localStorage.getItem(defaultConnectionKey) || '';
  } catch {
    return '';
  }
}
