# Oravia Codex Instructions

## Communication

- Explain completed work, reasoning, risks, and next steps in Turkish.
- Code, filenames, function names, test names, and commit messages may remain in English.
- Keep final reports concise and structured.

## Product Architecture

- Oravia is an AI assistant engine plus a dental clinic vertical product.
- Keep reusable assistant and messaging core independent from dental-specific code.
- Dental knowledge, treatment rules, doctors, durations, availability rules, and clinical handoff behavior must remain in the vertical layer.
- Do not introduce direct clinic or dental dependencies into the reusable assistant core.
- Follow existing repository architecture and naming conventions.

## Scope Control

- Work only on the explicitly requested sprint.
- Inspect existing related modules and tests before changing code.
- Do not begin the next sprint automatically.
- Avoid broad refactors unless strictly required.
- Do not add dependencies unless the task explicitly requires them.
- Do not modify unrelated files.

## Safety Boundaries

- Never diagnose a patient.
- Never recommend medication or antibiotics.
- Never invent prices.
- Never claim availability was checked unless a real availability check occurred.
- Never claim an appointment was created unless booking actually occurred.
- Route risky clinical messages to handoff.
- Preserve conservative safety fields.

## Execution Boundaries

Unless explicitly authorized by the task:

- Do not execute approve or reject actions.
- Do not create appointments.
- Do not create calendar events.
- Do not access Google Calendar.
- Do not add database persistence.
- Do not add Prisma, Supabase, Redis, or another persistence provider.
- Do not change bookingCreated to true.
- Do not change calendarChecked to true.
- Do not change actionPerformed to true.
- Do not change databasePersisted to true.
- Do not connect validation-only contracts to real execution.

## Secrets and Data

- Never read, print, modify, copy, stage, or commit:
  - .env
  - .env.*
  - credentials.json
  - token.json
  - service-account.json
  - oravia-secrets
  - Google private keys
  - real patient data
  - .DS_Store
- Never expose environment variables or credentials in terminal output, tests, fixtures, logs, or documentation.
- Use only synthetic test data.

## Git Safety

- Check git status before making changes.
- Do not use git reset --hard.
- Do not use git clean -fd.
- Do not force push.
- Do not amend or rewrite existing commits.
- Do not commit unless the task explicitly requests a commit.
- Do not stage unrelated files.

## Verification

- Add or update focused tests for every behavior change.
- Run the relevant targeted tests.
- Run the full npm test suite before finishing.
- Run required messaging demos when the change may affect messaging or appointment review flows.
- Inspect the final diff for unrelated changes.
- Confirm booking, calendar, database, persistence, and clinical safety boundaries remain intact.

## Final Report

Finish every task with:

1. Changed files
2. Implemented behavior
3. Tests and demos executed
4. Test results
5. Safety boundary verification
6. Remaining risks or limitations
7. Suggested commit message