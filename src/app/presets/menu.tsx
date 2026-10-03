import { IconButton } from "@roprgm/ui/icon-button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Submenu,
  SubmenuContent,
  SubmenuTrigger,
} from "@roprgm/ui/menu";
import { Notice, NoticeClose } from "@roprgm/ui/notice";
import { Section, SectionAction } from "@roprgm/ui/section";
import { useState } from "react";
import { useStore } from "zustand";
import { useDocument } from "@/components/editor/session";
import { PresetsIcon } from "@/components/icons/presets";
import { keepKeys } from "@/lib/dom";
import { ManagePresetsDialog } from "./manage-dialog";
import type { PresetSession } from "./session";
import { copySettings } from "./settings";
import { SettingsDialog } from "./settings-dialog";

/** Why copied settings or a preset couldn't apply, or presets couldn't be read or kept. */
export function PresetNotice({ presets }: { presets: PresetSession }) {
  const error = useStore(presets.state, (state) => state.error);
  if (!error) {
    return null;
  }
  return (
    <Notice
      tone="alert"
      className="fixed top-14 left-1/2 z-50 w-96 max-w-[calc(100%-1.5rem)] -translate-x-1/2"
    >
      <Section className="flex-row items-start gap-2">
        <p className="flex-1">{error}</p>
        <SectionAction>
          <NoticeClose onClick={presets.dismiss} />
        </SectionAction>
      </Section>
    </Notice>
  );
}

/** Copies and pastes the photo's settings, and applies, saves, and manages presets, from the header. */
export function PresetMenu({ presets }: { presets: PresetSession }) {
  const document = useDocument();
  const { copied, presets: stored } = useStore(presets.state);
  const [dialog, setDialog] = useState<"copy" | "save" | "manage">();
  const [image] = document.scene.getState().layers;
  const raw = document.resources.get(image.source).raw !== undefined;
  function close(open: boolean) {
    if (!open) {
      setDialog(undefined);
    }
  }
  function paste() {
    if (copied) {
      presets.apply(document, copied, "the copied settings");
    }
  }
  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <IconButton
              label="Copy settings and presets"
              size="icon"
              className="pointer-coarse:size-10"
            >
              <PresetsIcon className="size-4" />
            </IconButton>
          }
        />
        <MenuContent onKeyDown={keepKeys}>
          <MenuItem onClick={() => setDialog("copy")}>Copy settings…</MenuItem>
          <MenuItem disabled={!copied} onClick={paste}>
            Paste settings
          </MenuItem>
          <MenuSeparator />
          <Submenu>
            <SubmenuTrigger disabled={!stored.length}>
              Apply preset
            </SubmenuTrigger>
            <SubmenuContent>
              {stored.map((preset) => (
                <MenuItem
                  key={preset.id}
                  onClick={() =>
                    presets.apply(document, preset.settings, preset.name)
                  }
                >
                  {preset.name}
                </MenuItem>
              ))}
            </SubmenuContent>
          </Submenu>
          <MenuItem onClick={() => setDialog("save")}>Save preset…</MenuItem>
          <MenuItem onClick={() => setDialog("manage")}>
            Manage presets…
          </MenuItem>
        </MenuContent>
      </Menu>
      <SettingsDialog
        open={dialog === "copy"}
        onOpenChange={close}
        title="Copy settings"
        description="Choose what to paste on this or another photo."
        submit="Copy"
        raw={raw}
        onSubmit={(chosen) => presets.copy(document, chosen)}
      />
      <SettingsDialog
        open={dialog === "save"}
        onOpenChange={close}
        title="Save preset"
        description="Choose what the preset applies to any photo."
        submit="Save"
        named
        raw={raw}
        onSubmit={(chosen, name) =>
          void presets.save(name, copySettings(document, chosen))
        }
      />
      <ManagePresetsDialog
        open={dialog === "manage"}
        onOpenChange={close}
        presets={presets}
      />
    </>
  );
}
