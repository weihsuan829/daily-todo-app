import {
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { nextProjectName } from "./renameProject";

/**
 * Shared inline-rename behaviour: Enter/blur commits, Escape cancels.
 * Commit only fires for a real change (see nextProjectName).
 */
export function useInlineRename(
  currentName: string,
  onCommit: (name: string) => void
) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName);

  const start = () => {
    setValue(currentName);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const next = nextProjectName(currentName, value);
    if (next) onCommit(next);
  };

  const cancel = () => {
    setEditing(false);
    setValue(currentName);
  };

  const inputProps = {
    autoFocus: true,
    value,
    onChange: (e: ChangeEvent<HTMLInputElement>) => setValue(e.currentTarget.value),
    onFocus: (e: FocusEvent<HTMLInputElement>) => e.currentTarget.select(),
    onClick: (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
    },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    onBlur: commit,
  };

  return { editing, start, inputProps };
}
