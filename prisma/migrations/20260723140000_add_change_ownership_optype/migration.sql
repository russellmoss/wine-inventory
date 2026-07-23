-- Plan 093 (custom-crush data foundation), Unit 5: add the CHANGE_OWNERSHIP OperationType value in a
-- DEDICATED enum-only migration. Postgres `ALTER TYPE ... ADD VALUE` cannot run in the same transaction
-- that later writes rows using it, so the value must land (and commit + deploy) before change-ownership-core
-- writes CHANGE_OWNERSHIP operations. IF NOT EXISTS keeps this idempotent (the Windows enum rule).
ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'CHANGE_OWNERSHIP';
