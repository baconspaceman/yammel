export interface ProblemPanelProps {
  title: string;
  message: string;
  details?: string[];
}

/** Shown instead of the options when a YAML cannot be edited yet. The file is never changed. */
export function ProblemPanel({ title, message, details }: ProblemPanelProps) {
  return (
    <section className="problem" role="alert">
      <h2 className="problem__title">{title}</h2>
      <p>{message}</p>
      {details !== undefined && details.length > 0 && (
        <ul>
          {details.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
