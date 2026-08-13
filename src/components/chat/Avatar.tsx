const PALETTE = [
  "bg-indigo-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-teal-500",
  "bg-fuchsia-500",
];

const TEXT_PALETTE = [
  "text-indigo-500",
  "text-sky-500",
  "text-emerald-500",
  "text-amber-500",
  "text-rose-500",
  "text-violet-500",
  "text-teal-500",
  "text-fuchsia-500",
];

export function avatarColor(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) {
    h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}

export function authorTextColor(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) {
    h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  }
  return TEXT_PALETTE[h % TEXT_PALETTE.length];
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface AvatarProps {
  uid: string;
  name: string;
  photoURL?: string;
  size?: "sm" | "md" | "lg";
}

const SIZES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-9 w-9 text-sm",
  md: "h-11 w-11 text-base",
  lg: "h-12 w-12 text-lg",
};

export function Avatar({ uid, name, photoURL, size = "md" }: AvatarProps) {
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={name}
        class={SIZES[size] + " flex-none rounded-full object-cover ring-2 ring-white"}
      />
    );
  }
  return (
    <span
      class={
        SIZES[size] +
        ` ${avatarColor(uid)} grid flex-none place-items-center rounded-full font-bold text-white`
      }
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}