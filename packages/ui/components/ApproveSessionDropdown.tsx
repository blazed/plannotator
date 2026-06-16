import React, { useEffect, useRef, useState } from 'react';

export type ApprovalSessionMode = 'current' | 'fresh';

interface ApproveSessionDropdownProps {
  onApprove: (mode: ApprovalSessionMode) => void;
  disabled?: boolean;
  isLoading?: boolean;
}

const SessionIcon = ({ fresh }: { fresh?: boolean }) => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    {fresh ? (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v4m0 8v4m8-8h-4M8 12H4m11.66-6.66-2.83 2.83M11.17 15.83l-2.83 2.83m10.32 0-2.83-2.83M8.34 5.34l2.83 2.83" />
    ) : (
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11Z" />
    )}
  </svg>
);

export const ApproveSessionDropdown: React.FC<ApproveSessionDropdownProps> = ({
  onApprove,
  disabled = false,
  isLoading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: PointerEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const baseClasses = disabled
    ? 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground'
    : 'bg-success text-success-foreground hover:opacity-90';

  const handleApprove = (mode: ApprovalSessionMode) => {
    setIsOpen(false);
    onApprove(mode);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Mobile: simple current-session approval button */}
      <button
        onClick={() => handleApprove('current')}
        disabled={disabled}
        className={`md:hidden px-2 py-1 rounded-md text-xs font-medium transition-all ${baseClasses}`}
        title="Approve and continue in this session"
      >
        {isLoading ? '...' : 'OK'}
      </button>

      {/* Desktop: split button */}
      <div className="hidden md:flex items-stretch">
        <button
          onClick={() => handleApprove('current')}
          disabled={disabled}
          className={`px-2.5 py-1 rounded-l-md text-xs font-medium transition-all ${baseClasses}`}
          title="Approve and continue in this session"
        >
          {isLoading ? 'Approving...' : 'Approve'}
        </button>
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className={`px-1.5 py-1 rounded-r-md border-l border-success-foreground/20 text-xs transition-all ${baseClasses}`}
          title="Choose where implementation should continue"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-60 rounded-lg border border-border bg-popover shadow-xl z-[70] overflow-hidden py-1">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
            Continue implementation
          </div>
          <button
            onClick={() => handleApprove('current')}
            className="w-full px-3 py-2 text-left text-xs transition-colors flex items-start gap-2 text-popover-foreground hover:bg-muted"
          >
            <span className="mt-0.5 text-primary"><SessionIcon /></span>
            <span>
              <span className="block font-medium">Current session</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">Keep planning context and continue here.</span>
            </span>
          </button>
          <button
            onClick={() => handleApprove('fresh')}
            className="w-full px-3 py-2 text-left text-xs transition-colors flex items-start gap-2 text-popover-foreground hover:bg-muted"
          >
            <span className="mt-0.5 text-primary"><SessionIcon fresh /></span>
            <span>
              <span className="block font-medium">Fresh session</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">Press Enter in Pi to start clean.</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
};
