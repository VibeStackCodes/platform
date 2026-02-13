"use client";

import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import {
  ScrollArea,
  ScrollBar,
} from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useCallback } from "react";

export type SuggestionsProps = ComponentProps<typeof ScrollArea> & {
  vertical?: boolean;
};

export const Suggestions = ({
  className,
  children,
  vertical,
  ...props
}: SuggestionsProps) => (
  <ScrollArea className={cn("w-full", !vertical && "overflow-x-auto whitespace-nowrap")} {...props}>
    <div className={cn(
      vertical
        ? "flex flex-col gap-2"
        : "flex w-max flex-nowrap items-center gap-2",
      className
    )}>
      {children}
    </div>
    {!vertical && <ScrollBar className="hidden" orientation="horizontal" />}
  </ScrollArea>
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  children,
  ...props
}: SuggestionProps) => {
  const handleClick = useCallback(() => {
    onClick?.(suggestion);
  }, [onClick, suggestion]);

  return (
    <Button
      className={cn("cursor-pointer rounded-full px-4 whitespace-normal text-left h-auto", className)}
      onClick={handleClick}
      size={size}
      data-testid="suggestion-button"
      type="button"
      variant={variant}
      {...props}
    >
      {children || suggestion}
    </Button>
  );
};
