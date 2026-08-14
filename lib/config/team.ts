/**
 * SSOT for clinical team members displayed on the marketing site.
 *
 * To add a team member:   append here + add "{key}.role" and "{key}.bio" in messages/{locale}.json
 * To remove a team member: delete the entry here + the matching key in messages/{locale}.json
 *
 * Names and initials live here (same across all locales).
 * Role titles and bios live in messages/{locale}.json under team.members.{key}.
 */

export const TEAM_MEMBERS = [
  { key: "manuel",   initials: "M",  name: "Manuel" },
  { key: "montagna", initials: "DM", name: "Dr. Montagna" },
] as const;

export type TeamMemberKey = (typeof TEAM_MEMBERS)[number]["key"];
