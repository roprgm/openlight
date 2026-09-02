import { useEffect, useState } from "react";

export default function useObjectUrl(file: Blob) {
	const [url, setUrl] = useState<string>();

	useEffect(() => {
		const next = URL.createObjectURL(file);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [file]);

	return url;
}
