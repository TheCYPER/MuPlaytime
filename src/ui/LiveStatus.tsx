export function LiveStatus({ message }: { message: string }) {
  return (
    <div className="visually-hidden" role="status" aria-live="polite">
      {message}
    </div>
  );
}
