import { useEntangled } from "@entangled-ui/react";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Figure attributes plus the image and the optional Edit button. */
export interface MediaCardProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** Media id; the card reads `media:<id>` and its Edit button writes it. */
  mediaId: string | number;
  /** Image URL. */
  src: string;
  /** Image alt text. */
  alt: string;
  /** Caption. Default `alt`. */
  title?: React.ReactNode;
  /** Click handler for the Edit button; the button is rendered only when this is set. */
  onEdit?: () => void;
  /** Edit button label. Default `"Edit"`. */
  editLabel?: React.ReactNode;
}

/**
 * Image card wired for the upload scenario: after
 * `useEntangle().confirm("media:<id>")` (e.g. when an upload finishes) a
 * soft sweep plays over the image and the Edit button gets a gradient ring.
 * Hovering Edit previews the image it changes.
 *
 * Both the figure and the Edit button are layered hosts (`relative`, no own
 * `::after`), so effects draw on decorative pseudo-elements only.
 */
export function MediaCard({ mediaId, src, alt, title, onEdit, editLabel = "Edit", className, ...props }: MediaCardProps) {
  const key = `media:${mediaId}`;
  const reader = useEntangled({ by: key, effect: "sweep", layer: true });
  const writer = useEntangled({ affects: key, layer: true });
  return (
    <figure
      className={cn("relative m-0 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm [--en-radius:0.75rem]", className)}
      {...reader}
      {...props}
    >
      <img src={src} alt={alt} className="block aspect-[4/3] w-full object-cover" />
      <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className="truncate">{title ?? alt}</span>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="relative inline-flex h-7 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent [--en-radius:0.375rem]"
            {...writer}
          >
            {editLabel}
          </button>
        )}
      </figcaption>
    </figure>
  );
}
