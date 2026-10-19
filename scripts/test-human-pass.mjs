import assert from "node:assert/strict";
import { createHumanPass, humanPassValid } from "../src/lib/human-pass.ts";

const env = { TURNSTILE_PAGE_SECRET: "test-secret" };
const token = await createHumanPass(env);
assert.equal(typeof token, "string");
assert.equal(await humanPassValid(token, env), true);
assert.equal(await humanPassValid(token, { TURNSTILE_PAGE_SECRET: "other" }), false);
assert.equal(await humanPassValid("1.abcd", env), false);
assert.equal(await humanPassValid(undefined, env), false);

console.log("human pass ok");
