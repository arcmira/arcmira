export * as Arcmira from "./api/index.js";
export type { BaseClientOptions, BaseRequestOptions } from "./BaseClient.js";
export {
    ArcmiraClient,
    PreparationError,
    PreparationFailedError,
    PreparationTimeoutError,
    PremiumUnavailableError,
    type PrepareAndWaitRequest,
    TranscriptsClient,
} from "./wrapper/ArcmiraClient.js";
export { ArcmiraEnvironment } from "./environments.js";
export { ArcmiraError, ArcmiraTimeoutError } from "./errors/index.js";
export * from "./exports.js";
