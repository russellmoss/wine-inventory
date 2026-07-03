-- Phase 16 Unit 1 — Commerce7 DTC integration enums, ISOLATED in their own migration (the Windows enum
-- rule: create/alter the types and commit BEFORE any column defaults to or uses them, so a single
-- failed step can't leave a half-created type wedged against a column). The _commerce7_schema migration
-- that follows adds the columns that reference these.

-- New types.
CREATE TYPE "CommerceProvider" AS ENUM ('COMMERCE7', 'WINEDIRECT');
CREATE TYPE "SalesDeltaKind" AS ENUM ('SALE', 'ADJUSTMENT', 'REVERSAL', 'REFUND');

-- New VALUES on existing types (a new enum value can't be used in the same tx that adds it — hence the
-- split migration). IF NOT EXISTS makes a re-run a no-op.
ALTER TYPE "MovementKind" ADD VALUE IF NOT EXISTS 'SALE';
ALTER TYPE "ConnectionStatus" ADD VALUE IF NOT EXISTS 'PENDING_CONFIRM';
