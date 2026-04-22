import { getList, rangeHeader, type PagedResult } from './http';
import type { Usage } from '@/types/tmf';

const USAGE_BASE = '/usageManagement/v1/usage';
const HTTP_LOG = '/ocs/v1/log/http';

export const logsApi = {
  access(start = 0, end = 99): Promise<PagedResult<Usage>> {
    return getList<Usage>(USAGE_BASE, {
      headers: rangeHeader(start, end),
      params: { type: 'AAAAccessUsage' },
    });
  },
  accounting(start = 0, end = 99): Promise<PagedResult<Usage>> {
    return getList<Usage>(USAGE_BASE, {
      headers: rangeHeader(start, end),
      params: { type: 'AAAAccountingUsage' },
    });
  },
  http(start = 0, end = 99): Promise<PagedResult<unknown>> {
    return getList<unknown>(HTTP_LOG, { headers: rangeHeader(start, end) });
  },
};
