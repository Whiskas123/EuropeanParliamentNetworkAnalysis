'use client';

export default function MandateSelector({ currentMandate, onMandateChange }) {
  const mandates = [6, 7, 8, 9, 10];

  return (
    <div className="mandate-selector">
      <label htmlFor="mandate-select">Select Mandate: </label>
      <select
        id="mandate-select"
        value={currentMandate}
        onChange={(e) => onMandateChange(parseInt(e.target.value))}
        className="mandate-select"
      >
        {mandates.map((mandate) => (
          <option key={mandate} value={mandate}>
            Mandate {mandate}
          </option>
        ))}
      </select>
    </div>
  );
}

