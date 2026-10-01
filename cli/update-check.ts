/**
 * At most one registry read a day: is there a newer arcmira on npm? The answer is cached in the config directory, so every
 * other run reads a file. Never throws and never delays a command by more than the timeout.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const REGISTRY_URL = "https://registry.npmjs.org/arcmira/latest";
const DAY_MS = 24 * 60 * 60 * 1000;

type Cache = { checked_at: number; latest: string };

/** Numeric x.y.z comparison; a prerelease or malformed version never counts as newer. */
export function newer(latest: string, current: string): boolean {
    const parse = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split(".").map(Number) : undefined);
    const [a, b] = [parse(latest), parse(current)];
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
}

function readCache(path: string): Cache | undefined {
    try {
        const value = JSON.parse(readFileSync(path, "utf8"));
        return typeof value.checked_at === "number" && typeof value.latest === "string" ? value : undefined;
    } catch {
        return undefined;
    }
}

/** The latest published version, from the cache when it is under a day old, else from the registry. */
export async function latestVersion(configDir: string, now = Date.now(), fetcher: typeof fetch = fetch, timeoutMs = 1500): Promise<string | undefined> {
    const path = join(configDir, "update-check.json");
    const cached = existsSync(path) ? readCache(path) : undefined;
    if (cached && now - cached.checked_at < DAY_MS) return cached.latest || undefined;
    let latest: string | undefined;
    try {
        const res = await fetcher(REGISTRY_URL, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
        const version = res.ok ? ((await res.json()) as { version?: unknown }).version : undefined;
        if (typeof version === "string") latest = version;
    } catch {}
    // A failed read is cached too, so an offline machine waits once a day, not on every command.
    try {
        mkdirSync(configDir, { recursive: true, mode: 0o700 });
        writeFileSync(path, JSON.stringify({ checked_at: now, latest: latest ?? cached?.latest ?? "" }) + "\n");
    } catch {}
    return latest ?? cached?.latest;
}

/** The one-line notice, or undefined when this CLI is current or the check is off (ARCMIRA_NO_UPDATE_CHECK, CI). */
export async function updateNotice(configDir: string, current: string, env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch): Promise<string | undefined> {
    if (env.ARCMIRA_NO_UPDATE_CHECK || env.CI) return undefined;
    const latest = await latestVersion(configDir, Date.now(), fetcher);
    if (!latest || !newer(latest, current)) return undefined;
    return `arcmira ${latest} is out (this is ${current}). Update: npm i -g arcmira@latest. The next run refreshes the skills setup installed.`;
}
