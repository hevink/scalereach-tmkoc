/**
 * Daily credit expiry job.
 * Runs once per day, syncs workspace balances for any credits that have expired.
 */
import { CreditModel } from "../models/credit.model";

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function startCreditExpiryJob() {
  async function run() {
    console.log("[CREDIT EXPIRY JOB] Running...");
    try {
      const result = await CreditModel.expireStaleCredits();
      console.log(`[CREDIT EXPIRY JOB] Done - workspaces updated: ${result.workspacesUpdated}, credits expired: ${result.creditsExpired}`);
    } catch (err) {
      console.error("[CREDIT EXPIRY JOB] Failed:", err);
    }
  }

  // Run once on startup, then every 24h
  run();
  const timer = setInterval(run, INTERVAL_MS);

  return {
    stop: () => clearInterval(timer),
  };
}
