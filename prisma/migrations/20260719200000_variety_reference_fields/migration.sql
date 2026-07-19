-- Ticket #308: optional REFERENCE attributes on a grape variety.
--
-- Additive only. Every column is nullable with no default, so existing variety rows
-- are untouched and keep their exact historical shape (NAMING-2 provenance). No
-- identity change: name + abbreviation still key the variety and still drive lot codes.
-- No new table, so the Phase-12 RLS checklist does not apply — `variety` already has
-- tenantId + FK + FORCE ROW LEVEL SECURITY and the policy covers new columns.
--
-- Both enums are NEW types (CREATE TYPE), not ALTER TYPE ... ADD VALUE, so the Windows
-- "isolated enum migration" rule does not apply here.

-- CreateEnum
CREATE TYPE "BerryColor" AS ENUM ('BLACK', 'WHITE');

-- CreateEnum
CREATE TYPE "VineSpecies" AS ENUM ('VINIFERA', 'HYBRID', 'OTHER');

-- AlterTable
ALTER TABLE "variety" ADD COLUMN "clone" TEXT;
ALTER TABLE "variety" ADD COLUMN "rootstock" TEXT;
ALTER TABLE "variety" ADD COLUMN "nursery" TEXT;
ALTER TABLE "variety" ADD COLUMN "berryColor" "BerryColor";
ALTER TABLE "variety" ADD COLUMN "species" "VineSpecies";
