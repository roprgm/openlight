import { useState } from "react";
import Editor from "./editor";
import Landing from "./landing";

export default function App() {
	const [image, setImage] = useState<File>();

	if (!image) {
		return <Landing onOpen={setImage} />;
	}

	return <Editor image={image} />;
}
