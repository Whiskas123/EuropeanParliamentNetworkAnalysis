"use client";

/**
 * A two-or-three way switch over how a panel presents its figures.
 *
 * There were two of these in the sidebar in two different styles, six hundred
 * pixels apart on the same tab: the heatmap's dark-filled Agreement/Change
 * pair, and a lighter Score/Change pair over each grid of dials. They do the
 * same job and now look the same doing it.
 *
 * Which ordering or which value a panel shows is not a detail — a grid carries
 * its ranking in the layout, read left to right and top to bottom, so the order
 * is part of what the grid says. Score answers "who agrees most"; change
 * answers "what is different here", which is a different question and often
 * the one being asked.
 *
 * Callers render this only where the second view exists. Without a comparable
 * baseline there is no change to switch to, and offering the switch would be
 * offering nothing.
 */
export default function SegmentedToggle({ value, onChange, options, label }) {
  return (
    <div className="sb-sort" role="group" aria-label={label}>
      {label ? <span>{label}</span> : null}
      <span className="sb-sort-group">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="sb-sort-option"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            title={option.title}
          >
            {option.text}
          </button>
        ))}
      </span>
    </div>
  );
}

/** The ordering switch every grid of dials carries. */
export const ORDER_OPTIONS = [
  { id: "score", text: "Score", title: "Highest agreement first" },
  {
    id: "change",
    text: "Change",
    title: "Furthest from its own baseline first, in either direction",
  },
];
