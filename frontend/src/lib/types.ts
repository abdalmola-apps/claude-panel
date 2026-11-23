export type PermList = "allow" | "deny" | "ask";

export interface Settings {
  [key: string]: any;
  permissions?: {
    allow?: string[];
    deny?: string[];
    ask?: string[];
    defaultMode?: string;
    additionalDirectories?: string[];
  };
  env?: Record<string, string>;
  enabledPlugins?: Record<string, boolean>;
  extraKnownMarketplaces?: Record<string, any>;
  hooks?: Record<string, any>;
  model?: string;
  effortLevel?: string;
  autoCompactEnabled?: boolean;
  autoCompactWindow?: number;
  // Ultra & Workflow / multi-agent orchestration
  ultracode?: boolean;
  workflowSizeGuideline?: string;
  skipWorkflowUsageWarning?: boolean;
  skipDangerousModePermissionPrompt?: boolean;
  switchModelsOnFlag?: boolean;
  teammateMode?: string;
  crossSessionInbound?: string;
  agentPushNotifEnabled?: boolean;
  inputNeededNotifEnabled?: boolean;
  askUserQuestionTimeout?: string | number;
  fallbackModel?: string[];
  modelSettings?: Record<string, { effortLevel?: string; model?: string }>;
}

export interface Agent {
  name: string;
  description: string;
  tools: string[];
  model: string;
  effort: string;
  body: string;
  path: string;
  source: string;
}

export interface MemoryEntry {
  file: string;
  name: string;
  description: string;
  type: string;
  body: string;
  path: string;
}

export interface MemoryGroup {
  project: string;
  dir: string;
  index: string;
  indexPath: string;
  entries: MemoryEntry[];
}

export interface Session {
  id: string;
  projectDir: string;
  project: string;
  path: string;
  mtime: string;
  ageSec: number;
  size: number;
  events: number;
  title: string;
  working: boolean;
  live: boolean;
}

export interface RunningProc {
  pid: number | string;
  uptimeSec: number;
  cwd: string;
  encoded: string;
}

export interface Worker {
  pid: number | string;
  cwd: string;
  project: string;
  uptimeSec: number;
  sessionId: string;
  firstTask: string;
  ageSec: number;
  status: "working" | "idle" | "stale" | string;
  phase: string;
  currentTask: string;
  lastText: string;
  lastTool: string;
  recentTools: string[];
  steps?: { tool: string; detail: string }[];
  subagent?: { type: string; task: string } | null;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export interface SessionAgent {
  type: string;
  count: number;
  tasks: string[];
  color: string;
  model: string;
  running: boolean;
  status: "working" | "waiting" | "hold" | string;
  ago: number;
}

export interface CatalogEntry {
  marketplace: string;
  sourceType: string;
  location: string;
  readable: boolean;
  plugins: { name: string; description: string; key: string; enabled: boolean }[];
}

export interface Skill {
  name: string;
  description: string;
  dir: string;
  path: string;
  source: "user" | "synced" | string;
}

export interface CliResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

export interface Project {
  id: string;
  label: string;
  isGlobal: boolean;
  projectDir: string;
  claudeDir: string;
  agentDir: string;
  hasClaude: boolean;
  hasSettings: boolean;
  agentCount: number;
}

export interface Scope {
  id: string;
  path: string;
  label: string;
  kind: "user" | "project" | "local" | string;
  project: string;
  exists: boolean;
}

export interface SystemInfo {
  cpu: { logical: number; physical: number; model: string };
  mem: { totalGB: number; availGB: number };
  load1: number;
  recommended: Record<string, number>;
  detail: { logical: number; totalGB: number; wfCpu: number; wfRam: number; subCpu: number; subRam: number };
}

export interface SandboxStatus {
  antInstalled: boolean;
  antVersion: string | null;
  apiKey: boolean;
  envId: string;
  envKey: boolean;
  workerRunning: boolean;
  workerPids: number[];
  os: string;
  defaultWorkdir: string;
  installCmd: string;
  installNote: string;
  docsUrl: string;
  logPath: string;
}

export interface SandboxStats {
  configured: boolean;
  reason?: string;
  ok?: boolean;
  error?: string;
  workersPolling?: number;
  raw?: any;
}

export interface Meta {
  claudeVersion: string;
  models: string[];
  efforts: string[];
  modes: string[];
  toolNames: string[];
  hookEvents: string[];
  paths: Record<string, string>;
}
