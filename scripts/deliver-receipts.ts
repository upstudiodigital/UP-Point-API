import "dotenv/config";
import { deliverReceipts } from "../src/portal/receipts";
import prisma from "../src/prisma";
async function main() {
  try {
    await deliverReceipts();
    console.log("Ciclo de comprovantes concluído.");
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch(() => {
  console.error("Falha no ciclo de comprovantes");
  process.exitCode = 1;
});
