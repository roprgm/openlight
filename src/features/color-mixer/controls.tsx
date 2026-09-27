import { ScrubInput } from "@roprgm/ui/scrub-input";
import { Slider } from "@roprgm/ui/slider";
import { Tab, TabList, TabPanel, Tabs } from "@roprgm/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import { useState } from "react";
import { useDocument } from "@/components/editor/session";
import type { ColorMixer } from "@/core/document";
import { setColorMixer } from "./edits";
import { channels, colors, type MixerChannel } from "./model";

function gradient(hue: number, channel: MixerChannel) {
  if (channel === "hue") {
    return [-30, 0, 30].map((shift) => `hsl(${hue + shift} 65% 55%)`);
  }
  if (channel === "saturation") {
    return [0, 50, 100].map((saturation) => `hsl(${hue} ${saturation}% 55%)`);
  }
  return [20, 55, 85].map((lightness) => `hsl(${hue} 65% ${lightness}%)`);
}

function ColorSlider({
  index,
  channel,
  value,
  layerId,
}: {
  index: number;
  channel: MixerChannel;
  value: number;
  layerId: string;
}) {
  const document = useDocument();
  const color = colors[index];
  const label = `${color.label} ${channel}`;
  const change = (value: number) =>
    setColorMixer(document, color.id, { [channel]: value }, layerId);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className="flex min-w-0 flex-col items-center gap-1">
            <ScrubInput
              aria-label={`${label} value`}
              className="w-full justify-center px-0 tracking-tight"
              value={value}
              defaultValue={0}
              onChange={change}
              min={-100}
              max={100}
            />
            <Slider
              orientation="vertical"
              label={label}
              value={value}
              onChange={change}
              min={-100}
              max={100}
              defaultValue={0}
              stops={gradient(color.hue, channel)}
              color={`hsl(${color.hue} 65% 55%)`}
            />
          </div>
        }
      />
      <TooltipContent>{color.label}</TooltipContent>
    </Tooltip>
  );
}

export function ColorMixerControls({
  id: layerId,
  mixer,
}: {
  id: string;
  mixer: ColorMixer;
}) {
  const [channel, setChannel] = useState<MixerChannel>("hue");
  return (
    <Tabs
      value={channel}
      onValueChange={setChannel}
      render={<section />}
      className="p-3.5"
    >
      <TabList
        aria-label="Color Mixer adjustment"
        variant="segmented"
        className="mb-3"
      >
        {channels.map(({ id, label }) => (
          <Tab key={id} value={id} className="min-w-0 flex-1 px-1">
            {label}
          </Tab>
        ))}
      </TabList>
      {/* One panel shows every channel, so it follows the tab that's selected. */}
      <TabPanel value={channel} className="grid grid-cols-8">
        {colors.map((color, index) => (
          <ColorSlider
            key={color.id}
            index={index}
            channel={channel}
            value={mixer[channel][index]}
            layerId={layerId}
          />
        ))}
      </TabPanel>
    </Tabs>
  );
}
