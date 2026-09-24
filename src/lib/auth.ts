export const AUTH_COOKIE = "dnd_key";

/** Ключ доступа из env. Если не задан — вход без ключа. */
export function getAccessKey(): string | undefined {
  const key = process.env.ACCESS_KEY?.trim();
  return key ? key : undefined;
}

export function isAuthorized(cookieValue: string | undefined): boolean {
  const key = getAccessKey();
  return !key || cookieValue === key;
}
