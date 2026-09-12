import React from "react";

/**
 * Pixel-perfect, optically balanced Kahoot shapes.
 * Solves the issue where Unicode glyphs (▲, ◆, ●, ■) have wildly mismatched
 * bounding boxes, optical weights, and font-dependent misalignments.
 */
export function KahootShape({ shape, className = "w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/85" }) {
  const norm = String(shape || "").toUpperCase();

  switch (norm) {
    case "▲":
    case "TRIANGLE":
    case "A":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="currentColor"
          aria-hidden="true"
        >
          <polygon
            points="12,2.5 22.5,21 1.5,21"
            stroke="currentColor"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "◆":
    case "DIAMOND":
    case "B":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="currentColor"
          aria-hidden="true"
        >
          <polygon
            points="12,1.5 22.5,12 12,22.5 1.5,12"
            stroke="currentColor"
            strokeWidth="0.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "●":
    case "CIRCLE":
    case "C":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9.2" />
        </svg>
      );
    case "■":
    case "SQUARE":
    case "D":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="2.5" />
        </svg>
      );
    case "★":
    case "STAR":
    case "E":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="currentColor"
          aria-hidden="true"
        >
          <polygon
            points="12,1.5 15.2,8 22.5,9.1 17.2,14.3 18.5,21.5 12,18.1 5.5,21.5 6.8,14.3 1.5,9.1 8.8,8"
            stroke="currentColor"
            strokeWidth="0.5"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return null;
  }
}
