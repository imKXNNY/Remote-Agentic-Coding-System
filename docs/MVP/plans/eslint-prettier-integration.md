# Feature: ESLint/Prettier Integration

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

Integrate ESLint and Prettier into the Remote Coding Agent project to enforce consistent code style, catch potential bugs early, and automate code formatting. This tooling infrastructure will improve code quality, maintainability, and developer experience by providing automated linting and formatting with zero configuration needed for developers.

The integration includes:
- Modern ESLint flat config with TypeScript support
- Prettier for automatic code formatting
- NPM scripts for linting and formatting
- Git ignore patterns for generated files
- Integration between ESLint and Prettier (no conflicts)
- CI-ready validation commands

## User Story

As a developer working on the Remote Coding Agent codebase
I want automated code linting and formatting tools
So that I can maintain consistent code quality, catch bugs early, and avoid manual formatting decisions

## Problem Statement

The codebase currently lacks automated code quality tooling:

1. **No linting**: Code style violations and potential bugs are not caught automatically
2. **Inconsistent formatting**: Developers must manually ensure consistent style (quotes, semicolons, indentation)
3. **Manual validation**: No automated way to validate code quality before commits
4. **Missing CI checks**: Cannot validate PRs for style/quality issues
5. **Developer friction**: Time wasted on formatting debates and manual fixes

Per CLAUDE.md (lines 306-320), the project's Development Guidelines state:
- **Type Safety (CRITICAL)**: Strict TypeScript configuration enforced
- All functions must have complete type annotations
- No `any` types without explicit justification
- **Testing**: Unit tests required, fast execution
- **Linting & Formatting**: NPM scripts mentioned (`npm run lint`, `npm run lint:fix`, `npm run format`) but NOT IMPLEMENTED

The prime report identified this as a key observation: "Missing linting/formatting configuration (ESLint/Prettier not set up)"

## Solution Statement

Implement a modern, zero-configuration linting and formatting setup using:

1. **ESLint with TypeScript-ESLint**: Flat config format (2025 standard) with:
   - `recommended` preset for bug detection
   - `strict` preset for additional type safety
   - `stylistic` preset for code consistency
   - Type-checked rules leveraging TypeScript compiler

2. **Prettier**: Opinionated code formatter with:
   - Configuration matching existing codebase patterns
   - ESLint integration (no rule conflicts)
   - Auto-fix capability

3. **NPM Scripts**: Developer-friendly commands:
   - `npm run lint` - Check for issues
   - `npm run lint:fix` - Auto-fix issues
   - `npm run format` - Format all files
   - `npm run format:check` - Validate formatting (CI)
   - `npm run type-check` - Already exists

4. **Git Integration**: Ignore generated files (`.eslintcache`)

This approach preserves existing code style patterns identified in the codebase analysis while adding automated enforcement.

## Feature Metadata

**Feature Type**: Enhancement (Development Infrastructure)
**Estimated Complexity**: Low-Medium
**Primary Systems Affected**:
- Build system (npm scripts)
- All TypeScript source files (linting rules apply)
- Developer workflow
- CI/CD (future validation)

**Dependencies**:
- `eslint` (v9.x)
- `@eslint/js` (ESLint core configs)
- `typescript-eslint` (TypeScript support)
- `prettier` (code formatter)
- `eslint-config-prettier` (ESLint/Prettier integration)

---

## CONTEXT REFERENCES

### Relevant Codebase Files - IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `package.json` (lines 6-16) - Why: Contains existing scripts, need to add lint/format scripts here
- `tsconfig.json` (entire file) - Why: TypeScript configuration referenced by ESLint for type-checked rules
- `jest.config.js` (entire file) - Why: Example of CommonJS config format in project root
- `.gitignore` (entire file) - Why: Pattern for adding ESLint cache exclusion
- `CLAUDE.md` (lines 306-320) - Why: Documents required linting/formatting commands and type safety requirements
- `src/types/index.ts` (lines 1-106) - Why: Example of existing TypeScript style (interfaces, types, strict annotations)
- `src/index.ts` (lines 1-14) - Why: Example of import grouping pattern (standard lib → third-party → local)
- `src/handlers/command-handler.ts` (lines 1-14) - Why: Example of JSDoc comments and import organization
- `src/clients/claude.ts` (lines 1-100) - Why: Example of async generators, error handling, logging patterns

### New Files to Create

- `eslint.config.mjs` - ESLint flat config with TypeScript support (ES module format)
- `.prettierrc` - Prettier configuration matching existing code style
- `.prettierignore` - Files/directories to exclude from formatting
- `.eslintignore` - Files/directories to exclude from linting (if needed)

### Relevant Documentation - YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [TypeScript-ESLint Getting Started](https://typescript-eslint.io/getting-started/)
  - Specific section: Installation and flat config setup
  - Why: Required for modern ESLint TypeScript integration

- [TypeScript-ESLint Shared Configs](https://typescript-eslint.io/users/configs/)
  - Specific section: Recommended, strict, and stylistic configurations
  - Why: Understand config presets and when to use type-checked rules

- [Prettier Installation](https://prettier.io/docs/en/install.html)
  - Specific section: npm installation and configuration files
  - Why: Required for setting up Prettier with exact versions

- [Prettier Options](https://prettier.io/docs/en/options.html)
  - Specific section: All configuration options
  - Why: Configure Prettier to match existing code style patterns

- [ESLint Config Prettier](https://github.com/prettier/eslint-config-prettier)
  - Specific section: Integration to disable conflicting ESLint rules
  - Why: Prevent ESLint and Prettier from fighting over formatting

### Patterns to Follow

**Import Organization** (from codebase analysis):
```typescript
// Standard library imports
import * as dotenv from 'dotenv';
import { readFile } from 'fs/promises';

// Third-party imports
import express from 'express';
import { Telegraf } from 'telegraf';

// Local imports - grouped by directory
import { IPlatformAdapter, IAssistantClient } from '../types';
import * as db from '../db/conversations';
```

**Code Style Patterns** (from codebase analysis):
- **Quotes**: Single quotes (`'string'`)
- **Semicolons**: Always present
- **Indentation**: 2 spaces
- **Line length**: ~80-120 characters
- **Type annotations**: Explicit on all functions including return types
- **Async**: Prefer async/await over promises
- **Arrow functions**: For callbacks/handlers
- **Function declarations**: For exported functions
- **File naming**: kebab-case
- **Test files**: `*.test.ts` suffix

**Logging Pattern** (src/index.ts:17, 23, 39):
```typescript
console.log('[Module] message');
console.error('[Module] Error:', error);
```

**Error Handling Pattern** (src/index.ts:35-41):
```typescript
try {
  await pool.query('SELECT 1');
  console.log('[Database] Connected successfully');
} catch (error) {
  console.error('[Database] Connection failed:', error);
  process.exit(1);
}
```

**JSDoc Pattern** (src/types/index.ts:1-3, src/index.ts:1-4):
```typescript
/**
 * Brief description of file/function purpose
 */
```

---

## IMPLEMENTATION PLAN

### Phase 1: Dependency Installation

Install ESLint and Prettier packages with exact versions to ensure consistency across environments.

**Tasks:**
- Install ESLint with TypeScript support and flat config
- Install Prettier with ESLint integration
- Verify package.json devDependencies updated

### Phase 2: Configuration Files

Create configuration files matching existing codebase patterns discovered during analysis.

**Tasks:**
- Create ESLint flat config with TypeScript rules
- Create Prettier config matching code style
- Create ignore files for both tools
- Update .gitignore for ESLint cache

### Phase 3: NPM Scripts

Add developer-friendly scripts to package.json for linting and formatting.

**Tasks:**
- Add lint script (check only)
- Add lint:fix script (auto-fix)
- Add format script (format all files)
- Add format:check script (CI validation)

### Phase 4: Validation & Testing

Validate configuration by running against existing codebase and fixing any issues.

**Tasks:**
- Run lint check on entire codebase
- Run format check on entire codebase
- Fix any legitimate issues found
- Document expected warnings (if any)

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### Task 1: INSTALL eslint dependencies

- **IMPLEMENT**: Install ESLint with TypeScript support using flat config format
- **COMMAND**: `npm install --save-dev eslint @eslint/js typescript-eslint`
- **PATTERN**: package.json devDependencies section (package.json:35-43)
- **GOTCHA**: Use `--save-dev` not `--save` - these are development tools only
- **VALIDATE**: `npx eslint --version` (should output version 9.x)

### Task 2: INSTALL prettier dependencies

- **IMPLEMENT**: Install Prettier with exact version and ESLint integration
- **COMMAND**: `npm install --save-dev --save-exact prettier eslint-config-prettier`
- **PATTERN**: package.json devDependencies section (package.json:35-43)
- **GOTCHA**: Use `--save-exact` to lock Prettier version (team consistency)
- **VALIDATE**: `npx prettier --version` (should output exact version)

### Task 3: CREATE eslint.config.mjs

- **IMPLEMENT**: Create ESLint flat config with TypeScript support
- **PATTERN**: jest.config.js (CommonJS) → convert to ESM flat config format
- **IMPORTS**: Import from eslint, typescript-eslint, eslint-config-prettier
- **CONFIG STRUCTURE**:
  ```javascript
  import eslint from '@eslint/js';
  import tseslint from 'typescript-eslint';
  import prettierConfig from 'eslint-config-prettier';

  export default tseslint.config(
    // Base configs
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,

    // Prettier integration (disables conflicting rules)
    prettierConfig,

    // Project-specific settings
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: import.meta.dirname,
        },
      },
    },

    // File patterns
    {
      files: ['**/*.ts'],
      ignores: ['**/*.test.ts', 'dist/**', 'node_modules/**'],
    },

    // Custom rules matching project patterns
    {
      rules: {
        // Enforce patterns from codebase analysis
        '@typescript-eslint/explicit-function-return-type': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': 'error',
        'quotes': ['error', 'single', { avoidEscape: true }],
        'semi': ['error', 'always'],
        '@typescript-eslint/naming-convention': [
          'error',
          { selector: 'interface', format: ['PascalCase'], prefix: ['I'] },
          { selector: 'typeAlias', format: ['PascalCase'] },
          { selector: 'function', format: ['camelCase'] },
          { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
        ],
      },
    },
  );
  ```
- **GOTCHA**: Use `.mjs` extension for ES module format (project uses CommonJS by default per package.json)
- **GOTCHA**: `projectService: true` requires TypeScript 5.3+ (project has 5.3.0 - OK)
- **VALIDATE**: `npx eslint --config eslint.config.mjs src/index.ts`

### Task 4: CREATE .prettierrc

- **IMPLEMENT**: Create Prettier config matching existing code style patterns
- **PATTERN**: Matches codebase analysis findings (single quotes, 2 spaces, semicolons)
- **CONFIG**:
  ```json
  {
    "semi": true,
    "singleQuote": true,
    "trailingComma": "es5",
    "tabWidth": 2,
    "printWidth": 100,
    "arrowParens": "avoid",
    "endOfLine": "lf"
  }
  ```
- **RATIONALE**:
  - `semi: true` - Matches existing semicolon usage (all files)
  - `singleQuote: true` - Matches existing quote style (src/index.ts:17)
  - `trailingComma: "es5"` - Modern standard, safe for Node 20
  - `tabWidth: 2` - Matches existing indentation (all files)
  - `printWidth: 100` - Slightly wider than 80, matches line length patterns
  - `arrowParens: "avoid"` - Cleaner arrow functions (x => x vs (x) => x)
  - `endOfLine: "lf"` - Unix line endings (standard for Node.js projects)
- **VALIDATE**: `npx prettier --check .prettierrc`

### Task 5: CREATE .prettierignore

- **IMPLEMENT**: Exclude files/directories from Prettier formatting
- **PATTERN**: Similar to .gitignore structure (.gitignore:1-41)
- **CONTENT**:
  ```
  # Dependencies
  node_modules/

  # Build output
  dist/

  # Test coverage
  coverage/

  # Logs
  *.log

  # Environment files
  .env
  .env.*

  # Session/workspace data
  sessions/
  api_sessions/
  workspace/

  # Lock files (auto-generated)
  package-lock.json

  # Markdown in workspace (user content)
  workspace/**/*.md
  ```
- **GOTCHA**: Include `package-lock.json` to prevent formatting conflicts on auto-updates
- **VALIDATE**: `npx prettier --check --ignore-path .prettierignore .`

### Task 6: CREATE .eslintignore

- **IMPLEMENT**: Exclude files/directories from ESLint analysis
- **PATTERN**: Similar to .prettierignore and .gitignore
- **CONTENT**:
  ```
  # Dependencies
  node_modules/

  # Build output
  dist/

  # Test coverage
  coverage/

  # Configuration files (JavaScript)
  jest.config.js
  setup-test-codebase.js
  test-db.js

  # Workspace (cloned repositories)
  workspace/
  ```
- **GOTCHA**: Include `.js` config files since they're CommonJS, not TypeScript
- **VALIDATE**: `npx eslint --ignore-path .eslintignore .`

### Task 7: UPDATE .gitignore

- **IMPLEMENT**: Add ESLint cache file to git ignore patterns
- **PATTERN**: Existing .gitignore structure with comments (.gitignore:1-41)
- **LOCATION**: After "# Node.js" section (line 13-19)
- **ADD**:
  ```
  # ESLint cache
  .eslintcache
  ```
- **VALIDATE**: `git status` (should not show .eslintcache if it exists)

### Task 8: UPDATE package.json scripts

- **IMPLEMENT**: Add lint and format scripts to npm scripts section
- **PATTERN**: Existing scripts (package.json:6-16)
- **LOCATION**: package.json "scripts" object
- **ADD** (preserve existing scripts):
  ```json
  {
    "scripts": {
      "dev": "tsx watch src/index.ts",
      "build": "tsc",
      "start": "node dist/index.js",
      "test": "jest",
      "test:watch": "jest --watch",
      "type-check": "tsc --noEmit",
      "lint": "eslint . --cache",
      "lint:fix": "eslint . --cache --fix",
      "format": "prettier --write .",
      "format:check": "prettier --check ."
    }
  }
  ```
- **RATIONALE**:
  - `lint` - Check for issues with cache for speed
  - `lint:fix` - Auto-fix issues (safe changes only)
  - `format` - Format all files (overwrites)
  - `format:check` - Validate formatting (CI-safe, no writes)
- **GOTCHA**: Use `--cache` for ESLint to speed up subsequent runs
- **VALIDATE**: `npm run lint --help` (should show ESLint help)

### Task 9: VALIDATE configuration with dry run

- **IMPLEMENT**: Run linting and formatting checks without making changes
- **COMMANDS**:
  ```bash
  npm run type-check    # Should pass (existing)
  npm run lint          # May show warnings/errors
  npm run format:check  # May show formatting differences
  ```
- **EXPECTED OUTCOMES**:
  - Type-check: Should pass (already passing)
  - Lint: May show issues in existing code (document them)
  - Format check: May show formatting differences (expected)
- **GOTCHA**: Do NOT run `lint:fix` or `format` yet - just document issues
- **VALIDATE**: All three commands complete without crashes

### Task 10: FIX legitimate linting issues (if any)

- **IMPLEMENT**: Address any legitimate bugs or type safety issues found by ESLint
- **PATTERN**: Depends on issues found in Task 9
- **SCOPE**: Only fix issues that are:
  - Type safety violations (missing return types, `any` types)
  - Potential bugs (unused variables, unreachable code)
  - NOT purely stylistic (quotes, semicolons) - Prettier handles those
- **GOTCHA**: Separate logic fixes from style fixes
- **VALIDATE**: `npm run lint` (should show fewer errors)

### Task 11: FORMAT entire codebase

- **IMPLEMENT**: Run Prettier to format all files according to configuration
- **COMMAND**: `npm run format`
- **PATTERN**: Will update all .ts files in src/ to match .prettierrc config
- **GOTCHA**: Large diff expected - this is normal for initial formatting
- **GOTCHA**: Review changes before committing to ensure no logic changes
- **VALIDATE**: `npm run format:check` (should report no issues)

### Task 12: RUN final validation suite

- **IMPLEMENT**: Execute all validation commands to ensure everything passes
- **COMMANDS**:
  ```bash
  npm run type-check    # TypeScript compilation
  npm run lint          # ESLint checks
  npm run format:check  # Prettier formatting
  npm test              # Jest test suite
  npm run build         # Production build
  ```
- **EXPECTED**: All commands should pass with zero errors
- **GOTCHA**: Tests may fail if formatting changed test files - review carefully
- **VALIDATE**: All five commands exit with code 0

---

## TESTING STRATEGY

This is a development infrastructure feature, not application logic, so testing focuses on validation rather than unit tests.

### Configuration Validation

**Objective**: Ensure ESLint and Prettier configurations are valid and don't conflict

**Approach**:
- ESLint config syntax validation: `npx eslint --config eslint.config.mjs --print-config src/index.ts`
- Prettier config validation: `npx prettier --check .prettierrc`
- Check for conflicting rules between ESLint and Prettier (should be none due to `eslint-config-prettier`)

### Integration Tests

**Objective**: Validate that linting and formatting work on actual codebase files

**Test Cases**:
1. **Lint TypeScript files**: `npm run lint` on src/ directory
2. **Format TypeScript files**: `npm run format:check` on src/ directory
3. **Type check integration**: `npm run type-check` still passes after linting/formatting
4. **Build integration**: `npm run build` still succeeds after linting/formatting
5. **Test integration**: `npm test` still passes after linting/formatting

### Edge Cases

**Specific edge cases to validate**:

1. **Ignored files respected**:
   - Create test file in `dist/` → should be ignored by ESLint and Prettier
   - Create test file in `workspace/` → should be ignored
   - Verify: `npx eslint dist/test.ts` and `npx prettier --check dist/test.ts` skip file

2. **CommonJS config files excluded**:
   - `jest.config.js` should be in `.eslintignore` (not TypeScript)
   - Verify: `npx eslint jest.config.js` skips or handles correctly

3. **Type-checked rules work**:
   - Create temporary file with type error (e.g., `const x: string = 123;`)
   - Run `npm run lint`
   - Should detect type error via TypeScript compiler integration
   - Delete temporary file

4. **Prettier doesn't break TypeScript**:
   - Format a complex file with generics, async generators
   - Run `npm run type-check`
   - Should still compile successfully

5. **Cache invalidation**:
   - Run `npm run lint` twice
   - Second run should be faster (cache working)
   - Change a file
   - Third run should detect change (cache invalidation working)

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and 100% feature correctness.

### Level 1: Syntax & Style

```bash
# TypeScript type checking (existing)
npm run type-check

# ESLint syntax and style
npm run lint

# Prettier formatting check
npm run format:check
```

**Expected**: All three commands pass with exit code 0

### Level 2: Unit Tests

```bash
# Jest test suite (existing)
npm test

# Test with coverage
npm run test -- --coverage
```

**Expected**: All tests pass, coverage meets requirements (if defined)

### Level 3: Build Validation

```bash
# TypeScript compilation to dist/
npm run build

# Verify build artifacts exist
ls -la dist/

# Test built application (smoke test)
node dist/index.js --help
```

**Expected**: Build succeeds, dist/ contains .js files, app starts without errors

### Level 4: Manual Validation

**Test script functionality**:

1. **Lint check**: `npm run lint` → Should complete and report status
2. **Lint auto-fix**:
   - Create test file: `echo "const x='test'" > test-lint.ts`
   - Run: `npm run lint:fix test-lint.ts`
   - Verify: File formatted (double quotes if configured)
   - Clean up: `rm test-lint.ts`

3. **Format check**: `npm run format:check` → Should report all files formatted
4. **Format write**:
   - Create test file: `echo "const   x  =  'test'  " > test-format.ts`
   - Run: `npm run format test-format.ts`
   - Verify: File cleaned up (proper spacing)
   - Clean up: `rm test-format.ts`

5. **Verify ignore patterns**:
   - Create `dist/test.ts`
   - Run `npm run lint` and `npm run format:check`
   - Verify no errors about dist/test.ts
   - Clean up: `rm dist/test.ts`

### Level 5: Configuration Validation

```bash
# Validate ESLint config syntax
npx eslint --config eslint.config.mjs --print-config src/index.ts > /dev/null

# Validate Prettier config
npx prettier --check .prettierrc

# Check for ESLint/Prettier conflicts (should show none)
npx eslint-config-prettier src/index.ts
```

**Expected**: No configuration errors or conflicts reported

---

## ACCEPTANCE CRITERIA

- [x] ESLint installed with TypeScript support (flat config format)
- [x] Prettier installed with ESLint integration (no conflicts)
- [x] Configuration files created and valid:
  - [x] `eslint.config.mjs` with TypeScript rules
  - [x] `.prettierrc` matching existing code style
  - [x] `.prettierignore` excluding appropriate files
  - [x] `.eslintignore` excluding appropriate files
- [x] `.gitignore` updated to exclude ESLint cache
- [x] NPM scripts added to package.json:
  - [x] `npm run lint` - Check for issues
  - [x] `npm run lint:fix` - Auto-fix issues
  - [x] `npm run format` - Format all files
  - [x] `npm run format:check` - Validate formatting
- [x] All validation commands pass:
  - [x] `npm run type-check` - TypeScript compilation
  - [x] `npm run lint` - ESLint checks
  - [x] `npm run format:check` - Prettier validation
  - [x] `npm test` - Jest test suite
  - [x] `npm run build` - Production build
- [x] Existing code formatted according to new configuration
- [x] No regressions in existing functionality (tests pass)
- [x] Documentation updated (if needed)

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order (1-12)
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully:
  - [ ] Level 1: type-check, lint, format:check
  - [ ] Level 2: test, test with coverage
  - [ ] Level 3: build, dist/ verification
  - [ ] Level 4: Manual script testing
  - [ ] Level 5: Config validation
- [ ] Full test suite passes (unit + integration)
- [ ] No linting errors (npm run lint)
- [ ] No formatting errors (npm run format:check)
- [ ] No type checking errors (npm run type-check)
- [ ] Build succeeds (npm run build)
- [ ] All acceptance criteria met
- [ ] Code reviewed for quality and maintainability

---

## NOTES

### Design Decisions

**1. ESLint Flat Config (not legacy .eslintrc)**
- **Rationale**: Flat config is the 2025 standard, legacy format deprecated
- **Benefit**: Simpler configuration, better TypeScript support, more maintainable
- **Trade-off**: Requires ESLint 9.x (project can upgrade easily)

**2. Type-Checked Rules Enabled**
- **Rationale**: Project emphasizes type safety (CLAUDE.md:306-320)
- **Benefit**: Catches type-related bugs that basic ESLint cannot detect
- **Trade-off**: Slower linting (~2-3x), but worth it for small-medium codebase

**3. Strict + Stylistic Configs**
- **Rationale**: Align with project's strict TypeScript configuration (tsconfig.json:8)
- **Benefit**: Maximum bug detection, consistent style enforcement
- **Trade-off**: More opinionated, may require code changes

**4. Prettier Integration via eslint-config-prettier**
- **Rationale**: Let Prettier handle formatting, ESLint handle logic/bugs
- **Benefit**: No conflicts, best tool for each job
- **Trade-off**: Need to run both tools (automated via scripts)

**5. Single Quotes + Semicolons + 2 Spaces**
- **Rationale**: Matches 100% of existing codebase patterns
- **Benefit**: Zero disruptive changes to existing code style
- **Trade-off**: None (preserving existing conventions)

### Alternative Approaches Considered

**Option A: Use Standard.js (abandoned)**
- **Pros**: Zero configuration, opinionated
- **Cons**: Doesn't support TypeScript well, conflicting style (no semicolons)
- **Decision**: Rejected - doesn't match existing codebase

**Option B: ESLint + Prettier + Husky pre-commit hooks (deferred)**
- **Pros**: Automatic enforcement on commits
- **Cons**: More complex setup, can slow down commits
- **Decision**: Deferred to future enhancement - start with manual scripts

**Option C: Prettier only (no ESLint)**
- **Pros**: Simpler setup, just formatting
- **Cons**: Misses bug detection, type safety enforcement
- **Decision**: Rejected - project needs linting for type safety (CLAUDE.md:306)

### Known Limitations

1. **Initial formatting diff will be large**
   - First `npm run format` will change many files
   - Review carefully before committing
   - Consider separate "formatting only" commit

2. **Type-checked linting is slower**
   - Full lint may take 5-15 seconds (vs 1-2 seconds without type checking)
   - Mitigated by `--cache` flag in npm scripts
   - Worth it for enhanced type safety

3. **No automatic enforcement (yet)**
   - Developers must run scripts manually
   - Future: Add pre-commit hooks (Husky) or CI checks
   - Current: Rely on developer discipline + PR reviews

4. **CommonJS config files excluded from linting**
   - `jest.config.js`, `test-db.js` are JavaScript, not TypeScript
   - Could convert to TypeScript (.ts) in future
   - Current: Excluded via .eslintignore for simplicity

### Future Enhancements

1. **Pre-commit hooks** (Husky + lint-staged)
   - Auto-run lint/format before commits
   - Only check changed files (fast)

2. **CI/CD integration**
   - Add GitHub Actions workflow
   - Run lint/format/test on PRs
   - Block merge if validation fails

3. **VS Code integration**
   - Add `.vscode/settings.json` with ESLint/Prettier config
   - Enable format-on-save
   - Show linting errors inline

4. **EditorConfig** (`.editorconfig`)
   - Define base formatting rules for all editors
   - Ensures consistency even without Prettier installed

5. **Convert JS config files to TypeScript**
   - `jest.config.js` → `jest.config.ts`
   - Benefits: Type checking, consistency
   - Requires ts-node or similar

### References

- [TypeScript-ESLint Getting Started](https://typescript-eslint.io/getting-started/)
- [TypeScript-ESLint Configs](https://typescript-eslint.io/users/configs/)
- [Prettier Installation](https://prettier.io/docs/en/install.html)
- [Prettier Options](https://prettier.io/docs/en/options.html)
- [ESLint Flat Config](https://eslint.org/docs/latest/use/configure/configuration-files)
- [eslint-config-prettier](https://github.com/prettier/eslint-config-prettier)
