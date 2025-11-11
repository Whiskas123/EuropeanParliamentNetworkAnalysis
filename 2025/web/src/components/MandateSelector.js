"use client";

export default function MandateSelector({ currentMandate, onMandateChange }) {
  const mandates = [
    { value: 6, label: "6th Term (2004 - 2009)" },
    { value: 7, label: "7th Term (2009 - 2014)" },
    { value: 8, label: "8th Term (2014 - 2019)" },
    { value: 9, label: "9th Term (2019 - 2024)" },
    { value: 10, label: "10th Term (2024 - )" },
  ];

  return (
    <div className="mandate-selector">
      <label htmlFor="mandate-select">Term: </label>
      <select
        id="mandate-select"
        value={currentMandate}
        onChange={(e) => onMandateChange(parseInt(e.target.value))}
        className="mandate-select"
      >
        {mandates.map((mandate) => (
          <option key={mandate.value} value={mandate.value}>
            {mandate.label}
          </option>
        ))}
      </select>
    </div>
  );
}
