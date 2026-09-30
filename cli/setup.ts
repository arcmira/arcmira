/**
 * `arcmira setup`: connect the Arcmira MCP server and install the Arcmira skills in every coding agent found on this machine,
 * with updates on: Claude Code gets the arcmira plugin with marketplace auto-update, the rest get skill copies this CLI refreshes after each upgrade.
 * Planning reads the current state and never writes; applying runs the plan. Running it twice changes nothing the second time.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { delimiter, dirname, join } from "node:path";

export const MCP_URL = "https://mcp.arcmira.com/mcp";
const SERVER = "arcmira";
/** The public repository that is both the MCP server and the Claude Code marketplace holding the arcmira plugin. */
export const MARKETPLACE = { name: "arcmira", repo: "arcmira/mcp", plugin: "arcmira@arcmira" } as const;

/** A skill as bundled with this CLI: skills/<name>/SKILL.md. */
export type Skill = { name: string; content: string };

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

/** Claude Code's plugin records, which say whether the arcmira marketplace is known, the plugin installed, and auto-update on. */
type PluginStore = { knownMarketplaces: string; installedPlugins: string; settings: string };

type Host = {
    id: AgentId;
    name: string;
    present: boolean;
    mcp: McpStore;
    /** Set for a host that installs the arcmira plugin (MCP server and skills together) when it signs in with OAuth. */
    plugin?: PluginStore;
    /** The directory skills go in, one folder per skill, or why there is none. */
    skills: string | { none: string };
    /** What the user does once after setup with OAuth. */
    signIn: string;
};

export type Target = "mcp" | "plugin" | "skill" | "update";

/** One change setup makes or reports. A json action sets `field`.`name` in the file; `merge` keeps the keys already there. */
export type Action =
    | { host: AgentId; target: Target; kind: "run"; argv: string[] }
    | { host: AgentId; target: Target; kind: "json"; path: string; field: string; name: string; entry: Record<string, unknown>; merge?: boolean; summary: string }
    | { host: AgentId; target: "skill"; kind: "file"; path: string; content: string; replaces: boolean }
    | { host: AgentId; target: Target; kind: "unchanged" | "manual"; detail: string };

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
            plugin: {
                knownMarketplaces: join(home, ".claude", "plugins", "known_marketplaces.json"),
                installedPlugins: join(home, ".claude", "plugins", "installed_plugins.json"),
                settings: join(home, ".claude", "settings.json"),
            },
            skills: join(home, ".claude", "skills"),
            signIn: "In Claude Code, run /mcp, pick the arcmira server and sign in.",
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
            skills: join(home, ".agents", "skills"),
            signIn: "Run: codex mcp login arcmira",
        },
        {
            id: "cursor",
            name: "Cursor",
            present: existsSync(join(home, ".cursor")),
            mcp: { kind: "json", path: join(home, ".cursor", "mcp.json"), field: "mcpServers", entry: (auth) => ({ url: MCP_URL, ...(auth.kind === "key" ? { headers: bearer(auth.key) } : {}) }) },
            skills: join(home, ".cursor", "skills"),
            signIn: "In Cursor, open Settings, then MCP, and choose Connect beside arcmira.",
        },
        {
            id: "vscode",
            name: "VS Code",
            present: existsSync(vscodeUser),
            mcp: { kind: "json", path: join(vscodeUser, "mcp.json"), field: "servers", entry: (auth) => ({ type: "http", url: MCP_URL, ...(auth.kind === "key" ? { headers: bearer(auth.key) } : {}) }) },
            skills: join(home, ".copilot", "skills"),
            signIn: "In VS Code, run MCP: List Servers, pick arcmira, and choose Start; approve the sign in.",
        },
        {
            id: "gemini",
            name: "Gemini CLI",
            present: onPath("gemini", env) || existsSync(join(home, ".gemini")),
            mcp: { kind: "json", path: join(home, ".gemini", "settings.json"), field: "mcpServers", entry: (auth) => ({ httpUrl: MCP_URL, ...(auth.kind === "key" ? { headers: bearer(auth.key) } : {}) }) },
            skills: join(home, ".gemini", "skills"),
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
            skills: { none: "Claude Desktop takes skills as an upload: Customize, then Skills." },
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
    return { host: host.id, target: "mcp", kind: "json", path: store.path, field: store.field, name: SERVER, entry, summary: `"${SERVER}" to ${store.path}` };
}

function planSkills(host: Host, skills: Skill[]): Action[] {
    const root = host.skills;
    if (typeof root !== "string") return [{ host: host.id, target: "skill", kind: "manual", detail: root.none }];
    return skills.map((skill): Action => {
        const path = join(root, skill.name, "SKILL.md");
        const current = existsSync(path) ? readFileSync(path, "utf8") : undefined;
        if (current === skill.content) return { host: host.id, target: "skill", kind: "unchanged", detail: path };
        if (current !== undefined && !isOurs(current)) return { host: host.id, target: "skill", kind: "manual", detail: `${path} is another skill with the same name; left alone` };
        return { host: host.id, target: "skill", kind: "file", path, content: skill.content, replaces: current !== undefined };
    });
}

/** Every Arcmira skill says so in its description, so setup never replaces a same-named skill someone else wrote. */
export const isOurs = (text: string) => /^---\n[\s\S]*?(arcmira)[\s\S]*?\n---\n/i.test(text);

type JsonObject = Record<string, unknown>;
const objectAt = (value: unknown, key: string): JsonObject | undefined => {
    const inner = value && typeof value === "object" ? (value as JsonObject)[key] : undefined;
    return inner && typeof inner === "object" && !Array.isArray(inner) ? (inner as JsonObject) : undefined;
};

/**
 * Claude Code with OAuth: the arcmira plugin from the arcmira/mcp marketplace carries the MCP server and every skill, and
 * `autoUpdate` on the marketplace's extraKnownMarketplaces entry in ~/.claude/settings.json turns background updates on
 * (off by default for a third-party marketplace; marketplace.json has no field for it).
 */
function planPlugin(host: Host, store: PluginStore, bin: string, env: NodeJS.ProcessEnv): Action[] {
    const actions: Action[] = [];
    const known = objectAt(readJson(store.knownMarketplaces), MARKETPLACE.name);
    actions.push(known ? { host: host.id, target: "plugin", kind: "unchanged", detail: `marketplace ${MARKETPLACE.name} (${MARKETPLACE.repo})` } : { host: host.id, target: "plugin", kind: "run", argv: [bin, "plugin", "marketplace", "add", MARKETPLACE.repo] });
    const installed = objectAt(readJson(store.installedPlugins), "plugins")?.[MARKETPLACE.plugin] !== undefined;
    actions.push(installed ? { host: host.id, target: "plugin", kind: "unchanged", detail: MARKETPLACE.plugin } : { host: host.id, target: "plugin", kind: "run", argv: [bin, "plugin", "install", MARKETPLACE.plugin, "--scope", "user"] });
    const settings = readJson(store.settings);
    const toggle = "in Claude Code, run /plugin, open Marketplaces, pick arcmira, and choose Enable auto-update";
    if (settings === "unreadable") actions.push({ host: host.id, target: "update", kind: "manual", detail: `${store.settings} is not plain JSON; ${toggle}` });
    else {
        const entry = objectAt(objectAt(settings, "extraKnownMarketplaces"), MARKETPLACE.name);
        actions.push(
            entry?.autoUpdate === true
                ? { host: host.id, target: "update", kind: "unchanged", detail: `auto-update on for marketplace ${MARKETPLACE.name}` }
                : { host: host.id, target: "update", kind: "json", path: store.settings, field: "extraKnownMarketplaces", name: MARKETPLACE.name, entry: { source: entry?.source ?? { source: "github", repo: MARKETPLACE.repo }, autoUpdate: true }, merge: true, summary: `auto-update on for marketplace ${MARKETPLACE.name} in ${store.settings}` },
        );
    }
    const direct = spawnSync(bin, ["mcp", "get", SERVER], { env, stdio: "ignore", timeout: 20_000 });
    if (direct.status === 0) actions.push({ host: host.id, target: "mcp", kind: "manual", detail: `an older direct "${SERVER}" server duplicates the plugin's; remove it: claude mcp remove ${SERVER} --scope user` });
    return actions;
}

export function plan(selected: Host[], auth: Auth, skills: Skill[], env: NodeJS.ProcessEnv = process.env): Action[] {
    return selected.flatMap((host) => {
        const bin = host.mcp.kind === "cli" ? host.mcp.found : undefined;
        if (host.plugin && bin && auth.kind === "oauth") return planPlugin(host, host.plugin, bin, env);
        return [planMcp(host, auth, env), ...planSkills(host, skills)];
    });
}

export function apply(action: Action, env: NodeJS.ProcessEnv = process.env): void {
    if (action.kind === "run") {
        execFileSync(action.argv[0], action.argv.slice(1), { env, stdio: ["ignore", "ignore", "pipe"], timeout: 60_000 });
    } else if (action.kind === "json") {
        const current = readJson(action.path);
        if (current === "unreadable") throw new Error(`${action.path} is not plain JSON; left as it is`);
        const root = current === "absent" ? {} : current;
        const field = objectAt(root, action.field) ?? {};
        const entry = action.merge ? { ...(objectAt(field, action.name) ?? {}), ...action.entry } : action.entry;
        mkdirSync(dirname(action.path), { recursive: true });
        writeFileSync(action.path, JSON.stringify({ ...root, [action.field]: { ...field, [action.name]: entry } }, null, 2) + "\n");
    } else if (action.kind === "file") {
        mkdirSync(dirname(action.path), { recursive: true });
        writeFileSync(action.path, action.content);
    }
}

const shellWord = (word: string) => (/^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`);

/** Never print a key: a bearer value in a command or entry shows as its last four characters. */
export const redact = (text: string, auth: Auth) => (auth.kind === "key" ? text.split(auth.key).join(`...${auth.key.slice(-4)}`) : text);

export function describe(action: Action, auth: Auth, dryRun: boolean): string {
    const verb = (done: "added" | "installed" | "updated" | "set") => (dryRun ? `would ${{ added: "add", installed: "install", updated: "update", set: "set" }[done]}` : done);
    const [status, detail] = ((): [string, string] => {
        switch (action.kind) {
            case "run":
                return [verb("added"), action.argv.map(shellWord).join(" ")];
            case "json":
                return [action.target === "update" ? verb("set") : verb("added"), action.summary];
            case "file":
                return [action.replaces ? verb("updated") : verb("installed"), action.path];
            case "unchanged":
                return ["unchanged", action.detail];
            case "manual":
                return ["by hand", action.detail];
        }
    })();
    return redact(`${action.host.padEnd(15)}${action.target.padEnd(8)}${status.padEnd(16)}${detail}`, auth);
}

/** The skill directories setup wrote to, so a newer CLI can refresh those copies and add skills it bundles for the first time. */
type SetupRecord = { version: string; roots: string[]; names?: string[] };

export function recordPath(configDir: string): string {
    return join(configDir, "setup.json");
}

export function writeRecord(configDir: string, version: string, roots: string[], names: string[]): void {
    const previous = readRecord(configDir)?.roots ?? [];
    mkdirSync(configDir, { recursive: true, mode: 0o700 });
    writeFileSync(recordPath(configDir), JSON.stringify({ version, roots: [...new Set([...previous, ...roots])], names }, null, 2) + "\n");
}

function readRecord(configDir: string): SetupRecord | undefined {
    const value = readJson(recordPath(configDir));
    return typeof value === "object" && typeof value.version === "string" && Array.isArray(value.roots) ? (value as SetupRecord) : undefined;
}

/** The skills directory of a skill file setup wrote: <root>/<name>/SKILL.md. */
export const skillRoot = (path: string) => dirname(dirname(path));

/**
 * After an upgrade, rewrite the Arcmira skills in each directory setup used, and add skills new in this version.
 * A skill the user deleted stays deleted, and a same-named skill someone else wrote is never touched. Returns how many directories changed.
 */
export function refreshSkills(configDir: string, version: string, skills: Skill[]): number {
    const record = readRecord(configDir);
    if (!record || record.version === version) return 0;
    const known = new Set(record.names ?? skills.map((s) => s.name));
    let count = 0;
    for (const root of record.roots) {
        if (!existsSync(root)) continue;
        let changed = false;
        for (const skill of skills) {
            const path = join(root, skill.name, "SKILL.md");
            const current = existsSync(path) ? readFileSync(path, "utf8") : undefined;
            if (current === skill.content) continue;
            if (current === undefined ? known.has(skill.name) : !isOurs(current)) continue;
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, skill.content);
            changed = true;
        }
        if (changed) count++;
    }
    writeRecord(configDir, version, [], skills.map((s) => s.name));
    return count;
}
