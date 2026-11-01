import {
  evaluateFabricTransaction,
  disconnectFabric,
} from "./fabric";

async function main() {
  try {
    console.log("Connecting to ResiduGuard Fabric...");

    const result = await evaluateFabricTransaction(
      "GetMilkBatch",
      "RG-TEST-001",
    );

    const batch = JSON.parse(result);

    console.log("\nBlockchain query successful!");
    console.log("Batch ID:", batch.batchId);
    console.log("Collection Centre:", batch.collectionCentreName);
    console.log("Quantity:", batch.quantityLitres, "litres");
    console.log("Farm Origins:", batch.farmOrigins?.length ?? 0);
    console.log("Supply Chain Events:", batch.events?.length ?? 0);
    console.log("\nFull ledger response:");
    console.log(JSON.stringify(batch, null, 2));
  } catch (error) {
    console.error("\nFabric connection/query failed:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await disconnectFabric();
  }
}

main();