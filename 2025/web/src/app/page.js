"use client";

import { useRouter } from "next/navigation";
import styles from "./page.module.css";

export default function Home() {
  const router = useRouter();

  const handleEnter = () => {
    router.push("/visualization");
  };

  return (
    <div className={styles.landingPage}>
      <div className={styles.landingContent}>
        <div className={styles.networkLogo}>
          <svg
            width="200"
            height="200"
            viewBox="0 0 200 200"
            className={styles.networkSvg}
          >
            {/* EU stars arranged in a circle (12 stars) */}
            {[...Array(12)].map((_, i) => {
              const angle = (i * 30 - 90) * (Math.PI / 180);
              const radius = 70;
              // Round to 2 decimal places to avoid hydration mismatches
              const cx =
                Math.round((100 + radius * Math.cos(angle)) * 100) / 100;
              const cy =
                Math.round((100 + radius * Math.sin(angle)) * 100) / 100;
              const nextAngle = ((i + 1) * 30 - 90) * (Math.PI / 180);
              const nextCx =
                Math.round((100 + radius * Math.cos(nextAngle)) * 100) / 100;
              const nextCy =
                Math.round((100 + radius * Math.sin(nextAngle)) * 100) / 100;
              return (
                <g key={i}>
                  {/* Network edges connecting stars - only circle edges */}
                  {i < 12 && (
                    <line
                      x1={cx}
                      y1={cy}
                      x2={nextCx}
                      y2={nextCy}
                      stroke="#FFD700"
                      strokeWidth="1.5"
                      opacity="0.4"
                    />
                  )}
                  {/* Star node */}
                  <circle cx={cx} cy={cy} r="6" fill="#FFD700" />
                  {/* Star shape */}
                  <path
                    d={`M ${cx} ${cy - 4} L ${cx + 1.2} ${cy - 1.2} L ${
                      cx + 4
                    } ${cy - 1.2} L ${cx + 1.8} ${cy + 1.2} L ${cx + 2.4} ${
                      cy + 4
                    } L ${cx} ${cy + 2.4} L ${cx - 2.4} ${cy + 4} L ${
                      cx - 1.8
                    } ${cy + 1.2} L ${cx - 4} ${cy - 1.2} L ${cx - 1.2} ${
                      cy - 1.2
                    } Z`}
                    fill="#FFD700"
                    opacity="0.9"
                  />
                </g>
              );
            })}
          </svg>
        </div>
        <h1 className={styles.landingTitle}>
          European Parliament
          <br />
          Network Analysis
        </h1>
        <p className={styles.landingDescription}>
          Explore voting patterns and political alliances in the European
          Parliament across mandates 6-10. Interactive network visualization
          powered by D3.js.
        </p>
        <button className={styles.enterButton} onClick={handleEnter}>
          Enter Visualization
        </button>
      </div>
    </div>
  );
}
