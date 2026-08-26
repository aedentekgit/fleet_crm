import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

/**
 * Reusable Pagination Component for ERP Tables & Lists
 * 
 * @param {number} currentPage - Active 1-based page number
 * @param {number} totalItems - Total count of filtered records
 * @param {number} pageSize - Number of items per page (default: 10)
 * @param {function} onPageChange - Callback when page changes: (pageNumber) => void
 * @param {string} itemName - Label for the items (e.g. "orders", "quotations", "lorries", "customers")
 * @param {object} style - Optional container inline styles
 */
export default function Pagination({
  currentPage = 1,
  totalItems = 0,
  pageSize = 10,
  onPageChange = () => {},
  itemName = 'records',
  style = {},
  className = ''
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, safePage * pageSize);

  // Generate page numbers with smart ellipsis
  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (safePage <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages);
      } else if (safePage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', safePage - 1, safePage, safePage + 1, '...', totalPages);
      }
    }
    return pages;
  };

  if (totalItems === 0) return null;

  return (
    <div
      className={`erp-pagination ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '12px 16px',
        background: '#FFFFFF',
        border: '1px solid var(--line, #E2E8F0)',
        borderTop: 'none',
        borderRadius: '0 0 14px 14px',
        fontSize: '0.82rem',
        color: 'var(--slate, #475569)',
        fontFamily: '"Outfit", "Sen", sans-serif',
        ...style
      }}
    >
      {/* Showing range text */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
        <span>Showing</span>
        <strong style={{ color: 'var(--navy-900, #0F172A)', fontWeight: 800 }}>{startItem}</strong>
        <span>to</span>
        <strong style={{ color: 'var(--navy-900, #0F172A)', fontWeight: 800 }}>{endItem}</strong>
        <span>of</span>
        <strong style={{ color: 'var(--navy-900, #0F172A)', fontWeight: 800 }}>{totalItems}</strong>
        <span>{itemName}</span>
        {totalPages > 1 && (
          <span style={{ marginLeft: '6px', color: 'var(--slate-soft, #64748B)', fontSize: '0.76rem' }}>
            (Page {safePage} of {totalPages})
          </span>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* First Page Button */}
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={safePage === 1}
            title="First Page"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '30px',
              height: '30px',
              borderRadius: '7px',
              border: '1px solid var(--line, #E2E8F0)',
              background: safePage === 1 ? '#F8FAFC' : '#FFFFFF',
              color: safePage === 1 ? '#CBD5E1' : 'var(--navy-900, #0F172A)',
              cursor: safePage === 1 ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              padding: 0
            }}
            onMouseEnter={(e) => {
              if (safePage !== 1) {
                e.currentTarget.style.background = '#F1F5F9';
                e.currentTarget.style.borderColor = '#CBD5E1';
              }
            }}
            onMouseLeave={(e) => {
              if (safePage !== 1) {
                e.currentTarget.style.background = '#FFFFFF';
                e.currentTarget.style.borderColor = 'var(--line, #E2E8F0)';
              }
            }}
          >
            <ChevronsLeft size={14} />
          </button>

          {/* Previous Page Button */}
          <button
            type="button"
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage === 1}
            title="Previous Page"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 8px',
              height: '30px',
              borderRadius: '7px',
              border: '1px solid var(--line, #E2E8F0)',
              background: safePage === 1 ? '#F8FAFC' : '#FFFFFF',
              color: safePage === 1 ? '#CBD5E1' : 'var(--navy-900, #0F172A)',
              cursor: safePage === 1 ? 'not-allowed' : 'pointer',
              fontSize: '0.78rem',
              fontWeight: 700,
              gap: '4px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (safePage !== 1) {
                e.currentTarget.style.background = '#F1F5F9';
                e.currentTarget.style.borderColor = '#CBD5E1';
              }
            }}
            onMouseLeave={(e) => {
              if (safePage !== 1) {
                e.currentTarget.style.background = '#FFFFFF';
                e.currentTarget.style.borderColor = 'var(--line, #E2E8F0)';
              }
            }}
          >
            <ChevronLeft size={14} />
            <span>Prev</span>
          </button>

          {/* Page Numbers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', margin: '0 2px' }}>
            {getPageNumbers().map((p, idx) => {
              if (p === '...') {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    style={{
                      width: '26px',
                      textAlign: 'center',
                      color: '#94A3B8',
                      fontWeight: 700,
                      userSelect: 'none',
                      fontSize: '0.8rem'
                    }}
                  >
                    …
                  </span>
                );
              }

              const isActive = p === safePage;
              return (
                <button
                  key={`page-${p}`}
                  type="button"
                  onClick={() => onPageChange(p)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '30px',
                    height: '30px',
                    padding: '0 6px',
                    borderRadius: '7px',
                    border: isActive ? '1px solid var(--navy-900, #0F172A)' : '1px solid var(--line, #E2E8F0)',
                    background: isActive ? 'var(--navy-900, #0F172A)' : '#FFFFFF',
                    color: isActive ? '#FFFFFF' : 'var(--navy-900, #0F172A)',
                    fontWeight: isActive ? 800 : 600,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    boxShadow: isActive ? '0 2px 6px rgba(15, 23, 42, 0.18)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = '#F1F5F9';
                      e.currentTarget.style.borderColor = '#CBD5E1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = '#FFFFFF';
                      e.currentTarget.style.borderColor = 'var(--line, #E2E8F0)';
                    }
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>

          {/* Next Page Button */}
          <button
            type="button"
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage === totalPages}
            title="Next Page"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 8px',
              height: '30px',
              borderRadius: '7px',
              border: '1px solid var(--line, #E2E8F0)',
              background: safePage === totalPages ? '#F8FAFC' : '#FFFFFF',
              color: safePage === totalPages ? '#CBD5E1' : 'var(--navy-900, #0F172A)',
              cursor: safePage === totalPages ? 'not-allowed' : 'pointer',
              fontSize: '0.78rem',
              fontWeight: 700,
              gap: '4px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (safePage !== totalPages) {
                e.currentTarget.style.background = '#F1F5F9';
                e.currentTarget.style.borderColor = '#CBD5E1';
              }
            }}
            onMouseLeave={(e) => {
              if (safePage !== totalPages) {
                e.currentTarget.style.background = '#FFFFFF';
                e.currentTarget.style.borderColor = 'var(--line, #E2E8F0)';
              }
            }}
          >
            <span>Next</span>
            <ChevronRight size={14} />
          </button>

          {/* Last Page Button */}
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={safePage === totalPages}
            title="Last Page"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '30px',
              height: '30px',
              borderRadius: '7px',
              border: '1px solid var(--line, #E2E8F0)',
              background: safePage === totalPages ? '#F8FAFC' : '#FFFFFF',
              color: safePage === totalPages ? '#CBD5E1' : 'var(--navy-900, #0F172A)',
              cursor: safePage === totalPages ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              padding: 0
            }}
            onMouseEnter={(e) => {
              if (safePage !== totalPages) {
                e.currentTarget.style.background = '#F1F5F9';
                e.currentTarget.style.borderColor = '#CBD5E1';
              }
            }}
            onMouseLeave={(e) => {
              if (safePage !== totalPages) {
                e.currentTarget.style.background = '#FFFFFF';
                e.currentTarget.style.borderColor = 'var(--line, #E2E8F0)';
              }
            }}
          >
            <ChevronsRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
