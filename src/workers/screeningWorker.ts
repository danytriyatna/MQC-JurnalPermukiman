import { drainScreeningQueue } from "../lib/queue/screeningQueue";
import { client } from "../db";

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS || "3000") || 3000;
const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || "2") || 2;
const AUTO_DRAIN = process.env.WORKER_AUTO_DRAIN === "true";
const runOnce = process.argv.includes("--once");

let shuttingDown = false;

process.on("SIGINT", () => {
  shuttingDown = true;
});
process.on("SIGTERM", () => {
  shuttingDown = true;
});

async function main() {
  const workerId = `mqc-worker-${process.pid}`;
  if (!runOnce && !AUTO_DRAIN) {
    console.log(
      `[MQC Worker] Standby (${workerId}) | auto-drain nonaktif (WORKER_AUTO_DRAIN!=true); naskah OJS menunggu verifikasi dari /dashboard.`,
    );
  } else {
    console.log(
      `[MQC Worker] Started (${workerId}) | concurrency=${WORKER_CONCURRENCY} | mode=${runOnce ? "once" : "daemon"}`,
    );
  }

  do {
    if (runOnce || AUTO_DRAIN) {
      try {
        const stats = await drainScreeningQueue({
          workerId,
          concurrency: WORKER_CONCURRENCY,
          maxJobs: 50,
        });

        if (stats.processed > 0) {
          console.log(
            `[MQC Worker] Cycle summary: processed=${stats.processed}, completed=${stats.completed}, failed=${stats.failed}, dead=${stats.dead}`,
          );
        }
      } catch (err: any) {
        console.error("[MQC Worker] Error during queue cycle:", err?.message || err);
      }
    }

    if (runOnce || shuttingDown) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  } while (!shuttingDown);

  await client.end();
  console.log(`[MQC Worker] Stopped (${workerId})`);
}

main().catch(async (err) => {
  console.error("[MQC Worker] Fatal error:", err);
  await client.end();
  process.exit(1);
});
