---
description: Execute a development plan with systematic task tracking
argument-hint: [plan-file-path]
---

# Execute Development Plan

You are about to execute a comprehensive development plan with systematic task tracking. This workflow ensures organized task management and implementation throughout the entire development process.

## Critical Requirements

**MANDATORY**: Throughout the ENTIRE execution of this plan, you MUST maintain organized task management. Track all tasks from creation to completion using the built-in task management system.

## Step 1: Read and Parse the Plan

Read the plan file specified in: $ARGUMENTS

The plan file will contain:
- A list of tasks to implement
- References to existing codebase components and integration points
- Context about where to look in the codebase for implementation

## Step 2: Project Setup

1. Create a comprehensive list of all tasks from the plan
   - Use the built-in task management system to organize work
   - Create a tracking document or use project management tooling available

2. Organize tasks logically:
   - Group related tasks together
   - Establish clear ordering and dependencies
   - Document context and requirements for each task

## Step 3: Create Task List

For EACH task identified in the plan:
1. Create a detailed task entry using the task management system
2. Set initial status as "not-started"
3. Include detailed descriptions from the plan
4. Maintain the task order/priority from the plan

**IMPORTANT**: Create ALL tasks upfront before starting implementation. This ensures complete visibility of the work scope.

## Step 4: Codebase Analysis

Before implementation begins:
1. Analyze ALL integration points mentioned in the plan
2. Use Grep and Glob tools to:
   - Understand existing code patterns
   - Identify where changes need to be made
   - Find similar implementations for reference
3. Read all referenced files and components
4. Build a comprehensive understanding of the codebase context

## Step 5: Implementation Cycle

For EACH task in sequence:

### 5.1 Start Task
- Mark the current task as "in-progress" in your tracking system
- Use the built-in task management to track subtasks if needed

### 5.2 Implement
- Execute the implementation based on:
  - The task requirements from the plan
  - Your codebase analysis findings
  - Best practices and existing patterns
- Make all necessary code changes
- Ensure code quality and consistency

### 5.3 Complete Task
- Once implementation is complete, mark task status as "completed"
- Flag for validation in the next phase

### 5.4 Proceed to Next
- Move to the next task in the list
- Repeat steps 5.1-5.3

**CRITICAL**: Only ONE task should be in "doing" status at any time. Complete each task before starting the next.

## Step 6: Validation Phase

After ALL tasks are in "review" status:

**IMPORTANT: Use the `validator` agent for comprehensive testing**
1. Launch the validator agent using the Task tool
   - Provide the validator with a detailed description of what was built
   - Include the list of features implemented and files modified
   - The validator will create simple, effective unit tests
   - It will run tests and report results

The validator agent will:
- Create focused unit tests for the main functionality
- Test critical edge cases and error handling
- Run the tests using the project's test framework
- Report what was tested and any issues found

Additional validation you should perform:
- Check for integration issues between components
- Ensure all acceptance criteria from the plan are met

## Step 7: Finalize Tasks

After successful validation:

1. For each task that has corresponding unit test coverage:
   - Mark task as "completed" in the tracking system

2. For any tasks without test coverage:
   - Keep in "in-progress" or "pending" status
   - Document why they remain incomplete (e.g., "Awaiting integration tests")

## Step 8: Final Report

Provide a summary including:
- Total tasks created and completed
- Any tasks remaining in review and why
- Test coverage achieved
- Key features implemented
- Any issues encountered and how they were resolved

## Workflow Rules

1. **ALWAYS** maintain organized task tracking throughout
2. **ALWAYS** create all tasks before starting implementation
3. **MAINTAIN** one task in "in-progress" status at a time
4. **VALIDATE** all work before marking tasks as complete
5. **TRACK** progress continuously in your task management system
6. **ANALYZE** the codebase thoroughly before implementation
7. **TEST** everything before final completion

## Error Handling

If at any point task management operations fail:
1. Retry the operation
2. If persistent failures, document the issue and continue tracking locally
3. Always maintain a backup tracking method to ensure continuity

Remember: The success of this execution depends on maintaining systematic task management throughout the entire process. This ensures accountability, progress tracking, and quality delivery.

## Notes

- If you encounter issues not addressed in the plan, document them
- If you need to deviate from the plan, explain why
- If tests fail, fix implementation until they pass
- Don't skip validation steps

### Ready for Commit
- Confirm all changes are complete
- Confirm all validations pass
- Ready for `/commit` command
