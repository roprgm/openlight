import useObjectUrl from "@/hooks/use-object-url";

type EditorProps = { image: File };

export default function Editor({ image }: EditorProps) {
	const source = useObjectUrl(image);

	if (!source) {
		return null;
	}

	return (
		<img
			alt={image.name}
			className="size-full object-contain p-6"
			src={source}
		/>
	);
}
