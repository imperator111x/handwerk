export async function verifyTurnstile(
  env: Env | undefined,
  token: unknown,
  remoteIp: string,
  expectedAction: string,
  secret: string | undefined,
): Promise<boolean> {
  const expectedHostnames = new Set(
    (env?.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((hostname) => hostname.trim())
      .filter(Boolean),
  );
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > 2048 ||
    !secret ||
    expectedHostnames.size === 0
  ) {
    return false;
  }

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: remoteIp,
      }),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
    };
    return (
      result.success === true &&
      result.action === expectedAction &&
      typeof result.hostname === "string" &&
      expectedHostnames.has(result.hostname)
    );
  } catch (err) {
    console.error("turnstile_verify_failed", err);
    return false;
  }
}
