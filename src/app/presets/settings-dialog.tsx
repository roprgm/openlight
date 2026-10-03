import { Button } from "@roprgm/ui/button";
import { Checkbox } from "@roprgm/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@roprgm/ui/dialog";
import { Field } from "@roprgm/ui/field";
import { Input } from "@roprgm/ui/input";
import { Section } from "@roprgm/ui/section";
import { type FormEvent, useId, useState } from "react";
import { keepKeys } from "@/lib/dom";
import type { Category, Settings } from "./settings";

/** The categories in the order the dialogs list them. */
const categories: readonly { id: Category; label: string; hint?: string }[] = [
  { id: "light", label: "Light" },
  { id: "whiteBalance", label: "White balance" },
  { id: "color", label: "Color", hint: "Vibrance and saturation" },
  { id: "toneCurve", label: "Tone curve" },
  { id: "colorMixer", label: "Color Mixer" },
  { id: "details", label: "Details", hint: "Clarity and sharpening" },
  { id: "vignette", label: "Vignette" },
  { id: "grain", label: "Grain" },
];

/** What settings hold, named as the dialogs list it. */
export function describeSettings(settings: Settings) {
  return categories
    .filter(({ id }) => settings[id] !== undefined)
    .map(({ label }) => label)
    .join(", ");
}

// White balance stays with each photo unless chosen: RAW photos set it in kelvin, others incrementally.
const chosenFirst: ReadonlySet<Category> = new Set(
  categories.map(({ id }) => id).filter((id) => id !== "whiteBalance"),
);

type Props = {
  title: string;
  description: string;
  submit: string;
  /** Asks for the name the settings are saved under. */
  named?: boolean;
  /** Whether the photo is RAW, whose white balance only RAW photos take. */
  raw: boolean;
  onSubmit: (chosen: ReadonlySet<Category>, name: string) => void;
};

function CategoryOption({
  label,
  note,
  checked,
  onChange,
}: {
  label: string;
  note?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-2.5">
      <Checkbox
        id={id}
        checked={checked}
        aria-describedby={note && `${id}-note`}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <label htmlFor={id}>{label}</label>
      {note && (
        <p id={`${id}-note`} className="col-start-2 text-secondary">
          {note}
        </p>
      )}
    </div>
  );
}

function CategoryChoice({
  chosen,
  raw,
  onChange,
}: {
  chosen: ReadonlySet<Category>;
  raw: boolean;
  onChange: (chosen: ReadonlySet<Category>) => void;
}) {
  const balance = raw
    ? "Temperature in kelvin and tint, for RAW photos only"
    : "Temp and Tint, for photos other than RAW";
  function toggle(id: Category, on: boolean) {
    const next = new Set(chosen);
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
    onChange(next);
  }
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="sr-only">Settings</legend>
      {categories.map(({ id, label, hint }) => (
        <CategoryOption
          key={id}
          label={label}
          note={id === "whiteBalance" ? balance : hint}
          checked={chosen.has(id)}
          onChange={(on) => toggle(id, on)}
        />
      ))}
    </fieldset>
  );
}

/** Mounted while the dialog is open, so each opening starts from the same choice. */
function SettingsForm({
  title,
  description,
  submit,
  named,
  raw,
  onSubmit,
}: Props) {
  const form = useId();
  const [chosen, setChosen] = useState(chosenFirst);
  const [name, setName] = useState("");
  const ready = chosen.size > 0 && (!named || name.trim() !== "");
  function send(event: FormEvent) {
    event.preventDefault();
    if (ready) {
      onSubmit(chosen, name);
    }
  }
  return (
    <>
      <Section>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </Section>
      <Section>
        <form id={form} className="flex flex-col gap-4" onSubmit={send}>
          {named && (
            <Field label="Name">
              <Input
                value={name}
                maxLength={64}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </Field>
          )}
          <CategoryChoice chosen={chosen} raw={raw} onChange={setChosen} />
          <p className="text-secondary">
            Effects change the photo's first layer of their kind, or add one on
            top. Crop, masks, healing, and paint stay with each photo.
          </p>
        </form>
      </Section>
      <Section className="flex-row justify-end gap-2">
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button type="submit" form={form} variant="primary" disabled={!ready}>
          {submit}
        </Button>
      </Section>
    </>
  );
}

/** Chooses which of the photo's settings to copy or save as a preset. */
export function SettingsDialog({
  open,
  onOpenChange,
  onSubmit,
  ...props
}: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onKeyDown={keepKeys}>
        <SettingsForm
          {...props}
          onSubmit={(chosen, name) => {
            onSubmit(chosen, name);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
