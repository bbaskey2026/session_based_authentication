import React from 'react';

/**
 * Loading Component
 * Monochrome circular spinner with Geist Mono status text.
 */
const Loading = ({ message = 'Authenticating session...' }) => {
  return (
    <div className="spinner-container" id="loading-spinner">
      <div className="spinner" aria-label="Loading"></div>
      <p className="spinner-text">{message}</p>
    </div>
  );
};

export default Loading;
