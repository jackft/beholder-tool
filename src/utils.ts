export function inJestTest() {
    return typeof process !== "undefined" && process.env.JEST_WORKER_ID !== undefined;
}
