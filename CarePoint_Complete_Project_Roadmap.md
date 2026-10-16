# CarePoint Hospital Portal — Complete Project Roadmap

A step-by-step plan for building a hospital appointment portal with **React + Vite**, **CSS**, **Supabase Auth**, **PostgreSQL**, and **Row Level Security (RLS)**, then deploying it with **Vercel**.

> **Project goal:** Build a practical learning project for patients and hospital administrators. Keep the UI clean and simple. Complete and test the core booking flow before adding optional features.

---

## 1. Project overview

### Main user roles

- **Patient**
  - Sign up and sign in.
  - View specialties and doctors.
  - View a doctor's available appointment slots.
  - Book an appointment.
  - View their own appointments.
  - Cancel an eligible appointment.
- **Admin**
  - Sign in to an authorized admin account.
  - Manage specialties and doctors.
  - Set each doctor's weekly schedule.
  - Review and manage appointments.
  - Confirm, complete, or cancel appointments.
  - View basic patient/profile information where permitted.

### Technology stack

| Area | Technology |
|---|---|
| Frontend | React + Vite |
| Styling | CSS |
| Authentication | Supabase Auth |
| Database | Supabase PostgreSQL |
| Access control | PostgreSQL RLS policies |
| Hosting | Vercel |
| Source control | Git + GitHub |

---

## 2. Recommended project structure

```text
carepoint-hospital-portal/
├── public/
├── src/
│   ├── App.jsx
│   ├── App.css
│   ├── supabase.js
│   └── main.jsx
├── .env
├── .env.example
├── .gitignore
├── index.html
├── package.json
└── README.md
```

As the project grows, you can split `App.jsx` into components such as `AuthScreen.jsx`, `Dashboard.jsx`, `DoctorDirectory.jsx`, `AppointmentBooking.jsx`, and `AdminScheduleEditor.jsx`. Do that only when it makes the code easier to maintain.

---

## 3. Step 1 — Create the React project

If you have not already created the project, run:

```bash
npm create vite@latest carepoint-hospital-portal -- --template react
cd carepoint-hospital-portal
npm install
npm install @supabase/supabase-js lucide-react
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

**Checkpoint:** The React starter page loads without a terminal or browser-console error.

If the project already exists, do not create a second one; continue in the existing project folder.

---

## 4. Step 2 — Create the Supabase project and connect React

1. Create a project in the Supabase dashboard.
2. Open **Project Settings → API** (the exact dashboard wording may vary).
3. Copy the project URL and the publishable/anon client key.
4. Create `.env` in the project root:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_publishable_or_anon_key
```

5. Create `src/supabase.js`:

```javascript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
```

6. Add `.env` to `.gitignore`. Never put a Supabase `service_role` secret in frontend code or commit it to GitHub.

Create `.env.example` with placeholder values only:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_publishable_or_anon_key
```

**Checkpoint:** The app can detect whether Supabase configuration exists. Restart Vite after changing `.env`.

---

## 5. Step 3 — Create authentication and profiles

Use Supabase Auth for signup, login, logout, and session restoration. The `profiles` table stores app-specific profile data linked to `auth.users`.

A typical profile table:

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role text not null default 'patient'
    check (role in ('patient', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());
```

> Run only SQL that matches your existing schema. If `profiles` already exists, compare its columns and policies before rerunning or altering anything. Do not blindly replace working tables.

### Authentication tasks

- Signup with full name and email/password.
- Login with email/password.
- Restore session when the page reloads.
- Logout.
- Show clear loading and error messages.
- Handle email-confirmation settings according to your Supabase project configuration.
- Load the profile after authentication.

### Important role security

Do **not** let users promote themselves to admin by freely editing `profiles.role`. For a learning project, promote the intended admin account using the Supabase SQL editor or a controlled server-side process. Keep the ability to grant admin privileges out of ordinary patient-facing forms.

**Checkpoint:** Signup, login, page refresh, and logout work. A normal user cannot grant themselves admin permissions.

---

## 6. Step 4 — Create the specialties table

The specialties table represents departments such as Cardiology or Pediatrics.

```sql
create table if not exists public.specialties (
  id bigint generated by default as identity primary key,
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.specialties enable row level security;
```

Seed the initial specialties if they are not already present:

```sql
insert into public.specialties (name)
values
  ('Cardiology'),
  ('Neurology'),
  ('Orthopedics'),
  ('Pediatrics'),
  ('General Surgery'),
  ('Dermatology'),
  ('Gynecology'),
  ('Ophthalmology')
on conflict (name) do nothing;
```

Create read policies for the public/authorized users as appropriate for your app, and restrict insert/update/delete operations to admins.

**Checkpoint:** The specialties appear in Supabase Table Editor and can be loaded by the frontend.

---

## 7. Step 5 — Create doctors

A doctor belongs to a specialty.

```sql
create table if not exists public.doctors (
  id bigint generated by default as identity primary key,
  full_name text not null,
  specialty_id bigint references public.specialties(id) on delete set null,
  qualification text,
  bio text,
  consultation_fee numeric(10,2) not null default 0
    check (consultation_fee >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.doctors enable row level security;
```

If your existing `doctors` table uses different column names, keep your current schema and update the React queries to match it rather than creating a duplicate table.

### Admin doctor management

- Add a doctor.
- Assign a specialty.
- Set qualification, short bio, and consultation fee.
- Mark a doctor active or inactive.
- Do not hard-delete doctors that have historical appointments; prefer an inactive flag.

**Checkpoint:** Admin can add a doctor, and patients can see active doctors with their specialties.

---

## 8. Step 6 — Create doctor schedules

The `doctor_schedules` table describes recurring weekly working hours. Use day numbers consistently: **0 = Sunday, 1 = Monday, …, 6 = Saturday**.

Example schema:

```sql
create table if not exists public.doctor_schedules (
  id bigint generated by default as identity primary key,
  doctor_id bigint not null references public.doctors(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_duration_minutes integer not null default 30
    check (slot_duration_minutes > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

alter table public.doctor_schedules enable row level security;
```

Before running this SQL, compare it with your existing `doctor_schedules` table to avoid duplicate or conflicting schema changes.

### Admin schedule editor

The admin should be able to:

1. Choose a doctor.
2. Choose a weekday.
3. Enter start and end times.
4. Set appointment duration, such as 15, 20, or 30 minutes.
5. Activate/deactivate the schedule.
6. Save changes and see existing schedules.

Validate that end time is later than start time and that the duration is positive.

**Checkpoint:** Each doctor can have one or more active weekly schedules and the admin can edit them.

---

## 9. Step 7 — Build the doctor directory

The patient-facing directory should show:

- Doctor name.
- Specialty.
- Qualification or short bio.
- Consultation fee.
- Active/inactive availability state (patients should only be offered active doctors).
- A **Book appointment** action.

Add filters for specialty or name only after the basic directory works.

**Checkpoint:** Directory data comes from Supabase, not from hard-coded demo arrays. Loading, empty, and error states are handled.

---

## 10. Step 8 — Create the appointments table

A typical appointment records the patient, doctor, date, start/end time, reason, and status.

```sql
create extension if not exists btree_gist;

create table if not exists public.appointments (
  id bigint generated by default as identity primary key,
  patient_id uuid not null references public.profiles(id) on delete restrict,
  doctor_id bigint not null references public.doctors(id) on delete restrict,
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  reason text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
```

To prevent overlapping non-cancelled appointments for the same doctor at the database level, use an exclusion constraint. Run this only if it is not already present:

```sql
alter table public.appointments
add constraint appointments_no_doctor_time_overlap
exclude using gist (
  doctor_id with =,
  appointment_date with =,
  tsrange(
    (appointment_date + start_time),
    (appointment_date + end_time),
    '[)'
  ) with &&
)
where (status <> 'cancelled');
```

**Important:** If this fails because an equivalent constraint already exists, do not keep adding duplicate constraints. Check the existing database first. The database constraint is the final protection against two overlapping bookings, even if two users submit at almost the same time.

### Appointment policies

Enable RLS and create policies that ensure:

- Patients can read only their own appointments.
- Patients can create appointments only for their own profile ID.
- Patients cannot set another patient's ID or arbitrarily mark appointments completed.
- Admins can read and update appointments according to the admin policy.
- Only permitted roles can change status.

The exact SQL depends on your current `is_carepoint_admin()` helper and the policies already installed. Review the existing policies in Supabase before adding new ones.

**Checkpoint:** Appointment records are protected by RLS and overlapping bookings are rejected by the database.

---

## 11. Step 9 — Build the booking flow

Recommended patient flow:

1. Patient signs in.
2. Opens the doctor directory.
3. Selects a doctor.
4. Selects an appointment date.
5. The app loads that doctor's active schedule for the weekday.
6. The app generates candidate time slots.
7. The app removes past slots and slots that overlap active appointments.
8. Patient selects a slot and enters an optional reason.
9. The app submits the appointment with `status = 'pending'`.
10. The app displays success or a useful error message and refreshes the appointment list.

### Slot-generation logic

For each active schedule matching the selected weekday:

- Start at the schedule's `start_time`.
- Add `slot_duration_minutes` repeatedly.
- Only show a slot if the full slot fits before `end_time`.
- Remove slots in the past for the current date.
- Remove slots that overlap `pending` or `confirmed` appointments.
- Do not use schedules belonging to inactive doctors.
- Re-check availability when the user submits; the UI list alone is not a guarantee.

Example: 09:00–11:00 with 30-minute slots yields 09:00, 09:30, 10:00, and 10:30.

### Important validation

The browser is not a trusted security boundary. Validate appointment ownership, doctor status, schedule, slot duration, and overlap on the database/server side where possible. A database exclusion constraint protects against overlapping appointments, but it does **not** by itself prove that a slot is within the doctor's working hours. Add a database function/RPC or another trusted validation layer for that rule before treating the booking workflow as production-ready.

**Checkpoint:** A patient can select a real available slot and create an appointment; unavailable or overlapping slots are rejected.

---

## 12. Step 10 — Build the patient appointments page

Show the signed-in patient's appointments with:

- Doctor and specialty.
- Date and time.
- Status.
- Reason, if provided.
- Cancel action only when cancellation is allowed.

Sort upcoming appointments first. Display a clear empty state when the patient has no appointments.

**Checkpoint:** A patient can only see their own records and cannot cancel another patient's appointment.

---

## 13. Step 11 — Build the admin dashboard

The admin dashboard should include:

- Appointment list with patient, doctor, date/time, and status.
- Filters for status and date.
- Actions to confirm, cancel, or mark an appointment completed.
- Doctor management.
- Specialty management, if needed.
- Doctor schedule management.
- Basic counts for pending, confirmed, and completed appointments.

Keep the dashboard simple. Do not add charts or advanced analytics until the appointment workflow is reliable.

**Checkpoint:** Admin actions update Supabase and the page refreshes to reflect the current database state. RLS prevents normal patients from performing admin actions.

---

## 14. Step 12 — Loading, errors, and form validation

Every Supabase-backed view should account for:

- Loading state.
- Empty state.
- Error state with a useful message.
- Form validation before submission.
- Disabled submit buttons while a request is in progress.
- Success confirmation after a completed action.
- Safe handling of a missing session or profile.
- A refresh/retry option when appropriate.

Avoid swallowing all errors silently. During development, inspect the browser console and Supabase response messages, but never display secret values.

**Checkpoint:** Common failures do not leave the UI stuck or misleading.

---

## 15. Step 13 — Test the complete workflow

Test with at least two accounts: one patient and one admin.

### Authentication

- [ ] Signup succeeds.
- [ ] Login succeeds.
- [ ] Session survives page refresh.
- [ ] Logout works.
- [ ] A signed-out user cannot access protected screens.

### Doctor directory and schedules

- [ ] Active doctors load.
- [ ] Inactive doctors cannot be booked.
- [ ] Specialty data is correct.
- [ ] Admin can add/edit doctors.
- [ ] Admin can create/edit schedules.
- [ ] Invalid schedule times are rejected.

### Appointments

- [ ] Patient can book a valid slot.
- [ ] Patient can see their own appointments.
- [ ] Patient cannot read another patient's appointments.
- [ ] Past slots are not offered.
- [ ] Slots outside a doctor's schedule are rejected.
- [ ] Overlapping active appointments are rejected.
- [ ] A cancelled appointment no longer blocks the slot, if that is the intended rule.
- [ ] Admin can confirm/cancel/complete appointments.
- [ ] Two simultaneous attempts for the same slot cannot both succeed.

### Security

- [ ] RLS is enabled on every table exposed to the frontend.
- [ ] Normal users cannot grant themselves admin privileges.
- [ ] Normal users cannot modify another patient's records.
- [ ] Admin-only database actions are protected by policies or trusted server-side logic.
- [ ] No service-role key appears in the frontend or Git history.

---

## 16. Step 14 — Git and GitHub

Create `.gitignore`:

```gitignore
node_modules/
dist/
.env
.env.*
!.env.example
.DS_Store
```

Review this carefully if your project already has a `.gitignore`; do not overwrite useful existing rules.

Then run:

```bash
git init
git add .
git status
git commit -m "Build CarePoint hospital portal"
```

Create an empty repository on GitHub and follow its instructions to add the remote and push the project.

Before pushing, verify that `.env` is not staged:

```bash
git status
```

If a secret has ever been committed, removing it in a later commit is not enough; rotate/revoke the exposed secret.

**Checkpoint:** The source code is on GitHub, while `.env` and other secrets remain local.

---

## 17. Step 15 — Deploy to Vercel

1. Push the latest code to GitHub.
2. Sign in to Vercel and import the repository.
3. For a standard Vite project, use:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
4. Add these environment variables in Vercel's project settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (or the publishable client key used by your project)
5. Deploy.
6. After changing environment variables, redeploy so the build receives them.
7. Open the deployed URL and test signup/login, doctor directory, booking, patient appointments, and admin workflows.

For client-side routing beyond a single page, configure a Vercel rewrite if needed. A simple single-page app may not need an extra rewrite depending on its routing setup.

**Checkpoint:** The deployed website connects to the intended Supabase project and its core workflows work outside localhost.

---

## 18. Step 16 — Final README and handover

Your repository README should explain:

- What CarePoint does.
- Tech stack.
- Features completed.
- Requirements (Node.js/npm and Supabase project).
- How to install dependencies.
- How to create `.env` from `.env.example`.
- How to run locally.
- Database setup/migration instructions.
- How to deploy.
- Known limitations.
- Screenshots, if available.

Example local setup:

```bash
npm install
cp .env.example .env
npm run dev
```

On Windows, if `cp` is unavailable, copy `.env.example` to `.env` using File Explorer or PowerShell.

Never put real credentials in the README.

---

## 19. Optional features — only after the core project is stable

Possible future improvements:

- Email reminders or appointment notifications.
- Search and specialty filters.
- Pagination for large appointment lists.
- Admin activity log.
- More staff roles.
- Doctor leave/holiday exceptions.
- Patient profile editing.
- Accessible form labels and keyboard navigation.
- Automated tests.
- Better timezone handling.
- Deployment monitoring and backups.

These are optional. Finish and test the core booking workflow first.

---

## 20. Final completion checklist

The project is ready for a learning-project demo when:

- [ ] Supabase connection is configured through environment variables.
- [ ] Authentication and session handling work.
- [ ] Patient and admin permissions are enforced by RLS.
- [ ] Specialties and doctors load from the database.
- [ ] Admin can manage doctors and weekly schedules.
- [ ] Patients can view real available slots.
- [ ] Patients can book and view their appointments.
- [ ] Admin can manage appointment statuses.
- [ ] Overlapping bookings are blocked by the database.
- [ ] Slot-within-schedule validation is handled by trusted logic, not just frontend code.
- [ ] Loading, empty, error, and success states work.
- [ ] The main workflow has been tested with separate patient/admin accounts.
- [ ] `.env` and secrets are not committed.
- [ ] GitHub repository is up to date.
- [ ] Vercel deployment has been tested.
- [ ] README setup instructions are complete.

---

## Current project status and next recommended task

Based on the project progress so far:

- React/Vite project and base UI: started.
- Supabase connection and authentication: implemented; continue testing.
- Profiles, specialties, doctors, appointments, and doctor schedules tables: created or substantially set up.
- Doctor directory UI: in progress/needs verification against the current `App.jsx`.
- Admin schedule editor: pending.
- Real slot generation and trusted schedule validation: pending.
- End-to-end testing, GitHub, and Vercel final verification: remaining.

### Best next step

**Finish the admin schedule editor and patient available-slot booking flow.** Then test database permissions and overlap protection before polishing or adding optional features.

> This roadmap is a project plan, not a guarantee that every SQL block can be pasted unchanged into an existing database. Since some tables and policies may already exist, inspect the current schema and policies first, and adapt migrations to avoid duplicate constraints or incompatible column names.
