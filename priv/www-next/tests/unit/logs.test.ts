import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getListMock } = vi.hoisted(() => ({
  getListMock: vi.fn(),
}));

vi.mock('@/services/http', () => ({
  getList: getListMock,
  rangeHeader: (start: number, end: number) => ({ Range: `items=${start + 1}-${end + 1}` }),
}));

import { logsApi } from '@/services/logs';

describe('logsApi.accounting', () => {
  beforeEach(() => {
    getListMock.mockReset();
  });

  it('requests accounting usage sorted by newest date first', async () => {
    getListMock.mockResolvedValueOnce({ items: [] });

    await logsApi.accounting(0, 49);

    expect(getListMock).toHaveBeenCalledWith(
      '/usageManagement/v1/usage',
      expect.objectContaining({
        params: expect.objectContaining({
          type: 'AAAAccountingUsage',
          sort: '-date',
        }),
      }),
    );
  });

  it('pages backwards until the requested window is covered', async () => {
    getListMock
      .mockResolvedValueOnce({
        items: [
          { date: '2026-06-30T12:00:00', usageCharacteristic: [] },
          { date: '2026-06-20T12:00:00', usageCharacteristic: [] },
        ],
        contentRange: { start: 0, end: 1, total: 10 },
        etag: 'page-1',
      })
      .mockResolvedValueOnce({
        items: [
          { date: '2026-06-15T12:00:00', usageCharacteristic: [] },
          { date: '2026-06-05T12:00:00', usageCharacteristic: [] },
        ],
        contentRange: { start: 2, end: 3, total: 10 },
        etag: 'page-1',
      });

    const result = await logsApi.accountingWindow({
      from: '2026-06-10T00:00:00Z',
      to: '2026-06-30T23:59:59Z',
      pageSize: 2,
    });

    expect(getListMock).toHaveBeenCalledTimes(2);
    expect(getListMock).toHaveBeenNthCalledWith(
      2,
      '/usageManagement/v1/usage',
      expect.objectContaining({
        headers: expect.objectContaining({
          'If-Range': 'page-1',
        }),
      }),
    );
    expect(result.items).toHaveLength(3);
    expect(result.items.map((item: { date: string }) => item.date)).toEqual([
      '2026-06-30T12:00:00',
      '2026-06-20T12:00:00',
      '2026-06-15T12:00:00',
    ]);
  });
});
