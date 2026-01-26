# Default AI Workflow Commands (v2)

Ein **Workflow-/Command-Set** zur **systematischen Software-Entwicklung** mit AI-Agents (Antigravity, Codex CLI/Remote Agentic, VS Code + beliebige Agents).
Ziel: **weniger Chaos**, **klarere Prozesse**, **Issue-first**, **einheitliche Pfade**, **wiederholbare Entwicklungs-Loops**.

## Warum dieses Repo existiert

AI-Agents werden schnell ineffektiv, wenn…

* Pfade/Strukturen pro Projekt variieren (`.codex/`, `.agents/`, `.claude/`, …)
* Tasks über lange Zeit in `TASK.md`/`TODO.md` zu Log-Dumps werden
* Commands inkonsistente Interfaces haben (z. B. `execute` nimmt mal 1, mal 2 args)

Dieses Repo liefert daher:

* **v2 Workflows** mit **konsistenter Struktur** (Antigravity-first)
* **Issue-first Tracking** (GitHub Issues als Source of Truth)
* **klar definierte Command-Contracts** (Inputs/Outputs, Pfade)
* **einfachen “Drop-in” Deploy** in andere Repos

---

## Canonical Layout (pro Ziel-Repo)

Die v2 Workflows sind dafür gemacht, in **jedes Projekt-Repo** kopiert zu werden – **immer gleich**:

```
.agent/
  rules/
    00-core.md
  workflows/
    prime.md
    plan-feature.md
    execute.md
    end-to-end-feature.md
    validate-simple.md
    validate.md
    code-review.md
    code-review-fix.md
    execution-report.md
    system-review.md
    ultimate_validate_command.md
    commit.md
    create-pr.md
    create-prd.md
    rca.md
    implement-fix.md

  plans/
  reports/
    code-reviews/
    execution-reports/
    system-reviews/
```

### Warum `.agent/`?

* Antigravity arbeitet standardmäßig mit `.agent/rules` und `.agent/workflows`.
* Dein Remote Agent System ist flexibel (z. B. via `/load-commands`) und kann damit umgehen.
* Ein Standard reduziert “Pfad-Drift” und macht Workflows austauschbar.

---

## Global Rules vs Repo Rules

Dieses Repo enthält **Workflows/Commands**.
Regeln liegen getrennt:

### Global Rules (User-level)

* z. B. Antigravity: `~/.gemini/GEMINI.md`
* Enthält **nur universelle Regeln** (Safety, Issue-first, Output-Format)

### Repo Core Rules (Project-level)

* **Canonical**: `.agent/rules/00-core.md`
* Enthält repo-spezifische Standards: Stack, Tests, DoD, Branch/PR Convention

**Wichtig:** Workflows verlassen sich darauf, dass `.agent/rules/00-core.md` existiert.

---

## Core Prinzipien (v2)

### 1) Issue-first (kein TASK/TODO Logdump)

* **GitHub Issues** sind die Wahrheit.
* Jede Änderung referenziert eine Issue-ID.
* Wenn GitHub nicht verfügbar ist: Agent gibt **Issue Draft** aus (Titel, Body, Labels, AC).

### 2) Konsistente Pfade

* Commands: `.agent/workflows/`
* Plans: `.agent/plans/`
* Reports: `.agent/reports/`

### 3) Konsistenter Execute-Contract

* `execute <branch> <plan-file-path>`
* Keine “magischen” Nebenpfade (`.agents/`, `.claude/`, `core_commands/` …)

### 4) Systematische Loop

Plan → Execute → Review → Validate → Report → Improve

---

## Workflow Übersicht & Use-Cases

### Core Loop

* **`prime`**
  Baut ein zuverlässiges Verständnis der Codebase auf (Docs, Entry Points, Patterns).
* **`plan-feature <issue-id|desc>`**
  Erstellt einen implementierbaren Plan inkl.:

  * Issue/AC
  * Branch Name
  * Plan-Datei unter `.agent/plans/...`
  * Verification Commands (repo-aware)
* **`execute <branch> <plan>`**
  Implementiert den Plan **in Slices**, test-aware, issue-first, mit sauberer Verifikation.

### End-to-End

* **`end-to-end-feature <issue-id|desc>`**
  Chain: `prime → plan-feature → execute → code-review → validate → PR`

### Validation / QA

* **`validate-simple`**
  Schnell: lint/type/test/build (nur vorhandene scripts/tools im Repo).
* **`validate`**
  Comprehensive: Integration/E2E/Services (nur wenn Repo/DoD es verlangt).
* **`code-review`**
  Strukturierte Review Findings (severity: blocker/high/med/low).
* **`code-review-fix <review>`**
  Arbeitet Findings ab + reruns validation.

### Reporting / Process

* **`execution-report`**
  “Was wurde gemacht, was abgewichen, wie verifiziert”
* **`system-review`**
  Prozessanalyse (Planqualität, Executionqualität, Validation, Doku) + konkrete Verbesserungen
* **`ultimate_validate_command`**
  Generiert repo-spezifisches `validate-ultimate.md` (für komplexe Repos)

### Git / PR

* **`commit`**
  Atomarer Commit mit Issue-Referenz.
* **`create-pr [base-branch]`**
  PR-ready inkl. Rebase/Validation/PR Body Struktur.
* **`create-prd [output-file]`**
  PRD-Template + Issue Breakdown.

### Bugfix Loop (Issue-centric)

* **`rca <issue-id>`** → `docs/rca/issue-<id>.md`
* **`implement-fix <issue-id>`** → Fix minimal + Regression Test + Validate

---

## Empfohlene Standard-Flows

### Feature (normal)

1. `prime`
2. `plan-feature 123`
3. `execute feature/123-short-slug .agent/plans/123-short-slug.md`
4. `code-review`
5. `validate-simple` (oder `validate`, falls DoD)
6. `commit`
7. `create-pr`

### Bugfix

1. `prime`
2. `rca 456`
3. `implement-fix 456`
4. `code-review`
5. `validate-simple`
6. `create-pr` (mit `Fixes #456` im PR Body)

### Process Improvement / Post-Mortem

1. `execution-report`
2. `system-review`
3. Repo Rules / Workflows daraus iterieren

---

## Installation / Anwendung in einem Ziel-Repo

### Minimal Setup (pro Ziel-Repo)

1. Kopiere kompletten `.agent/`-Ordner, welcher **v2 Core + Workflows**  enthält, in dein Ziel-Repo.
2. (Optional, aber empfohlen) Root Stubs:

   * `CLAUDE.md` → zeigt auf `.agent/rules/00-core.md`
   * `GEMINI.md` → zeigt auf `.agent/rules/00-core.md`

### Migration von Legacy

Stelle sicher, dass ungewollte oder veraltete (legacy/deprecated) Rules & Commands archiviert oder entfernt wurden.

**Pro Ziel-Repo:**

* Existierende `legacy/` / `.claude/` / `.agents/` / `.codex/commands` prüfen
* Wenn du “clean cut” willst: alte Ordner **archivieren** (nicht mischen)
* Dann `.agent/` v2 rein kopieren und **nur v2** nutzen
  (sonst entstehen wieder Pfad-/Contract-Konflikte)

---

## Naming / Contracts (wichtig)

### Plan-Dateien

* `.agent/plans/<id>-<slug>.md`

### Branches

* `feature/<id>-<slug>`
* `fix/<id>-<slug>`
* `chore/<id>-<slug>` (optional)

### PR Body (wenn Issue geschlossen werden soll)

* Enthält: `Fixes #<id>`

---

## Guidelines für neue Workflows

Wenn du neue Workflows ergänzt:

* **flat** unter `.agent/workflows/` (keine Unterordner)
* nutze bestehende Pfade (`.agent/plans`, `.agent/reports`)
* dokumentiere:

  * `argument-hint`
  * inputs/outputs
  * wann man den Workflow verwendet
* keine Repo-spezifischen Annahmen hardcoden (die gehören in `.agent/rules/00-core.md`)

---

## Troubleshooting

**Agent findet Files nicht / falsche Pfade**

* Sicherstellen: `.agent/workflows/` ist der einzige Ort
* Keine `.claude/...` oder `core_commands/...` Referenzen in v2

**Agent will TASK.md/TODO.md befüllen**

* In v2 ist das bewusst raus. Repo Core Rules (`.agent/rules/00-core.md`) müssen Issue-first erzwingen.

**Validation zu heavy**

* `validate-simple` nutzen
* `validate` nur, wenn das Repo es wirklich braucht (CI/DoD)

---

## Versioning

* `legacy/` = altes Set (nicht mehr aktiv)
* `v2` = canonical Workflows (Antigravity-first, Issue-first)

---

## License

(Dein gewünschtes License-Model eintragen, z. B. MIT)
