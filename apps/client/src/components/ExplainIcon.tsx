// A four-pointed sparkle with curved sides, the shape commonly used for AI
// features, so the action reads as "ask AI" at a glance. Its tips reach the
// edges of the viewBox: the curved sides leave little filled area, so a
// sparkle drawn within the 2–22 bounds of the outlined icons looks smaller
// than them.
export function ExplainIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M12 0C12 6.63 17.37 12 24 12C17.37 12 12 17.37 12 24C12 17.37 6.63 12 0 12C6.63 12 12 6.63 12 0Z" />
    </svg>
  );
}
