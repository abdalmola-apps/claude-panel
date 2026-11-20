/** Collapse the user's home dir to `~` for display. `home` comes from the
 *  backend (/api/meta → paths.home), so this works on any machine/user. */
export function tildePath(p: string, home?: string): string {
  if (home && p.startsWith(home)) return "~" + p.slice(home.length);
  return p;
}
