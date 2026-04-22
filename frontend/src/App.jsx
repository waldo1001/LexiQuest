import { useEffect, useState } from "react";
import { fetchHelloMessage } from "./lib/api.js";

export default function App() {
  const [message, setMessage] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchHelloMessage()
      .then((msg) => {
        if (!cancelled) setMessage(msg);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  let heading;
  if (message) heading = message;
  else if (failed) heading = "LexiQuest";
  else heading = "Loading…";

  return (
    <main>
      <h1>{heading}</h1>
    </main>
  );
}
