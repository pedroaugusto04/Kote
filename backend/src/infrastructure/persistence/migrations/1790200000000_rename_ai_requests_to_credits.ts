import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Renames max_ai_requests_per_month → max_ai_credits_per_month on kb_plans
 * and recalibrates plan credit limits to match the new credit-based model.
 *
 * Credit model rationale: instead of counting 1 per request (regardless of cost),
 * each AI operation now deducts a variable number of credits proportional to its
 * computational cost (see domain/constants/ai-credits.constants.ts).
 *
 * Free: 100 credits (~20 asks or ~10 GitHub reviews / month)
 * Pro:  2 000 credits (~400 asks or ~200 GitHub reviews / month)
 * Enterprise: 20 000 credits (effectively unlimited for typical usage)
 */

// Inline limits to avoid import issues in node-pg-migrate runtime context
const FREE_CREDITS = 100;
const PRO_CREDITS = 2000;
const ENTERPRISE_CREDITS = 20000;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Rename column
  pgm.renameColumn('kb_plans', 'max_ai_requests_per_month', 'max_ai_credits_per_month');

  // 2. Recalibrate plan limits for the new credit model
  pgm.sql(`
    UPDATE kb_plans
    SET max_ai_credits_per_month = CASE slug
      WHEN 'free'       THEN ${FREE_CREDITS}
      WHEN 'pro'        THEN ${PRO_CREDITS}
      WHEN 'enterprise' THEN ${ENTERPRISE_CREDITS}
      ELSE max_ai_credits_per_month
    END
    WHERE slug IN ('free', 'pro', 'enterprise');
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Restore original column name and approximate original request values
  pgm.renameColumn('kb_plans', 'max_ai_credits_per_month', 'max_ai_requests_per_month');
  pgm.sql(`
    UPDATE kb_plans
    SET max_ai_requests_per_month = CASE slug
      WHEN 'free'       THEN 50
      WHEN 'pro'        THEN 1000
      WHEN 'enterprise' THEN 10000
      ELSE max_ai_requests_per_month
    END
    WHERE slug IN ('free', 'pro', 'enterprise');
  `);
}
