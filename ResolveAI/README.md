# ResolveAI — AI-assisted customer support platform

A **from-scratch, full-stack** support-ticket application designed to demonstrate secure backend engineering with optional Gemini-powered ticket analysis and agent-reviewed reply drafting.

> **Current scope:** A portfolio-ready development MVP, **not a production-certified help desk**. Gemini needs a real API key; it does not invent results when the key is missing. No hosted deployment or public repository is included.

## Tech stack

- **Client:** React 18, TypeScript, Vite, responsive custom CSS, Lucide icons
- **Server:** Node.js 22, Express 4, TypeScript, Zod, JWT, bcryptjs
- **Database:** PostgreSQL 16 and Prisma 6 (intentionally pinned for a straightforward client-generation workflow)
- **GenAI:** Google Gemini `generateContent` REST API, schema-constrained ticket analysis, validated with Zod
- **Tests:** Vitest, Supertest

## Features

| Feature | Who can use it | Notes |
|---|---|---|
| Register / login / profile | Customers; login for staff | Customer registration cannot self-assign staff roles |
| Submit / list / search / filter tickets | Customers, assigned agents, admins | Tickets are role-scoped server-side |
| Message on ticket | Customers, assigned agents, admins | Messages blocked after closure |
| Assign ticket to agent | Admin | Agent must exist and belong to a team; conditional update prevents stale overwrite |
| Change status / category / priority | Assigned agent, admin | Restricted transitions and audit records |
| AI category / urgency / sentiment / summary | Assigned agent, admin | On-demand only; suggestion is not automatically applied |
| AI reply draft with human approval | Assigned agent, admin | Draft becomes message only after atomic approve-and-send transaction |
| Ticket analytics / agent management | Admin | Aggregate workload, resolution time, staff creation |

### Important limitations

- AI analysis is **on demand** (an assigned agent/admin clicks *Analyze ticket*). A database-backed queue and automatic retry are not implemented.
- Authentication uses an **8-hour bearer JWT stored in sessionStorage** for this educational MVP. For production, consider an HttpOnly Secure cookie, CSRF defenses, rotation and centralized session revocation.
- Not yet implemented: forgot-password email flow, email notifications, attachments, SLA deadlines, RAG, realtime WebSockets, automatic assignment, incident monitoring, production observability, advanced multi-tenant isolation.
- Admin/agent accounts are seeded locally or created by admins. Rotate demo passwords; do not expose seed credentials on the internet.
- The AI service may misclassify tickets or draft inaccurate advice. Agents are responsible for reviewing all responses.

## Requirements

1. Node.js **22.x** and npm (test with `node -v`)
2. Docker Desktop with Docker Compose **or** a local PostgreSQL 16 server
3. Optional: a Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

## Run locally

Run commands **from the root `ResolveAI/` directory**:

```bash
# 1. Start PostgreSQL (or configure your local PostgreSQL instance)
docker compose up -d

# 2. Install dependencies for both workspaces
npm install

# 3. Create local configuration files
cp server/.env.example server/.env
cp client/.env.example client/.env
```

On Windows **PowerShell**, replace the two `cp` commands with:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

**Edit `server/.env`:** change `JWT_SECRET` to a fresh random 32+ character string and replace the placeholder admin and agent passwords with different strong passwords (12+ characters). Optional: add `GEMINI_API_KEY` for AI features. `DATABASE_URL` is preconfigured for the included local Docker Postgres service. Change it if you use your own server. Do not commit `.env`.

```bash
# 4. Generate the Prisma client
npm run db:generate -w server

# 5. Apply the committed database migration
npm run db:deploy -w server

# 6. Seed support teams and your initial admin/agent accounts
npm run db:seed -w server

# 7. Launch React + Express
npm run dev
```

Visit **http://localhost:5173** (frontend). Express API: **http://localhost:4000/api/v1**. API health check: http://localhost:4000/api/v1/health.

> The initial SQL migration is included in `server/prisma/migrations`. For future schema changes, use `npm run db:migrate -w server` locally and commit the new migration. For deployed databases, always run `npm run db:deploy -w server`; never reset a production database.

## How to demonstrate it

1. Register a new **customer** account from the login page.
2. Submit a new complaint. Log out.
3. Log in as the **admin** account from your `server/.env` seed values.
4. Open **Agents & teams** to see the seeded agent.
5. Open **Tickets**, select the new complaint, and assign it to that agent.
6. Log out and sign in as the **agent**.
7. Open the ticket; run **Analyze ticket** (needs a valid Gemini key). Review classification, priority and sentiment suggestions. Apply category/priority through the manual review controls.
8. Run **Generate a reply draft**, edit it, then **Approve & send**. Log back in as customer and view the message.
9. Change the status to `IN_PROGRESS`, then `RESOLVED`; view analytics as admin.

**Note:** `Gemini is not configured` is the intended API response when you omit the key. Core ticket features still work independently.

## Application design

```text
React customer / agent / admin views
             |
      JWT-authenticated REST API
             |
   Express routers + Zod validation
        |                |
 Role-scoped ticket      Gemini REST API
  business logic         (classification/draft)
        |                |
   Prisma ORM ------ JSON + Zod validation
        |
  PostgreSQL (users, teams, tickets, messages, AI records, drafts, audit)
```

### Project layout

```text
ResolveAI/
├── client/               # React app, dashboard, forms, API client
├── server/
│   ├── prisma/           # Schema and seed
│   └── src/
│       ├── ai/           # Gemini integration
│       ├── lib/          # DB, errors, authorization helpers
│       ├── middleware/   # JWT and role middleware
│       ├── routes/       # Auth, tickets, admin
│       └── tests/        # API smoke and pure business-rule tests
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## API reference

All routes begin with `/api/v1`. Authenticated routes require `Authorization: Bearer <JWT>`.

| Method | Path | Role |
|---|---|---|
| POST | `/auth/register` | Public (creates CUSTOMER only) |
| POST | `/auth/login` | Public |
| GET | `/auth/me` | Logged in |
| GET | `/health` | Public |
| GET | `/tickets?status=OPEN&search=payment&page=1` | Role-scoped |
| POST | `/tickets` | Customer |
| GET | `/tickets/:id` | Permitted owner / assignee / admin |
| PATCH | `/tickets/:id/status` | Assignee / admin |
| PATCH | `/tickets/:id/assign` | Admin |
| PATCH | `/tickets/:id/classification` | Assignee / admin |
| GET, POST | `/tickets/:id/messages` | Permitted owner / assignee / admin |
| GET | `/tickets/:id/analyses` | Permitted owner / assignee / admin |
| POST | `/tickets/:id/analyze` | Assignee / admin |
| GET | `/tickets/:id/drafts` | Assignee / admin |
| POST | `/tickets/:id/draft-reply` | Assignee / admin |
| POST | `/tickets/:id/drafts/:draftId/approve` | Assignee / admin |
| POST | `/tickets/:id/drafts/:draftId/reject` | Assignee / admin |
| GET | `/tickets/:id/audit` | Admin |
| GET | `/admin/analytics` | Admin |
| GET | `/admin/teams` | Admin |
| GET, POST | `/admin/agents` | Admin |

### Curl examples

```bash
curl http://localhost:4000/api/v1/health

curl -X POST http://localhost:4000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Example Customer","email":"customer@example.com","password":"StrongPass123!"}'

# Set YOUR_TOKEN to the token from the response, then:
curl -X POST http://localhost:4000/api/v1/tickets \
  -H 'Content-Type: application/json' -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"title":"My payment was deducted twice","description":"I was charged twice for my order and need help."}'
```

## Tests, build and quality checks

```bash
npm run db:generate -w server
npm test
npm run typecheck
npm run build

# With the server and PostgreSQL running:
npm run smoke
```

Vitest unit/smoke tests are deliberately database-independent; `npm run smoke` exercises real registration, ticket authorization, messages and status permissions against a running server and PostgreSQL. **Run the manual integration scenarios below against real Postgres** before claiming fully verified workflows:

- Register → customer create ticket → another customer receives 403 on access.
- Admin assigns an agent → only assigned agent sees and manages ticket.
- Agent reviews AI suggestions; invalid/missing Gemini responses do not modify ticket.
- Two concurrent approvals of the same draft lead to exactly one message.
- Status changes persist, category filters work, and analytics update.

## Security and deployment notes

- Use HTTPS, strong secrets, an allowlisted frontend origin and managed secret storage in deployment.
- Never commit `.env`, payment data, government IDs, passwords, support secrets or API keys.
- Do not include customer credentials or sensitive internal notes in AI prompts. Consider redaction and privacy policies for real data.
- Production should use request logging, backups, alerting, password resets, tighter AI quotas, secure sessions, and automated integration testing before launch.
- Public source repositories should include only sample/synthetic tickets.

## Upload to GitHub

First ensure no secret files are staged:

```bash
git init
git add .
git status
git commit -m "feat: build ResolveAI full-stack customer support MVP"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ResolveAI.git
git push -u origin main
```

Create the **empty** repository on GitHub before pushing. Replace `YOUR_USERNAME` with your username. If `git remote add origin` says the remote already exists, use `git remote set-url origin ...` instead. `.gitignore` excludes `.env` and `node_modules`.

## Interview guide

- **Why SQL?** Tickets have clear relations to users, messages, agent assignments and analyses; foreign keys and transactions help preserve consistency.
- **Why role-based access?** Customers must never view another customer's ticket; assigned agents should only see assigned work.
- **Why manual AI review?** LLM output is a recommendation, not evidence; a human checks claims and priority before acting.
- **How is duplicate approval avoided?** Prisma's `updateMany` conditionally moves `DRAFT` to `APPROVED` inside a DB transaction with message creation, so only one approval can win.
- **How are AI failures handled?** Ticket saving never calls Gemini. AI is a separate, on-demand endpoint; a failed request returns an error without changing the ticket.
- **What would you improve?** Background queue, idempotency keys, email notifications, RAG over curated support policies, request audit trails and production session handling.

## Resume content

See [`RESUME.md`](RESUME.md). Only claim features you have personally run, reviewed, and understood.

## License

MIT. See [`LICENSE`](LICENSE).
