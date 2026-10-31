import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const DialogContext = createContext(null);

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
};

export const DialogProvider = ({ children }) => {
  const [dialogState, setDialogState] = useState({
    isOpen: false,
    type: 'info', // 'confirm' | 'error' | 'success' | 'info'
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: null,
    onCancel: null,
  });

  const closeDialog = useCallback(() => {
    setDialogState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const showDialog = useCallback(
    ({
      type = 'info',
      title = '',
      message = '',
      confirmText = 'OK',
      cancelText = 'Cancel',
      onConfirm = null,
      onCancel = null,
    }) => {
      setDialogState({
        isOpen: true,
        type,
        title,
        message,
        confirmText,
        cancelText,
        onConfirm,
        onCancel,
      });
    },
    []
  );

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && dialogState.isOpen) {
        closeDialog();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogState.isOpen, closeDialog]);

  const handleConfirm = async () => {
    if (dialogState.onConfirm) {
      await dialogState.onConfirm();
    }
    closeDialog();
  };

  const handleCancel = () => {
    if (dialogState.onCancel) {
      dialogState.onCancel();
    }
    closeDialog();
  };

  return (
    <DialogContext.Provider value={{ showDialog, closeDialog }}>
      {children}

      {dialogState.isOpen && (
        <div
          className="dialog-overlay"
          onClick={closeDialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
        >
          <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <div className="dialog-icon-wrapper">
                {dialogState.type === 'error' && (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}

                {dialogState.type === 'success' && (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                )}

                {dialogState.type === 'confirm' && (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                )}

                {dialogState.type === 'info' && (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                )}
              </div>

              <div className="dialog-text">
                <h3 className="dialog-title" id="dialog-title">
                  {dialogState.title}
                </h3>
                <p className="dialog-message">{dialogState.message}</p>
              </div>
            </div>

            <div className="dialog-actions">
              {dialogState.type === 'confirm' && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCancel}
                  id="dialog-cancel-btn"
                  style={{ height: '36px', padding: '0 0.85rem' }}
                >
                  {dialogState.cancelText}
                </button>
              )}

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirm}
                id="dialog-confirm-btn"
                style={{ height: '36px', padding: '0 0.85rem' }}
                autoFocus
              >
                {dialogState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};
