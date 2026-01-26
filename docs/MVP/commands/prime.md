---
description: Prime agent with codebase understanding for remote GitHub workflow
---

# Prime: Load Project Context

## Objective

Build comprehensive understanding of the codebase by analyzing structure, documentation, key files, and GitHub repository state for remote development workflow.

**🚨 CRITICAL RULE - READ THIS FIRST 🚨**

**YOU ARE FORBIDDEN FROM IMPLEMENTING ANYTHING.**

This is a READ-ONLY analysis command. You must:
- ❌ NOT edit ANY files (no Write, Edit, or file modification tools)
- ❌ NOT implement the feature described in the GitHub issue
- ❌ NOT make any code changes whatsoever
- ❌ NOT solve the problem - just understand it
- ✅ ONLY read files and analyze the project structure
- ✅ ONLY provide a summary report

**Your ONLY job is to analyze the codebase and report what you find. The actual implementation will happen in a SEPARATE command later.**

If you implement anything, you have FAILED this command.

## Process

### 1. Analyze Project Structure

List all tracked files:
!`git ls-files`

Show directory structure:
On Linux, run: `tree -L 3 -I 'node_modules|__pycache__|.git|dist|build'`

### 2. Read Core Documentation

- Read PRD or similar files
- Read CLAUDE.md/AGENTS.md or similar global rules file
- Read README files at project root and major directories
- Read any architecture documentation

### 3. Identify Key Files

Based on the structure, identify and read:
- Main entry points (main.py, index.ts, app.py, etc.)
- Core configuration files (pyproject.toml, package.json, tsconfig.json)
- Key model/schema definitions
- Important service or controller files

### 4. Understand Current State

Check recent activity:
!`git log -10 --oneline`

Check current branch and status:
!`git status`

**GitHub Repository Context:**
- Verify remote repository connection: `git remote -v`
- Check if we're on main/master branch (important for feature branch creation)
- Note any uncommitted changes that might need stashing

### 5. Verify GitHub CLI Access

Ensure GitHub CLI is configured:
!`gh auth status`

This confirms we can create branches and pull requests remotely.

## Output Report

Provide a concise summary covering:

### Project Overview
- Purpose and type of application
- Primary technologies and frameworks
- Current version/state

### Architecture
- Overall structure and organization
- Key architectural patterns identified
- Important directories and their purposes

### Tech Stack
- Languages and versions
- Frameworks and major libraries
- Build tools and package managers
- Testing frameworks

### Core Principles
- Code style and conventions observed
- Documentation standards
- Testing approach

### Current State
- Active branch (note if on main/master for feature branching)
- Recent changes or development focus
- Any uncommitted changes or work in progress
- GitHub remote repository URL
- GitHub CLI authentication status

### Remote Development Readiness
- ✓ On main/master branch (ready for feature branch creation)
- ✓ Working tree clean (or note what needs stashing)
- ✓ GitHub CLI authenticated
- ✓ Remote repository accessible

**Make this summary easy to scan - use bullet points and clear headers.**
