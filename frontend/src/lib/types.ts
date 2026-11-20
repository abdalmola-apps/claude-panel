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
  rationale: { workflow: string; subagents: string };
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
