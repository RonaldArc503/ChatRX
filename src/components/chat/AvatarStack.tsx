import { Avatar } from "./Avatar";

interface AvatarStackProps {
  members: { uid: string; displayName: string; photoURL: string }[];
  size?: "sm" | "md";
}

export function AvatarStack({ members, size = "sm" }: AvatarStackProps) {
  const shown = members.slice(0, 3);
  const rest = members.length - shown.length;
  const gap = size === "md" ? "-space-x-3" : "-space-x-2";

  if (members.length === 0) return null;

  return (
    <span class={"flex flex-none items-center " + gap}>
      {shown.map((m, i) => (
        <span
          key={m.uid}
          class={"relative " + (i > 0 ? "ring-2 ring-white dark:ring-slate-900" : "") + " rounded-full"}
          style={{ zIndex: 10 - i }}
        >
          <Avatar uid={m.uid} name={m.displayName} photoURL={m.photoURL} size={size} />
        </span>
      ))}
      {rest > 0 ? (
        <span
          class={
            "relative z-0 rounded-full ring-2 ring-white dark:ring-slate-900 " +
            (size === "md" ? "h-10 w-10" : "h-8 w-8") +
            " grid flex-none place-items-center bg-slate-200 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300"
          }
          aria-label={rest + " miembros más"}
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
}