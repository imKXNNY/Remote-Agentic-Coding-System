export type WebhookRiskTier = 'low' | 'medium' | 'high';
export type WebhookPolicyDecision = 'allow' | 'requires_approval' | 'blocked';
export type WebhookPolicyReason =
  | 'repo_not_allowed'
  | 'command_not_allowed'
  | 'protected_path_blocked'
  | 'branch_not_allowed'
  | 'high_risk_requires_approval'
  | 'medium_risk_requires_approval'
  | 'policy_allow';

export interface WebhookPolicyInput {
  repositoryFullName: string;
  targetBranch: string;
  commandText: string;
  isMutating: boolean;
}

export interface WebhookPolicyResult {
  decision: WebhookPolicyDecision;
  reason: WebhookPolicyReason;
  riskTier: WebhookRiskTier;
}

function parseCsv(value: string | undefined, fallback: string[]): string[] {
  if (!value) {
    return fallback;
  }
  const parsed = value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

function isPatternMatch(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(value);
}

function matchesAny(value: string, patterns: string[]): boolean {
  return patterns.some(pattern => isPatternMatch(value, pattern));
}

function extractPrimaryCommand(commandText: string): string {
  return commandText.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

function classifyRisk(commandText: string, isMutating: boolean): WebhookRiskTier {
  if (!isMutating) {
    return 'low';
  }

  const text = commandText.toLowerCase();
  const highRiskSignals = [
    'migration',
    'schema',
    'auth',
    'security',
    'token',
    'secret',
    'release',
    'deploy',
    'package.json',
    'dependency',
    '.github/workflows',
  ];
  if (highRiskSignals.some(signal => text.includes(signal))) {
    return 'high';
  }

  const lowRiskSignals = ['docs/', 'readme', 'test', 'report', '.md'];
  if (lowRiskSignals.some(signal => text.includes(signal))) {
    return 'low';
  }

  return 'medium';
}

function containsProtectedPath(commandText: string, protectedPaths: string[]): boolean {
  const text = commandText.toLowerCase();
  return protectedPaths.some(path => text.includes(path.toLowerCase()));
}

export function evaluateWebhookPolicy(input: WebhookPolicyInput): WebhookPolicyResult {
  const allowedRepos = parseCsv(process.env.WEBHOOK_POLICY_ALLOWED_REPOS, ['*']);
  const allowedBranches = parseCsv(process.env.WEBHOOK_POLICY_ALLOWED_BRANCHES, ['feature/*', 'fix/*', 'chore/*']);
  const allowedCommands = parseCsv(process.env.WEBHOOK_POLICY_ALLOWED_COMMANDS, [
    '/status',
    '/help',
    '/prime',
    '/plan-feature',
    '/execute',
    '/code-review',
    '/validate-simple',
    '/execution-report',
    '/command-invoke',
    '/load-commands',
    '/commands',
    'approve-run',
  ]).map(command => command.toLowerCase());
  const protectedPaths = parseCsv(process.env.WEBHOOK_POLICY_PROTECTED_PATHS, [
    '.env',
    '.env.',
    'secret',
    'credentials',
    'id_rsa',
    'deploy_key',
  ]);
  const overrideToken = (process.env.WEBHOOK_POLICY_OVERRIDE_TOKEN ?? '--policy-override').toLowerCase();
  const requireMediumApproval = process.env.WEBHOOK_POLICY_REQUIRE_APPROVAL_FOR_MEDIUM === 'true';

  const primaryCommand = extractPrimaryCommand(input.commandText);
  const riskTier = classifyRisk(input.commandText, input.isMutating);

  if (!matchesAny(input.repositoryFullName, allowedRepos)) {
    return { decision: 'blocked', reason: 'repo_not_allowed', riskTier };
  }

  if (primaryCommand && !allowedCommands.includes(primaryCommand)) {
    return { decision: 'blocked', reason: 'command_not_allowed', riskTier };
  }

  const hasOverride = input.commandText.toLowerCase().includes(overrideToken);
  if (containsProtectedPath(input.commandText, protectedPaths) && !hasOverride) {
    return { decision: 'blocked', reason: 'protected_path_blocked', riskTier };
  }

  if (input.isMutating && !matchesAny(input.targetBranch, allowedBranches) && !hasOverride) {
    return { decision: 'requires_approval', reason: 'branch_not_allowed', riskTier };
  }

  if (riskTier === 'high') {
    return { decision: 'requires_approval', reason: 'high_risk_requires_approval', riskTier };
  }

  if (riskTier === 'medium' && requireMediumApproval) {
    return { decision: 'requires_approval', reason: 'medium_risk_requires_approval', riskTier };
  }

  return { decision: 'allow', reason: 'policy_allow', riskTier };
}
