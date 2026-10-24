// Stand-in for the consumer's shadcn `@/lib/utils` (clsx + tailwind-merge),
// used only to type-check and test the registry sources here.
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(" ");
}
