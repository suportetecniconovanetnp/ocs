import { http, getList, rangeHeader, type PagedResult } from './http';
import type { Characteristic } from '@/types/tmf';

const BASE = '/partyManagement/v1/individual';

export interface OcsUser {
  id: string;
  href?: string;
  characteristic?: Characteristic[];
}

export interface UserFormInput {
  username: string;
  password: string;
  locale: 'en' | 'es';
  rating: boolean;
}

export const usersApi = {
  list(start = 0, end = 49): Promise<PagedResult<OcsUser>> {
    return getList<OcsUser>(BASE, { headers: rangeHeader(start, end) });
  },
  get(id: string): Promise<OcsUser> {
    return http.get<OcsUser>(`${BASE}/${id}`).then((r) => r.data);
  },
  create(input: UserFormInput): Promise<OcsUser> {
    const payload: OcsUser = {
      id: input.username,
      characteristic: [
        { name: 'username', value: input.username },
        { name: 'password', value: input.password },
        { name: 'locale', value: input.locale },
        { name: 'rating', value: input.rating },
      ],
    };
    return http.post<OcsUser>(BASE, payload).then((r) => r.data);
  },
  delete(id: string): Promise<void> {
    return http.delete(`${BASE}/${id}`).then(() => undefined);
  },
};
