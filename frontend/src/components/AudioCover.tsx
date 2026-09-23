import { Headphones } from "lucide-react";

import { cn } from "@/lib/utils";

/** 純音檔來源（BBC）沒有畫面，播放器位置改放節目封面，播放中加一圈脈動提示。 */
export function AudioCover({
  imageUrl,
  playing,
  className,
}: {
  imageUrl: string | null | undefined;
  playing: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative h-full w-full", className)}>
      {imageUrl && <img src={imageUrl} alt="" className="h-full w-full object-cover opacity-80" />}
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            "glass-strong flex h-14 w-14 items-center justify-center rounded-full",
            playing && "animate-pulse",
          )}
        >
          <Headphones className="h-6 w-6 text-primary" strokeWidth={1.75} />
        </span>
      </div>
    </div>
  );
}
