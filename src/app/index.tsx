import { useState } from "react";
import Editor from "./editor";
import Landing from "./landing";

export default function App() {
	const [file, setFile] = useState<File>();

	if (!file) {
		return <Landing onOpen={setFile} />;
	}

	return <Editor file={file} />;
}
