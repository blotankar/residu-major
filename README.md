# ResiduGuard
### Cattle Health. Safe Milk. Compliant Supply Chain.

ResiduGuard is a web-based cattle health and antibiotic residue tracking portal designed to support responsible antibiotic usage, Maximum Residue Limit (MRL) compliance, milk batch traceability and livestock health record management.

**Repository:** https://github.com/blotankar/residu-blotankar

---

# Part A – Project Documentation

## 1. Problem Statement

Antibiotics are commonly administered to dairy cattle to treat bacterial infections and other diseases. However, improper antibiotic usage or failure to follow the prescribed withdrawal period can result in antibiotic residues remaining in milk.

When contaminated milk enters the dairy supply chain, it can create potential health risks for consumers and affect food safety.

Traditional dairy supply chains also face challenges such as:
- Lack of centralized cattle health and treatment records.
- Difficulty monitoring antibiotic administration and withdrawal periods.
- Limited traceability of milk from farms to consumers.
- Difficulty identifying and tracking potentially contaminated milk batches.
- Lack of transparent residue testing and MRL compliance records.

## 2. Proposed Solution

ResiduGuard provides a centralized digital platform connecting farmers, veterinarians, collection centres, factories and customers.

The system enables:
- Digital cattle health and treatment record management.
- Antibiotic administration and withdrawal-period monitoring.
- Milk collection and batch management.
- Residue testing and MRL compliance monitoring.
- End-to-end milk supply-chain traceability.
- Blockchain-based storage of traceability records using Hyperledger Fabric.

By combining database management with blockchain technology, ResiduGuard improves transparency, accountability and traceability throughout the dairy supply chain.

## 3. Project Objectives

- Maintain digital cattle health and treatment records.
- Monitor antibiotic usage and withdrawal periods.
- Reduce the risk of milk containing antibiotic residues entering the supply chain.
- Track milk batches from collection to final distribution.
- Support residue testing and MRL compliance verification.
- Maintain tamper-evident records using blockchain technology.
- Provide role-based access to different stakeholders.

## 4. System Architecture

ResiduGuard follows a multi-tier web application architecture consisting of the following layers:

**1. Presentation Layer**
- React and TypeScript.
- Role-based dashboards and interfaces.
- User authentication and navigation.

**2. Application Layer**
- Bun and TypeScript backend.
- REST API endpoints.
- Authentication and authorization.
- Business logic and workflow management.

**3. Data Layer**
- PostgreSQL database hosted on Supabase.
- Prisma ORM for database operations.
- Stores users, cattle, treatments, milk batches, residue tests and compliance records.

**4. Blockchain Layer**
- Hyperledger Fabric 2.5.x.
- Permissioned blockchain network.
- Dedicated channel and deployed ResiduGuard chaincode.
- Maintains tamper-evident milk traceability records.

PostgreSQL serves as the operational database, while Hyperledger Fabric provides an additional layer of verifiable and tamper-evident traceability.

## 5. Technology Stack

| Technology | Purpose |
|---|---|
| React | Frontend development |
| TypeScript | Type-safe application development |
| TanStack Router / TanStack Start | Frontend routing and application framework |
| Tailwind CSS | UI styling |
| Bun | JavaScript runtime and package management |
| REST APIs | Frontend-backend communication |
| PostgreSQL | Relational database |
| Supabase | Cloud database hosting |
| Prisma ORM | Database queries and schema management |
| Hyperledger Fabric 2.5.x | Permissioned blockchain |
| Docker | Blockchain network containerization |
| Git and GitHub | Version control and collaboration |

## 6. User Roles and Responsibilities

ResiduGuard provides role-based access for six major stakeholders.

### 6.1 Farmer

- Register and manage cattle.
- Maintain cattle health information.
- View cattle treatment history.
- Track milk production.
- Access relevant cattle records.

### 6.2 Veterinarian

- Maintain veterinary treatment records.
- Record antibiotic administration.
- Manage treatment information and dosage.
- Monitor antibiotic withdrawal periods.
- Maintain cattle treatment history.

### 6.3 Collection Centre

- Manage milk collection from farmers.
- Record milk intake information.
- Track milk collection batches.
- Maintain collection records.
- View relevant batch and testing information.

### 6.4 Factory

- Manage incoming milk batches.
- Record milk receipt and quality inspection.
- Manage production operations.
- Maintain finished-lot inventory.
- Manage dispatch operations.
- View residue testing and compliance information.
- Access batch traceability and reports.

### 6.5 Customer

- Access product details.
- Verify available milk batch information.
- View traceability information.
- Check available safety and compliance information.

### 6.6 Administrator

- Manage users and their roles.
- Oversee system operations.
- Monitor system information.
- Access compliance information and reports.
- Manage administrative access.

## 7. Features and Interfaces

### 7.1 Authentication and Role-Based Access
- User registration and login.
- Role-specific authentication.
- Protected dashboards and routes.
- Role-based authorization.

### 7.2 Farmer Interface
- Cattle registration and management.
- Cattle health information.
- Treatment history.
- Milk production records.

### 7.3 Veterinarian Interface
- Treatment management.
- Antibiotic administration records.
- Withdrawal-period monitoring.
- Veterinary health records.

### 7.4 Collection Centre Interface
- Milk intake management.
- Milk collection records.
- Batch creation and tracking.
- Testing information management.

### 7.5 Factory Interface
- Milk receipt.
- Quality inspection.
- Production management.
- Finished-lot inventory.
- Dispatch management.
- Batch traceability.
- Date-filtered reports.

### 7.6 Customer Interface
- Product information access.
- Milk batch verification.
- Traceability information.
- Available compliance details.

### 7.7 Administrator Interface
- User and role management.
- System monitoring.
- Administrative operations.
- Reports and compliance oversight.

## 8. End-to-End Supply Chain Workflow

ResiduGuard connects the different stakeholders through a digital milk supply-chain workflow.

**Farm → Collection Centre → Factory → Customer**

1. **Farm:** Farmers maintain cattle information, health records and milk production details. Veterinarians record treatments and antibiotic administration.

2. **Collection Centre:** Milk is collected and recorded. Collection centres manage milk intake and batch information.

3. **Factory:** Incoming milk batches are received, inspected and processed. Factories manage production, residue testing, compliance information, inventory and dispatch.

4. **Customer:** Customers can access available product and batch traceability information to understand the milk's supply-chain history.

## 9. Antibiotic Withdrawal Period and MRL Compliance

ResiduGuard supports monitoring of antibiotic treatment records and prescribed withdrawal periods.

The system helps identify milk eligibility based on recorded treatment and withdrawal information.

Residue testing results are also recorded to support Maximum Residue Limit (MRL) compliance verification.

The combination of treatment tracking, withdrawal monitoring and residue testing helps improve milk safety management.

## 10. Blockchain Integration – Hyperledger Fabric

ResiduGuard integrates **Hyperledger Fabric 2.5.x** as a permissioned blockchain network for milk supply-chain traceability.

Blockchain integration provides:
- Tamper-evident traceability records.
- Shared ledger access for authorized participants.
- Verifiable milk batch transaction history.
- Improved transparency across supply-chain stages.
- Additional accountability for recorded transactions.

**Blockchain Configuration:**

| Configuration | Value |
|---|---|
| Platform | Hyperledger Fabric 2.5.x |
| Channel | `residuguard-channel` |
| Chaincode | `residuguard` |
| Organization | `Org1MSP` |
| Peer | `peer0.org1.example.com` |
| Peer Port | `7051` |
| Docker Network | `fabric_test` |

The project uses a shared Fabric network hosted by the project maintainer. Authorized team members connect their local backend applications to the same network.

---

# Part B – Technical Setup

## 11. Prerequisites

Install the following software:

- [Git](https://git-scm.com/downloads)
- [Bun](https://bun.sh/)
- [Node.js](https://nodejs.org/)
- [Visual Studio Code](https://code.visualstudio.com/)

You will also need:
- Authorized access to the shared Supabase PostgreSQL database.
- Fabric certificates and identity credentials supplied by the project maintainer.
- Network access to the shared Hyperledger Fabric network.

**Blockchain maintainer requirements:**
- WSL2 with Ubuntu.
- Docker Desktop with WSL2 integration.
- Hyperledger Fabric binaries and Docker images.
- Fabric test network and deployed ResiduGuard chaincode.

Other team members do not need to install or deploy Fabric locally.

## 12. Clone the Repository

Open PowerShell and execute:

```powershell
git clone https://github.com/blotankar/residu-blotankar.git
cd residu-blotankar
```

Open the project in VS Code:

```powershell
code .
```

## 13. Install Dependencies

**Frontend dependencies:**

Run from the repository root:

```powershell
bun install
```

**Backend dependencies:**

Open another terminal:

```powershell
cd backend
bun install
```

## 14. Configure Environment Variables

Create the backend environment file:

```powershell
Copy-Item .env.example .env
```

Open `backend/.env` and configure:

```dotenv
DATABASE_URL="YOUR_SUPABASE_DATABASE_URL"
DIRECT_URL="YOUR_SUPABASE_DIRECT_DATABASE_URL"
JWT_SECRET="YOUR_PRIVATE_JWT_SECRET"
```

Replace the placeholders with credentials provided by the project maintainer.

- `DATABASE_URL`: Application database connection.
- `DIRECT_URL`: Direct database connection used for Prisma migrations.
- `JWT_SECRET`: Secret used for signing authentication tokens.

### Security Notes

- Never commit `.env` files.
- Never share database passwords or JWT secrets publicly.
- The root `.gitignore` should ignore environment files while allowing `.env.example`.
- Keep all credentials private.

## 15. Database and Prisma Setup

From the `backend` directory, generate the Prisma Client:

```powershell
bunx prisma generate
```

To validate the schema:

```powershell
bunx prisma validate
```

To check migration status:

```powershell
bunx prisma migrate status
```

**Important:**
- The project uses a shared Supabase PostgreSQL database.
- The project maintainer should coordinate database migrations.
- Never execute `prisma migrate reset` on the shared database.
- Inspect pending migrations before applying them.

The earlier `20261010180437_cattle_id_unique_per_farmer` migration drops and recreates the cattle table. If this migration is pending, do not apply the migration chain until a data-preserving remediation has been planned.

## 16. Hyperledger Fabric Configuration

ResiduGuard uses a shared Hyperledger Fabric 2.5.x network.

### 16.1 Shared Network Architecture

- **Project maintainer:** Hosts the Fabric network.
- **Other team members:** Run their own frontend and backend locally.
- **PostgreSQL:** Shared Supabase database.
- **Hyperledger Fabric:** Shared permissioned blockchain ledger.

### 16.2 Start the Blockchain Network

The project maintainer must start the existing Fabric network.

Open Ubuntu through WSL and navigate to:

```bash
cd ~/residuguard-blockchain/fabric-samples/test-network
```

Start the existing network using its existing configuration.

Check running containers:

```bash
docker ps
```

Keep the network running while other team members use blockchain functionality.

### 16.3 Configure Remote Connectivity

The maintainer must provide a reachable IP address.

On the maintainer's Windows laptop, execute:

```powershell
ipconfig
```

Find the IPv4 address of the active network connection.

For teammates working remotely, a private VPN such as Tailscale can be used.

Ensure:
- The Fabric peer port `7051` is reachable.
- Docker publishes the peer port for remote connections.
- Windows Firewall permits authorized connections.
- The peer TLS hostname matches its certificate.

Do not expose Fabric peer ports directly to the public internet.

### 16.4 Configure Fabric Environment Variables

Each teammate must configure the following in their own `backend/.env`:

```dotenv
FABRIC_PEER_ENDPOINT=MAINTAINER_IP:7051
FABRIC_PEER_HOST_ALIAS=peer0.org1.example.com

FABRIC_TLS_CERT_PATH=certs/fabric/org1/peer-tls-ca.crt
FABRIC_IDENTITY_CERT_PATH=certs/fabric/org1/identity-cert.pem
FABRIC_PRIVATE_KEY_PATH=certs/fabric/org1/private-key.pem

FABRIC_MSP_ID=Org1MSP
FABRIC_CHANNEL=residuguard-channel
FABRIC_CHAINCODE=residuguard
```

Replace `MAINTAINER_IP` with the actual reachable IP address.

### 16.5 Fabric Certificates and Identity

The backend requires:

- Peer TLS CA certificate.
- Client identity certificate.
- Corresponding private key.

Expected directory structure:

```text
backend/
└── certs/
    └── fabric/
        └── org1/
            ├── peer-tls-ca.crt
            ├── identity-cert.pem
            └── private-key.pem
```

The project maintainer must securely provide these files to authorized team members.

Never commit certificates or private keys to GitHub. Prefer separate Fabric identities and private keys for each teammate.

### 16.6 Verify Blockchain Connectivity

1. Ensure the maintainer's Fabric network is running.
2. Configure the teammate's backend environment.
3. Start the backend.
4. Log in to ResiduGuard.
5. Perform a blockchain-enabled operation, such as creating or dispatching a milk batch.
6. Check the backend terminal for transaction or connectivity errors.
7. Verify the records through the application's traceability functionality.

**Important limitations:**

- The maintainer's laptop must remain switched on.
- Docker and the Fabric network must remain running.
- If the network stops, blockchain operations may fail.
- All authorized teammates use the same ledger.
- Do not independently recreate the channel or redeploy chaincode without coordinating with the maintainer.

## 17. Start the Backend

Open a terminal inside the `backend` directory:

```powershell
bun run src/server.ts
```

The backend is expected to run at:

```text
http://localhost:3000
```

Keep this terminal running.

## 18. Start the Frontend

Open another terminal at the repository root:

```powershell
bun run dev
```

Open the local URL displayed in the terminal.

The frontend should communicate with the backend at:

```text
http://localhost:3000
```

Verify the API base URL, proxy configuration and CORS settings if requests fail.

**Note:** ResiduGuard is a TanStack Start application. Do not use VS Code Live Server to run the project.

## 19. Registration and Login

1. Open the frontend development URL.
2. Register using a unique email address.
3. Verify the registration response.
4. Log in using the registered credentials.
5. Verify the appropriate role-based dashboard.

### Supported Public Registration Roles

| Role | Required field |
|---|---|
| Farmer | Village |
| Veterinarian | License number |
| Collection Centre | Centre code |
| Factory | Factory code |

Additional account information:

- Authority accounts are provisioned by an administrator.
- Consumer accounts use guest batch verification.
- Consumers do not register through the public registration endpoint according to the current backend logic.

## 20. Factory Database Migration

The Factory workspace is available at:

```text
/factory
```

It uses the existing authentication, session, role gate, Bun API server, PostgreSQL database and Prisma Client.

Factory migration:

```text
backend/prisma/migrations/20261027000000_factory_operations
```

From the backend directory, execute:

```powershell
bunx prisma validate
bunx prisma generate
bunx prisma migrate status
```

The factory migration adds tables and nullable processing-batch fields.

Before applying pending migrations to the shared database, inspect the migration status and coordinate with the project maintainer.

**Important:** The factory dashboard requires a factory user and matching `Factory` profile. Factory receipt and production data come from milk batches created by a collection-centre account.

## 21. Git Workflow for Team Development

Avoid committing directly to `main`.

**Step 1: Update the main branch**

```powershell
git switch main
git pull origin main
```

**Step 2: Create a feature branch**

```powershell
git switch -c feature/your-task
```

**Step 3: Stage and commit changes**

```powershell
git add .
git commit -m "Describe your change"
```

**Step 4: Push the branch**

```powershell
git push -u origin feature/your-task
```

**Step 5: Create a Pull Request**

Open GitHub and create a Pull Request to merge your branch into `main`.

Coordinate changes involving Prisma schema, migrations, authentication, blockchain configuration and API configuration with the project maintainer.

Before running `git add .`, verify that no environment files, credentials, private keys or generated dependencies are included.

## 22. Troubleshooting

### Browser shows a folder listing at 127.0.0.1:5500

- Do not use VS Code Live Server.
- Run `bun run dev` from the repository root.
- Open the URL displayed in the terminal.

### DATABASE_URL is not defined

- Check that `backend/.env` exists.
- Verify that `DATABASE_URL` is spelled correctly.
- Restart the backend.

### Prisma cannot connect to Supabase

- Verify database URLs.
- Check network connectivity and database permissions.
- Contact the project maintainer if access is unavailable.

### Frontend registration or login fails

- Confirm the backend is running on port `3000`.
- Verify the frontend API URL.
- Check browser console and backend terminal errors.
- Verify CORS and proxy configuration.

### Fabric connection fails

- Check whether the maintainer's Fabric network is running.
- Verify remote connectivity and port `7051`.
- Check Docker peer port mapping.
- Verify TLS certificates and peer hostname.
- Verify identity certificate and private key.
- Check channel, chaincode and identity permissions.

### Fabric works on maintainer's laptop but not on teammates' laptops

This may indicate a remote connectivity, Docker port mapping, firewall, VPN or TLS certificate issue.

Use the maintainer's reachable IP address instead of `localhost`.

### Port 3000 is already in use

Stop the conflicting process or coordinate a different backend port and update the frontend API configuration accordingly.

## 23. Important Reminders

- Keep `backend/.env` private.
- Never commit Fabric certificates or private keys.
- Never run `prisma migrate reset` on the shared database.
- Coordinate database schema and migration changes.
- Do not commit directly to `main` without team agreement.
- Pull the latest changes before starting new development work.
- Keep the shared Fabric network running when blockchain functionality is required.
- Use only authorized database and blockchain credentials.

---

**ResiduGuard – Cattle Health. Safe Milk. Compliant Supply Chain.**
