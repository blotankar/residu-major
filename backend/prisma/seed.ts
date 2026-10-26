import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding ResiduGuard database...");

  async function seedUser(name: string, email: string, role: "VETERINARIAN" | "COLLECTION_CENTRE" | "FACTORY") {
    return prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        name,
        email,
        passwordHash: await Bun.password.hash(crypto.randomUUID()),
        role,
      },
    });
  }

  // -------------------------
  // FARMER
  // -------------------------

  const farmerUser = await prisma.user.upsert({
    where: {
      email: "ramesh@residuguard.demo",
    },
    update: {},
    create: {
      name: "Ramesh Patil",
      email: "ramesh@residuguard.demo",
      passwordHash: "demo-hash",
      role: "FARMER",
      organization: "Patil Dairy Farm",
    },
  });

  const farmer = await prisma.farmer.upsert({
    where: {
      userId: farmerUser.id,
    },
    update: {},
    create: {
      userId: farmerUser.id,
      village: "Pune",
      phone: "9876543210",
    },
  });

  // -------------------------
  // CATTLE
  // -------------------------

  await prisma.cattle.upsert({
    where: {
      farmerId_cattleId: {
        farmerId: farmer.id,
        cattleId: "CATTLE-001",
      },
    },
    update: {},
    create: {
      cattleId: "CATTLE-001",
      name: "Ganga",
      breed: "Gir",
      sex: "FEMALE",
      farmerId: farmer.id,
    },
  });

  await prisma.cattle.upsert({
    where: {
      farmerId_cattleId: {
        farmerId: farmer.id,
        cattleId: "CATTLE-002",
      },
    },
    update: {},
    create: {
      cattleId: "CATTLE-002",
      name: "Lakshmi",
      breed: "Sahiwal",
      sex: "FEMALE",
      farmerId: farmer.id,
    },
  });

  // -------------------------
  // VETERINARIAN
  // -------------------------

  const vetUser = await seedUser(
    "Dr. Anjali Sharma",
    "anjali@residuguard.demo",
    "VETERINARIAN",
  );
  await prisma.veterinarian.upsert({
    where: {
      licenseNo: "VET-PUNE-001",
    },
    update: { userId: vetUser.id },
    create: {
      userId: vetUser.id,
      name: "Dr. Anjali Sharma",
      licenseNo: "VET-PUNE-001",
      phone: "9876501234",
    },
  });

  // -------------------------
  // COLLECTION CENTRE
  // -------------------------

  const centreUser = await seedUser(
    "Pune Milk Collection Centre",
    "centre@residuguard.demo",
    "COLLECTION_CENTRE",
  );
  await prisma.collectionCentre.upsert({
    where: {
      code: "CC-PUNE-001",
    },
    update: { userId: centreUser.id },
    create: {
      userId: centreUser.id,
      name: "Pune Milk Collection Centre",
      code: "CC-PUNE-001",
      village: "Pune",
      address: "Pune, Maharashtra",
    },
  });

  // -------------------------
  // FACTORY
  // -------------------------

  const factoryUser = await seedUser(
    "Pune Dairy Processing Factory",
    "factory@residuguard.demo",
    "FACTORY",
  );
  await prisma.factory.upsert({
    where: {
      code: "FACT-PUNE-001",
    },
    update: { userId: factoryUser.id },
    create: {
      userId: factoryUser.id,
      name: "Pune Dairy Processing Factory",
      code: "FACT-PUNE-001",
      address: "Pune, Maharashtra",
    },
  });

  console.log("Seed completed successfully!");
}

main()
  .catch((error) => {
    console.error("Seed failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });