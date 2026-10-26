# ResiduGuard

ResiduGuard is a cattle-health and antibiotic-residue tracking portal designed to support Maximum Residue Limit (MRL) compliance and livestock health record management.

Repository: https://github.com/blotankar/residu-blotankar

## Prerequisites

Install the following on your computer:

- [Git](https://git-scm.com/downloads)
- [Bun](https://bun.sh/)
- [Node.js](https://nodejs.org/) (keep it installed if required by your frontend tools)
- [Visual Studio Code](https://code.visualstudio.com/)

You will also need authorized access to the shared Supabase PostgreSQL database. Do not commit or share real `.env` files, database passwords, or private JWT secrets.

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
DATABASE_URL="postgresql://postgres.hofwigzqksfajkwiuewp:Residuguard%40110011@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.hofwigzqksfajkwiuewp:Residuguard%40110011@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
JWT_SECRET="residuguard-development-secret-change-before-production"
```

Replace the placeholders with the actual values supplied by the project maintainer. These example values are not real credentials.

- `DATABASE_URL`: the application/database connection URL.
- `DIRECT_URL`: the database URL used by Prisma for migration operations.
- `JWT_SECRET`: a private secret used to sign authentication tokens, if JWT signing is enabled in the current code.

**Security notes**
- Never commit `backend/.env` to Git.
- Never paste database passwords or JWT secrets into issues, chat, or public documentation.
- Share database credentials only with teammates who are authorized to access the shared database.
- The root `.gitignore` should ignore `.env` and `.env.*` files while allowing `.env.example`.

The current `.env.example` may need to be updated by the maintainer to include all required variables (`DATABASE_URL`, `DIRECT_URL`, and `JWT_SECRET`) with placeholders only.

## 5. Generate Prisma Client

From the `backend` directory, run:

```powershell
bunx prisma generate
```

Do not run `prisma migrate reset`: it can delete data from the shared database.

The maintainer should ensure the committed Prisma migrations are applied to the shared database. Teammates should not independently reset or alter the shared schema.

## 6. Start the backend

From `backend`, run:

```powershell
bun run src/server.ts
```

Keep this terminal open. The current backend server is expected to listen at:

```text
http://localhost:3000
```

If startup fails, check that `backend/.env` is configured correctly and send the error message to the project maintainer. Never send the contents of `.env`.

## 7. Start the frontend

Open a **separate terminal** at the repository root (not inside `backend`) and run:

```powershell
bun run dev
```

Use the local URL printed by the frontend development server in the terminal.

The frontend's login and registration requests must target the backend at `http://localhost:3000`. Confirm the API URL/proxy configuration in the project before testing. If requests fail, the maintainer should verify the frontend API base URL, CORS configuration, and that the backend is running.

## 8. Test registration and login

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

## 9. Git workflow for team development

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

Then open a Pull Request on GitHub to merge the branch into `main`. Coordinate with the team before editing shared files such as Prisma schema, migrations, authentication, or API configuration.

Before running `git add .`, review `git status` and make sure `.env`, credentials, generated files, and dependencies are not being committed.

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
- Do not post the connection strings publicly.
- Ask the project maintainer to verify database permissions and connection settings.

### Frontend registration/login does not work
- Confirm the backend is running on port `3000`.
- Confirm the frontend API URL points to the backend.
- Check the browser developer console and backend terminal for errors.
- The maintainer may need to verify CORS or development proxy configuration.

### Port `3000` is already in use
- Stop the other process using the port, or coordinate a different backend port and update the frontend API URL accordingly.

## Important reminders

- Keep `backend/.env` local and private.
- Do not run `prisma migrate reset` on the shared database.
- Do not commit directly to `main` unless the team agrees.
- Pull the latest changes before starting new work.
- Coordinate schema and migration changes with the project maintainer.
