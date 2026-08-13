import type { MemberSnapshot } from "../../lib/chat";

export interface MentionContact {
  uid: string;
  displayName: string;
}

export function mentionContacts(
  members: Record<string, MemberSnapshot>,
  excludeUid?: string,
): MentionContact[] {
  return Object.entries(members)
    .filter(([uid]) => uid !== excludeUid)
    .map(([uid, m]) => ({ uid, displayName: m.displayName }));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractMentions(
  text: string,
  members: Record<string, MemberSnapshot>,
): string[] {
  const mentioned: string[] = [];
  for (const [uid, m] of Object.entries(members)) {
    const name = m.displayName;
    if (!name) continue;
    const namePattern = name.replace(/\s+/g, "\\s+");
    const regex = new RegExp(
      `(^|\\s)@${escapeRegExp(namePattern)}(?!\\S)`,
      "i",
    );
    if (regex.test(text)) mentioned.push(uid);
  }
  return mentioned;
}

export interface MentionRange {
  uid: string;
  displayName: string;
  start: number;
  end: number;
}

export function findMentionRanges(
  text: string,
  members: Record<string, MemberSnapshot>,
): MentionRange[] {
  const ranges: MentionRange[] = [];
  for (const [uid, m] of Object.entries(members)) {
    const name = m.displayName;
    if (!name) continue;
    const namePattern = name.replace(/\s+/g, "\\s+");
    const regex = new RegExp(
      `(^|\\s)@${escapeRegExp(namePattern)}(?!\\S)`,
      "gi",
    );
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const leading = match[1] ?? "";
      const start = match.index + leading.length;
      ranges.push({
        uid,
        displayName: name,
        start,
        end: start + 1 + name.length,
      });
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}