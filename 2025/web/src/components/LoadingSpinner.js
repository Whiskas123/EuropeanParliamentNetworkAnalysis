"use client";

export default function LoadingSpinner() {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(245, 245, 245, 0.9)",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "60px",
          height: "60px",
        }}
      >
        {/* Outer spinning ring */}
        <div
          className="loading-spinner-outer"
          style={{
            position: "absolute",
            width: "60px",
            height: "60px",
            border: "4px solid rgba(0, 51, 153, 0.1)",
            borderTop: "4px solid #003399",
            borderRadius: "50%",
          }}
        />
        {/* Inner spinning ring */}
        <div
          className="loading-spinner-inner"
          style={{
            position: "absolute",
            top: "10px",
            left: "10px",
            width: "40px",
            height: "40px",
            border: "4px solid rgba(0, 51, 153, 0.1)",
            borderRight: "4px solid #003399",
            borderRadius: "50%",
          }}
        />
      </div>
    </div>
  );
}

