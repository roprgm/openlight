import { Button } from "@roprgm/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@roprgm/ui/dialog";
import { Section } from "@roprgm/ui/section";
import { useRef } from "react";
import { useStore } from "zustand";
import { FileInput } from "@/app/editor/open";
import { download, keepKeys } from "@/lib/dom";
import { presetExtension, writePresetFile } from "./file";
import type { PresetSession, StoredPreset } from "./session";
import { describeSettings } from "./settings-dialog";

function PresetRow({
  preset,
  onDelete,
}: {
  preset: StoredPreset;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-1">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{preset.name}</span>
        <span className="truncate text-secondary">
          {describeSettings(preset.settings)}
        </span>
      </span>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Export ${preset.name}`}
        onClick={() => download(writePresetFile(preset))}
      >
        Export
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Delete ${preset.name}`}
        onClick={onDelete}
      >
        Delete
      </Button>
    </li>
  );
}

/** The stored presets with what each holds, to export or delete, and preset files to import. */
export function ManagePresetsDialog({
  open,
  onOpenChange,
  presets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets: PresetSession;
}) {
  const { presets: stored, error } = useStore(presets.state);
  const input = useRef<HTMLInputElement>(null);
  // A failure shown here is read once the dialog closes.
  function change(open: boolean) {
    if (!open) {
      presets.dismiss();
    }
    onOpenChange(open);
  }
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent onKeyDown={keepKeys}>
        <Section>
          <DialogTitle>Presets</DialogTitle>
          <DialogDescription>
            Kept in this browser. Export one to use it elsewhere.
          </DialogDescription>
        </Section>
        <Section>
          {stored.length > 0 ? (
            <ul aria-label="Presets" className="flex flex-col gap-2">
              {stored.map((preset) => (
                <PresetRow
                  key={preset.id}
                  preset={preset}
                  onDelete={() => void presets.remove(preset)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-secondary">
              No presets yet. Save one from a photo, or import a preset file.
            </p>
          )}
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
        </Section>
        <Section className="flex-row justify-between gap-2">
          <Button onClick={() => input.current?.click()}>Import…</Button>
          <DialogClose render={<Button variant="primary" />}>Done</DialogClose>
          <FileInput
            ref={input}
            accept={presetExtension}
            onOpen={(files) => {
              for (const file of files) {
                void presets.import(file);
              }
            }}
          />
        </Section>
      </DialogContent>
    </Dialog>
  );
}
