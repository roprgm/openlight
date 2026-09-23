import { Slider } from "@roprgm/ui/slider";
import { useDocument, useScene } from "@/components/editor/session";
import { setWhiteBalance, whiteBalanceLimits } from "./edits";

export function WhiteBalanceControls() {
  const document = useDocument();
  const source = useScene((scene) => scene.layers[0].source);
  const selected = useScene((scene) => scene.layers[0].whiteBalance);
  const asShot = document.resources.get(source).raw?.asShot;
  if (!asShot) {
    return null;
  }
  const balance = selected ?? asShot;
  const limits = whiteBalanceLimits(asShot);
  return (
    <>
      <div className="relative">
        <Slider
          label="Temperature (K)"
          value={balance.temperature}
          {...limits.temperature}
          defaultValue={asShot.temperature}
          onChange={(temperature) => setWhiteBalance(document, { temperature })}
        />
        {/* The slider's label row again, its text hidden, so As Shot follows the label without a row of its own. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 py-0.5">
          <span aria-hidden className="invisible">
            Temperature (K)
          </span>
          <button
            type="button"
            className="pointer-events-auto cursor-pointer text-faint hover:text-foreground"
            onClick={() => setWhiteBalance(document)}
          >
            As Shot
          </button>
        </div>
      </div>
      <Slider
        label="Tint"
        value={balance.tint}
        step={0.1}
        {...limits.tint}
        defaultValue={asShot.tint}
        onChange={(tint) => setWhiteBalance(document, { tint })}
      />
    </>
  );
}
