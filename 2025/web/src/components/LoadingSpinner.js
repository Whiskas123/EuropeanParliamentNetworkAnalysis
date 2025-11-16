"use client";

export default function LoadingSpinner({ message }) {
  return (
    <div className="loading-spinner">
      <div className="loading-spinner-container">
        {/* Outer spinning ring */}
        <div className="loading-spinner-outer" />
        {/* Inner spinning ring */}
        <div className="loading-spinner-inner" />
      </div>
      {message && (
        <div className="loading-spinner-message">{message}</div>
      )}
    </div>
  );
}

