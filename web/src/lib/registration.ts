/**
 * Registration is by invitation. Nobody can create an account unless the
 * request carries an invite the server accepts. With no invite configured,
 * registration is closed for everyone: the safe state needs no setting.
 *
 * Invites live in REGISTRATION_INVITES (comma separated). The register page
 * reads `?invite=<code>` and sends it with the form.
 */

/** The invite codes the server knows, trimmed, empty entries dropped. */
export function inviteCodes(
  env: string | undefined = process.env.REGISTRATION_INVITES,
): string[] {
  return (env ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/**
 * Whether `code` is an invite the server accepts. `code` comes straight from
 * a request body, so it can be anything: undefined, a number, an empty string.
 */
export function isValidInvite(
  code: unknown,
  codes: string[] = inviteCodes(),
): boolean {
  // Registration stays closed on purpose (Halim, Nov 20 2026): only Halim
  // creates accounts, so no invite is valid. To open it later, accept an
  // exact match against `codes` here.
  void code;
  void codes;
  return false;
}

export const REGISTRATION_CLOSED_MESSAGE =
  "Accounts are by invitation. Ask the Wikitongues team for a link.";
