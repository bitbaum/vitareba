/**
 * SSOT for clinical team members displayed on the marketing site.
 *
 * To add a team member:   append here + add "{key}.role" and "{key}.bio" in messages/{locale}.json
 * To remove a team member: delete the entry here + the matching key in messages/{locale}.json
 *
 * Names and initials live here (same across all locales).
 * Role titles and bios live in messages/{locale}.json under team.members.{key}.
 */

/**
 * Names as the practice itself publishes them (vitareba.com) and as the Swiss
 * commercial register records them. Titles live in messages/{locale}.json.
 *
 * Deliberately no honorific we cannot source: "Dr." is a credential claim, and
 * asserting one for a real person on a medical site is not ours to make.
 */
export const TEAM_MEMBERS = [
  { key: "manuel", initials: "MR", name: "Manuel Riegner" },
  { key: "george",  initials: "GE", name: "George" },
] as const;

export type TeamMemberKey = (typeof TEAM_MEMBERS)[number]["key"];
