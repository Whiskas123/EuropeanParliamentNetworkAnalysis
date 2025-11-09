'use client';

export default function NodeInfoPanel({ node, onClose }) {
  if (!node) return null;

  return (
    <div className="node-info-panel">
      <button className="close-button" onClick={onClose}>×</button>
      <h3>Node Information</h3>
      <div className="info-content">
        <div className="info-row">
          <strong>Name:</strong>
          <span>{node.label || node.FullName || node.id}</span>
        </div>
        {node.country && (
          <div className="info-row">
            <strong>Country:</strong>
            <span>{node.country}</span>
          </div>
        )}
        {node.groupId && (
          <div className="info-row">
            <strong>Group:</strong>
            <span>{node.groupId}</span>
          </div>
        )}
        {node.id && (
          <div className="info-row">
            <strong>ID:</strong>
            <span>{node.id}</span>
          </div>
        )}
      </div>
    </div>
  );
}

