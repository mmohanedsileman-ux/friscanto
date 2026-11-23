# Frescanto Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Menu Visibility vs Management**: Unauthenticated customers may only `get` or `list` documents in `/menuItems/{itemId}` where `resource.data.isAvailable == true`, and may only `get` `/storeSettings/main` where `resource.data.isPublic == true`. All writes require a verified admin (`isAdmin()`).
2. **POS & Accounting Isolation**: `/orders`, `/expenses`, `/dailyClosings`, and `/monthlyClosings` contain business financials and are strictly forbidden to unauthenticated users or non-admin authenticated users.
3. **Verified Identity & Anti-Spoofing**: Every admin check strictly mandates `request.auth != null && request.auth.token.email_verified == true`.
4. **Immutable Audit Fields & Server Timestamps**: `createdBy`, `closedBy`, and `createdAt` are immutable after creation; `createdAt` on create and `updatedAt` on create/update MUST equal `request.time`.
5. **Strict Schema & Bounded Arrays**: All documents use strict `hasAll` + `hasOnly` key checks, `.size()` limits on every string and array, `items.size() >= 1 && items.size() <= 30` on orders, and `isValidId()` on all single-document path IDs.
6. **PII Isolation**: `/admins/{userId}` contains staff emails and is readable only by the matching user (`request.auth.uid == userId`) or a verified admin, and writable only by the bootstrapped owner.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Order Read**: Anonymous user calls `get(/orders/ord_1)` -> MUST DENY.
2. **Non-Admin Menu Write**: Verified non-admin user tries to create `/menuItems/hack_1` -> MUST DENY.
3. **Email Spoofing (Unverified Admin Email)**: Token with `email: 'mmohanedsileman@gmail.com'` and `email_verified: false` attempts write -> MUST DENY.
4. **Shadow Field Injection on MenuItem**: Admin attempts to create `/menuItems/item_1` with extra ghost key `discountSecret: 99` -> MUST DENY.
5. **Identity Spoofing on Order**: Admin tries to create `/orders/ord_2` with `createdBy: 'other_uid'` -> MUST DENY.
6. **Client Timestamp Forgery**: Admin creates `/orders/ord_3` with a backdated `createdAt` not equal to `request.time` -> MUST DENY.
7. **ID Poisoning**: Admin writes `/menuItems/invalid$id!with*spaces` or a 200-char ID -> MUST DENY.
8. **Unbounded Array / Denial-of-Wallet**: Admin creates `/orders/ord_4` with 35 items (`items.size() > 30`) -> MUST DENY.
9. **Hidden Menu Leak**: Unauthenticated customer calls `get(/menuItems/hidden_1)` where `isAvailable == false` -> MUST DENY.
10. **Immutable `createdAt` Tampering**: Admin updates `/orders/ord_1` trying to alter `createdAt` or `orderNumber` -> MUST DENY.
11. **Value Poisoning on Update**: Admin updates `/menuItems/item_1` setting `price: -50` or `name: 12345` -> MUST DENY.
12. **Self-Privilege Escalation**: Non-admin user attempts to create `/admins/{theirUid}` with `role: 'admin'` -> MUST DENY.
