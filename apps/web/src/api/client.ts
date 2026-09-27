import createClient from 'openapi-fetch';
import type { paths } from './generated';
/** Typed service interface. The caller supplies run/revision/idempotency/CSRF explicitly. */
export function createApi(baseUrl = '') {
  return createClient<paths>({ baseUrl, credentials: 'same-origin' });
}
export const api = createApi();
export type ApiService = ReturnType<typeof createApi>;
