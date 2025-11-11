"use client";

export default function LoadingSpinner() {
  return (
    <div className="loading-spinner">
      <div className="loading-spinner-container">
        {/* Outer spinning ring */}
        <div className="loading-spinner-outer" />
        {/* Inner spinning ring */}
        <div className="loading-spinner-inner" />
      </div>
    </div>
  );
}

