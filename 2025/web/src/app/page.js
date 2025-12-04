"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PasswordModal from "../components/PasswordModal";
import { checkSession } from "../lib/passwordConfig";

export default function Home() {
  const router = useRouter();
  const [showMethodology, setShowMethodology] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const handleEnter = () => {
    // Check if user is already authenticated
    const session = checkSession();
    if (session.authenticated) {
      router.push("/visualization");
    } else {
      setShowPasswordModal(true);
    }
  };

  const handlePasswordSuccess = () => {
    setShowPasswordModal(false);
    router.push("/visualization");
  };

  return (
    <div className="landingPage">
      <div className="landingContent">
        <div className="networkLogo">
          <svg
            width="200"
            height="200"
            viewBox="0 0 200 200"
            className="networkSvg"
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
        <h1 className="landingTitle">European Parliament Voting Network</h1>
        <p className="landingDescription">
          Analyze voting patterns and political cohesion in the European Parliament through an interactive network visualization. Discover alliances, group dynamics, and voting behavior across parliamentary terms and policy areas.
        </p>
        
        <div className="landingFeatures">
          <div className="landingFeature">
            <div className="landingFeatureIcon">🔍</div>
            <div className="landingFeatureText">
              <strong>Explore Voting Patterns</strong>
              <span>Visualize how MEPs vote together across different policy areas</span>
            </div>
          </div>
          <div className="landingFeature">
            <div className="landingFeatureIcon">📊</div>
            <div className="landingFeatureText">
              <strong>Analyze Group Cohesion</strong>
              <span>Measure similarity scores within and between political groups</span>
            </div>
          </div>
          <div className="landingFeature">
            <div className="landingFeatureIcon">🌍</div>
            <div className="landingFeatureText">
              <strong>Filter by Term & Subject</strong>
              <span>Examine specific parliamentary terms and policy domains</span>
            </div>
          </div>
        </div>

        <div className="landingActions">
          <button className="enterButton" onClick={handleEnter}>
            Explore the Network
          </button>
          <button 
            className="methodologyButton" 
            onClick={() => setShowMethodology(!showMethodology)}
          >
            {showMethodology ? "Hide" : "Show"} Methodology
          </button>
        </div>

        {showMethodology && (
          <div className="methodologySection">
            <h2 className="methodologyTitle">Methodology</h2>
            <div className="methodologyContent">
              <div className="methodologyItem">
                <h3>Network Construction</h3>
                <p>
                  The network is built by calculating voting similarity between each pair of Members of the European Parliament (MEPs). 
                  Each MEP is represented as a node, and connections (edges) between MEPs are weighted by their voting agreement rate.
                </p>
              </div>
              <div className="methodologyItem">
                <h3>Similarity Calculation</h3>
                <p>
                  For each pair of MEPs, we calculate the percentage of votes where they agreed (both voted "For", "Against", or "Abstain"). 
                  The similarity score ranges from 0% (complete disagreement) to 100% (perfect agreement). Only MEPs who participated in 
                  at least 50% of voting sessions are included in the network.
                </p>
              </div>
              <div className="methodologyItem">
                <h3>Data Sources</h3>
                <p>
                  Voting data comes from roll-call votes in the European Parliament across multiple terms (6th through 10th mandate). 
                  The visualization includes filters for specific policy subjects and parliamentary terms, allowing for detailed analysis 
                  of voting behavior in different contexts.
                </p>
              </div>
              <div className="methodologyItem">
                <h3>Visualization</h3>
                <p>
                  The network layout uses Force Atlas 2 algorithm, positioning MEPs closer together when they vote similarly. 
                  Colors represent political groups, and edge thickness indicates the strength of voting agreement. 
                  The tool provides detailed statistics on group cohesion, country similarity, and individual MEP voting patterns.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <PasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSuccess={handlePasswordSuccess}
      />
    </div>
  );
}
