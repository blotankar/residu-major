
import { Context, Contract } from "fabric-contract-api";

interface FarmOrigin {
  farmId: string;
  farmName: string;
  location: string;
  cattleIds: string[];
  linkedAt: string;
}

interface SupplyChainEvent {
  eventId: string;
  eventType: string;
  organization: string;
  location: string;
  timestamp: string;
  vehicleId?: string;
  quantityLitres?: number;
  qualityStatus?: string;
  productLotId?: string;
}

interface MilkBatch {
  batchId: string;
  collectionCentreId: string;
  collectionCentreName: string;
  collectedAt: string;
  quantityLitres: number;
  status: string;
  farmOrigins: FarmOrigin[];
  events: SupplyChainEvent[];
  createdAt: string;
  updatedAt: string;
}

export class ResiduGuardContract extends Contract {

  // Create a new milk collection batch
  async CreateMilkBatch(
    ctx: Context,
    batchId: string,
    collectionCentreId: string,
    collectionCentreName: string,
    collectedAt: string,
    quantityLitres: number
  ): Promise<string> {

    if (!batchId || !collectionCentreId || !collectionCentreName) {
      throw new Error("Required batch details are missing");
    }

    // Fabric transaction arguments arrive as strings.
    const parsedQuantity = Number(quantityLitres);

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      throw new Error("Quantity must be greater than zero");
    }

    const existing = await ctx.stub.getState(batchId);

    if (existing && existing.length > 0) {
      throw new Error(`Batch ${batchId} already exists`);
    }

    // Use the Fabric transaction timestamp for deterministic execution.
    const timestamp = this.getTransactionTimestamp(ctx);

    const batch: MilkBatch = {
      batchId,
      collectionCentreId,
      collectionCentreName,
      collectedAt,
      quantityLitres: parsedQuantity,
      status: "COLLECTED",
      farmOrigins: [],
      events: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await ctx.stub.putState(
      batchId,
      Buffer.from(JSON.stringify(batch))
    );

    return JSON.stringify(batch);
  }

  // Link a farm and its cattle to a collection batch
  async AddFarmOrigin(
    ctx: Context,
    batchId: string,
    farmId: string,
    farmName: string,
    location: string,
    cattleIdsJson: string
  ): Promise<string> {

    const batch = await this.getBatchData(ctx, batchId);

    if (!farmId || !farmName || !location) {
      throw new Error("Farm details are required");
    }

    let cattleIds: string[];

    try {
      cattleIds = JSON.parse(cattleIdsJson);
    } catch {
      throw new Error("Cattle IDs must be valid JSON");
    }

    if (
      !Array.isArray(cattleIds) ||
      cattleIds.length === 0 ||
      !cattleIds.every(
        id => typeof id === "string" && id.trim().length > 0
      )
    ) {
      throw new Error("At least one valid cattle ID is required");
    }

    if (batch.farmOrigins.some(origin => origin.farmId === farmId)) {
      throw new Error("This farm is already linked to the batch");
    }

    // Generate one deterministic timestamp for this transaction.
    const timestamp = this.getTransactionTimestamp(ctx);

    batch.farmOrigins.push({
      farmId,
      farmName,
      location,
      cattleIds,
      linkedAt: timestamp
    });

    batch.updatedAt = timestamp;

    await ctx.stub.putState(
      batchId,
      Buffer.from(JSON.stringify(batch))
    );

    return JSON.stringify(batch);
  }

  // Record a supply-chain event
  async RecordSupplyChainEvent(
    ctx: Context,
    batchId: string,
    eventId: string,
    eventType: string,
    organization: string,
    location: string,
    vehicleId: string,
    quantityLitres: number,
    qualityStatus: string,
    productLotId: string
  ): Promise<string> {

    const batch = await this.getBatchData(ctx, batchId);

    if (!eventId || !eventType || !organization || !location) {
      throw new Error("Required event details are missing");
    }

    const allowedEvents = [
      "TRANSPORT_DISPATCHED",
      "TRANSPORT_ARRIVED",
      "FACTORY_RECEIVED",
      "QUALITY_CHECK_RECORDED",
      "PROCESSING_RECORDED",
      "PRODUCT_PACKAGED",
      "DISTRIBUTION_DISPATCHED",
      "DISTRIBUTION_ARRIVED",
      "RETAILER_RECEIVED"
    ];

    if (!allowedEvents.includes(eventType)) {
      throw new Error("Invalid supply-chain event type");
    }

    if (batch.events.some(event => event.eventId === eventId)) {
      throw new Error("Event ID already exists");
    }

    // Convert the quantity argument from string to number.
    const parsedQuantity = Number(quantityLitres);

    if (
      quantityLitres !== undefined &&
      quantityLitres !== null &&
      String(quantityLitres).trim() !== "" &&
      (!Number.isFinite(parsedQuantity) || parsedQuantity < 0)
    ) {
      throw new Error("Event quantity must be a valid non-negative number");
    }

    // Use the same Fabric transaction timestamp across all endorsing peers.
    const timestamp = this.getTransactionTimestamp(ctx);

    const event: SupplyChainEvent = {
      eventId,
      eventType,
      organization,
      location,
      timestamp,
      ...(vehicleId && { vehicleId }),
      ...(
        Number.isFinite(parsedQuantity) &&
        String(quantityLitres).trim() !== "" &&
        parsedQuantity > 0 && {
          quantityLitres: parsedQuantity
        }
      ),
      ...(qualityStatus && { qualityStatus }),
      ...(productLotId && { productLotId })
    };

    batch.events.push(event);
    batch.updatedAt = timestamp;

    await ctx.stub.putState(
      batchId,
      Buffer.from(JSON.stringify(batch))
    );

    return JSON.stringify(event);
  }

  // Retrieve a complete batch
  async GetMilkBatch(
    ctx: Context,
    batchId: string
  ): Promise<string> {

    const batch = await this.getBatchData(ctx, batchId);

    return JSON.stringify(batch);
  }

  // Retrieve the recorded supply-chain events
  async GetBatchHistory(
    ctx: Context,
    batchId: string
  ): Promise<string> {

    const batch = await this.getBatchData(ctx, batchId);

    return JSON.stringify(batch.events);
  }

  // Get a deterministic timestamp from the Fabric transaction.
  private getTransactionTimestamp(ctx: Context): string {

    const txTimestamp = ctx.stub.getTxTimestamp();

    const milliseconds =
      Number(txTimestamp.seconds.toString()) * 1000 +
      Math.floor(txTimestamp.nanos / 1000000);

    return new Date(milliseconds).toISOString();
  }

  // Retrieve batch data from the ledger
  private async getBatchData(
    ctx: Context,
    batchId: string
  ): Promise<MilkBatch> {

    const data = await ctx.stub.getState(batchId);

    if (!data || data.length === 0) {
      throw new Error(`Milk batch ${batchId} does not exist`);
    }

    return JSON.parse(data.toString()) as MilkBatch;
  }
}
