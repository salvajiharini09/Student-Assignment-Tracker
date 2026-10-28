# Student Assignment Tracker (StudyFlow)

A beginner-friendly full-stack assignment dashboard for college students. Track coursework, due dates, priorities, estimated effort, notes, and completion status from one responsive workspace.

## Features

- Create, view, edit, delete, and update assignment status.
- Search titles, subjects, and notes.
- Filter by status and priority; sort by due date, priority, or recently added.
- Quick views for all assignments, due today, upcoming seven days, and completed work.
- Overview cards and completion progress.
- Responsive layout for mobile, tablet, and desktop.
- Form validation, loading states, empty states, success/error feedback, and API error handling.
- Express REST API backed by Supabase PostgreSQL; frontend calls it with Fetch API.
- SQL constraints, indexes, timestamps, update trigger, and Row Level Security enabled.

## Technology stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js, Express.js, CORS, dotenv
- Database: Supabase PostgreSQL via `@supabase/supabase-js`
- API: REST + Fetch API
- Version control: Git and GitHub

## Prerequisites

- Node.js 18.18 or newer and npm
- A free Supabase project
- A browser
- Optional: VS Code and Git

## 1. Create and configure Supabase

1. Sign in to [Supabase](https://supabase.com/) and create a project.
2. Open **SQL Editor** in your project.
3. Open `database/schema.sql` from this repository, copy the whole script, and run it in the SQL Editor.
4. In **Project Settings → API** (or the project API keys page), copy the Project URL and the **service_role / secret key** for backend use only. Supabase labels may differ by dashboard version.
5. Never paste the service-role/secret key into `frontend/`, a public repository, a screenshot, or a client-side environment variable.

The schema enables RLS and intentionally creates no direct browser access policies. The backend uses the service-role key to perform the CRUD operations. Service-role credentials bypass RLS; that is why the server is configured to bind to `127.0.0.1` by default and why this version is for local learning only. **Do not deploy this API publicly or use it for private data without implementing Supabase Auth, per-user ownership, and server-side authorization.** See “Security limitations.”

## 2. Configure the backend environment

From the project root, copy the example file:

**macOS / Linux**
```bash
cp backend/.env.example backend/.env
```

**Windows PowerShell**
```powershell
Copy-Item backend/.env.example backend/.env
```

Edit `backend/.env` and replace the placeholders:
```env
PORT=3000
HOST=127.0.0.1
CORS_ORIGIN=http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```
Use your actual project URL and backend-only service-role key. Do not commit `.env`; it is ignored by Git. Keep `HOST=127.0.0.1` for local development.

## 3. Install and start the backend

**Run all npm commands inside the `backend` directory.**

```bash
cd backend
npm install
```

The `package.json` already declares every runtime and development dependency, so `npm install` is sufficient. These extra commands are optional and are not required after `npm install`:
```bash
npm install express cors dotenv @supabase/supabase-js ws
npm install --save-dev nodemon
```

Check JavaScript syntax:
```bash
npm run check
```

Start in development mode with automatic restart:
```bash
npm run dev
```

Or start normally:
```bash
npm start
```

The server defaults to `http://127.0.0.1:3000`. If credentials are missing, the health endpoint still responds but database routes return HTTP 503 with a configuration message. Restart the server after changing `.env`.

## 4. Start the frontend

Serve the `frontend` folder through a local static web server. For example, if Python is installed, open a **second terminal** from the project root:
```bash
python -m http.server 5500 --directory frontend
```
Then open `http://localhost:5500`. Alternatively, use the VS Code Live Server extension and ensure its origin is included in `CORS_ORIGIN`. If you use a different port, add that exact origin to `CORS_ORIGIN` in `backend/.env`, then restart the backend.

The default API URL is `http://localhost:3000/api`. To change it, define `window.STUDYFLOW_API_URL` before `script.js` in `frontend/index.html`, for example:
```html
<script>window.STUDYFLOW_API_URL = 'http://localhost:3000/api';</script>
<script src="script.js" defer></script>
```
Do not put database credentials in this configuration.

## 5. REST API reference

Base URL: `http://localhost:3000/api`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Health and database-configuration status |
| GET | `/assignments` | List assignments; optional `?status=pending` and `?priority=high` |
| POST | `/assignments` | Create an assignment |
| GET | `/assignments/:id` | Fetch one assignment by UUID |
| PATCH | `/assignments/:id` | Update supplied fields |
| DELETE | `/assignments/:id` | Delete an assignment |

Example JSON for `POST /api/assignments`:
```json
{
  "title": "Research paper outline",
  "subject": "Introduction to Psychology",
  "due_date": "2026-11-15",
  "priority": "high",
  "status": "pending",
  "estimated_hours": 3,
  "notes": "Review the rubric and choose three sources."
}
```

Allowed statuses: `pending`, `in_progress`, `completed`. Allowed priorities: `low`, `medium`, `high`. `estimated_hours` and `notes` may be `null`. The API returns JSON and uses HTTP 400 for validation errors, 404 for missing records/routes, 503 when the database is not configured, and 500 for database failures.

## 6. Test the API manually

With the backend running, open `http://127.0.0.1:3000/api/health`. It should return JSON with `status: "ok"` and `databaseConfigured: true` once credentials are configured.

Create an assignment using curl (change the date if desired):
```bash
curl -i -X POST http://127.0.0.1:3000/api/assignments \
  -H "Content-Type: application/json" \
  -d '{"title":"Read chapter 2","subject":"Biology","due_date":"2026-11-15","priority":"medium","status":"pending","estimated_hours":1,"notes":"Take notes"}'
```
Then visit `http://127.0.0.1:3000/api/assignments` to list records. Test update and delete using the UUID returned by the create call:
```bash
curl -i -X PATCH http://127.0.0.1:3000/api/assignments/REPLACE_WITH_UUID \
  -H "Content-Type: application/json" -d '{"status":"completed"}'
curl -i -X DELETE http://127.0.0.1:3000/api/assignments/REPLACE_WITH_UUID
```
For a validation test, send an empty title or an invalid priority and verify the API returns `400 Bad Request`.

## 7. Git and GitHub submission

From the project root:
```bash
git init
git add .
git status
git commit -m "Build student assignment tracker"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```
Create an empty repository on GitHub first and replace the example remote with your repository URL. Check `git status` and confirm that `backend/.env` is not staged. Never commit secrets.

## 8. Common errors and troubleshooting

- **Database is not configured / HTTP 503:** Ensure `backend/.env` exists, values are real, variable names are exact, and the backend was restarted.
- **Invalid API key / HTTP 500:** Copy the project URL and service-role key from the same Supabase project. Never use the placeholder text.
- **Relation `assignments` does not exist:** Run `database/schema.sql` in the correct Supabase project's SQL Editor.
- **CORS error:** Add the exact frontend origin (including hostname and port) to `CORS_ORIGIN`, separated by commas, and restart the backend.
- **Port already in use:** Change `PORT` in `backend/.env` and update the API URL in the frontend.
- **`npm` is not recognized:** Install Node.js and reopen the terminal.
- **Blank or stuck assignment list:** Check the backend terminal, `/api/health`, Supabase credentials, and schema setup.
- **Frontend changes are not visible:** Hard-refresh the browser and verify that the static server serves the `frontend` folder.
- **Date rejected:** Use a real calendar date in `YYYY-MM-DD` format.

## 9. Security limitations and remaining setup

This is a learning/demo starter, not a production-ready multi-user service. There is no login or per-student authorization. The API is intentionally bound to localhost by default, and the service-role key is only read by the backend. Because a service-role key bypasses RLS, anyone who can reach an exposed API could potentially read or alter every row. Do not change the bind host to `0.0.0.0` or deploy publicly without adding authentication, per-user row ownership, authorization checks, request rate limits, and production secrets management. For a real shared deployment, add Supabase Auth and an `owner_id` foreign key referencing `auth.users`, then implement policies restricting every operation to `auth.uid() = owner_id`. RLS being enabled is not by itself sufficient when a privileged backend key is used.

The database has no separate users table because authentication is not included. Data in this starter is shared within the one configured Supabase table. No real credentials or sample/mock assignments are bundled.

## 10. Short demonstration script

1. Start the backend and frontend and open StudyFlow in the browser.
2. Create an assignment with a title, subject, due date, priority, and estimated hours.
3. Show the new card and the updated overview counters.
4. Search by subject, filter by priority, and sort by due date.
5. Change the status using the status pill, then show the completed view and progress bar.
6. Edit the notes or deadline, save, then delete the test assignment.
7. Briefly show the API health response and explain that PostgreSQL stores the records.

## 11. Beginner-friendly viva questions

**Q1. What is the purpose of Express.js in this project?**  
A: Express.js creates the backend HTTP server and REST endpoints that receive requests from the frontend and return JSON responses.

**Q2. What does CRUD stand for?**  
A: Create, Read, Update, and Delete—the four basic operations used to manage assignment records.

**Q3. Why is Supabase used?**  
A: Supabase provides a hosted PostgreSQL database and a JavaScript client that the backend uses to run database queries.

**Q4. Why must the service-role key stay on the backend?**  
A: It has privileged database access and bypasses Row Level Security. Exposing it in browser code could let other people access or modify data.

**Q5. How does the frontend communicate with the backend?**  
A: It uses the browser Fetch API to send HTTP requests to Express endpoints and reads the JSON responses to update the page.

## Project structure

```text
student-assignment-tracker/
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── backend/
│   ├── server.js
│   ├── supabase.js
│   ├── package.json
│   └── .env.example
├── database/
│   └── schema.sql
├── .gitignore
└── README.md
```
