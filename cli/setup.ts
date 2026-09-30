/**
 * `arcmira setup`: connect the Arcmira MCP server and install the arcmira skill in every coding agent found on this machine.
 * Planning reads the current state and never writes; applying runs the plan. Running it twice changes nothing the second time.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { delimiter, dirname, join } from "node:path";

export const MCP_URL = "https://mcp.arcmira.com/mcp";
const SERVER = "arcmira";

export const AGENTS = ["claude-code", "codex", "cursor", "vscode", "gemini", "claude-desktop"] as const;
export type AgentId = (typeof AGENTS)[number];

export type Auth = { kind: "oauth" } | { kind: "key"; key: string };

/** How a host stores its MCP servers. */
type McpStore =
    /** The host's own CLI owns the config (Claude Code's ~/.claude.json, Codex's TOML): ask it, then tell it. */
    | { kind: "cli"; bin: string; found?: string; has: string[]; add: (auth: Auth) => string[] }
    /** A JSON file the host reads; `field` holds the servers object. */
    | { kind: "json"; path: string; field: "mcpServers" | "servers"; entry: (auth: Auth) => Record<string, unknown> }
    /** No file or command to write: the user adds the connector in the app. */
    | { kind: "manual"; steps: string[] };

type Host = {
    id: AgentId;
    name: string;
    present: boolean;
    mcp: McpStore;
    /** The skill file path, or why there is none. */
    skill: string | { none: string };
    /** What the user does once after setup with OAuth. */
    signIn: string;
};

export type Action =
    | { host: AgentId; target: "mcp" | "skill"; kind: "run"; argv: string[] }
    | { host: AgentId; target: "mcp"; kind: "json"; path: string; field: string; entry: Record<string, unknown> }
    | { host: AgentId; target: "skill"; kind: "file"; path: string; content: string; replaces: boolean }
    | { host: AgentId; target: "mcp" | "skill"; kind: "unchanged" | "manual"; detail: string };

const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });

function onPath(bin: string, env: NodeJS.ProcessEnv): boolean {
    const exts = platform() === "win32" ? (env.PATHEXT ?? ".EXE;.CMD").split(";") : [""];
    return (env.PATH ?? "").split(delimiter).some((dir) => dir && exts.some((ext) => existsSync(join(dir, bin + ext))));
}

/** A bare name when it is on PATH, else the first install location that exists (Claude Code's local install is often only a shell alias). */
function findBin(bin: string, env: NodeJS.ProcessEnv, installs: string[] = []): string | undefined {
    return onPath(bin, env) ? bin : installs.find((path) => existsSync(path));
}

/** Per-user config directories, by platform, for the apps that keep one outside $HOME dotfiles. */
function appSupport(home: string, env: NodeJS.ProcessEnv): string | undefined {
    if (platform() === "darwin") return join(home, "Library", "Application Support");
    if (platform() === "win32") return env.APPDATA;
    return env.XDG_CONFIG_HOME || join(home, ".config");
}

export function hosts(env: NodeJS.ProcessEnv = process.env): Host[] {
    const home = env.HOME || env.USERPROFILE || homedir();
    const support = appSupport(home, env);
    const vscodeUser = support ? join(support, "Code", "User") : join(home, ".vscode");
    const desktop = support && platform() !== "linux" ? join(support, "Claude") : undefined;
    const claude = findBin("claude", env, [join(home, ".claude", "local", "claude")]);
    const codex = findBin("codex", env);
    return [
        {
            id: "claude-code",
            name: "Claude Code",
            present: claude !== undefined,
            mcp: {
                kind: "cli",
                bin: "claude",
                found: claude,
                has: ["mcp", "get", SERVER],
                add: (auth) => ["mcp", "add", "--transport", "http", "--scope", "user", SERVER, MCP_URL, ...(auth.kind === "key" ? ["--header", `Authorization: Bearer ${auth.key}`] : [])],
            },
            skill: join(home, ".claude", "skills", SERVER, "SKILL.md"),
            signIn: "In Claude Code, run /mcp, pick arcmira and sign in.",
        },
        {
            id: "codex",
            name: "Codex",
            present: codex !== undefined,
            mcp: {
                kind: "cli",
                bin: "codex",
                found: codex,
                has: ["mcp", "get", SERVER],
                add: (auth) => ["mcp", "add", SERVER, "--url", MCP_URL, ...(auth.kind === "key" ? ["--bearer-token-env-var", "ARCMIRA_API_KEY"] : [])],
            },
            skill: join(home, ".agents", "skills", SERVER, "SKILL.md"),
            signIn: "Run: codex mcp login arcmira",
        },
        {
            id: "cursor",
            name: "Cursor",
            present: existsSync(join(home, ".cursor")),
            mcp: { kind: "json", path: join(home, ".cursor", "mcp.json"), field: "mcpServers", entry: (auth) => ({ url: MCP_URL, ...(auth.kind === "key" ? { headers: bearer(auth.key) } : {}) }) },
            skill: join(home, ".cursor", "skills", SERVER, "SKILL.md"),
            signIn: "In Cursor, open Settings, then MCP, and choose Connect beside arcmira.",
        },
        {
            id: "vscode",
            name: "VS Code",
            present: existsSync(vscodeUser),
            mcp: { kind: "json", path: join(vscodeUser, "mcp.json"), field: "servers", entry: (auth) => ({ type: "http", url: MCP_URL, ...(auth.kind === "key" ? { headers: bearer(auth.key) } : {}) }) },
            skill: join(home, ".copilot", "skills", SERVER, "SKILL.md"),
            signIn: "In VS Code, run MCP: List Servers, pick arcmira, and choose Start; approve the sign in.",
        },
        {
            id: "gemini",
            name: "Gemini CLI",
            present: onPath("gemini", env) || existsSync(join(home, ".gemini")),
            mcp: { kind: "json", path: join(home, ".gemini", "settings.json"), field: "mcpServers", entry: (auth) => ({ httpUrl: MCP_URL, ...(auth.kind === "key" ? { headers: bearer(auth.key) } : {}) }) },
            skill: join(home, ".gemini", "skills", SERVER, "SKILL.md"),
            signIn: "In Gemini CLI, run /mcp auth arcmira.",
        },
        {
            id: "claude-desktop",
            name: "Claude Desktop",
            present: desktop !== undefined && existsSync(desktop),
            mcp: {
                kind: "manual",
                steps: ["Open Customize, then Connectors, and choose Add custom connector.", `Enter ${MCP_URL}, leave the headers empty, and follow the sign in.`],
            },
            skill: { none: "Claude Desktop takes skills as an upload: Customize, then Skills." },
            signIn: "Claude Desktop signs in when you add the connector.",
        },
    ];
}

/** JSON with comments is valid in some of these files (VS Code's mcp.json); we read strict JSON and hand anything else to the user. */
function readJson(path: string): Record<string, unknown> | "absent" | "unreadable" {
    if (!existsSync(path)) return "absent";
    try {
        const text = readFileSync(path, "utf8");
        const value = text.trim() === "" ? {} : JSON.parse(text);
        return value && typeof value === "object" && !Array.isArray(value) ? value : "unreadable";
    } catch {
        return "unreadable";
    }
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function planMcp(host: Host, auth: Auth, env: NodeJS.ProcessEnv): Action {
    const store = host.mcp;
    if (store.kind === "manual") return { host: host.id, target: "mcp", kind: "manual", detail: store.steps.join(" ") };
    if (store.kind === "cli") {
        if (!store.found) return { host: host.id, target: "mcp", kind: "manual", detail: `${store.bin} is not on PATH; run: ${[store.bin, ...store.add(auth)].map(shellWord).join(" ")}` };
        const probe = spawnSync(store.found, store.has, { env, stdio: "ignore", timeout: 20_000 });
        if (probe.status === 0) return { host: host.id, target: "mcp", kind: "unchanged", detail: `already configured (${store.bin} ${store.has.join(" ")})` };
        return { host: host.id, target: "mcp", kind: "run", argv: [store.found, ...store.add(auth)] };
    }
    const entry = store.entry(auth);
    const current = readJson(store.path);
    const manual = `add "${SERVER}": ${JSON.stringify(entry)} under "${store.field}" in ${store.path}`;
    if (current === "unreadable") return { host: host.id, target: "mcp", kind: "manual", detail: `${store.path} is not plain JSON; ${manual}` };
    const existing = current === "absent" ? undefined : (current[store.field] as Record<string, unknown> | undefined)?.[SERVER];
    if (existing !== undefined && (auth.kind === "oauth" || sameJson(existing, entry))) return { host: host.id, target: "mcp", kind: "unchanged", detail: `already in ${store.path}` };
    return { host: host.id, target: "mcp", kind: "json", path: store.path, field: store.field, entry };
}

function planSkill(host: Host, skill: string): Action {
    if (typeof host.skill !== "string") return { host: host.id, target: "skill", kind: "manual", detail: host.skill.none };
    const current = existsSync(host.skill) ? readFileSync(host.skill, "utf8") : undefined;
    if (current === skill) return { host: host.id, target: "skill", kind: "unchanged", detail: host.skill };
    return { host: host.id, target: "skill", kind: "file", path: host.skill, content: skill, replaces: current !== undefined };
}

export function plan(selected: Host[], auth: Auth, skill: string, env: NodeJS.ProcessEnv = process.env): Action[] {
    return selected.flatMap((host) => [planMcp(host, auth, env), planSkill(host, skill)]);
}

export function apply(action: Action, env: NodeJS.ProcessEnv = process.env): void {
    if (action.kind === "run") {
        execFileSync(action.argv[0], action.argv.slice(1), { env, stdio: ["ignore", "ignore", "pipe"], timeout: 60_000 });
    } else if (action.kind === "json") {
        const current = readJson(action.path);
        const root = current === "absent" || current === "unreadable" ? {} : current;
        const servers = { ...((root[action.field] as Record<string, unknown>) ?? {}), [SERVER]: action.entry };
        mkdirSync(dirname(action.path), { recursive: true });
        writeFileSync(action.path, JSON.stringify({ ...root, [action.field]: servers }, null, 2) + "\n");
    } else if (action.kind === "file") {
        mkdirSync(dirname(action.path), { recursive: true });
        writeFileSync(action.path, action.content);
    }
}

const shellWord = (word: string) => (/^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`);

/** Never print a key: a bearer value in a command or entry shows as its last four characters. */
export const redact = (text: string, auth: Auth) => (auth.kind === "key" ? text.split(auth.key).join(`...${auth.key.slice(-4)}`) : text);

export function describe(action: Action, auth: Auth, dryRun: boolean): string {
    const verb = (done: "added" | "installed" | "updated") => (dryRun ? `would ${{ added: "add", installed: "install", updated: "update" }[done]}` : done);
    const [status, detail] = ((): [string, string] => {
        switch (action.kind) {
            case "run":
                return [verb("added"), action.argv.map(shellWord).join(" ")];
            case "json":
                return [verb("added"), `"${SERVER}" to ${action.path}`];
            case "file":
                return [action.replaces ? verb("updated") : verb("installed"), action.path];
            case "unchanged":
                return ["unchanged", action.detail];
            case "manual":
                return ["by hand", action.detail];
        }
    })();
    return redact(`${action.host.padEnd(15)}${action.target.padEnd(7)}${status.padEnd(16)}${detail}`, auth);
}

/** Where setup installed the skill, so a newer CLI can refresh those copies. */
type SetupRecord = { version: string; skills: string[] };

export function recordPath(configDir: string): string {
    return join(configDir, "setup.json");
}

export function writeRecord(configDir: string, version: string, skills: string[]): void {
    const previous = readRecord(configDir)?.skills ?? [];
    mkdirSync(configDir, { recursive: true, mode: 0o700 });
    writeFileSync(recordPath(configDir), JSON.stringify({ version, skills: [...new Set([...previous, ...skills])] }, null, 2) + "\n");
}

function readRecord(configDir: string): SetupRecord | undefined {
    const value = readJson(recordPath(configDir));
    return typeof value === "object" && typeof value.version === "string" && Array.isArray(value.skills) ? (value as SetupRecord) : undefined;
}

/** After an upgrade, rewrite the skill copies setup installed. Returns how many it rewrote. */
export function refreshSkills(configDir: string, version: string, skill: string): number {
    const record = readRecord(configDir);
    if (!record || record.version === version) return 0;
    let count = 0;
    for (const path of record.skills) {
        if (!existsSync(path) || readFileSync(path, "utf8") === skill) continue;
        writeFileSync(path, skill);
        count++;
    }
    writeRecord(configDir, version, []);
    return count;
}
