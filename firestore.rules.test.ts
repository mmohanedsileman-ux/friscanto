/**
 * Security Rules Specification Verification Suite for Frescanto.
 * Documents the 12 adversarial ("Dirty Dozen") test cases verified against firestore.rules.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  actor: 'anonymous' | 'non_admin' | 'unverified_admin' | 'admin';
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
  enforcedBy: string;
}

export const dirtyDozenTests: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Order Read',
    actor: 'anonymous',
    operation: 'get',
    path: '/orders/ord_001',
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'isAdmin() gate on /orders/{orderId}',
  },
  {
    id: 2,
    name: 'Non-Admin Menu Write',
    actor: 'non_admin',
    operation: 'create',
    path: '/menuItems/mango_hack',
    payload: { name: 'Hacked Mango', price: 1 },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'isAdmin() gate on /menuItems/{itemId}',
  },
  {
    id: 3,
    name: 'Email Spoofing With Unverified Admin Email',
    actor: 'unverified_admin',
    operation: 'create',
    path: '/orders/ord_spoof',
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'request.auth.token.email_verified == true in isBootstrappedAdmin()',
  },
  {
    id: 4,
    name: 'Shadow Field Injection on MenuItem',
    actor: 'admin',
    operation: 'create',
    path: '/menuItems/item_ghost',
    payload: { name: 'Mango', ghostField: true },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'data.keys().hasOnly(...) inside isValidMenuItem()',
  },
  {
    id: 5,
    name: 'Identity Spoofing on Order createdBy',
    actor: 'admin',
    operation: 'create',
    path: '/orders/ord_impersonate',
    payload: { createdBy: 'another_user_uid' },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'data.createdBy == request.auth.uid inside isValidOrder()',
  },
  {
    id: 6,
    name: 'Client Timestamp Forgery on Order Create',
    actor: 'admin',
    operation: 'create',
    path: '/orders/ord_backdated',
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'incoming().createdAt == request.time',
  },
  {
    id: 7,
    name: 'Path ID Poisoning',
    actor: 'admin',
    operation: 'create',
    path: '/menuItems/bad$id!with*chars',
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'isValidId(itemId)',
  },
  {
    id: 8,
    name: 'Unbounded Order Items Array (>30)',
    actor: 'admin',
    operation: 'create',
    path: '/orders/ord_dos',
    payload: { items: Array.from({ length: 35 }, () => ({ itemId: 'a' })) },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'data.items.size() >= 1 && data.items.size() <= 30',
  },
  {
    id: 9,
    name: 'Hidden Unavailable Menu Item Read by Customer',
    actor: 'anonymous',
    operation: 'get',
    path: '/menuItems/hidden_item',
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'existing().isAvailable == true || isAdmin()',
  },
  {
    id: 10,
    name: 'Immutable createdAt / orderNumber Mutation',
    actor: 'admin',
    operation: 'update',
    path: '/orders/ord_001',
    payload: { orderNumber: 'FR-9999' },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'affectedKeys().hasOnly([status, paymentMethod, notes, updatedAt])',
  },
  {
    id: 11,
    name: 'Negative Price Value Poisoning on Update',
    actor: 'admin',
    operation: 'update',
    path: '/menuItems/item_1',
    payload: { price: -50 },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'isValidMenuItem(incoming()) requiring price >= 0 && price <= 100000',
  },
  {
    id: 12,
    name: 'Self-Assigned Admin Role Escalation',
    actor: 'non_admin',
    operation: 'create',
    path: '/admins/attacker_uid',
    payload: { role: 'admin', email: 'attacker@example.com' },
    expected: 'PERMISSION_DENIED',
    enforcedBy: 'isBootstrappedAdmin() required on /admins/{userId} writes',
  },
];
