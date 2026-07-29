# macOS One-Click Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add macOS double-click scripts to start and stop the complete digital twin development environment, including the WebSocket simulator.

**Architecture:** Root `.command` launchers delegate to focused Bash scripts in `scripts/`. The start script prepares Node 24/pnpm, starts Docker dependencies with an explicit Compose project name, runs Prisma migrations, starts app processes in the background, writes logs/PIDs, and verifies health. The stop script terminates project dev processes and stops Docker containers while preserving volumes.

**Tech Stack:** Bash 3-compatible macOS shell, Docker Compose, Node.js 24, pnpm 10.12.1, Prisma, Vite, tsx.

## Global Constraints

- Node.js must satisfy `>=24 <25`.
- pnpm must be activated as `10.12.1` via Corepack.
- Docker Compose project name must be explicit to avoid Chinese-path project-name errors.
- Stop must preserve PostgreSQL, Redis, and MinIO data volumes.
- Scripts must avoid stopping unrelated projects on occupied ports.

---

### Task 1: Add macOS launcher scripts

**Files:**
- Create: `start-all.command`
- Create: `stop-all.command`

**Steps:**
- [ ] Create double-clickable launchers that `cd` to repo root and call `scripts/start-all.sh` or `scripts/stop-all.sh`.
- [ ] Mark both files executable with `chmod +x`.

### Task 2: Add start orchestration script

**Files:**
- Create: `scripts/start-all.sh`

**Steps:**
- [ ] Detect LAN IP, Docker, Node 24, and pnpm 10.12.1.
- [ ] Pick/reuse dependency ports, using existing `digital-twin` compose containers when available.
- [ ] Run Docker Compose with `-p digital-twin`, migrations, decoder copy, and Prisma generate.
- [ ] Start API, worker, editor, and runtime as background processes with logs and PID files.
- [ ] Verify API and Socket health and print local/LAN URLs.

### Task 3: Add stop orchestration script

**Files:**
- Create: `scripts/stop-all.sh`

**Steps:**
- [ ] Stop recorded API, worker, Socket and web PIDs plus any remaining Node processes whose command line includes the repo root and dev-server signatures.
- [ ] Stop Docker Compose containers with `docker compose -p digital-twin stop`.
- [ ] Mark the file executable and verify syntax.
