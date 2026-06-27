-- Phase 3 cellar operations: add the new OperationType enum values in a DEDICATED
-- migration. Postgres `ALTER TYPE ... ADD VALUE` can't be used in the same transaction
-- that adds it, so the values must land (and commit) before the migration that writes
-- rows using them. IF NOT EXISTS keeps this idempotent.
ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'ADDITION';
ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'TOPPING';
ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'FINING';
ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'FILTRATION';
ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'CAP_MGMT';
