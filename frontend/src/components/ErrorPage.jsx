import { Link } from "react-router-dom";

const MESSAGES = {
  403: "Forbidden — you don't have permission to view this page.",
  404: "Not found — this page doesn't exist.",
  500: "Something went wrong — please try again later.",
};

export default function ErrorPage({ status = 500 }) {
  const message = MESSAGES[status] ?? MESSAGES[500];
  return (
    <main>
      <h1>{status}</h1>
      <p>{message}</p>
      <Link to="/home">Go home</Link>
    </main>
  );
}
