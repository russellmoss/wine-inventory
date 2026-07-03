-- Phase 15 Unit 2 — accounting-integration enums, ISOLATED in their own migration (the Windows enum
-- rule: create the types and commit BEFORE any column defaults to them, so a single failed step can't
-- leave a half-created type wedged against a column default). No table touches these yet — the
-- _accounting_schema migration that follows adds the columns.

CREATE TYPE "AccountingProvider" AS ENUM ('QBO', 'XERO');
CREATE TYPE "ConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'NEEDS_REAUTH');
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'IN_FLIGHT', 'VERIFYING', 'POSTED', 'FAILED', 'WITHHELD', 'DELETED_IN_GL');
