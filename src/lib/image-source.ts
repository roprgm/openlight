import type { Frame, Gpu, Target } from "vgpu";
import type { WhiteBalance } from "@/lib/white-balance";

/** A loader supplies this capability only when its pixels support absolute white balance. */
export type WhiteBalanceSource = {
	asShot: Readonly<WhiteBalance>;
	/** Each renderer owns its stage; preview and export never share mutable output textures. */
	create(gpu: Gpu): {
		render(frame: Frame, balance?: Readonly<WhiteBalance>): Target;
		dispose(): void;
	};
	/** Release additional source resources; the document owns image.color separately. */
	dispose(): void;
};

export type ImageSource = { image: Target; whiteBalance?: WhiteBalanceSource };
