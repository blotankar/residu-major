# ResiduGuard

ResiduGuard is a cattle-health and antibiotic-residue tracking portal designed to support Maximum Residue Limit (MRL) compliance and livestock health record management.

**Repository:** https://github.com/blotankar/residu-blotankar

## Prerequisites

Install the following on your computer:

- [Git](https://git-scm.com/downloads)
- [Bun](https://bun.sh/)
- [Node.js](https://nodejs.org/) (keep it installed if required by your frontend tools)
- [Visual Studio Code](https://code.visualstudio.com/)

You will also need authorized access to the shared Supabase PostgreSQL database.

Do not commit or share real `.env` files, database passwords, JWT secrets, or Fabric private keys.

## 1. Clone the repository

Open PowerShell and run:

```powershell
git clone https://github.com/blotankar/residu-blotankar.git
cd residu-blotankar
```

Open this folder in VS Code if you prefer:

```powershell
code .
```

## 2. Install frontend dependencies

From the repository root (`residu-blotankar`), run:

```powershell
bun install
```

## 3. Install backend dependencies

Open a second terminal at the repository root, then run:

```powershell
cd backend
bun install
```

## 4. Configure backend environment variables

Create a local environment file:

```powershell
Copy-Item .env.example .env
```

Open `backend/.env` and configure the values required by the backend:

```dotenv
DATABASE_URL="YOUR_SUPABASE_DATABASE_URL"
DIRECT_URL="YOUR_SUPABASE_DIRECT_DATABASE_URL"
JWT_SECRET="YOUR_PRIVATE_JWT_SECRET"
```

Replace the placeholders with the actual values supplied by the project maintainer.

- `DATABASE_URL`: Application/database connection URL.
- `DIRECT_URL`: Database URL used by Prisma for migration operations.
- `JWT_SECRET`: Private secret used to sign authentication tokens.

**Security notes**

- Never commit `backend/.env` to Git.
- Never paste database passwords or JWT secrets into public issues, chats, or documentation.
- Share database credentials only with teammates authorized to access the shared database.
- The root `.gitignore` should ignore `.env` and `.env.*` files while allowing `.env.example`.

The maintainer should ensure that `backend/.env.example` contains all required variable names with placeholders only.

## 5. Generate Prisma Client

From the `backend` directory, run:

```powershell
bunx prisma generate
```

Do not run `prisma migrate reset`: it can delete data from the shared database.

The maintainer should ensure the committed Prisma migrations are applied to the shared database. Teammates should not independently reset or alter the shared schema.

## 6. Configure Hyperledger Fabric blockchain connectivity

ResiduGuard uses **Hyperledger Fabric 2.5.x** as its permissioned blockchain network for milk traceability.

The project uses a shared blockchain network hosted on the project maintainer's laptop.

Other team members do not need to install Hyperledger Fabric, Docker, WSL, or deploy chaincode locally. They only need to configure their backend to connect to the maintainer's running Fabric network.

### 6.1 Shared blockchain architecture

- **Project maintainer:** Hosts the Hyperledger Fabric network on their laptop.
- **Other team members:** Run their own frontend and backend applications locally.
- **PostgreSQL:** All authorized team members use the shared Supabase database.
- **Hyperledger Fabric:** All team members connect to the same Fabric network and ledger.

The frontend and backend run independently on each teammate's laptop, while blockchain transactions are submitted to the shared Fabric network.

### 6.2 Fabric network configuration

The existing ResiduGuard blockchain network uses:

| Configuration | Value |
|---|---|
| Hyperledger Fabric version | 2.5.x |
| Channel name | `residuGuard-channel` |
| Chaincode name | `residuguard` |
| Organization | `Org1MSP` |
| Peer | `peer0.org1.example.com` |
| Peer port | `7051` |
| Docker network | `fabric_test` |

The chaincode is already deployed by the project maintainer.

### 6.3 Maintainer setup (one-time and whenever the network needs restarting)

The project maintainer must have the following installed and configured:

- WSL2 with Ubuntu
- Docker Desktop with WSL2 integration
- Hyperledger Fabric binaries and Docker images
- Fabric test network
- ResiduGuard channel and deployed chaincode

Open the Ubuntu terminal and navigate to the Fabric test network:

```bash
cd ~/residuguard-blockchain/fabric-samples/test-network
```

Start the existing network using the existing channel configuration. Do not recreate the channel or redeploy chaincode unnecessarily.

Check that the Fabric containers are running:

```bash
docker ps
```

The maintainer must keep the Fabric network running while teammates are using blockchain functionality.

### 6.4 Allow teammates to connect to the maintainer's laptop

Teammates cannot use `localhost:7051` to access the maintainer's laptop because `localhost` refers to their own computers.

The maintainer must provide a reachable IP address.

**Step 1: Find the maintainer's IP address**

Open PowerShell on the maintainer's laptop:

```powershell
ipconfig
```

Find the IPv4 address of the active Wi-Fi or Ethernet connection.

For example:

```text
192.168.1.10
```

This is only an example. Use the actual reachable IP address.

**Step 2: Establish network connectivity**

- If teammates are on the same local network, they can connect using the maintainer's reachable LAN IP.
- If teammates are working from different locations, use a private VPN such as Tailscale.
- Ensure that the Fabric peer's gRPC port `7051` is reachable from authorized team devices.
- Configure Windows Firewall to permit connections from trusted devices.

**Important:** The Fabric peer must be configured to accept remote connections through its Docker port mapping and network interface. A peer accessible through `localhost` on the maintainer's laptop is not automatically accessible from other computers.

Do not expose Fabric peer ports directly to the public internet.

### 6.5 Configure Fabric environment variables on teammate laptops

Each teammate must configure their own `backend/.env`.

Add the following Fabric configuration:

```dotenv
FABRIC_PEER_ENDPOINT=MAINTAINER_IP:7051
FABRIC_PEER_HOST_ALIAS=peer0.org1.example.com

FABRIC_TLS_CERT_PATH=certs/fabric/org1/peer-tls-ca.crt
FABRIC_IDENTITY_CERT_PATH=certs/fabric/org1/identity-cert.pem
FABRIC_PRIVATE_KEY_PATH=certs/fabric/org1/private-key.pem

FABRIC_MSP_ID=Org1MSP
FABRIC_CHANNEL=residuGuard-channel
FABRIC_CHAINCODE=residuguard
```

Replace `MAINTAINER_IP` with the actual reachable IP address of the maintainer's laptop.

For example:

```dotenv
FABRIC_PEER_ENDPOINT=192.168.1.10:7051
```

The `FABRIC_PEER_HOST_ALIAS` must match the hostname included in the peer's TLS certificate. Do not replace it with the IP address unless the peer's TLS configuration and certificate have been updated accordingly.

### 6.6 Fabric certificates and identity setup

The backend requires the following files to establish a secure Fabric Gateway connection:

- Peer TLS CA certificate.
- Client identity certificate.
- Corresponding private key.

These files are not included in the GitHub repository because they contain security-sensitive information.

The project maintainer must securely provide each authorized teammate with the required certificates and identity credentials.

Recommended security practices:

- Use a separate Fabric identity and private key for each teammate.
- Do not share the maintainer's private key with everyone.
- Never upload private keys to GitHub.
- Never commit the `backend/certs/` directory.
- Keep certificate files in their configured local paths.

The expected local directory structure is:

```text
backend/
└── certs/
    └── fabric/
        └── org1/
            ├── peer-tls-ca.crt
            ├── identity-cert.pem
            └── private-key.pem
```

The certificate files must correspond to the identity and peer configuration used by the backend.

### 6.7 Verify blockchain connectivity

Once the maintainer's Fabric network is running and the teammate's environment is configured:

1. Start the teammate's backend.
2. Log in to ResiduGuard.
3. Perform a blockchain-enabled operation, such as creating or dispatching a milk batch.
4. Check the backend terminal for Fabric connection or transaction errors.
5. Use the application's traceability functionality to verify the blockchain records.

All teammates should be able to query and submit transactions to the same shared ledger, subject to their Fabric identity permissions.

### 6.8 Important limitations of the shared blockchain

- The maintainer's laptop must remain switched on and connected to the network.
- Docker and the Fabric test network must remain running.
- If the maintainer's laptop shuts down or the Fabric network stops, blockchain operations from other teammates may fail.
- All teammates use the same blockchain ledger.
- Each teammate runs their own frontend and backend locally.
- PostgreSQL remains the operational database, while Hyperledger Fabric stores tamper-evident traceability records.
- Do not independently recreate the shared channel or deploy a different chaincode version without coordinating with the maintainer.

## 7. Start the backend

From the `backend` directory, run:

```powershell
bun run src/server.ts
```

Keep this terminal open.

The backend server is expected to listen at:

```text
http://localhost:3000
```

If startup fails, check that `backend/.env` is configured correctly and send the error message to the project maintainer. Never send the contents of `.env`.

## 8. Start the frontend

Open a separate terminal at the repository root (not inside `backend`) and run:

```powershell
bun run dev
```

Use the local URL printed by the frontend development server in the terminal.

The frontend's login and registration requests must target the local backend at `http://localhost:3000`.

Confirm the API URL/proxy configuration in the project before testing. If requests fail, the maintainer should verify the frontend API base URL, CORS configuration, and that the backend is running.

## 9. Test registration and login

1. Open the frontend URL printed by `bun run dev`.
2. Register a test account using a unique email address.
3. Confirm the frontend shows a success response.
4. Log in using the same credentials.
5. If authorized, verify that the user and matching role profile were created in the shared Supabase database.

### Supported public registration roles

| Role | Required role-specific field |
|---|---|
| Farmer | Village |
| Veterinarian | License number |
| Collection Centre | Centre code |
| Factory | Factory code |

Authority accounts are provisioned by an administrator. Consumer accounts use guest batch verification and do not register through the public registration endpoint, according to the current backend logic.

Use clearly identifiable test accounts. Since teammates may share one database, test registrations can be visible to everyone with database access.

## 10. Git workflow for team development

Avoid having every teammate commit directly to `main`. Each teammate should create a branch for their task.

First, update the local main branch:

```powershell
git switch main
git pull origin main
```

Create a task branch (replace `your-task` with a short task name):

```powershell
git switch -c feature/your-task
```

After implementing and testing changes:

```powershell
git add .
git commit -m "Describe your change"
git push -u origin feature/your-task
```

Then open a Pull Request on GitHub to merge the branch into `main`.

Coordinate with the team before editing shared files such as Prisma schema, migrations, authentication, blockchain configuration, or API configuration.

Before running `git add .`, review `git status` and make sure `.env`, credentials, private keys, generated files, and dependencies are not being committed.

## Troubleshooting

### Browser shows a folder listing at `127.0.0.1:5500`

- This project is a TanStack Start app, not a static site. Do not open the repository with VS Code Live Server.
- In a terminal at the repository root, run `bun install` if you have not installed dependencies, then run `bun run dev`.
- Open the URL printed by the development server (usually `http://localhost:5173`) instead of the Live Server URL.

### `DATABASE_URL is not defined`

- Confirm `backend/.env` exists.
- Check that the variable is named exactly `DATABASE_URL`.
- Restart the backend after changing `.env`.

### Prisma cannot connect to Supabase

- Verify the database URLs and network access.
- Do not post connection strings publicly.
- Ask the project maintainer to verify database permissions and connection settings.

### Frontend registration/login does not work

- Confirm the backend is running on port `3000`.
- Confirm the frontend API URL points to the backend.
- Check the browser developer console and backend terminal for errors.
- The maintainer may need to verify CORS or development proxy configuration.

### Fabric connection fails

- Check whether the maintainer's Fabric network is running.
- Confirm the maintainer's laptop is reachable over the LAN or private VPN.
- Confirm port `7051` is reachable.
- Check that the Docker peer port is published for remote access.
- Verify the TLS CA certificate and peer hostname.
- Verify the teammate's identity certificate and corresponding private key.
- Check that the Fabric channel and chaincode names match the shared network.
- Check that the Fabric identity has the necessary permissions.

### Fabric works on the maintainer's laptop but not on teammates' laptops

This usually indicates a remote connectivity, Docker port mapping, firewall, VPN, or TLS certificate configuration issue.

Check the peer's network configuration and ensure that the backend connects using the maintainer's reachable IP address rather than `localhost`.

### Port `3000` is already in use

- Stop the other process using the port, or coordinate a different backend port and update the frontend API URL accordingly.

## Factory dashboard

The factory workspace is part of the existing ResiduGuard application at `/factory` and uses the existing login, session, role gate, Bun API server, PostgreSQL database, and Prisma client.

Factory operations include:

- Milk receipt.
- Recorded quality inspection.
- Production.
- Finished-lot inventory.
- Dispatch.
- Traceability.
- Date-filtered reports.

The application records inspection measurements and inspector decisions; it does not invent test thresholds or claim laboratory or regulatory certification.

The factory schema change is an additive migration in:

```text
backend/prisma/migrations/20261027000000_factory_operations
```

Generate the client and validate the schema from `backend`:

```powershell
bunx prisma validate
bunx prisma generate
bunx prisma migrate status
```

Do not run `prisma migrate reset`.

**Before applying any pending migrations to a shared or existing database, inspect the status and have the maintainer verify the migration history.**

The earlier `20261010180437_cattle_id_unique_per_farmer` migration drops and recreates the cattle table; if it is pending, do not apply the migration chain until its data-preserving remediation has been planned.

The factory migration itself adds tables and nullable processing-batch fields, but it cannot make that earlier migration safe.

The factory dashboard requires a factory user and matching `Factory` profile. Factory receipt and production data come from milk batches created by a collection-centre account through the collection-centre workspace.

## Important reminders

- Keep `backend/.env` local and private.
- Never commit Fabric certificates or private keys.
- Do not run `prisma migrate reset` on the shared database.
- Do not commit directly to `main` unless the team agrees.
- Pull the latest changes before starting new work.
- Coordinate schema, migration, authentication, and blockchain changes with the project maintainer.
- The shared Fabric network is available only while the maintainer's network and laptop are running.
