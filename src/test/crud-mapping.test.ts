import { describe, expect, test } from 'vitest';
import { CRUD_ROUTE_MAP } from '@/lib/api';

describe('global CRUD route map', () => {
  test('contains required modules and endpoint mappings', () => {
    expect(CRUD_ROUTE_MAP.users.create).toBe('admin/user/create');
    expect(CRUD_ROUTE_MAP.users.read).toBe('admin/user/list');
    expect(CRUD_ROUTE_MAP.users.update).toBe('admin/user/update');
    expect(CRUD_ROUTE_MAP.users.delete).toBe('admin/user/delete');

    expect(CRUD_ROUTE_MAP.products.create).toBe('admin/product/create');
    expect(CRUD_ROUTE_MAP.products.read).toBe('products');
    expect(CRUD_ROUTE_MAP.products.update).toBe('admin/product/update');
    expect(CRUD_ROUTE_MAP.products.delete).toBe('admin/product/delete');

    expect(CRUD_ROUTE_MAP.orders.read).toBe('admin/orders');
    expect(CRUD_ROUTE_MAP.orders.update).toBe('admin/order/status');

    expect(CRUD_ROUTE_MAP.wallet.read).toBe('wallet');
    expect(CRUD_ROUTE_MAP.wallet.create).toBe('wallet/add');
    expect(CRUD_ROUTE_MAP.wallet.update).toBe('wallet/edit');

    expect(CRUD_ROUTE_MAP.apk.create).toBe('apk/upload');
    expect(CRUD_ROUTE_MAP.apk.read).toBe('apk/list');
    expect(CRUD_ROUTE_MAP.apk.update).toBe('apk/update');
    expect(CRUD_ROUTE_MAP.apk.delete).toBe('apk/delete');

    expect(CRUD_ROUTE_MAP.builder.create).toBe('builder/create');
    expect(CRUD_ROUTE_MAP.builder.read).toBe('builder/status');
    expect(CRUD_ROUTE_MAP.builder.update).toBe('builder/retry');

    expect(CRUD_ROUTE_MAP.server.create).toBe('server/add');
    expect(CRUD_ROUTE_MAP.server.read).toBe('server/list');
    expect(CRUD_ROUTE_MAP.server.update).toBe('server/update');
    expect(CRUD_ROUTE_MAP.server.delete).toBe('server/remove');
  });
});
