/** First letter of up to the first two words of a name — used for avatar
 *  bubbles (ProfileMenu, PeoplePicker, Dashboard's collaborator avatars). */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
